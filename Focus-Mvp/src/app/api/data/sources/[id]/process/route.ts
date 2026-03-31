import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { applyMappingWithAttributes, CANONICAL_FIELDS, type MappingConfig, type ColumnClassification, type EntityType } from "@/lib/ingestion/field-mapper";
import { loadRowsFromConfig } from "@/lib/ingestion/source-loader";
import { fillDown } from "@/lib/ingestion/preprocess";
import { resolveEntity } from "@/lib/normalization/entity-resolver";
import { linkRelationships, addToPendingArray } from "@/lib/normalization/relationship-linker";
import { calculateCompleteness } from "@/lib/normalization/completeness-detector";
import { computeDataQualityScore } from "@/lib/normalization/data-quality-scorer";
import { updateFreshness } from "@/lib/normalization/freshness-tracker";
import { checkConsistency } from "@/lib/normalization/consistency-checker";
import { invalidateOrgContextCache } from "@/lib/chat/build-context";
import type { ResolvableEntityType } from "@/lib/normalization/types";
import { SNAPSHOT_ENTITIES } from "@/lib/ingestion/snapshot-config";

// Null-safe numeric coercions that handle comma-formatted values ("1,500.00")
// and return null for empty / non-numeric strings — consistent with the ODE
// normaliser layer without needing to import from that separate concern.
const decimal = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isNaN(n) ? null : n;
};
const int = (v: string | undefined): number | null => {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
};

/** Safely coerce a user-supplied string to a Prisma enum value, returning
 *  `undefined` (which tells Prisma "use default") when the value doesn't match. */
function toEnum<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return (allowed as readonly string[]).includes(upper) ? (upper as T) : undefined;
}

/** Build an object of optional DB fields from mapped user data.
 *  Only includes fields that the user actually provided a non-empty value for.
 *  This prevents Prisma from generating SQL for columns that may not yet exist
 *  in the database (pending migration), and avoids overwriting existing data
 *  with null when the user simply didn't map that column. */
function optFields(
  data: Record<string, string>,
  specs: Array<{ k: string; t?: "d" | "i" | "dt" }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { k, t } of specs) {
    const v = data[k];
    if (!v) continue;
    switch (t) {
      case "d":  { const n = decimal(v); if (n !== null) out[k] = n; break; }
      case "i":  { const n = int(v);     if (n !== null) out[k] = n; break; }
      case "dt": { const d = new Date(v); if (!isNaN(d.getTime())) out[k] = d; break; }
      default:   out[k] = v;
    }
  }
  return out;
}

/** Turn a raw Prisma / internal error into a short message a non-technical user
 *  can understand when it appears in the import results UI. */
function friendlyError(e: unknown, rowHint?: string): string {
  const raw = e instanceof Error ? e.message : String(e);
  const prefix = rowHint ? `Row ${rowHint}: ` : "";

  if (raw.includes("column") && raw.includes("not availabl"))
    return `${prefix}A recent schema update hasn't been applied to the database yet. Please contact your admin to run pending migrations.`;
  if (raw.includes("Unique constraint"))
    return `${prefix}Duplicate record — a record with this key already exists.`;
  if (raw.includes("Foreign key constraint"))
    return `${prefix}A referenced record was not found. Make sure related data (e.g. Products, Suppliers) is imported first.`;
  if (raw.includes("Invalid") && raw.includes("invocation"))
    return `${prefix}A database query failed. This usually means a schema migration is pending — please contact your admin.`;

  // Fallback: strip Prisma class prefix and truncate
  return `${prefix}${raw.replace(/^PrismaClient\w+Error:\s*/i, "").slice(0, 150)}`;
}

