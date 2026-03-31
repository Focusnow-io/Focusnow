/**
 * ConsistencyChecker — detects referential integrity issues across the data model.
 *
 * Runs 5 checks after every normalization cycle:
 *  1. orphaned_bom_lines       — BOMLines whose component Product is inactive/deleted
 *  2. unlinked_inventory_items — InventoryItems with no linked Location
 *  3. orphaned_purchase_orders — PurchaseOrders linked to an inactive/deleted Supplier
 *  4. work_orders_missing_bom  — WorkOrders whose Product has no BOMHeader
 *  5. mps_entries_missing_forecast — MPSEntries with no DemandForecast for the same product/period
 *
 * Results are stored in ModelCompletenessReport.consistencyIssues (JSON).
 */

import { prisma } from "@/lib/prisma";

export interface ConsistencyIssue {
  check: string;       // machine-readable check name
  entityType: string;  // primary entity type affected
  count: number;       // total number of affected records
  sampleIds: string[]; // up to 5 example IDs for inspection
}

const SAMPLE_LIMIT = 5;

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

async function checkOrphanedBomLines(organizationId: string): Promise<ConsistencyIssue> {
  const affected = await prisma.bOMLine.findMany({
    where: {
      bomHeader: { orgId: organizationId },
      component: {
        OR: [{ isActive: false }, { deletedAt: { not: null } }],
      },
    },
    select: { id: true },
  });

  return {
    check: "orphaned_bom_lines",
    entityType: "BOMLine",
    count: affected.length,
    sampleIds: affected.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

async function checkUnlinkedInventoryItems(organizationId: string): Promise<ConsistencyIssue> {
  const affected = await prisma.inventoryItem.findMany({
    where: { organizationId, locationId: null },
    select: { id: true },
  });

  return {
    check: "unlinked_inventory_items",
    entityType: "InventoryItem",
    count: affected.length,
    sampleIds: affected.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

async function checkOrphanedPurchaseOrders(organizationId: string): Promise<ConsistencyIssue> {
  const affected = await prisma.purchaseOrder.findMany({
    where: {
      orgId: organizationId,
      supplier: {
        OR: [{ isActive: false }, { deletedAt: { not: null } }],
      },
    },
    select: { id: true },
  });

  return {
    check: "orphaned_purchase_orders",
    entityType: "PurchaseOrder",
    count: affected.length,
    sampleIds: affected.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

async function checkWorkOrdersMissingBom(organizationId: string): Promise<ConsistencyIssue> {
  const affected = await prisma.workOrder.findMany({
    where: {
      organizationId,
      productId: { not: null },
      product: { bomHeaders: { none: {} } },
    },
    select: { id: true },
  });

  return {
    check: "work_orders_missing_bom",
    entityType: "WorkOrder",
    count: affected.length,
    sampleIds: affected.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

async function checkMpsEntriesMissingForecast(organizationId: string): Promise<ConsistencyIssue> {
  // Fetch all MPSEntry rows for this org and all DemandForecast rows in memory.
  // Match on productId + same period (year + month). No date-range cross-join needed
  // since MPS and DemandForecast both use periodYear/periodMonth integers.
  const [mpsEntries, forecasts] = await Promise.all([
    prisma.mPSEntry.findMany({
      where: { orgId: organizationId },
      select: { id: true, productId: true, periodYear: true, periodMonth: true },
    }),
    prisma.demandForecast.findMany({
      where: { orgId: organizationId },
      select: { productId: true, periodYear: true, periodMonth: true },
    }),
  ]);

  // Build a Set of "productId|year|month" keys from forecasts for O(1) lookup
  const forecastKeys = new Set(
    forecasts.map((f) => `${f.productId}|${f.periodYear}|${f.periodMonth}`),
  );

  const unmatched = mpsEntries.filter(
    (m) => !forecastKeys.has(`${m.productId}|${m.periodYear}|${m.periodMonth}`),
  );

  return {
    check: "mps_entries_missing_forecast",
    entityType: "MPSEntry",
    count: unmatched.length,
    sampleIds: unmatched.slice(0, SAMPLE_LIMIT).map((r) => r.id),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Runs all 5 consistency checks and updates ModelCompletenessReport.consistencyIssues.
 * Returns the list of issues (empty array if everything is clean).
 */
export async function checkConsistency(
  organizationId: string,
): Promise<ConsistencyIssue[]> {
  const [
    orphanedBomLines,
    unlinkedInventory,
    orphanedPOs,
    workOrdersMissingBom,
    mpsMissingForecast,
  ] = await Promise.all([
    checkOrphanedBomLines(organizationId),
    checkUnlinkedInventoryItems(organizationId),
    checkOrphanedPurchaseOrders(organizationId),
    checkWorkOrdersMissingBom(organizationId),
    checkMpsEntriesMissingForecast(organizationId),
  ]);

  const issues = [
    orphanedBomLines,
    unlinkedInventory,
    orphanedPOs,
    workOrdersMissingBom,
    mpsMissingForecast,
  ];

  // Persist to ModelCompletenessReport if it exists
  await prisma.modelCompletenessReport.updateMany({
    where: { organizationId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { consistencyIssues: issues as any },
  });

  return issues;
}
