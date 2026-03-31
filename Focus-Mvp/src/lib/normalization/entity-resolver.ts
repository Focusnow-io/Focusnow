/**
 * entity-resolver.ts
 *
 * Deduplicates entities after import using Bigram Dice similarity on
 * name + key field. Decisions are persisted to EntityResolutionLog.
 *
 * Confidence thresholds:
 *   > 90  → auto-merge (dry-run FK plan stored in log, then executed)
 *   70–90 → queue for human review (PENDING status)
 *   < 70  → no action (NO_MATCH status)
 */

import { prisma } from "@/lib/prisma";
import { stringSimilarity } from "@/lib/ingestion/field-mapper";
import type {
  FkChange,
  MatchFieldDetail,
  MergeResult,
  ResolutionResult,
  ResolvableEntityType,
} from "./types";

// ─── Normalise a string for comparison (lower, alphanumeric only) ─────────────

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ─── Per-entity scoring config ────────────────────────────────────────────────

interface EntityConfig {
  nameField: string;
  keyField: string;
  nameWeight: number;
  keyWeight: number;
}

const ENTITY_CONFIG: Record<ResolvableEntityType, EntityConfig> = {
  Product:  { nameField: "name", keyField: "sku",  nameWeight: 0.5, keyWeight: 0.5 },
  Supplier: { nameField: "name", keyField: "code", nameWeight: 0.6, keyWeight: 0.4 },
  Location: { nameField: "name", keyField: "code", nameWeight: 0.5, keyWeight: 0.5 },
  Customer: { nameField: "name", keyField: "code", nameWeight: 0.7, keyWeight: 0.3 },
};

// ─── Load entity by type ──────────────────────────────────────────────────────

async function loadEntity(
  entityType: ResolvableEntityType,
  entityId: string,
): Promise<Record<string, string> | null> {
  switch (entityType) {
    case "Product":
      return prisma.product.findUnique({ where: { id: entityId } }) as Promise<Record<string, string> | null>;
    case "Supplier":
      return prisma.supplier.findUnique({ where: { id: entityId } }) as Promise<Record<string, string> | null>;
    case "Location":
      return prisma.location.findUnique({ where: { id: entityId } }) as Promise<Record<string, string> | null>;
    case "Customer":
      return prisma.customer.findUnique({ where: { id: entityId } }) as Promise<Record<string, string> | null>;
  }
}

// ─── Load all other entities of the same type in the same org ────────────────

async function loadCandidates(
  entityType: ResolvableEntityType,
  organizationId: string,
  excludeId: string,
): Promise<Array<Record<string, string>>> {
  const orgFilter = entityType === "Customer"
    ? { orgId: organizationId }
    : { organizationId };

  switch (entityType) {
    case "Product":
      return prisma.product.findMany({
        where: { organizationId, id: { not: excludeId }, isActive: true },
        select: { id: true, name: true, sku: true },
      }) as Promise<Array<Record<string, string>>>;
    case "Supplier":
      return prisma.supplier.findMany({
        where: { organizationId, id: { not: excludeId }, isActive: true },
        select: { id: true, name: true, code: true },
      }) as Promise<Array<Record<string, string>>>;
    case "Location":
      return prisma.location.findMany({
        where: { organizationId, id: { not: excludeId }, isActive: true },
        select: { id: true, name: true, code: true },
      }) as Promise<Array<Record<string, string>>>;
    case "Customer":
      return prisma.customer.findMany({
        where: { orgId: organizationId, id: { not: excludeId } },
        select: { id: true, name: true, code: true },
      }) as Promise<Array<Record<string, string>>>;
    default:
      return [];
  }
}

// ─── Score one candidate against the incoming entity ─────────────────────────