const PO_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
const SO_STATUSES = ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const WO_STATUSES = ["PLANNED", "RELEASED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/** Sensible defaults for non-identity required fields when missing from source data.
 *  Sentinel values prefixed with "__" are resolved at runtime from other canonical
 *  fields (e.g. "__sku__" means "use the value of data.sku"). */
const ENTITY_DEFAULTS: Partial<Record<string, Record<string, string | number>>> = {
  BOM: { quantity: 1 },
  Product: { name: "__sku__" },
  Supplier: { name: "__code__" },
  InventoryItem: { quantity: 0 },
  WorkCenter: { name: "__code__" },
  Customer: { name: "__code__" },
  Equipment: { name: "__code__" },
  Location: { name: "__locationId__" },
  Employee: { name: "__employeeId__" },
  PriceList: { name: "__priceListId__" },
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  const config = source.mappingConfig as MappingConfig | null;
  if (!config) {
    return NextResponse.json({ error: "No mapping configured" }, { status: 400 });
  }

  let rows = await loadRowsFromConfig(config);
  const { entity, mapping, attributeKeys = [] } = config;

  // Addition 2 — Fill-down sparse columns before the import loop
  if (config.columnClassification) {
    const sparseColumns = Object.entries(config.columnClassification)
      .filter(([, c]) => c.type === "sparse")
      .map(([col]) => col);
    if (sparseColumns.length > 0) {
      rows = fillDown(rows, sparseColumns);
    }
  }

  await prisma.dataSource.update({
    where: { id },
    data: { status: "PROCESSING" },
  });

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const newEntityIds: Array<{ entityType: ResolvableEntityType; id: string }> = [];
  // Track rows per entity type for DataQualityScore
  const entityTypeCounts: Record<string, { totalRows: number; importedRows: number }> = {};
  // Addition 1 — Per-entity created vs updated delta tracking
  const delta: Record<string, { created: number; updated: number; deactivated?: number }> = {};

  // Snapshot import: track successfully processed unique keys for post-upsert deactivation
  const snapshotConfig = SNAPSHOT_ENTITIES[entity];
  const processedKeys = new Set<string>();

  // Track notes for informational messages (e.g. defaulted values) shown on done screen
  const notes: string[] = [];
  const defaultCounts: Record<string, Record<string, number>> = {};

  // Diagnostic: log the mapping and first row keys so we can debug mapping failures.
  if (rows.length > 0) {
    const firstRowKeys = Object.keys(rows[0]);
    const mappingEntries = Object.entries(mapping);
    console.log(
      `[process] entity=${entity}, mappingKeys=[${mappingEntries.map(([k, v]) => `${k}→${v}`).join(", ")}], firstRowCols=[${firstRowKeys.join(", ")}]`
    );
    // Check for header mismatches — mapping references a source column not in the row
    for (const [canonical, source] of mappingEntries) {
      if (source && !firstRowKeys.includes(source)) {
        console.warn(`[process] MISMATCH: mapping.${canonical}="${source}" not found in row keys`);
      }
    }
  }

  try {
    for (let rowNum = 0; rowNum < rows.length; rowNum++) {
      const row = rows[rowNum];
      const { canonical, attributes } = applyMappingWithAttributes(row, mapping, attributeKeys);

      // Skip empty rows (common in Excel exports with trailing blanks)
      if (Object.values(canonical).every((v) => v == null || v === "")) {
        skipped++;
        continue;
      }

      // Track total rows per entity type
      if (!entityTypeCounts[entity]) {
        entityTypeCounts[entity] = { totalRows: 0, importedRows: 0 };
      }
      entityTypeCounts[entity].totalRows++;

      // Apply sensible defaults for non-identity required fields when missing.
      // This allows multi-entity imports to succeed even when not all required
      // columns are mapped (e.g. BOM quantity defaults to 1).
      const defaults = ENTITY_DEFAULTS[entity];
      if (defaults) {
        for (const [field, defaultVal] of Object.entries(defaults)) {
          if (canonical[field] == null || String(canonical[field]).trim() === "") {
            // Resolve sentinel values like "__sku__" → canonical.sku
            if (typeof defaultVal === "string" && defaultVal.startsWith("__") && defaultVal.endsWith("__")) {
              const sourceField = defaultVal.slice(2, -2);
              canonical[field] = canonical[sourceField] ?? String(defaultVal);
            } else {
              canonical[field] = String(defaultVal);
            }
            if (!defaultCounts[entity]) defaultCounts[entity] = {};
            defaultCounts[entity][field] = (defaultCounts[entity][field] ?? 0) + 1;
          }
        }
      }

      try {
        const result = await upsertEntity(entity, canonical, attributes, ctx.org.id, delta);
        if (result === null) {
          // Validation skip — required fields missing or parent not found
          console.error(`[process] SKIP Row ${rowNum + 1} (${entity}): validation returned null — required fields missing or parent not found. canonical=`, JSON.stringify(canonical));
          skipped++;
          // Surface a helpful error so the user knows WHY the row was skipped
          const entityFields = CANONICAL_FIELDS[entity as EntityType];
          if (entityFields) {
            const missing = entityFields
              .filter((f) => f.required && (!canonical[f.field] || String(canonical[f.field]).trim() === ""))
              .map((f) => f.label);
            if (missing.length > 0) {
              errors.push(`Row ${rowNum + 1}: Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}`);
            } else {
              errors.push(`Row ${rowNum + 1}: Skipped — required fields missing or parent not found`);
            }
          } else {
            errors.push(`Row ${rowNum + 1}: Skipped — validation failed`);
          }
        } else if (result === UPSERTED_CREATE || result === UPSERTED_UPDATE) {
          imported++;
          entityTypeCounts[entity].importedRows++;
          // Track delta
          if (!delta[entity]) delta[entity] = { created: 0, updated: 0 };
          if (result === UPSERTED_CREATE) delta[entity].created++;
          else delta[entity].updated++;
          // Snapshot key tracking
          if (snapshotConfig) {
            const key = snapshotConfig.uniqueKeyExtractor(canonical);
            if (key) processedKeys.add(key);
          }
        } else {
          // Got entity ID back
          newEntityIds.push({ entityType: result.entityType, id: result.id });
          imported++;
          entityTypeCounts[entity].importedRows++;
          // Track delta
          if (!delta[entity]) delta[entity] = { created: 0, updated: 0 };
          if (result.wasUpdate) delta[entity].updated++;
          else delta[entity].created++;
          // Snapshot key tracking
          if (snapshotConfig) {
            const key = snapshotConfig.uniqueKeyExtractor(canonical);
            if (key) processedKeys.add(key);
          }
        }
      } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        console.error(
          `[process] SKIP Row ${rowNum + 1} (${entity}):`,
          err.message,
          (e as { code?: string }).code ?? '',
          err.stack,
        );
        errors.push(friendlyError(e, String(rowNum + 1)));
      }
    }

    // Addition 4 — LogicParam capture for calculated columns
    if (config.columnClassification) {
      const calculatedEntries = Object.entries(config.columnClassification)
        .filter(([, c]) => c.type === "calculated" && c.logicParamKey);
      for (const [sourceColumn, classification] of calculatedEntries) {
        try {
          if (!delta.LogicParam) delta.LogicParam = { created: 0, updated: 0 };
          const existingLp = await prisma.logicParam.findUnique({
            where: {
              organizationId_key: {
                organizationId: ctx.org.id,
                key: classification.logicParamKey!,
              },
            },
            select: { id: true },
          });
          await prisma.logicParam.upsert({
            where: {
              organizationId_key: {
                organizationId: ctx.org.id,
                key: classification.logicParamKey!,
              },
            },
            create: {
              organizationId: ctx.org.id,
              key: classification.logicParamKey!,
              value: classification.logicParamValue ?? {},
              sourceColumn,
              status: "IMPORTED",
            },
            update: {
              value: classification.logicParamValue ?? {},
              sourceColumn,
              status: "IMPORTED",
            },
          });
          if (existingLp) delta.LogicParam.updated++;
          else delta.LogicParam.created++;
        } catch (e) {
          errors.push(friendlyError(e, `LogicParam:${classification.logicParamKey}`));
        }
      }
    }

    // ── Snapshot deactivation: deactivate active records NOT in the uploaded file ──
    if (snapshotConfig && processedKeys.size > 0) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const deactivated = await (prisma as any)[snapshotConfig.model].updateMany({
          where: {
            [snapshotConfig.orgField]: ctx.org.id,
            isActive: true,
            [snapshotConfig.uniqueKeyDbField]: { notIn: Array.from(processedKeys) },
          },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedBySourceId: id,
          },
        });
        if (deactivated.count > 0) {
          if (!delta[entity]) delta[entity] = { created: 0, updated: 0 };
          delta[entity].deactivated = deactivated.count;
          await prisma.dataSource.update({
            where: { id },
            data: {
              snapshotDeactivatedCount: deactivated.count,
              snapshotCompletedAt: new Date(),
            },
          });
        }
      } catch (e) {
        console.error("[process] Snapshot deactivation error:", e);
        errors.push(`Snapshot deactivation failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const totalRows = rows.length;
    const importStatus = imported === 0 && errors.length > 0 ? "FAILED" : "COMPLETED";

    await prisma.dataSource.update({
      where: { id },
      data: {
        status: importStatus,
        importedRows: imported,
        errorMessage: errors.length > 0 ? errors.slice(0, 5).join("; ") : null,
        normalizationStatus: "pending",
      },
    });

    // Run the normalization pipeline in the background — do not block the response.
    const dataSourceId = id;
    const organizationId = ctx.org.id;
    setTimeout(() => {
      runNormalizationPipeline(organizationId, dataSourceId, newEntityIds, entityTypeCounts).catch(
        (err) => console.error("[normalization] pipeline error:", err),
      );
    }, 0);

    // Build informational notes from defaulted field counts
    for (const [ent, fields] of Object.entries(defaultCounts)) {
      for (const [field, count] of Object.entries(fields)) {
        const label = (CANONICAL_FIELDS[ent as EntityType] ?? [])
          .find((f) => f.field === field)?.label ?? field;
        notes.push(`${label} defaulted for ${count} ${ent} row${count > 1 ? "s" : ""}`);
      }
    }

    return NextResponse.json({ imported, skipped, total: totalRows, errors: errors.slice(0, 5), delta, notes });
  } catch (err) {
    console.error("[process] Unexpected error during import:", err);
    await prisma.dataSource.update({
      where: { id },
      data: { status: "FAILED", errorMessage: String(err), normalizationStatus: "failed" },
    });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function runNormalizationPipeline(
  organizationId: string,
  dataSourceId: string,
  newEntityIds: Array<{ entityType: ResolvableEntityType; id: string }>,
  entityTypeCounts: Record<string, { totalRows: number; importedRows: number }>,
): Promise<void> {
  try {
    // 1. Resolve duplicates for each newly imported resolvable entity
    await Promise.all(
      newEntityIds.map(({ entityType, id }) =>
        resolveEntity(organizationId, entityType, id).catch((err) =>
          console.error(`[normalization] resolveEntity failed for ${entityType}/${id}:`, err),
        ),
      ),
    );

    // 2. Link unresolved FKs and repair post-merge references
    await linkRelationships(organizationId);

    // 3. Recalculate completeness report
    await calculateCompleteness(organizationId);

    // 4. Compute DataQualityScore per entity type and update freshness
    const dataQualityScores: Record<string, number> = {};
    await Promise.all(
      Object.entries(entityTypeCounts).map(async ([entityType, { totalRows, importedRows }]) => {
        const [score] = await Promise.all([
          computeDataQualityScore(organizationId, entityType, totalRows, importedRows),
          updateFreshness(organizationId, entityType, importedRows).catch((err) =>
            console.error(`[normalization] updateFreshness failed for ${entityType}:`, err),
          ),
        ]);
        dataQualityScores[entityType] = score;
      }),
    );

    // 5. Run consistency checks
    await checkConsistency(organizationId).catch((err) =>
      console.error("[normalization] checkConsistency failed:", err),
    );

    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { normalizationStatus: "complete", dataQualityScores },
    });

    // Invalidate AI chat context cache so next chat message picks up new data
    invalidateOrgContextCache(organizationId);
  } catch (err) {
    console.error("[normalization] pipeline failed:", err);
    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { normalizationStatus: "failed" },
    });
  }
}

/** Sentinels: upsert ran but this entity type doesn't track IDs. */
const UPSERTED_CREATE = Symbol("upserted_create");
const UPSERTED_UPDATE = Symbol("upserted_update");
type UpsertResult =
  | { entityType: ResolvableEntityType; id: string; wasUpdate: boolean }
  | typeof UPSERTED_CREATE
  | typeof UPSERTED_UPDATE
  | null;

async function upsertEntity(
  entity: string,
  data: Record<string, string>,
  attributes: Record<string, string>,
  orgId: string,
  delta?: Record<string, { created: number; updated: number }>,
): Promise<UpsertResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = Object.keys(attributes).length > 0 ? (attributes as any) : undefined;

  switch (entity) {
    case "Product": {
      if (!data.sku || !data.name) return null;
      const prodOpt = optFields(data, [
        { k: "description" }, { k: "category" }, { k: "unit" },
        { k: "unitCost", t: "d" }, { k: "externalId" },
        { k: "productFamily" }, { k: "shelfLifeDays", t: "i" },
        { k: "drawingNumber" }, { k: "drawingRevision" },
        { k: "abcClass" }, { k: "productLine" },
        { k: "regulatoryClass" }, { k: "listPrice", t: "d" },
      ]);
      const existingProduct = await prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        select: { id: true },
      });
      const product = await prisma.product.upsert({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        create: { organizationId: orgId, sku: data.sku, name: data.name, ...prodOpt, attributes: attrs },
        update: { name: data.name, ...prodOpt, attributes: attrs },
        select: { id: true },
      });
      return { entityType: "Product", id: product.id, wasUpdate: !!existingProduct };
    }
    case "Supplier": {
      if (!data.code || !data.name) return null;
      const supOpt = optFields(data, [
        { k: "email" }, { k: "phone" }, { k: "country" },
        { k: "leadTimeDays", t: "i" }, { k: "paymentTerms" },
        { k: "city" }, { k: "leadTimeCategory" },
        { k: "qualityRating", t: "d" }, { k: "onTimePct", t: "d" },
        { k: "certifications" }, { k: "status" }, { k: "approvedSince", t: "dt" },
      ]);
      const existingSupplier = await prisma.supplier.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        select: { id: true },
      });
      const supplier = await prisma.supplier.upsert({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        create: { organizationId: orgId, code: data.code, name: data.name, ...supOpt, attributes: attrs },
        update: { name: data.name, ...supOpt, attributes: attrs },
        select: { id: true },
      });
      return { entityType: "Supplier", id: supplier.id, wasUpdate: !!existingSupplier };
    }
    case "InventoryItem": {
      // Accept qtyOnHand or qtyOnHold as a fallback for quantity — rows that only
      // carry a hold/QA quantity are still valid inventory records.
      const invQty = data.quantity || data.qtyOnHand || data.qtyOnHold;
      if (!data.sku || invQty == null || invQty === "") return null;
      // Auto-create product stub so inventory rows are never silently dropped.
      const existingProduct = await prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        select: { id: true },
      });
      const invProduct = existingProduct
        ? existingProduct
        : await prisma.product.create({
            data: { organizationId: orgId, sku: data.sku, name: data.name || data.sku },
            select: { id: true },
          });
      if (!existingProduct && delta) {
        if (!delta.Product) delta.Product = { created: 0, updated: 0 };
        delta.Product.created++;
      }

      let locationId: string | null = null;
      if (data.locationCode) {
        const existingLoc = await prisma.location.findUnique({
          where: { organizationId_code: { organizationId: orgId, code: data.locationCode } },
          select: { id: true },
        });
        const loc = existingLoc
          ? existingLoc
          : await prisma.location.create({
              data: { organizationId: orgId, code: data.locationCode, name: data.locationCode },
              select: { id: true },
            });
        if (!existingLoc && delta) {
          if (!delta.Location) delta.Location = { created: 0, updated: 0 };
          delta.Location.created++;
        }
        locationId = loc.id;
      }

      const invOpt = optFields(data, [
        { k: "reorderPoint", t: "d" }, { k: "reorderQty", t: "d" },
        { k: "outflow7d", t: "i" }, { k: "outflow30d", t: "i" },
        { k: "outflow60d", t: "i" }, { k: "outflow92d", t: "i" },
        // v2 quantity fields
        { k: "qtyOnHold", t: "d" }, { k: "qtyOnHandTotal", t: "d" },
        { k: "qtyOpenPO", t: "d" }, { k: "qtyOnHandPlusPO", t: "d" },
        // Demand fields
        { k: "demandCurrentMonth", t: "d" }, { k: "demandNextMonth", t: "d" },
        { k: "demandMonth3", t: "d" }, { k: "demandPerDay", t: "d" },
        { k: "daysOfSupply", t: "d" },
        // Receipt & replenishment
        { k: "lastReceiptDate", t: "dt" },
        { k: "recommendedQty", t: "d" },
        { k: "moq", t: "i" }, { k: "orderMultiple", t: "i" }, { k: "leadTimeDays", t: "i" },
        // Cost fields
        { k: "unitCost", t: "d" }, { k: "totalValue", t: "d" },
      ]);
      // String / boolean fields that optFields doesn't cover
      if (data.uom) invOpt.uom = data.uom;
      if (data.lotId) invOpt.lotId = data.lotId;
      if (data.buyRecommendation) {
        const br = data.buyRecommendation.trim().toLowerCase();
        invOpt.buyRecommendation = br === "true" || br === "yes" || br === "1";
      }
      // Null locationId requires special handling: PostgreSQL unique constraints
      // treat NULL ≠ NULL, so upsert/ON CONFLICT can't match null locationId.
      // Split into findFirst + create/update to avoid silent duplicates.
      const invData = { quantity: decimal(invQty) ?? 0, ...invOpt, attributes: attrs };
      const existingInv = locationId
        ? await prisma.inventoryItem.findUnique({
            where: {
              organizationId_productId_locationId: {
                organizationId: orgId,
                productId: invProduct.id,
                locationId,
              },
            },
            select: { id: true },
          })
        : await prisma.inventoryItem.findFirst({
            where: { organizationId: orgId, productId: invProduct.id, locationId: null },
            select: { id: true },
          });

      if (existingInv) {
        await prisma.inventoryItem.update({
          where: { id: existingInv.id },
          data: invData,
          select: { id: true },
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            organizationId: orgId,
            productId: invProduct.id,
            locationId,
            ...invData,
          },
          select: { id: true },
        });
      }
      return existingInv ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "BOM": {
      // Only identity fields (parentSku, componentSku) are hard-required.
      // quantity defaults to 1 via ENTITY_DEFAULTS when missing.
      if (!data.parentSku || !data.componentSku) return null;

      // Auto-create product stubs so BOM rows are never silently dropped.
      const [parent, child] = await Promise.all([
        prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: data.parentSku } },
          create: { organizationId: orgId, sku: data.parentSku, name: data.parentName || data.parentSku },
          update: data.parentName ? { name: data.parentName } : {},
          select: { id: true },
        }),
        prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: data.componentSku } },
          create: { organizationId: orgId, sku: data.componentSku, name: data.componentName || data.componentSku },
          update: data.componentName ? { name: data.componentName } : {},
          select: { id: true },
        }),
      ]);
      const bomOpt = optFields(data, [
        { k: "unit" }, { k: "scrapFactor", t: "d" },
      ]);
      // Guard: scrapFactor is Decimal(6,4) — max 99.9999. Drop misclassified
      // values that would cause a P2020 numeric overflow.
      if (typeof bomOpt.scrapFactor === "number" && (bomOpt.scrapFactor > 99.9999 || bomOpt.scrapFactor < 0)) {
        delete bomOpt.scrapFactor;
      }
      const existingBom = await prisma.bOMItem.findUnique({
        where: { parentId_childId: { parentId: parent.id, childId: child.id } },
        select: { id: true },
      });
      await prisma.bOMItem.upsert({
        where: { parentId_childId: { parentId: parent.id, childId: child.id } },
        create: { parentId: parent.id, childId: child.id, quantity: decimal(data.quantity) ?? 1, ...bomOpt, attributes: attrs },
        update: { quantity: decimal(data.quantity) ?? 1, ...bomOpt, attributes: attrs },
        select: { id: true },
      });
      return existingBom ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "ForecastEntry": {
      if (!data.sku || !data.period || data.forecastQty == null || data.forecastQty === "") return null;
      const fcOpt = optFields(data, [{ k: "forecastUnit" }, { k: "channel" }, { k: "version" }]);
      const existingFc = await prisma.forecastEntry.findFirst({
        where: {
          organizationId: orgId, sku: data.sku, period: data.period,
          channel: data.channel ?? null, version: data.version ?? null,
        },
        select: { id: true },
      });
      await prisma.forecastEntry.upsert({
        where: {
          organizationId_sku_period_channel_version: {
            organizationId: orgId, sku: data.sku, period: data.period,
            channel: data.channel ?? null, version: data.version ?? null,
          },
        },
        create: { organizationId: orgId, sku: data.sku, period: data.period, forecastQty: decimal(data.forecastQty) ?? 0, ...fcOpt, attributes: attrs },
        update: { forecastQty: decimal(data.forecastQty) ?? 0, ...fcOpt, attributes: attrs },
        select: { id: true },
      });
      return existingFc ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "MpsEntry": {
      if (!data.sku || !data.period || data.plannedQty == null || data.plannedQty === "") return null;
      const mpsOpt = optFields(data, [{ k: "confirmedQty", t: "d" }, { k: "workCenter" }]);
      const existingMps = await prisma.mpsEntry.findFirst({
        where: {
          organizationId: orgId, sku: data.sku, period: data.period, workCenter: data.workCenter ?? null,
        },
        select: { id: true },
      });
      await prisma.mpsEntry.upsert({
        where: {
          organizationId_sku_period_workCenter: {
            organizationId: orgId, sku: data.sku, period: data.period, workCenter: data.workCenter ?? null,
          },
        },
        create: { organizationId: orgId, sku: data.sku, period: data.period, plannedQty: decimal(data.plannedQty) ?? 0, ...mpsOpt, attributes: attrs },
        update: { plannedQty: decimal(data.plannedQty) ?? 0, ...mpsOpt, attributes: attrs },
        select: { id: true },
      });
      return existingMps ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "WorkOrder": {
      if (!data.orderNumber || !data.sku || data.plannedQty == null || data.plannedQty === "") return null;
      const woStatus = toEnum(data.status, WO_STATUSES);
      const woOpt = optFields(data, [
        { k: "actualQty", t: "d" }, { k: "unit" }, { k: "workCenter" },
        { k: "scheduledDate", t: "dt" }, { k: "dueDate", t: "dt" },
        { k: "routingId" }, { k: "productionLine" }, { k: "yieldPct", t: "d" },
        { k: "lotNumber" }, { k: "operatorLeadId" },
      ]);
      const existingWo = await prisma.workOrder.findUnique({
        where: { organizationId_orderNumber: { organizationId: orgId, orderNumber: data.orderNumber } },
        select: { id: true },
      });
      await prisma.workOrder.upsert({
        where: { organizationId_orderNumber: { organizationId: orgId, orderNumber: data.orderNumber } },
        create: { organizationId: orgId, orderNumber: data.orderNumber, sku: data.sku, plannedQty: decimal(data.plannedQty) ?? 0, status: woStatus ?? "PLANNED", ...woOpt, attributes: attrs },
        update: { sku: data.sku, plannedQty: decimal(data.plannedQty) ?? 0, ...woOpt, ...(woStatus && { status: woStatus }), attributes: attrs },
        select: { id: true },
      });
      return existingWo ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "Routing": {
      if (!data.sku || !data.operationNo || !data.workCenter) return null;
      const opNo = int(data.operationNo);
      if (opNo === null) return null;
      const rtOpt = optFields(data, [
        { k: "description" }, { k: "setupTimeMins", t: "d" }, { k: "runTimeMins", t: "d" },
        { k: "runTimeUnit" }, { k: "status" },
        { k: "effectiveFrom", t: "dt" }, { k: "effectiveTo", t: "dt" },
        { k: "approvedBy" }, { k: "approvalDate", t: "dt" },
      ]);
      const existingRt = await prisma.routing.findUnique({
        where: { organizationId_sku_operationNo: { organizationId: orgId, sku: data.sku, operationNo: opNo } },
        select: { id: true },
      });
      await prisma.routing.upsert({
        where: { organizationId_sku_operationNo: { organizationId: orgId, sku: data.sku, operationNo: opNo } },
        create: { organizationId: orgId, sku: data.sku, operationNo: opNo, workCenter: data.workCenter, ...rtOpt, attributes: attrs },
        update: { workCenter: data.workCenter, ...rtOpt, attributes: attrs },
        select: { id: true },
      });
      return existingRt ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "WorkCenter": {
      if (!data.code || !data.name) return null;
      const wcOpt = optFields(data, [
        { k: "description" }, { k: "availableHoursPerWeek", t: "d" },
        { k: "efficiency", t: "d" }, { k: "costRatePerHour", t: "d" },
        { k: "calendar" }, { k: "department" }, { k: "capacityHrsDay", t: "d" },
        { k: "operatorsPerShift", t: "i" }, { k: "shiftsPerDay", t: "i" },
        { k: "availableDaysWeek", t: "i" }, { k: "oeeTargetPct", t: "d" },
        { k: "oeeCurrentPct", t: "d" }, { k: "notes" },
      ]);
      const existingWc = await prisma.workCenter.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        select: { id: true },
      });
      await prisma.workCenter.upsert({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        create: { organizationId: orgId, code: data.code, name: data.name, ...wcOpt, attributes: attrs },
        update: { name: data.name, ...wcOpt, attributes: attrs },
        select: { id: true },
      });
      return existingWc ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "Customer": {
      if (!data.code || !data.name) return null;
      const custOpt = optFields(data, [
        { k: "contactName" }, { k: "email" }, { k: "phone" },
        { k: "country" }, { k: "currency" }, { k: "paymentTerms" },
        { k: "creditLimit", t: "d" }, { k: "type" }, { k: "city" },
        { k: "vatNumber" }, { k: "accountManagerId" }, { k: "status" },
        { k: "sinceDate", t: "dt" },
      ]);
      const existingCust = await prisma.customer.findUnique({
        where: { orgId_code: { orgId, code: data.code } },
        select: { id: true },
      });
      const customer = await prisma.customer.upsert({
        where: { orgId_code: { orgId, code: data.code } },
        create: { orgId, code: data.code, name: data.name, ...custOpt, attributes: attrs },
        update: { name: data.name, ...custOpt, attributes: attrs },
        select: { id: true },
      });
      return { entityType: "Customer", id: customer.id, wasUpdate: !!existingCust };
    }
    case "PurchaseOrder": {
      if (!data.poNumber || !data.supplierId) return null;
      // Auto-create supplier stub so PO rows are never silently dropped.
      const poSupplier = await prisma.supplier.upsert({
        where: { organizationId_code: { organizationId: orgId, code: data.supplierId } },
        create: { organizationId: orgId, code: data.supplierId, name: data.supplierId },
        update: {},
        select: { id: true },
      });
      const poStatus = toEnum(data.status, PO_STATUSES);
      const poOpt = optFields(data, [
        { k: "totalAmount", t: "d" }, { k: "expectedDate", t: "dt" },
        { k: "notes" }, { k: "orderDate", t: "dt" }, { k: "totalLines", t: "i" },
        { k: "buyerId" }, { k: "approvedBy" }, { k: "poType" },
      ]);
      const existingPo = await prisma.purchaseOrder.findUnique({
        where: { orgId_poNumber: { orgId, poNumber: data.poNumber } },
        select: { id: true },
      });
      await prisma.purchaseOrder.upsert({
        where: { orgId_poNumber: { orgId, poNumber: data.poNumber } },
        create: { orgId, poNumber: data.poNumber, supplierId: poSupplier.id, status: poStatus ?? "DRAFT", currency: data.currency || "USD", ...poOpt, attributes: attrs },
        update: { ...(poStatus && { status: poStatus }), ...(data.currency && { currency: data.currency }), ...poOpt, attributes: attrs },
        select: { id: true },
      });
      return existingPo ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "POLine": {
      if (!data.purchaseOrderId || !data.sku || data.qtyOrdered == null || data.qtyOrdered === "") return null;
      const po = await prisma.purchaseOrder.findFirst({
        where: { orgId, poNumber: data.purchaseOrderId },
        select: { id: true, attributes: true },
      });
      if (!po) return null;
      const poProduct = await prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        select: { id: true },
      });
      if (!poProduct) {
        // Product not yet loaded — store for deferred resolution
        const newAttrs = await addToPendingArray(
          orgId, "PRODUCT", po.id, "pendingPOLines",
          { sku: data.sku, qty: data.qtyOrdered, unitCost: data.unitCost, uom: data.uom, notes: data.notes },
          (po.attributes ?? null) as Record<string, unknown> | null,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.purchaseOrder.update({ where: { id: po.id }, data: { attributes: newAttrs as any } });
        return UPSERTED_CREATE;
      }
      const lineNumber = int(data.lineNumber) ?? ((await prisma.pOLine.count({ where: { purchaseOrderId: po.id } })) + 1);
      const polOpt = optFields(data, [
        { k: "qtyReceived", t: "d" }, { k: "qtyOpen", t: "d" },
        { k: "expectedDate", t: "dt" }, { k: "confirmedETA", t: "dt" },
        { k: "lineValue", t: "d" }, { k: "status" }, { k: "notes" },
      ]);
      const existingPol = await prisma.pOLine.findUnique({
        where: { id: `${po.id}_${lineNumber}` },
        select: { id: true },
      });
      await prisma.pOLine.upsert({
        where: { id: `${po.id}_${lineNumber}` },
        create: {
          id: `${po.id}_${lineNumber}`, purchaseOrderId: po.id, productId: poProduct.id, lineNumber,
          qtyOrdered: decimal(data.qtyOrdered) ?? 0, unitCost: decimal(data.unitCost) ?? 0, uom: data.uom || "EA",
          ...polOpt,
        },
        update: {
          qtyOrdered: decimal(data.qtyOrdered) ?? 0, unitCost: decimal(data.unitCost) ?? 0,
          ...(data.uom && { uom: data.uom }), ...polOpt,
        },
        select: { id: true },
      });
      return existingPol ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "SalesOrder": {
      if (!data.soNumber || !data.customerId) return null;
      // Auto-create customer stub so SO rows are never silently dropped.
      const soCustomer = await prisma.customer.upsert({
        where: { orgId_code: { orgId, code: data.customerId } },
        create: { orgId, code: data.customerId, name: data.customerId },
        update: {},
        select: { id: true },
      });
      const soStatus = toEnum(data.status, SO_STATUSES);
      const soOpt = optFields(data, [
        { k: "totalAmount", t: "d" }, { k: "requestedDate", t: "dt" },
        { k: "shippingAddress" }, { k: "notes" }, { k: "orderDate", t: "dt" },
        { k: "actualShipDate", t: "dt" }, { k: "paymentTerms" }, { k: "salesRepId" },
        { k: "incoterms" }, { k: "shipToLocationId" }, { k: "customerPoRef" },
      ]);
      const existingSo = await prisma.salesOrder.findUnique({
        where: { orgId_soNumber: { orgId, soNumber: data.soNumber } },
        select: { id: true },
      });
      await prisma.salesOrder.upsert({
        where: { orgId_soNumber: { orgId, soNumber: data.soNumber } },
        create: { orgId, soNumber: data.soNumber, customerId: soCustomer.id, status: soStatus ?? "DRAFT", currency: data.currency || "USD", ...soOpt, attributes: attrs },
        update: { ...(soStatus && { status: soStatus }), ...(data.currency && { currency: data.currency }), ...soOpt, attributes: attrs },
        select: { id: true },
      });
      return existingSo ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "BOMHeader": {
      if (!data.productId || !data.version) return null;
      const bomProduct = await prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: data.productId } },
        select: { id: true },
      }) ?? await prisma.product.upsert({
        where: { organizationId_sku: { organizationId: orgId, sku: data.productId } },
        create: { organizationId: orgId, sku: data.productId, name: data.productId },
        update: {},
        select: { id: true },
      });
      const isActiveBOM = data.isActive ? data.isActive.toLowerCase() !== "false" && data.isActive !== "0" : false;
      const bhOpt = optFields(data, [
        { k: "effectiveFrom", t: "dt" }, { k: "effectiveTo", t: "dt" },
        { k: "yieldPct", t: "d" }, { k: "notes" }, { k: "status" },
        { k: "totalComponents", t: "i" }, { k: "totalBomCost", t: "d" },
        { k: "applicableStandard" }, { k: "createdBy" },
        { k: "approvedBy" }, { k: "approvalDate", t: "dt" },
      ]);
      const existingBh = await prisma.bOMHeader.findFirst({
        where: { orgId, productId: bomProduct.id, version: data.version },
        select: { id: true },
      });
      await prisma.bOMHeader.upsert({
        where: { orgId_productId_version: { orgId, productId: bomProduct.id, version: data.version } },
        create: { orgId, productId: bomProduct.id, version: data.version, isActive: isActiveBOM, ...bhOpt, attributes: attrs },
        update: { isActive: isActiveBOM, ...bhOpt, attributes: attrs },
        select: { id: true },
      });
      return existingBh ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "Location": {
      const locCode = data.locationId || data.code;
      const locName = data.name || locCode;
      if (!locCode) return null;
      const locOpt = optFields(data, [
        { k: "type" }, { k: "city" }, { k: "countryCode" }, { k: "notes" },
      ]);
      const existingLoc = await prisma.location.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: locCode } },
        select: { id: true },
      });
      await prisma.location.upsert({
        where: { organizationId_code: { organizationId: orgId, code: locCode } },
        create: { organizationId: orgId, code: locCode, name: locName, ...locOpt, attributes: attrs },
        update: { name: locName, ...locOpt, attributes: attrs },
        select: { id: true },
      });
      return existingLoc ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "Equipment": {
      if (!data.code || !data.name) return null;
      let equipLocId: string | null = null;
      if (data.locationCode) {
        const eLoc = await prisma.location.upsert({
          where: { organizationId_code: { organizationId: orgId, code: data.locationCode } },
          create: { organizationId: orgId, code: data.locationCode, name: data.locationCode },
          update: {},
          select: { id: true },
        });
        equipLocId = eLoc.id;
      }
      const validStatuses = ["OPERATIONAL", "MAINTENANCE", "DOWN", "RETIRED"] as const;
      const equipStatus = (validStatuses as readonly string[]).includes(data.status ?? "")
        ? (data.status as typeof validStatuses[number])
        : "OPERATIONAL";
      const eqOpt = optFields(data, [
        { k: "type" }, { k: "serialNumber" }, { k: "manufacturer" },
        { k: "purchasedAt", t: "dt" }, { k: "warrantyExpiry", t: "dt" },
        { k: "installationDate", t: "dt" }, { k: "maintenanceIntervalDays", t: "i" },
        { k: "lastPmDate", t: "dt" }, { k: "calibrationDue", t: "dt" }, { k: "notes" },
      ]);
      const existingEq = await prisma.equipment.findUnique({
        where: { orgId_code: { orgId, code: data.code } },
        select: { id: true },
      });
      await prisma.equipment.upsert({
        where: { orgId_code: { orgId, code: data.code } },
        create: { orgId, code: data.code, name: data.name, locationId: equipLocId, status: equipStatus, ...eqOpt, attributes: attrs },
        update: { name: data.name, locationId: equipLocId, status: equipStatus, ...eqOpt, attributes: attrs },
        select: { id: true },
      });
      return existingEq ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    default:
      return null;
  }
}
