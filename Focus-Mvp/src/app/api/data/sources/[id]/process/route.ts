export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { POStatus } from "@prisma/client";
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
import { deleteEntityData } from "@/lib/ingestion/entity-cleanup";

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

// Truthy / falsy token sets for boolean CSV fields. Values outside both sets
// (e.g. a typo or unexpected label) are left unwritten so we never force a
// `false` onto a field the user intended to leave unset.
const BOOL_TRUE_TOKENS = new Set(["y", "yes", "true", "1", "x"]);
const BOOL_FALSE_TOKENS = new Set(["n", "no", "false", "0", ""]);

/** Build an object of optional DB fields from mapped user data.
 *  Only includes fields that the user actually provided a non-empty value for.
 *  This prevents Prisma from generating SQL for columns that may not yet exist
 *  in the database (pending migration), and avoids overwriting existing data
 *  with null when the user simply didn't map that column. */
function optFields(
  data: Record<string, string>,
  specs: Array<{ k: string; t?: "d" | "i" | "dt" | "b" }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { k, t } of specs) {
    const v = data[k];
    if (v == null || v === "") continue;
    switch (t) {
      case "d":  { const n = decimal(v); if (n !== null) out[k] = n; break; }
      case "i":  { const n = int(v);     if (n !== null) out[k] = n; break; }
      case "dt": { const d = new Date(v); if (!isNaN(d.getTime())) out[k] = d; break; }
      case "b":  {
        const lower = String(v).trim().toLowerCase();
        if (BOOL_TRUE_TOKENS.has(lower)) out[k] = true;
        else if (BOOL_FALSE_TOKENS.has(lower)) out[k] = false;
        // Unrecognised boolean token — don't write anything, so an existing
        // value isn't clobbered by a typo.
        break;
      }
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

/** Translate common plain-English PO status labels ("Open", "Approved",
 *  "Partially Received", "Closed", …) into the strict POStatus enum values
 *  before we hand them to Prisma. Unknown labels fall back to undefined so
 *  the caller can default the row to DRAFT instead of dying on a Prisma
 *  enum-validation error for one misspelled cell. */
function normalisePOStatus(raw: string | undefined): POStatus | undefined {
  if (!raw) return undefined;
  // Prisma's POStatus enum has no CLOSED member — "Closed" / "Completed" /
  // "Received" all collapse onto RECEIVED, which is the terminal state.
  const map: Record<string, POStatus> = {
    open: "SENT",
    sent: "SENT",
    approved: "CONFIRMED",
    confirmed: "CONFIRMED",
    partial: "PARTIAL",
    "partially received": "PARTIAL",
    "partially delivered": "PARTIAL",
    closed: "RECEIVED",
    complete: "RECEIVED",
    completed: "RECEIVED",
    received: "RECEIVED",
    cancelled: "CANCELLED",
    canceled: "CANCELLED",
    draft: "DRAFT",
  };
  const lower = raw.toLowerCase().trim();
  if (map[lower]) return map[lower];
  const upper = raw.toUpperCase().trim().replace(/[\s-]+/g, "_");
  return (PO_STATUSES as readonly string[]).includes(upper)
    ? (upper as POStatus)
    : undefined;
}

/** POLine.status is a free-form String? (not enum) but we still
 *  canonicalise to Open | Partial | Closed | Cancelled so the chat's
 *  "open lines" filter `{ status: { in: ["Open","Partial"] } }` actually
 *  hits the right rows. Unknown labels pass through unchanged. */
function normalisePOLineStatus(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const map: Record<string, string> = {
    open: "Open",
    sent: "Open",
    partial: "Partial",
    "partially received": "Partial",
    "partially delivered": "Partial",
    closed: "Closed",
    complete: "Closed",
    completed: "Closed",
    received: "Closed",
    cancelled: "Cancelled",
    canceled: "Cancelled",
  };
  const lower = raw.toLowerCase().trim();
  return map[lower] ?? raw.trim();
}
const WO_STATUSES = ["PLANNED", "RELEASED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/** Sensible defaults for non-identity required fields when missing from source data.
 *  Sentinel values prefixed with "__" are resolved at runtime from other canonical
 *  fields (e.g. "__sku__" means "use the value of data.sku"). */
const ENTITY_DEFAULTS: Partial<Record<string, Record<string, string | number>>> = {
  BOM: { quantity: 1 },
  BOMLine: { qtyPer: "1", uom: "EA" },
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
  try {
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
  const importMode = config.importMode ?? "merge";

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

  // Replace mode — wipe existing entity data and old source records before importing
  if (importMode === "replace") {
    console.log(`[process] replace mode — deleting existing ${entity} data for org ${ctx.org.id}`);
    await deleteEntityData(ctx.org.id, entity);
    // Also delete old DataSource records for the same entity (except the current one)
    await prisma.dataSource.deleteMany({
      where: {
        organizationId: ctx.org.id,
        id: { not: id },
        mappingConfig: {
          path: ["entity"],
          equals: entity,
        },
      },
    });
  }

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
    // Per-import parent-entity caches — avoids re-upserting the same
    // FG product / BOMHeader / supplier / PO / etc. once per child row.
    // See UpsertCtx for the full set.
    const upsertCtx = createUpsertCtx();

    for (let rowNum = 0; rowNum < rows.length; rowNum++) {
      const row = rows[rowNum];
      const { canonical, attributes } = applyMappingWithAttributes(row, mapping, attributeKeys);

      // Skip empty rows (common in Excel exports with trailing blanks)
      if (Object.values(canonical).every((v) => v == null || v === "")) {
        skipped++;
        continue;
      }

      // Skip rows whose orderType doesn't match the entity being imported.
      // Handles mixed PO+SO files — SO rows are silently ignored in a PO import and vice versa.
      const rawOrderType = (
        (row["orderType"] || row["order_type"] || row["Order Type"] || row["type"] || "") as string
      ).trim().toUpperCase();
      if (rawOrderType) {
        if (entity === "PurchaseOrder" && rawOrderType === "SO") { skipped++; continue; }
        if (entity === "SalesOrder" && rawOrderType === "PO") { skipped++; continue; }
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
        const result = await upsertEntity(entity, canonical, attributes, ctx.org.id, delta, id, importMode, upsertCtx);
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
        } else if (result === UPSERTED_CACHED) {
          // The upsertEntity call short-circuited on the in-run cache —
          // we've already handled this identity in this pass. Count the
          // row as imported so totals still line up with the file but
          // skip the delta bump so we don't report 476 supplier updates
          // when only 19 unique suppliers exist.
          imported++;
          entityTypeCounts[entity].importedRows++;
          if (snapshotConfig) {
            const key = snapshotConfig.uniqueKeyExtractor(canonical);
            if (key) processedKeys.add(key);
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
  } catch (err) {
    // Last-resort safety net: anything that slips past the per-step error
    // handlers above (unhandled throw from normalisePOStatus, prisma client
    // init, raw SQL, file IO) would otherwise return an empty response
    // body and leave the client UI with no error to show. Log + return
    // a structured JSON 500 so the import UI gets a real message.
    console.error("[process] UNHANDLED FATAL ERROR:", err);
    return NextResponse.json(
      {
        error: "Import failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
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
/** Returned when a per-row upsert short-circuits on the cache because we've
 *  already processed that identity (supplier code, product sku, …) in this
 *  run. The row is considered "already handled" for delta purposes — no
 *  double-count of 476 rows → 476 supplier updates when only 19 unique
 *  codes exist. */
const UPSERTED_CACHED = Symbol("upserted_cached");
type UpsertResult =
  | { entityType: ResolvableEntityType; id: string; wasUpdate: boolean }
  | typeof UPSERTED_CREATE
  | typeof UPSERTED_UPDATE
  | typeof UPSERTED_CACHED
  | null;

/** Per-import-run caches so we don't re-upsert the same parent entity for
 *  every child row. Collapses the BOMLine / POLine / SOLine / etc. N+1
 *  lookups from O(n_rows * n_parents_per_row) to O(unique_parents).
 *  Keys are pre-composed strings (e.g. `${orgId}:${sku}`) so map lookups
 *  are pure string compares. */
interface UpsertCtx {
  productCache: Map<string, string>;     // `${orgId}:${sku}` -> productId
  supplierCache: Map<string, string>;    // `${orgId}:${code}` -> supplierId
  customerCache: Map<string, string>;    // `${orgId}:${code}` -> customerId
  locationCache: Map<string, string>;    // `${orgId}:${code}` -> locationId
  bomHeaderCache: Map<string, string>;   // `${orgId}:${productId}:${version}` -> bomHeaderId
  poCache: Map<string, string>;          // `${orgId}:${poNumber}` -> purchaseOrderId
  soCache: Map<string, string>;          // `${orgId}:${soNumber}` -> salesOrderId
  woCache: Map<string, string>;          // `${orgId}:${orderNumber}` -> workOrderId
}

function createUpsertCtx(): UpsertCtx {
  return {
    productCache: new Map(),
    supplierCache: new Map(),
    customerCache: new Map(),
    locationCache: new Map(),
    bomHeaderCache: new Map(),
    poCache: new Map(),
    soCache: new Map(),
    woCache: new Map(),
  };
}

/** Consult `cache` for `key`; call `load` only on miss and cache the id for
 *  subsequent rows. `cache` is optional so callers outside the per-run
 *  pipeline (e.g. a single-row resolver) can pass undefined. */
async function cachedUpsert(
  cache: Map<string, string> | undefined,
  key: string,
  load: () => Promise<{ id: string }>,
): Promise<string> {
  if (cache) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  const { id } = await load();
  cache?.set(key, id);
  return id;
}

async function upsertEntity(
  entity: string,
  data: Record<string, string>,
  attributes: Record<string, string>,
  orgId: string,
  delta?: Record<string, { created: number; updated: number }>,
  sourceId?: string,
  importMode?: string,
  ctx?: UpsertCtx,
): Promise<UpsertResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let attrs: any = Object.keys(attributes).length > 0 ? (attributes as any) : undefined;

  switch (entity) {
    case "Product": {
      if (!data.sku || !data.name) return null;
      // Same short-circuit as Supplier: clone-pass of a 282-row inventory
      // file running entity=Product would otherwise report the primary
      // row count as supplier-like noise.
      const prodCacheKey = `${orgId}:${data.sku}`;
      if (ctx?.productCache.has(prodCacheKey)) {
        return UPSERTED_CACHED;
      }
      const prodOpt = optFields(data, [
        { k: "description" }, { k: "category" }, { k: "unit" },
        { k: "unitCost", t: "d" }, { k: "unitPrice", t: "d" },
        { k: "externalId" }, { k: "uom" },
        { k: "leadTimeDays", t: "i" }, { k: "safetyStock", t: "d" },
        { k: "productFamily" }, { k: "shelfLifeDays", t: "i" },
        { k: "drawingNumber" }, { k: "drawingRevision" },
        { k: "abcClass" }, { k: "productLine" },
        { k: "regulatoryClass" }, { k: "listPrice", t: "d" },
      ]);
      const PRODUCT_TYPES = ["FINISHED_GOOD", "RAW_MATERIAL", "COMPONENT", "SUBASSEMBLY", "SERVICE"] as const;
      const MAKE_BUY_TYPES = ["MAKE", "BUY", "OTHER"] as const;
      const prodType = toEnum(data.type, PRODUCT_TYPES);
      const makeBuy = toEnum(data.makeBuy, MAKE_BUY_TYPES);
      if (prodType) prodOpt.type = prodType;
      if (makeBuy) prodOpt.makeBuy = makeBuy;
      const existingProduct = await prisma.product.findUnique({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        select: { id: true, attributes: true },
      });

      // Merge existing attributes (possibly { isStub: true, createdBySourceId }
      // from a BOM or inventory import that auto-created this SKU) with
      // anything the real Product row carries — new keys win, and the stub
      // markers are dropped because a real Product row is now being ingested.
      const existingProdAttrs =
        (existingProduct?.attributes as Record<string, unknown> | null) ?? {};
      const incomingProdAttrs = (attrs as Record<string, unknown> | undefined) ?? {};
      const mergedProdAttrs: Record<string, unknown> = { ...existingProdAttrs, ...incomingProdAttrs };
      delete mergedProdAttrs.isStub;
      delete mergedProdAttrs.createdBySourceId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prodUpdateAttrs: any =
        Object.keys(mergedProdAttrs).length > 0 ? mergedProdAttrs : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prodCreateAttrs: any =
        Object.keys(incomingProdAttrs).length > 0 ? incomingProdAttrs : undefined;

      const product = await prisma.product.upsert({
        where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
        create: { organizationId: orgId, sku: data.sku, name: data.name, ...prodOpt, attributes: prodCreateAttrs },
        update: { name: data.name, ...prodOpt, attributes: prodUpdateAttrs },
        select: { id: true },
      });
      ctx?.productCache.set(prodCacheKey, product.id);
      return { entityType: "Product", id: product.id, wasUpdate: !!existingProduct };
    }
    case "Supplier": {
      if (!data.code || !data.name) return null;
      // Short-circuit when we've already processed this supplier code in
      // this run. Typical trigger: multi-entity clone-pass runs entity=
      // Supplier against a 476-row PO Lines file whose 19 unique codes
      // repeat; without this, delta["Supplier"].updated would reach 457.
      const supCacheKey = `${orgId}:${data.code}`;
      if (ctx?.supplierCache.has(supCacheKey)) {
        return UPSERTED_CACHED;
      }
      const supOpt = optFields(data, [
        { k: "email" }, { k: "phone" }, { k: "country" },
        { k: "leadTimeDays", t: "i" }, { k: "paymentTerms" },
        { k: "city" }, { k: "leadTimeCategory" },
        { k: "qualityRating", t: "d" }, { k: "onTimePct", t: "d" },
        { k: "certifications" }, { k: "status" }, { k: "approvedSince", t: "dt" },
      ]);
      const existingSupplier = await prisma.supplier.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        select: { id: true, attributes: true },
      });

      // Merge existing attributes (likely { isStub: true } from a prior
      // PO/SO-stub auto-create) with anything the current row carries — new
      // keys win, and the isStub marker is dropped because we are now
      // ingesting a real Supplier row.
      const existingAttrs =
        (existingSupplier?.attributes as Record<string, unknown> | null) ?? {};
      const incomingAttrs = (attrs as Record<string, unknown> | undefined) ?? {};
      const mergedAttrs: Record<string, unknown> = { ...existingAttrs, ...incomingAttrs };
      delete mergedAttrs.isStub;
      delete mergedAttrs.createdBySourceId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updateAttrs: any =
        Object.keys(mergedAttrs).length > 0 ? mergedAttrs : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createAttrs: any =
        Object.keys(incomingAttrs).length > 0 ? incomingAttrs : undefined;

      const supplier = await prisma.supplier.upsert({
        where: { organizationId_code: { organizationId: orgId, code: data.code } },
        create: { organizationId: orgId, code: data.code, name: data.name, ...supOpt, attributes: createAttrs },
        update: { name: data.name, ...supOpt, attributes: updateAttrs },
        select: { id: true },
      });
      ctx?.supplierCache.set(supCacheKey, supplier.id);
      return { entityType: "Supplier", id: supplier.id, wasUpdate: !!existingSupplier };
    }
    case "InventoryItem": {
      // Accept qtyOnHand or qtyOnHold as a fallback for quantity — rows that only
      // carry a hold/QA quantity are still valid inventory records.
      const invQty = data.quantity || data.qtyOnHand || data.qtyOnHold;
      if (!data.sku || invQty == null || invQty === "") return null;

      // Find or auto-create a minimal product stub so inventory rows are never
      // silently dropped when no Product file has been imported yet.
      // Stubs (name = sku) are excluded from product count KPIs in the apps.
      // Cached per-run so a 282-row file doesn't re-hit the same product.
      const invProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${data.sku}`,
        async () => {
          const existing = await prisma.product.findUnique({
            where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
            select: { id: true },
          });
          if (existing) return existing;
          return prisma.product.create({
            data: { organizationId: orgId, sku: data.sku, name: data.name || data.sku },
            select: { id: true },
          });
        },
      );

      let locationId: string | null = null;
      if (data.locationCode) {
        // Cache hits avoid re-querying the Location table on every row.
        // We don't auto-create Locations here (users must upload a
        // Locations/Sites file explicitly), so on miss we findUnique and
        // only cache real hits.
        const locKey = `${orgId}:${data.locationCode}`;
        const cached = ctx?.locationCache.get(locKey);
        if (cached) {
          locationId = cached;
        } else {
          const existingLoc = await prisma.location.findUnique({
            where: { organizationId_code: { organizationId: orgId, code: data.locationCode } },
            select: { id: true },
          });
          if (existingLoc) {
            locationId = existingLoc.id;
            ctx?.locationCache.set(locKey, existingLoc.id);
          }
        }
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
        // Shelf-life
        { k: "expiryDate", t: "dt" },
        // Expected: after importing a CSV with "Buy Recommendation" = "Y",
        // InventoryItem.buyRecommendation must be true (Boolean), not "Y" (String).
        { k: "buyRecommendation", t: "b" },
      ]);
      // String fields that optFields doesn't cover
      if (data.uom) invOpt.uom = data.uom;
      if (data.lotId) invOpt.lotId = data.lotId;
      // Always store the raw locationCode in attributes so null-location rows
      // from different warehouses stay distinct (NULL ≠ NULL in PG unique constraints,
      // but findFirst without a locationCode filter would still collapse them).
      if (data.locationCode) attrs = { ...attrs, locationCode: data.locationCode };
      // Tag every NEW inventory row with the source that created it.
      // On merge updates we keep the original sourceId (row was created by the first import).
      // This lets us delete only the rows added by a specific source when it is removed.
      if (sourceId) attrs = { ...attrs, sourceId };

      // Null locationId requires special handling: PostgreSQL unique constraints
      // treat NULL ≠ NULL, so upsert/ON CONFLICT can't match null locationId.
      // Split into findFirst + create/update to avoid silent duplicates.
      // When a locationCode is present but unresolved, include it in the lookup
      // so two rows with the same SKU at different warehouses aren't collapsed.
      const invData = { quantity: decimal(invQty) ?? 0, ...invOpt, attributes: attrs };
      const existingInv = locationId
        ? await prisma.inventoryItem.findUnique({
            where: {
              organizationId_productId_locationId: {
                organizationId: orgId,
                productId: invProductId,
                locationId,
              },
            },
            select: { id: true },
          })
        : await prisma.inventoryItem.findFirst({
            where: {
              organizationId: orgId,
              productId: invProductId,
              locationId: null,
              // Disambiguate by raw locationCode stored in attributes
              ...(data.locationCode
                ? { attributes: { path: ["locationCode"], equals: data.locationCode } }
                : {}),
            },
            select: { id: true },
          });

      if (existingInv) {
        // Merge: ADD quantity, keep the original sourceId (row belongs to its creator).
        // Replace: overwrite everything including sourceId (fresh import owns all rows).
        const { quantity: _qty, attributes: _attrs, ...invDataCore } = invData;
        await prisma.inventoryItem.update({
          where: { id: existingInv.id },
          data: importMode === "merge"
            ? { ...invDataCore, quantity: { increment: decimal(invQty) ?? 0 } }
            : invData,
          select: { id: true },
        });
      } else {
        await prisma.inventoryItem.create({
          data: {
            organizationId: orgId,
            productId: invProductId,
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
      // Cached: a BOM file repeating the same parentSku across 50 component
      // rows now only upserts the parent once.
      const parentId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${data.parentSku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: data.parentSku } },
          create: { organizationId: orgId, sku: data.parentSku, name: data.parentName || data.parentSku },
          update: data.parentName ? { name: data.parentName } : {},
          select: { id: true },
        }),
      );
      const childId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${data.componentSku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: data.componentSku } },
          create: { organizationId: orgId, sku: data.componentSku, name: data.componentName || data.componentSku },
          update: data.componentName ? { name: data.componentName } : {},
          select: { id: true },
        }),
      );
      const bomOpt = optFields(data, [
        { k: "unit" }, { k: "scrapFactor", t: "d" },
      ]);
      // Guard: scrapFactor is Decimal(6,4) — max 99.9999. Drop misclassified
      // values that would cause a P2020 numeric overflow.
      if (typeof bomOpt.scrapFactor === "number" && (bomOpt.scrapFactor > 99.9999 || bomOpt.scrapFactor < 0)) {
        delete bomOpt.scrapFactor;
      }
      const existingBom = await prisma.bOMItem.findUnique({
        where: { parentId_childId: { parentId, childId } },
        select: { id: true },
      });
      await prisma.bOMItem.upsert({
        where: { parentId_childId: { parentId, childId } },
        create: { parentId, childId, quantity: decimal(data.quantity) ?? 1, ...bomOpt, attributes: attrs },
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
      const custCacheKey = `${orgId}:${data.code}`;
      if (ctx?.customerCache.has(custCacheKey)) {
        return UPSERTED_CACHED;
      }
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
      ctx?.customerCache.set(custCacheKey, customer.id);
      return { entityType: "Customer", id: customer.id, wasUpdate: !!existingCust };
    }
    case "PurchaseOrder": {
      if (!data.poNumber || !data.supplierId) return null;
      // Auto-create supplier stub so PO rows are never silently dropped.
      // Cached so a PO-Headers file with 65 rows across 15 suppliers only
      // upserts each supplier once.
      const poSupplierId = await cachedUpsert(
        ctx?.supplierCache,
        `${orgId}:${data.supplierId}`,
        () => prisma.supplier.upsert({
          where: { organizationId_code: { organizationId: orgId, code: data.supplierId } },
          create: { organizationId: orgId, code: data.supplierId, name: data.supplierId },
          update: {},
          select: { id: true },
        }),
      );
      // Use the English-label-aware mapper instead of bare toEnum so CSVs
      // that export "Open" / "Partially received" / "Closed" land on the
      // right POStatus enum value instead of falling through to DRAFT.
      const poStatus = normalisePOStatus(data.status) as POStatus | undefined;
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
        create: { orgId, poNumber: data.poNumber, supplierId: poSupplierId, status: poStatus ?? "DRAFT", currency: data.currency || "USD", ...poOpt, attributes: attrs },
        update: { ...(poStatus && { status: poStatus }), ...(data.currency && { currency: data.currency }), ...poOpt, attributes: attrs },
        select: { id: true },
      });
      return existingPo ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "POLine": {
      if (!data.purchaseOrderId || !data.sku || data.qtyOrdered == null || data.qtyOrdered === "") return null;

      // Resolve parent PurchaseOrder.id by poNumber. Cached per-run because
      // the same PO typically has many lines. findFirst-on-miss stays
      // explicit so we can bail out cleanly when the header file hasn't
      // been imported yet.
      const poKey = `${orgId}:${data.purchaseOrderId}`;
      let poId = ctx?.poCache.get(poKey);
      if (!poId) {
        const found = await prisma.purchaseOrder.findFirst({
          where: { orgId, poNumber: data.purchaseOrderId },
          select: { id: true },
        });
        if (!found) return null;
        poId = found.id;
        ctx?.poCache.set(poKey, poId);
      }

      // Resolve the line's product, cached the same way as other product
      // lookups. If it doesn't exist we DON'T cache a placeholder — the
      // pending-product branch below needs the miss to keep firing until
      // the Product import lands.
      const pKey = `${orgId}:${data.sku}`;
      let poProductId = ctx?.productCache.get(pKey);
      if (!poProductId) {
        const found = await prisma.product.findUnique({
          where: { organizationId_sku: { organizationId: orgId, sku: data.sku } },
          select: { id: true },
        });
        if (found) {
          poProductId = found.id;
          ctx?.productCache.set(pKey, poProductId);
        }
      }

      if (!poProductId) {
        // Product not yet loaded — store for deferred resolution. The
        // pending-list merge needs the current PO.attributes, so fetch
        // them on-demand only in this cold path.
        const poRow = await prisma.purchaseOrder.findUnique({
          where: { id: poId },
          select: { attributes: true },
        });
        const newAttrs = await addToPendingArray(
          orgId, "PRODUCT", poId, "pendingPOLines",
          { sku: data.sku, qty: data.qtyOrdered, unitCost: data.unitCost, uom: data.uom, notes: data.notes },
          (poRow?.attributes ?? null) as Record<string, unknown> | null,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.purchaseOrder.update({ where: { id: poId }, data: { attributes: newAttrs as any } });
        return UPSERTED_CREATE;
      }
      const lineNumber = int(data.lineNumber) ?? ((await prisma.pOLine.count({ where: { purchaseOrderId: poId } })) + 1);
      const polOpt = optFields(data, [
        { k: "qtyReceived", t: "d" }, { k: "qtyOpen", t: "d" },
        { k: "expectedDate", t: "dt" }, { k: "confirmedETA", t: "dt" },
        { k: "lineValue", t: "d" }, { k: "notes" },
      ]);
      // Canonicalise POLine status separately so "Open" / "Partially received"
      // land as "Open" / "Partial" in the DB.
      const polStatus = normalisePOLineStatus(data.status);
      if (polStatus) polOpt.status = polStatus;
      const existingPol = await prisma.pOLine.findUnique({
        where: { id: `${poId}_${lineNumber}` },
        select: { id: true },
      });
      await prisma.pOLine.upsert({
        where: { id: `${poId}_${lineNumber}` },
        create: {
          id: `${poId}_${lineNumber}`, purchaseOrderId: poId, productId: poProductId, lineNumber,
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
      const soCustomerId = await cachedUpsert(
        ctx?.customerCache,
        `${orgId}:${data.customerId}`,
        () => prisma.customer.upsert({
          where: { orgId_code: { orgId, code: data.customerId } },
          create: { orgId, code: data.customerId, name: data.customerId },
          update: {},
          select: { id: true },
        }),
      );
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
        create: { orgId, soNumber: data.soNumber, customerId: soCustomerId, status: soStatus ?? "DRAFT", currency: data.currency || "USD", ...soOpt, attributes: attrs },
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
      // isActive is routed through the "b" coercion so Y/N/yes/no/true/false/1/0
      // all resolve correctly. If the user didn't provide a value, the DB
      // default (true) takes effect on create and the field is left untouched
      // on update.
      const bhOpt = optFields(data, [
        { k: "isActive", t: "b" },
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
        create: { orgId, productId: bomProduct.id, version: data.version, ...bhOpt, attributes: attrs },
        update: { ...bhOpt, attributes: attrs },
        select: { id: true },
      });
      return existingBh ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "Location": {
      const locCode = data.locationId || data.code;
      const locName = data.name || locCode;
      if (!locCode) return null;
      const locCacheKey = `${orgId}:${locCode}`;
      if (ctx?.locationCache.has(locCacheKey)) {
        return UPSERTED_CACHED;
      }
      const locOpt = optFields(data, [
        { k: "type" }, { k: "city" }, { k: "countryCode" }, { k: "notes" },
      ]);
      const existingLoc = await prisma.location.findUnique({
        where: { organizationId_code: { organizationId: orgId, code: locCode } },
        select: { id: true },
      });
      const location = await prisma.location.upsert({
        where: { organizationId_code: { organizationId: orgId, code: locCode } },
        create: { organizationId: orgId, code: locCode, name: locName, ...locOpt, attributes: attrs },
        update: { name: locName, ...locOpt, attributes: attrs },
        select: { id: true },
      });
      ctx?.locationCache.set(locCacheKey, location.id);
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
    case "BOMLine": {
      // Accept both field-name variants: the mapper now emits bomId /
      // componentSku / qtyPer (see CANONICAL_FIELDS[BOMLine]); older files
      // may still carry bomHeaderId / componentId / qty.
      const rawBomRef = data.bomId || data.bomHeaderId;
      const rawComponentSku = data.componentSku || data.componentId;
      const rawQty = data.qtyPer || data.qty || data.quantity;

      if (!rawBomRef || !rawComponentSku || !rawQty) return null;

      // Resolve the parent BOMHeader. If rawBomRef looks like "BOM-<sku>-<rev>"
      // strip the prefix and trailing revision segment to get the SKU,
      // otherwise treat it as the SKU directly.
      let bomSku = rawBomRef;
      if (rawBomRef.startsWith("BOM-")) {
        const parts = rawBomRef.replace(/^BOM-/, "").split("-");
        if (parts.length >= 2) bomSku = parts.slice(0, -1).join("-");
      }

      // All three parent lookups below are cached per-import-run so a 276-row
      // BOM Lines file with 6 FGs only issues 6 + 6 + (unique components)
      // upserts instead of 3 per row.
      const fgProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${bomSku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: bomSku } },
          create: { organizationId: orgId, sku: bomSku, name: data.fgName || bomSku },
          update: {},
          select: { id: true },
        }),
      );

      const version = data.version || data.bomRevision || data.revision || "1";
      const bomHeaderId = await cachedUpsert(
        ctx?.bomHeaderCache,
        `${orgId}:${fgProductId}:${version}`,
        () => prisma.bOMHeader.upsert({
          where: { orgId_productId_version: { orgId, productId: fgProductId, version } },
          create: { orgId, productId: fgProductId, version, isActive: true },
          update: {},
          select: { id: true },
        }),
      );

      const componentId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${rawComponentSku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku: rawComponentSku } },
          create: {
            organizationId: orgId,
            sku: rawComponentSku,
            name: data.componentName || rawComponentSku,
          },
          update: {},
          select: { id: true },
        }),
      );

      // Note: BOMLine has `sequence` (Int?) not `lineNumber` — the mapper can
      // send either, we route both to sequence.
      const bomLineOpt = optFields(data, [
        { k: "uom" }, { k: "section" }, { k: "notes" }, { k: "makeBuy" },
        { k: "componentCost", t: "d" }, { k: "extendedCost", t: "d" },
        { k: "wasteFactorPct", t: "d" },
        { k: "sequence", t: "i" }, { k: "lineNumber", t: "i" },
        { k: "isCritical", t: "b" }, { k: "isPhantom", t: "b" },
        { k: "approvedSubSku" }, { k: "parentComponentId" },
      ]);
      // Fold lineNumber into sequence when only lineNumber was mapped.
      if (bomLineOpt.lineNumber != null && bomLineOpt.sequence == null) {
        bomLineOpt.sequence = bomLineOpt.lineNumber;
      }
      delete bomLineOpt.lineNumber;

      const existingLine = await prisma.bOMLine.findFirst({
        where: { bomHeaderId, componentId },
        select: { id: true },
      });

      if (existingLine) {
        await prisma.bOMLine.update({
          where: { id: existingLine.id },
          data: {
            qty: decimal(rawQty) ?? 1,
            uom: data.uom || "EA",
            ...bomLineOpt,
          },
        });
      } else {
        await prisma.bOMLine.create({
          data: {
            bomHeaderId,
            componentId,
            qty: decimal(rawQty) ?? 1,
            uom: data.uom || "EA",
            ...bomLineOpt,
          },
        });
      }
      return existingLine ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "SalesOrderLine": {
      // salesOrderId is a human-readable SO number in the CSV, not a UUID.
      const soNumber = data.salesOrderId || data.soNumber || data.soId;
      const sku = data.productId || data.sku || data.itemCode;
      const lineNumber = int(data.lineNumber) ?? 1;

      if (!soNumber || !sku) return null;

      const solCustomerCode = data.customerId || "UNKNOWN";
      const solCustomerId = await cachedUpsert(
        ctx?.customerCache,
        `${orgId}:${solCustomerCode}`,
        () => prisma.customer.upsert({
          where: { orgId_code: { orgId, code: solCustomerCode } },
          create: {
            orgId,
            code: solCustomerCode,
            name: data.customerId || "Unknown Customer",
          },
          update: {},
          select: { id: true },
        }),
      );
      const salesOrderId = await cachedUpsert(
        ctx?.soCache,
        `${orgId}:${soNumber}`,
        () => prisma.salesOrder.upsert({
          where: { orgId_soNumber: { orgId, soNumber } },
          create: {
            orgId,
            soNumber,
            customerId: solCustomerId,
            status: "DRAFT",
            currency: data.currency || "USD",
          },
          update: {},
          select: { id: true },
        }),
      );

      const solProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${sku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku } },
          create: { organizationId: orgId, sku, name: data.itemName || sku },
          update: {},
          select: { id: true },
        }),
      );

      const solOpt = optFields(data, [
        { k: "qtyShipped", t: "d" }, { k: "qtyOpen", t: "d" },
        { k: "lineValue", t: "d" }, { k: "status" },
        { k: "requestedDate", t: "dt" }, { k: "confirmedDate", t: "dt" },
        { k: "uom" },
      ]);

      const existingSol = await prisma.sOLine.findFirst({
        where: { salesOrderId, productId: solProductId, lineNumber },
        select: { id: true },
      });

      if (existingSol) {
        await prisma.sOLine.update({
          where: { id: existingSol.id },
          data: {
            qtyOrdered: decimal(data.qtyOrdered) ?? 0,
            unitPrice: decimal(data.unitPrice) ?? 0,
            uom: data.uom || "EA",
            ...solOpt,
          },
        });
      } else {
        await prisma.sOLine.create({
          data: {
            salesOrderId,
            productId: solProductId,
            lineNumber,
            qtyOrdered: decimal(data.qtyOrdered) ?? 0,
            unitPrice: decimal(data.unitPrice) ?? 0,
            uom: data.uom || "EA",
            ...solOpt,
          },
        });
      }
      return existingSol ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "WorkOrderOperation": {
      const woNumber = data.workOrderId || data.workOrderNumber || data.woNumber;
      const sequence = int(data.sequence || data.opNumber || data.operationNo) ?? 1;
      const opName =
        data.name || data.operationName || data.opName || `Operation ${sequence}`;

      if (!woNumber) return null;

      const workOrderId = await cachedUpsert(
        ctx?.woCache,
        `${orgId}:${woNumber}`,
        () => prisma.workOrder.upsert({
          where: {
            organizationId_orderNumber: { organizationId: orgId, orderNumber: woNumber },
          },
          create: {
            organizationId: orgId,
            orderNumber: woNumber,
            sku: data.sku || woNumber,
            plannedQty: 0,
            status: "PLANNED",
          },
          update: {},
          select: { id: true },
        }),
      );

      const wooOpt = optFields(data, [
        { k: "workCenter" }, { k: "notes" },
        { k: "plannedMins", t: "i" }, { k: "actualMins", t: "i" },
        { k: "plannedSetupMin", t: "d" }, { k: "actualSetupMin", t: "d" },
        { k: "plannedRunMin", t: "d" }, { k: "actualRunMin", t: "d" },
        { k: "plannedQty", t: "d" }, { k: "actualQtyGood", t: "d" },
        { k: "actualQtyScrap", t: "d" }, { k: "yieldPct", t: "d" },
        { k: "plannedStart", t: "dt" }, { k: "actualStart", t: "dt" },
        { k: "actualEnd", t: "dt" },
      ]);

      const WOO_STATUSES = ["PENDING", "IN_PROGRESS", "DONE", "SKIPPED"] as const;
      const wooStatus = toEnum(data.status, WOO_STATUSES);

      const existingWoo = await prisma.workOrderOperation.findFirst({
        where: { workOrderId, sequence },
        select: { id: true },
      });

      if (existingWoo) {
        await prisma.workOrderOperation.update({
          where: { id: existingWoo.id },
          data: { name: opName, ...(wooStatus && { status: wooStatus }), ...wooOpt },
        });
      } else {
        await prisma.workOrderOperation.create({
          data: {
            workOrderId,
            sequence,
            name: opName,
            status: wooStatus ?? "PENDING",
            ...wooOpt,
          },
        });
      }
      return existingWoo ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "SupplierItem": {
      const supplierCode = data.supplierId || data.supplierCode;
      const sku = data.sku || data.productId || data.itemCode;

      if (!supplierCode || !sku) return null;

      const siSupplierId = await cachedUpsert(
        ctx?.supplierCache,
        `${orgId}:${supplierCode}`,
        () => prisma.supplier.upsert({
          where: { organizationId_code: { organizationId: orgId, code: supplierCode } },
          create: {
            organizationId: orgId,
            code: supplierCode,
            name: data.supplierName || supplierCode,
          },
          update: {},
          select: { id: true },
        }),
      );

      const siProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${sku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku } },
          create: { organizationId: orgId, sku, name: data.itemName || sku },
          update: {},
          select: { id: true },
        }),
      );

      const SUPPLIER_ITEM_STATUSES = ["APPROVED", "PREFERRED", "BLOCKED"] as const;
      const siStatus = toEnum(data.status, SUPPLIER_ITEM_STATUSES);

      // Note: SupplierItem.contractUnitCost (NOT unitCost). Also supports
      // unitCost CSV header — fold it in explicitly below.
      const siOpt = optFields(data, [
        { k: "contractUnitCost", t: "d" },
        { k: "leadTimeDays", t: "i" },
        { k: "moq", t: "i" }, { k: "orderMultiple", t: "i" },
        { k: "supplierPartNumber" }, { k: "currency" },
        { k: "countryOfOrigin" }, { k: "approvedSubstitute" },
        { k: "notes" },
        { k: "costValidFrom", t: "dt" }, { k: "costValidTo", t: "dt" },
      ]);
      const legacyUnitCost = decimal(data.unitCost);
      if (siOpt.contractUnitCost == null && legacyUnitCost !== null) {
        siOpt.contractUnitCost = legacyUnitCost;
      }

      const existingSi = await prisma.supplierItem.findFirst({
        where: { orgId, supplierId: siSupplierId, productId: siProductId },
        select: { id: true },
      });

      if (existingSi) {
        await prisma.supplierItem.update({
          where: { id: existingSi.id },
          data: { ...(siStatus && { status: siStatus }), ...siOpt, attributes: attrs },
        });
      } else {
        await prisma.supplierItem.create({
          data: {
            orgId,
            supplierId: siSupplierId,
            productId: siProductId,
            status: siStatus ?? "APPROVED",
            ...siOpt,
            attributes: attrs,
          },
        });
      }
      return existingSi ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    case "StockMovement": {
      const sku = data.sku || data.itemCode || data.productId;
      const movementDate = data.date || data.movementDate || data.occurredAt;
      const qty = data.qty || data.quantity;

      if (!sku || !qty) return null;

      const smProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${sku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku } },
          create: { organizationId: orgId, sku, name: sku },
          update: {},
          select: { id: true },
        }),
      );

      // StockMovement.locationId is NOT NULL in the schema. If the CSV
      // doesn't carry a locationCode we can't materialise a row; skip.
      const locationCode = data.locationCode || data.location;
      if (!locationCode) return null;
      const smLocationId = await cachedUpsert(
        ctx?.locationCache,
        `${orgId}:${locationCode}`,
        () => prisma.location.upsert({
          where: { organizationId_code: { organizationId: orgId, code: locationCode } },
          create: { organizationId: orgId, code: locationCode, name: locationCode },
          update: {},
          select: { id: true },
        }),
      );

      const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "TRANSFER", "ADJUSTMENT", "RETURN", "SCRAP"] as const;
      const movType =
        toEnum(data.type || data.movementType, MOVEMENT_TYPES) ?? "ADJUSTMENT";

      // Note: StockMovement schema has orgId (not organizationId), occurredAt
      // (not date), and refType/refId (not a single `reference`). It has no
      // `attributes` column.
      await prisma.stockMovement.create({
        data: {
          orgId,
          productId: smProductId,
          locationId: smLocationId,
          type: movType,
          qty: decimal(qty) ?? 0,
          occurredAt: movementDate ? new Date(movementDate) : new Date(),
          refType: data.refType || null,
          refId: data.refId || data.reference || data.movementId || null,
          notes: data.notes || null,
          uom: data.uom || null,
        },
      });
      return UPSERTED_CREATE;
    }
    case "Lot": {
      const lotNumber = data.lotNumber || data.lot || data.batchNumber;
      const sku = data.sku || data.productId || data.itemCode;

      if (!lotNumber || !sku) return null;

      const lotProductId = await cachedUpsert(
        ctx?.productCache,
        `${orgId}:${sku}`,
        () => prisma.product.upsert({
          where: { organizationId_sku: { organizationId: orgId, sku } },
          create: { organizationId: orgId, sku, name: sku },
          update: {},
          select: { id: true },
        }),
      );

      const lotOpt = optFields(data, [
        { k: "expiryDate", t: "dt" }, { k: "manufacturedDate", t: "dt" },
        { k: "lotType" }, { k: "originType" }, { k: "originReference" },
        { k: "qtyCreated", t: "d" }, { k: "qtyOnHand", t: "d" }, { k: "qtyConsumed", t: "d" },
        { k: "qtyScrapped", t: "d" },
        { k: "notes" }, { k: "status" }, { k: "releasedBy" },
      ]);

      let lotSupplierId: string | null = null;
      const lotSupplierCode = data.supplierCode || data.supplierId;
      if (lotSupplierCode) {
        lotSupplierId = await cachedUpsert(
          ctx?.supplierCache,
          `${orgId}:${lotSupplierCode}`,
          () => prisma.supplier.upsert({
            where: { organizationId_code: { organizationId: orgId, code: lotSupplierCode } },
            create: { organizationId: orgId, code: lotSupplierCode, name: lotSupplierCode },
            update: {},
            select: { id: true },
          }),
        );
      }

      const existingLot = await prisma.lot.findFirst({
        where: { orgId, lotNumber },
        select: { id: true },
      });

      if (existingLot) {
        await prisma.lot.update({
          where: { id: existingLot.id },
          data: {
            productId: lotProductId,
            ...(lotSupplierId && { supplierId: lotSupplierId }),
            ...lotOpt,
            attributes: attrs,
          },
        });
      } else {
        await prisma.lot.create({
          data: {
            orgId,
            lotNumber,
            productId: lotProductId,
            ...(lotSupplierId && { supplierId: lotSupplierId }),
            ...lotOpt,
            attributes: attrs,
          },
        });
      }
      return existingLot ? UPSERTED_UPDATE : UPSERTED_CREATE;
    }
    default:
      console.warn(`[process] No upsert case for entity: ${entity} — rows will be skipped`);
      return null;
  }
}