function scoreCandidate(
  incoming: Record<string, string>,
  candidate: Record<string, string>,
  config: EntityConfig,
): { confidence: number; details: MatchFieldDetail[] } {
  const nameSim = stringSimilarity(norm(incoming[config.nameField]), norm(candidate[config.nameField]));
  const keySim  = stringSimilarity(norm(incoming[config.keyField]),  norm(candidate[config.keyField]));
  const confidence = (nameSim * config.nameWeight + keySim * config.keyWeight) * 100;

  const details: MatchFieldDetail[] = [
    { field: config.nameField, incomingVal: incoming[config.nameField] ?? "", matchedVal: candidate[config.nameField] ?? "", score: nameSim },
    { field: config.keyField,  incomingVal: incoming[config.keyField]  ?? "", matchedVal: candidate[config.keyField]  ?? "", score: keySim  },
  ];

  return { confidence, details };
}

// ─── Build the FK update plan for a merge (dry-run or live) ──────────────────

async function mergeEntities(
  entityType: ResolvableEntityType,
  keepId: string,
  mergeId: string,
  dryRun: boolean,
): Promise<MergeResult> {
  const fkChanges: FkChange[] = [];

  if (entityType === "Product") {
    const tables: Array<{ table: string; field: string; model: keyof typeof prisma }> = [
      { table: "InventoryItem", field: "productId",  model: "inventoryItem" },
      { table: "BOMLine",       field: "componentId", model: "bOMLine" },
      { table: "BOMHeader",     field: "productId",  model: "bOMHeader" },
      { table: "OrderLine",     field: "productId",  model: "orderLine" },
      { table: "POLine",        field: "productId",  model: "pOLine" },
      { table: "SOLine",        field: "productId",  model: "sOLine" },
      { table: "WorkOrder",     field: "productId",  model: "workOrder" },
      { table: "SupplierItem",  field: "productId",  model: "supplierItem" },
      { table: "DemandForecast",field: "productId",  model: "demandForecast" },
      { table: "MPSEntry",      field: "productId",  model: "mPSEntry" },
    ];

    for (const { table, field, model } of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = (prisma as any)[model];
      const affectedCount: number = await repo.count({ where: { [field]: mergeId } });
      fkChanges.push({ table, field, fromId: mergeId, toId: keepId, affectedCount });
      if (!dryRun && affectedCount > 0) {
        await repo.updateMany({ where: { [field]: mergeId }, data: { [field]: keepId } });
      }
    }

    if (!dryRun) {
      await prisma.product.update({
        where: { id: mergeId },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
  } else if (entityType === "Supplier") {
    const tables: Array<{ table: string; field: string; model: keyof typeof prisma }> = [
      { table: "Order",         field: "supplierId", model: "order" },
      { table: "PurchaseOrder", field: "supplierId", model: "purchaseOrder" },
      { table: "SupplierItem",  field: "supplierId", model: "supplierItem" },
    ];

    for (const { table, field, model } of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = (prisma as any)[model];
      const affectedCount: number = await repo.count({ where: { [field]: mergeId } });
      fkChanges.push({ table, field, fromId: mergeId, toId: keepId, affectedCount });
      if (!dryRun && affectedCount > 0) {
        await repo.updateMany({ where: { [field]: mergeId }, data: { [field]: keepId } });
      }
    }

    if (!dryRun) {
      await prisma.supplier.update({
        where: { id: mergeId },
        data: { isActive: false, deletedAt: new Date() },
      });
    }
  } else if (entityType === "Location") {
    const tables: Array<{ table: string; field: string; model: keyof typeof prisma }> = [
      { table: "InventoryItem", field: "locationId", model: "inventoryItem" },
      { table: "Equipment",     field: "locationId", model: "equipment" },
    ];

    for (const { table, field, model } of tables) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const repo = (prisma as any)[model];
      const affectedCount: number = await repo.count({ where: { [field]: mergeId } });
      fkChanges.push({ table, field, fromId: mergeId, toId: keepId, affectedCount });
      if (!dryRun && affectedCount > 0) {
        await repo.updateMany({ where: { [field]: mergeId }, data: { [field]: keepId } });
      }
    }

    if (!dryRun) {
      await prisma.location.update({
        where: { id: mergeId },
        data: { isActive: false },
      });
    }
  }
  // Customer has no downstream FKs to remap in current schema

  return { dryRun, fkChanges };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function resolveEntity(
  organizationId: string,
  entityType: ResolvableEntityType,
  entityId: string,
): Promise<ResolutionResult> {
  const config = ENTITY_CONFIG[entityType];
  const incoming = await loadEntity(entityType, entityId);
  if (!incoming) {
    // Entity was deleted before resolution ran — skip silently
    return { status: "NO_MATCH", confidence: 0, logId: "" };
  }

  const candidates = await loadCandidates(entityType, organizationId, entityId);

  let bestConfidence = 0;
  let bestCandidate: Record<string, string> | null = null;
  let bestDetails: MatchFieldDetail[] = [];

  for (const candidate of candidates) {
    const { confidence, details } = scoreCandidate(incoming, candidate, config);
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestCandidate = candidate;
      bestDetails = details;
    }
  }

  const confidence = bestConfidence;

  if (confidence < 70 || !bestCandidate) {
    const log = await prisma.entityResolutionLog.create({
      data: {
        organizationId,
        entityType,
        incomingId: entityId,
        matchedId: null,
        confidence,
        status: "NO_MATCH",
        matchFields: bestDetails.length > 0 ? (bestDetails as object[]) : undefined,
      },
    });
    return { status: "NO_MATCH", confidence, logId: log.id };
  }

  if (confidence >= 70 && confidence <= 90) {
    const log = await prisma.entityResolutionLog.create({
      data: {
        organizationId,
        entityType,
        incomingId: entityId,
        matchedId: bestCandidate.id,
        confidence,
        status: "PENDING",
        matchFields: bestDetails as object[],
      },
    });
    return { status: "PENDING", confidence, logId: log.id, matchedId: bestCandidate.id };
  }

  // confidence > 90 → auto-merge
  // 1. Dry-run to get the FK change plan
  const dryRunResult = await mergeEntities(entityType, bestCandidate.id, entityId, true);

  // 2. Persist log with dry-run plan embedded in matchFields for auditability
  const matchFieldsWithPlan = [
    ...bestDetails,
    { fkChangePlan: dryRunResult.fkChanges },
  ];

  const log = await prisma.entityResolutionLog.create({
    data: {
      organizationId,
      entityType,
      incomingId: entityId,
      matchedId: bestCandidate.id,
      confidence,
      status: "AUTO_MERGED",
      matchFields: matchFieldsWithPlan as object[],
    },
  });

  // 3. Execute the actual merge
  await mergeEntities(entityType, bestCandidate.id, entityId, false);

  // 4. Mark log as resolved
  await prisma.entityResolutionLog.update({
    where: { id: log.id },
    data: { resolvedAt: new Date() },
  });

  return { status: "AUTO_MERGED", confidence, logId: log.id, matchedId: bestCandidate.id };
}

// ─── Execute a human-reviewed merge decision ──────────────────────────────────

export async function executeReviewedMerge(
  logId: string,
  resolvedBy: string,
): Promise<void> {
  const log = await prisma.entityResolutionLog.findUnique({ where: { id: logId } });
  if (!log || !log.matchedId) throw new Error("Resolution log not found or no matchedId");

  await mergeEntities(
    log.entityType as ResolvableEntityType,
    log.matchedId,
    log.incomingId,
    false,
  );

  await prisma.entityResolutionLog.update({
    where: { id: logId },
    data: { status: "REVIEWED_MERGED", resolvedAt: new Date(), resolvedBy },
  });
}

export async function markReviewedKept(
  logId: string,
  resolvedBy: string,
): Promise<void> {
  await prisma.entityResolutionLog.update({
    where: { id: logId },
    data: { status: "REVIEWED_KEPT", resolvedAt: new Date(), resolvedBy },
  });
}
