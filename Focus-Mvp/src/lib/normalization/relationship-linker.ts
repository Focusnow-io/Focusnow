/**
 * relationship-linker.ts
 *
 * After any import, scans for unresolved foreign keys and attempts
 * to auto-link them by normalized SKU/code matching.
 *
 * Pass 1 — InventoryItem ↔ Location
 *   Finds InventoryItems with locationId = null where attributes contain
 *   a location code, attempts to match Location.code.
 *
 * Pass 2 — Post-merge FK repair
 *   Re-applies FK remaps for any recently auto-merged entities.
 *
 * Pass 3 — Pending BOMLine / POLine / SupplierItem rows
 *   Reads pending arrays stored in parent attributes by the import
 *   pipeline and creates the actual rows once the referenced entities
 *   are available. Arrays are cleared on success. Per-record errors
 *   are isolated so one failure doesn't abort the entire pass.
 */

import { prisma } from "@/lib/prisma";
import { emitOperationalEvent } from "@/lib/ode/state-manager";
import type {
  LinkingResult,
  PendingBOMLine,
  PendingPOLine,
  PendingSupplierItem,
} from "./types";
import { PENDING_LIMIT } from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LOCATION_CODE_KEYS = [
  "locationCode",
  "location_code",
  "warehouseCode",
  "warehouse_code",
  "warehouseId",
  "locCode",
  "loc_code",
];

function extractLocationCode(attributes: unknown): string | null {
  if (!attributes || typeof attributes !== "object") return null;
  const attrs = attributes as Record<string, unknown>;
  for (const key of LOCATION_CODE_KEYS) {
    if (typeof attrs[key] === "string" && attrs[key]) return attrs[key] as string;
  }
  return null;
}

function safeDecimal(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}

function safeInt(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const n = parseInt(val, 10);
  return isNaN(n) ? undefined : n;
}

// ─── Pass 1: InventoryItem → Location ────────────────────────────────────────

async function pass1LinkInventoryLocations(
  organizationId: string,
  result: LinkingResult,
): Promise<void> {
  const unlinked = await prisma.inventoryItem.findMany({
    where: { organizationId, locationId: null },
    select: { id: true, attributes: true },
  });

  for (const item of unlinked) {
    const code = extractLocationCode(item.attributes);
    if (!code) continue;

    const location = await prisma.location.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true },
    });

    if (location) {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { locationId: location.id },
      });
      result.pass1Linked++;
    } else {
      await emitOperationalEvent({
        organizationId,
        entityType: "INVENTORY_ITEM",
        entityId: item.id,
        eventType: "relationship.link_failed",
        previousState: null,
        currentState: { reason: "no_location_match", candidateCode: code },
      });
      result.pass1Failed++;
    }
  }
}

// ─── Pass 2: Re-apply FK remaps for recently merged entities ─────────────────

async function pass2RepairMergedFKs(
  organizationId: string,
  result: LinkingResult,
): Promise<void> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  const recentMerges = await prisma.entityResolutionLog.findMany({
    where: {
      organizationId,
      status: { in: ["AUTO_MERGED", "REVIEWED_MERGED"] },
      updatedAt: { gte: fiveMinutesAgo },
    },
    select: {
      id: true,
      entityType: true,
      incomingId: true,
      matchedId: true,
    },
  });

  for (const merge of recentMerges) {
    if (!merge.matchedId) continue;

    // Update any FKs that still point to the merged-away entity.
    // These updateMany calls are idempotent — if count is 0 they're no-ops.
    if (merge.entityType === "Product") {
      const models = [
        { model: prisma.inventoryItem, field: "productId" },
        { model: prisma.bOMLine,       field: "componentId" },
        { model: prisma.bOMHeader,     field: "productId" },
        { model: prisma.orderLine,     field: "productId" },
        { model: prisma.pOLine,        field: "productId" },
        { model: prisma.sOLine,        field: "productId" },
        { model: prisma.workOrder,     field: "productId" },
        { model: prisma.supplierItem,  field: "productId" },
        { model: prisma.demandForecast,field: "productId" },
        { model: prisma.mPSEntry,      field: "productId" },
      ] as const;

      for (const { model, field } of models) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (model as any).updateMany({
          where:  { [field]: merge.incomingId },
          data:   { [field]: merge.matchedId },
        });
      }
      result.pass2Repaired++;
    } else if (merge.entityType === "Supplier") {
      for (const { model, field } of [
        { model: prisma.order,         field: "supplierId" },
        { model: prisma.purchaseOrder, field: "supplierId" },
        { model: prisma.supplierItem,  field: "supplierId" },
      ] as const) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (model as any).updateMany({
          where: { [field]: merge.incomingId },
          data:  { [field]: merge.matchedId },
        });
      }
      result.pass2Repaired++;
    } else if (merge.entityType === "Location") {
      for (const { model, field } of [
        { model: prisma.inventoryItem, field: "locationId" },
        { model: prisma.equipment,     field: "locationId" },
      ] as const) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (model as any).updateMany({
          where: { [field]: merge.incomingId },
          data:  { [field]: merge.matchedId },
        });
      }
      result.pass2Repaired++;
    }
  }
}

