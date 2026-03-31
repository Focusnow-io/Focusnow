/**
 * FreshnessTracker — tracks when each entity type was last imported and whether
 * it's gone stale based on per-type thresholds.
 *
 * One ModelFreshness row per (organizationId, entityType).
 * Upserted after every import; rechecked on-demand by the freshness API.
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Staleness thresholds (days)
// ---------------------------------------------------------------------------

const STALE_THRESHOLDS: Record<string, number> = {
  Product: 90,
  Supplier: 90,
  Location: 90,
  InventoryItem: 7,
  PurchaseOrder: 3,
  POLine: 3,
  DemandForecast: 30,
  ForecastEntry: 30,
  WorkOrder: 14,
};

const DEFAULT_STALE_DAYS = 30;

function thresholdFor(entityType: string): number {
  return STALE_THRESHOLDS[entityType] ?? DEFAULT_STALE_DAYS;
}

function computeStaleDays(lastImportedAt: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((Date.now() - lastImportedAt.getTime()) / msPerDay);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records that an import just occurred for the given entity type.
 * Upserts a ModelFreshness row with lastImportedAt = now and staleDays = 0.
 */
export async function updateFreshness(
  organizationId: string,
  entityType: string,
  recordCount: number,
): Promise<void> {
  const now = new Date();
  const staleDays = 0; // just imported — always fresh
  const isStale = false;

  await prisma.modelFreshness.upsert({
    where: { organizationId_entityType: { organizationId, entityType } },
    create: {
      organizationId,
      entityType,
      lastImportedAt: now,
      recordCount,
      staleDays,
      isStale,
    },
    update: {
      lastImportedAt: now,
      recordCount,
      staleDays,
      isStale,
    },
  });
}

/**
 * Recomputes staleDays and isStale for all ModelFreshness rows for this org
 * based on current time. Persists the updated values and returns the list.
 */
export async function checkAllFreshness(
  organizationId: string,
): Promise<Awaited<ReturnType<typeof prisma.modelFreshness.findMany>>> {
  const rows = await prisma.modelFreshness.findMany({
    where: { organizationId },
    orderBy: { entityType: "asc" },
  });

  await Promise.all(
    rows.map((row) => {
      const staleDays = computeStaleDays(row.lastImportedAt);
      const isStale = staleDays > thresholdFor(row.entityType);
      return prisma.modelFreshness.update({
        where: { id: row.id },
        data: { staleDays, isStale },
      });
    }),
  );

  return prisma.modelFreshness.findMany({
    where: { organizationId },
    orderBy: { entityType: "asc" },
  });
}