// ─── Pass 3: Resolve pending BOMLine / POLine / SupplierItem rows ─────────────

async function pass3ResolvePendingBOMLines(
  organizationId: string,
  result: LinkingResult,
): Promise<void> {
  const headers = await prisma.bOMHeader.findMany({
    where: {
      orgId: organizationId,
      attributes: { path: ["pendingBOMLines"], not: "[]" },
    },
    select: { id: true, attributes: true },
  });

  for (const header of headers) {
    try {
      const attrs = (header.attributes ?? {}) as Record<string, unknown>;
      const pending = (attrs.pendingBOMLines ?? []) as PendingBOMLine[];
      if (!Array.isArray(pending) || pending.length === 0) continue;

      const resolved: PendingBOMLine[] = [];
      for (const row of pending) {
        const product = await prisma.product.findUnique({
          where: { organizationId_sku: { organizationId, sku: row.componentSku } },
          select: { id: true },
        });

        if (!product) {
          await emitOperationalEvent({
            organizationId,
            entityType: "PRODUCT",
            entityId: header.id,
            eventType: "relationship.link_failed",
            previousState: null,
            currentState: { reason: "no_product_match", sku: row.componentSku, bomHeaderId: header.id },
          });
          result.pass3Failed++;
          resolved.push(row); // keep unresolved rows for next pass
          continue;
        }

        await prisma.bOMLine.create({
          data: {
            bomHeaderId:       header.id,
            componentId:       product.id,
            qty:               parseFloat(row.qty),
            uom:               row.uom,
            wasteFactorPct:    safeDecimal(row.wasteFactorPct),
            isPhantom:         row.isPhantom === "true",
            sequence:          safeInt(row.sequence),
            notes:             row.notes ?? null,
            parentComponentId: row.parentComponentId ?? null,
            componentCost:     safeDecimal(row.componentCost),
          },
        });
        result.pass3Created++;
      }

      // Clear resolved rows; keep unresolved ones for next pass
      const newAttrs = { ...attrs, pendingBOMLines: resolved };
      await prisma.bOMHeader.update({
        where: { id: header.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { attributes: newAttrs as any },
      });
    } catch (err) {
      await emitOperationalEvent({
        organizationId,
        entityType: "PRODUCT",
        entityId: header.id,
        eventType: "relationship.pass3_failed",
        previousState: null,
        currentState: { error: String(err), bomHeaderId: header.id },
      });
      result.pass3Failed++;
    }
  }
}

async function pass3ResolvePendingPOLines(
  organizationId: string,
  result: LinkingResult,
): Promise<void> {
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      orgId: organizationId,
      attributes: { path: ["pendingPOLines"], not: "[]" },
    },
    select: { id: true, attributes: true },
  });

  for (const po of orders) {
    try {
      const attrs = (po.attributes ?? {}) as Record<string, unknown>;
      const pending = (attrs.pendingPOLines ?? []) as PendingPOLine[];
      if (!Array.isArray(pending) || pending.length === 0) continue;

      const resolved: PendingPOLine[] = [];
      let lineNumber = await prisma.pOLine.count({ where: { purchaseOrderId: po.id } });

      for (const row of pending) {
        const product = await prisma.product.findUnique({
          where: { organizationId_sku: { organizationId, sku: row.sku } },
          select: { id: true },
        });

        if (!product) {
          await emitOperationalEvent({
            organizationId,
            entityType: "PRODUCT",
            entityId: po.id,
            eventType: "relationship.link_failed",
            previousState: null,
            currentState: { reason: "no_product_match", sku: row.sku, poId: po.id },
          });
          result.pass3Failed++;
          resolved.push(row);
          continue;
        }

        lineNumber++;
        await prisma.pOLine.create({
          data: {
            purchaseOrderId: po.id,
            productId:       product.id,
            lineNumber,
            qtyOrdered:      parseFloat(row.qty),
            unitCost:        safeDecimal(row.unitCost) ?? 0,
            uom:             row.uom ?? "",
          },
        });
        result.pass3Created++;
      }

      const newAttrs = { ...attrs, pendingPOLines: resolved };
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { attributes: newAttrs as any },
      });
    } catch (err) {
      await emitOperationalEvent({
        organizationId,
        entityType: "PRODUCT",
        entityId: po.id,
        eventType: "relationship.pass3_failed",
        previousState: null,
        currentState: { error: String(err), poId: po.id },
      });
      result.pass3Failed++;
    }
  }
}

async function pass3ResolvePendingSupplierItems(
  organizationId: string,
  result: LinkingResult,
): Promise<void> {
  const suppliers = await prisma.supplier.findMany({
    where: {
      organizationId,
      attributes: { path: ["pendingSupplierItems"], not: "[]" },
    },
    select: { id: true, attributes: true },
  });

  for (const supplier of suppliers) {
    try {
      const attrs = (supplier.attributes ?? {}) as Record<string, unknown>;
      const pending = (attrs.pendingSupplierItems ?? []) as PendingSupplierItem[];
      if (!Array.isArray(pending) || pending.length === 0) continue;

      const resolved: PendingSupplierItem[] = [];

      for (const row of pending) {
        const product = await prisma.product.findUnique({
          where: { organizationId_sku: { organizationId, sku: row.sku } },
          select: { id: true },
        });

        if (!product) {
          await emitOperationalEvent({
            organizationId,
            entityType: "PRODUCT",
            entityId: supplier.id,
            eventType: "relationship.link_failed",
            previousState: null,
            currentState: { reason: "no_product_match", sku: row.sku, supplierId: supplier.id },
          });
          result.pass3Failed++;
          resolved.push(row);
          continue;
        }

        // Use upsert to avoid duplicate-key errors on retry
        await prisma.supplierItem.upsert({
          where: { orgId_supplierId_productId: { orgId: organizationId, supplierId: supplier.id, productId: product.id } },
          create: {
            orgId:              organizationId,
            supplierId:         supplier.id,
            productId:          product.id,
            supplierPartNumber: row.supplierPartNumber ?? null,
            leadTimeDays:       safeInt(row.leadTimeDays),
            moq:                safeInt(row.moq),
            contractUnitCost:   safeDecimal(row.contractUnitCost),
          },
          update: {
            supplierPartNumber: row.supplierPartNumber ?? null,
            leadTimeDays:       safeInt(row.leadTimeDays),
            moq:                safeInt(row.moq),
            contractUnitCost:   safeDecimal(row.contractUnitCost),
          },
        });
        result.pass3Created++;
      }

      const newAttrs = { ...attrs, pendingSupplierItems: resolved };
      await prisma.supplier.update({
        where: { id: supplier.id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { attributes: newAttrs as any },
      });
    } catch (err) {
      await emitOperationalEvent({
        organizationId,
        entityType: "SUPPLIER",
        entityId: supplier.id,
        eventType: "relationship.pass3_failed",
        previousState: null,
        currentState: { error: String(err), supplierId: supplier.id },
      });
      result.pass3Failed++;
    }
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function linkRelationships(
  organizationId: string,
): Promise<LinkingResult> {
  const result: LinkingResult = {
    pass1Linked:   0,
    pass1Failed:   0,
    pass2Repaired: 0,
    pass3Created:  0,
    pass3Failed:   0,
  };

  await pass1LinkInventoryLocations(organizationId, result);
  await pass2RepairMergedFKs(organizationId, result);
  await pass3ResolvePendingBOMLines(organizationId, result);
  await pass3ResolvePendingPOLines(organizationId, result);
  await pass3ResolvePendingSupplierItems(organizationId, result);

  return result;
}

// ─── Helpers exported for the import pipeline ─────────────────────────────────

/**
 * Add a row to a parent's pending array in attributes.
 * Caps the array at PENDING_LIMIT and emits a warning event if exceeded.
 */
export async function addToPendingArray<T>(
  organizationId: string,
  parentEntityType: "PRODUCT" | "SUPPLIER",
  parentId: string,
  arrayKey: "pendingBOMLines" | "pendingPOLines" | "pendingSupplierItems",
  item: T,
  currentAttrs: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const attrs = currentAttrs ?? {};
  const existing = (attrs[arrayKey] ?? []) as T[];

  if (existing.length >= PENDING_LIMIT) {
    await emitOperationalEvent({
      organizationId,
      entityType: parentEntityType,
      entityId: parentId,
      eventType: "relationship.pending_limit_exceeded",
      previousState: null,
      currentState: { arrayKey, limit: PENDING_LIMIT },
    });
    return attrs;
  }

  return { ...attrs, [arrayKey]: [...existing, item] };
}
