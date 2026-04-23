export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { parseCSVBuffer } from "@/lib/ingestion/csv-parser";
import { parseXLSXBuffer, getXLSXWorkbookInfo } from "@/lib/ingestion/xlsx-parser";
import {
  suggestMappingWithConfidence,
  inferColumnType,
  classifyColumns,
  detectEntityFromFilename,
  detectCompoundFileType,
  CANONICAL_FIELDS,
  COMPOUND_ENTITIES,
  type EntityType,
  type ColumnClassification,
  type CompoundEntityType,
  type CompoundFileType,
} from "@/lib/ingestion/field-mapper";

interface DetectedEntity {
  entity: string;
  confidence: "high" | "medium" | "low";
  columnsUsed: string[];
  requiredFieldsMatched: number;
  /** When set, this entity is the header/line side of a detected compound
   *  concept (e.g. PurchaseOrder as part of a PurchaseOrders compound upload).
   *  The UI collapses these into one "Purchase Orders" row. */
  compoundType?: CompoundEntityType;
  compoundFileType?: CompoundFileType;
  compoundRole?: "header" | "line";
}

/** Derive detected entities from column classification output.
 *  Uses identity fields (not all required fields) for confidence scoring —
 *  identity fields are the minimum needed to prove the entity exists in the data,
 *  while non-identity required fields can be defaulted during processing.
 *
 *  When the file's classification hits both sides of a compound concept
 *  (e.g. PurchaseOrder + POLine), the matching entries are marked with
 *  `compoundType` and promoted to high confidence so the import wizard can
 *  surface them as one combined "Purchase Orders" choice.
 */
function deriveDetectedEntities(
  classification: Record<string, ColumnClassification>,
  headers: string[],
): DetectedEntity[] {
  // Group entity_match and sparse columns by entity
  const byEntity = new Map<string, string[]>();
  for (const [col, c] of Object.entries(classification)) {
    if ((c.type === "entity_match" || c.type === "sparse") && c.entity) {
      const cols = byEntity.get(c.entity) ?? [];
      cols.push(col);
      byEntity.set(c.entity, cols);
    }
  }

  const results: DetectedEntity[] = [];
  for (const [entity, columnsUsed] of byEntity) {
    // Count how many identity fields for this entity were matched.
    // Identity fields are the minimum to prove the entity exists (e.g. parentSku +
    // componentSku for BOM). Non-identity required fields like quantity can be
    // defaulted during processing.
    const entityFields = CANONICAL_FIELDS[entity as EntityType] as readonly Record<string, unknown>[] ?? [];
    const identityFields = new Set(
      entityFields.filter((f) => f.identity === true).map((f) => f.field as string),
    );
    let requiredFieldsMatched = 0;
    for (const col of columnsUsed) {
      const c = classification[col];
      if (c.canonicalField && identityFields.has(c.canonicalField)) {
        requiredFieldsMatched++;
      }
    }

    const confidence: "high" | "medium" | "low" =
      requiredFieldsMatched >= 2 ? "high" : requiredFieldsMatched === 1 ? "medium" : "low";

    results.push({ entity, confidence, columnsUsed, requiredFieldsMatched });
  }

  // Compound promotion — if the classified entities together cover both
  // sides of a compound concept, mark them so downstream code can treat
  // them as a single upload. Also runs for header-only / line-only files.
  const detectedSet = new Set(results.map((r) => r.entity));
  for (const key of Object.keys(COMPOUND_ENTITIES) as CompoundEntityType[]) {
    const def = COMPOUND_ENTITIES[key];
    if (!detectedSet.has(def.headerEntity) && !detectedSet.has(def.lineEntity)) {
      continue;
    }
    const { fileType } = detectCompoundFileType(headers, key);
    if (fileType === "unknown") continue;
    for (const r of results) {
      if (r.entity === def.headerEntity) {
        r.compoundType = key;
        r.compoundFileType = fileType;
        r.compoundRole = "header";
        r.confidence = "high";
      } else if (r.entity === def.lineEntity) {
        r.compoundType = key;
        r.compoundFileType = fileType;
        r.compoundRole = "line";
        r.confidence = "high";
      }
    }
  }

  // Sort high → medium → low, then by requiredFieldsMatched desc
  const order = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => order[a.confidence] - order[b.confidence] || b.requiredFieldsMatched - a.requiredFieldsMatched);

  return results;
}

/** Plain-English description of the auto-detected entity, surfaced in the
 *  import UI so the user sees "282 rows of inventory / stock levels"
 *  instead of a raw enum value. */
function describeDetection(entity: EntityType, rowCount: number): string {
  const DESCRIPTIONS: Partial<Record<EntityType, string>> = {
    Product: "product catalogue",
    Supplier: "supplier list",
    InventoryItem: "inventory / stock levels",
    PurchaseOrder: "purchase orders",
    POLine: "purchase order lines",
    SalesOrder: "sales orders",
    SalesOrderLine: "sales order lines",
    BOMHeader: "bill of materials headers",
    BOMLine: "bill of materials lines",
    WorkOrder: "work orders",
    Customer: "customer list",
    Location: "locations / warehouses",
    StockMovement: "stock movements",
    ForecastEntry: "demand forecast",
    SupplierItem: "supplier item catalogue (AVL)",
  };
  const desc = DESCRIPTIONS[entity] ?? entity.toLowerCase();
  return `${rowCount.toLocaleString()} rows of ${desc}`;
}

/** Compound counterpart of describeDetection — builds the same plain-English
 *  summary for a detected compound entity (e.g. "65 rows of purchase orders
 *  (headers + lines)"). */
function describeCompoundDetection(
  compound: CompoundEntityType,
  fileType: CompoundFileType,
  rowCount: number,
): string {
  const { label } = COMPOUND_ENTITIES[compound];
  const suffix =
    fileType === "flat"
      ? "(headers + lines)"
      : fileType === "header-only"
        ? "(headers only)"
        : fileType === "line-only"
          ? "(lines only)"
          : "";
  return `${rowCount.toLocaleString()} rows of ${label.toLowerCase()} ${suffix}`.trim();
}

/** Pick the best compound entity match from the detected single-entity list.
 *  A compound wins when both (or either) of its header/line entity is present
 *  in detectedEntities — we then use detectCompoundFileType to confirm the
 *  signal is strong enough. Returns `null` when no compound applies. */
function detectCompound(
  headers: string[],
  detectedEntities: DetectedEntity[],
): {
  compound: CompoundEntityType;
  fileType: CompoundFileType;
  headerMatches: number;
  lineMatches: number;
  headerMapping: Record<string, string>;
  lineMapping: Record<string, string>;
} | null {
  const detectedSet = new Set(detectedEntities.map((e) => e.entity));
  let best: ReturnType<typeof detectCompoundFileType> & {
    compound: CompoundEntityType;
  } | null = null;

  for (const key of Object.keys(COMPOUND_ENTITIES) as CompoundEntityType[]) {
    const def = COMPOUND_ENTITIES[key];
    // Require at least one of the compound's underlying entities to have been
    // picked up by classifyColumns, otherwise we'd register a compound hit on
    // e.g. a Product-only file just because `sku` / `lineNumber` happened to
    // appear.
    if (!detectedSet.has(def.headerEntity) && !detectedSet.has(def.lineEntity)) {
      continue;
    }
    const result = detectCompoundFileType(headers, key);
    if (result.fileType === "unknown") continue;
    // Prefer the compound with the strongest combined signal.
    const score = result.headerMatches + result.lineMatches;
    const bestScore = best ? best.headerMatches + best.lineMatches : -1;
    if (score > bestScore) {
      best = { ...result, compound: key };
    }
  }

  return best;
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(ctx.member.role, ctx.member.permissions as Record<string, unknown> | null);
  if (!perms.import) return forbidden();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  // The `entity` form field is now OPTIONAL — we auto-detect from the file
  // itself and treat the posted value as a hint only. Accept the empty
  // string as "no hint" so older clients that submit an unset <select>
  // don't poison the detection result.
  const entityHintRaw = formData.get("entity") as string | null;
  const entityHint: EntityType | null =
    entityHintRaw && entityHintRaw.length > 0 ? (entityHintRaw as EntityType) : null;
  const importMode = (formData.get("importMode") as "replace" | "merge" | null) ?? "merge";
  // Optional: user explicitly chose a sheet (from the inline "wrong sheet?" picker)
  const requestedSheet = formData.get("sheet") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  // ── Sheet selection (XLSX only) ──────────────────────────────────────────
  let allSheets: string[] = [];
  let selectedSheet: string | null = requestedSheet;
  let wasAutoSelected = false;

  if (isXlsx) {
    let workbookInfo: { sheetNames: string[]; rowCounts: Record<string, number> };
    try {
      // Single workbook parse — yields both sheet names and row counts.
      workbookInfo = getXLSXWorkbookInfo(buffer);
    } catch (err) {
      console.error("[import] Failed to read Excel workbook:", err);
      return NextResponse.json(
        { error: "Failed to parse Excel file. Make sure it is a valid .xlsx or .xls file." },
        { status: 422 }
      );
    }

    allSheets = workbookInfo.sheetNames;

    if (allSheets.length > 1 && !requestedSheet) {
      // Auto-select the sheet with the most data rows instead of blocking.
      selectedSheet = allSheets.reduce((best, s) =>
        (workbookInfo.rowCounts[s] ?? 0) > (workbookInfo.rowCounts[best] ?? 0) ? s : best
      );
      wasAutoSelected = true;
    } else if (allSheets.length === 1) {
      selectedSheet = allSheets[0];
    }
  }

  // ── Parse ────────────────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = isXlsx
      ? parseXLSXBuffer(buffer, selectedSheet ?? undefined)
      : parseCSVBuffer(buffer);
  } catch (err) {
    console.error("[import] Failed to parse file:", err);
    return NextResponse.json(
      { error: "Failed to parse file. Make sure it is a valid CSV or Excel file." },
      { status: 422 }
    );
  }

  // Sample values and type badges — computed in one pass over headers.
  const sampleValues: Record<string, string[]> = {};
  const columnTypes: Record<string, string> = {};
  for (const h of parsed.headers) {
    const samples = parsed.rows.map((r) => String(r[h] ?? "").trim()).filter(Boolean).slice(0, 3);
    sampleValues[h] = samples;
    columnTypes[h] = inferColumnType(samples);
  }

  // ── Auto-detect entity ────────────────────────────────────────────────
  // 1) Column classification is the strongest signal (content + headers).
  const columnClassification = classifyColumns(parsed.headers, sampleValues);
  const detectedEntities = deriveDetectedEntities(columnClassification, parsed.headers);

  // 2) Filename detection is a secondary signal used as a tiebreaker when
  //    column classification is only medium-confidence.
  const filenameEntity = detectEntityFromFilename(file.name);
  if (filenameEntity) {
    const match = detectedEntities.find((e) => e.entity === filenameEntity);
    if (match && match.confidence === "medium") {
      match.confidence = "high";
    }
  }
  // Re-sort after any tiebreaker promotion so detectedEntities[0] is always
  // the current best pick.
  const order = { high: 0, medium: 1, low: 2 };
  detectedEntities.sort(
    (a, b) =>
      order[a.confidence] - order[b.confidence] ||
      b.requiredFieldsMatched - a.requiredFieldsMatched,
  );

  // 3) Resolve the working entity via the detection priority ladder:
  //      (a) exactly one high-confidence detection → use it
  //      (b) multiple high-confidence → prefer the one matching the hint
  //      (c) one medium-confidence AND no hint → use it
  //      (d) otherwise → fall back to the hint, or Product
  let entity: EntityType = entityHint ?? "Product";
  let wasAutoDetected = false;
  let detectedConfidence: "certain" | "high" | "medium" | "inferred" = "inferred";

  if (detectedEntities.length > 0) {
    const highConf = detectedEntities.filter((e) => e.confidence === "high");
    if (highConf.length === 1) {
      entity = highConf[0].entity as EntityType;
      wasAutoDetected = entity !== entityHint;
      detectedConfidence = entityHint === entity ? "certain" : "high";
    } else if (highConf.length > 1) {
      const hintMatch = highConf.find((e) => e.entity === entityHint);
      const picked = hintMatch ?? highConf[0];
      entity = picked.entity as EntityType;
      wasAutoDetected = entity !== entityHint;
      detectedConfidence = hintMatch ? "certain" : "high";
    } else if (detectedEntities[0].confidence === "medium" && !entityHint) {
      entity = detectedEntities[0].entity as EntityType;
      wasAutoDetected = true;
      detectedConfidence = "medium";
    }
  }

  // 4) Compound detection — a file whose header + line signals both fire for
  //    the same business concept (e.g. PO-number AND item-sku on the same
  //    row) is treated as a compound import. The pipeline keeps the header
  //    entity as `entity` so snapshot / cleanup behaviour is unchanged, and
  //    adds a `compound` block to mappingConfig so /process knows to run two
  //    passes. A hint like "PurchaseOrder" or "POLine" still resolves to the
  //    same compound — the user picked one side of the pair.
  const compoundHintRaw = formData.get("compound") as string | null;
  const compoundHint: CompoundEntityType | null =
    compoundHintRaw && compoundHintRaw in COMPOUND_ENTITIES
      ? (compoundHintRaw as CompoundEntityType)
      : null;

  let compoundDetection = detectCompound(parsed.headers, detectedEntities);
  if (compoundHint && !compoundDetection) {
    // User hinted a compound but classification didn't fire — still run the
    // file-type detection so the processor knows how to route rows.
    const forced = detectCompoundFileType(parsed.headers, compoundHint);
    if (forced.fileType !== "unknown") {
      compoundDetection = { ...forced, compound: compoundHint };
    }
  } else if (compoundHint && compoundDetection && compoundDetection.compound !== compoundHint) {
    // Respect an explicit hint over the auto-picked compound.
    const forced = detectCompoundFileType(parsed.headers, compoundHint);
    if (forced.fileType !== "unknown") {
      compoundDetection = { ...forced, compound: compoundHint };
    }
  }

  if (compoundDetection) {
    const def = COMPOUND_ENTITIES[compoundDetection.compound];
    // Pick the *represented* side as primary when the file is one-sided, so
    // snapshot mode / cleanup still operates on the right table.
    if (compoundDetection.fileType === "line-only") {
      entity = def.lineEntity;
    } else {
      entity = def.headerEntity;
    }
    wasAutoDetected = wasAutoDetected || entity !== entityHint;
    detectedConfidence = "high";
  }

  // ── Field mapping + scoring (now uses the resolved entity) ────────────
  const { mapping: suggested, confidence, score } = suggestMappingWithConfidence(
    parsed.headers,
    entity,
  );

  // Headers the alias matcher did NOT resolve to a canonical field — the
  // client forwards these to /api/data/ai-map so Claude can either rescue
  // them (better alias) or register them as custom fields.
  const mappedHeaders = new Set(Object.values(suggested).filter(Boolean));
  const unmappedColumns = parsed.headers
    .filter((h) => !mappedHeaders.has(h))
    .map((h) => ({
      header: h,
      sampleValues: sampleValues[h] ?? [],
      columnType: columnTypes[h] ?? "text",
    }));

  // Build the compound block we'll persist on mappingConfig. When a compound
  // is in play, both the header- and line-side mappings are stored alongside
  // the primary mapping so /process can run its two passes without
  // re-running suggestMappingWithConfidence.
  const compoundConfig = compoundDetection
    ? {
        type: compoundDetection.compound,
        fileType: compoundDetection.fileType,
        headerMapping: compoundDetection.headerMapping,
        lineMapping: compoundDetection.lineMapping,
      }
    : null;

  // ── Persist DataSource ───────────────────────────────────────────────────
  const source = await prisma.dataSource.create({
    data: {
      organizationId: ctx.org.id,
      name: file.name.replace(/\.[^.]+$/, ""),
      type: isXlsx ? "XLSX" : "CSV",
      originalName: file.name,
      fileSize: buffer.byteLength,
      status: "MAPPING",
      rowCount: parsed.rowCount,
      rawHeaders: parsed.headers,
      mappingConfig: {
        entity,
        mapping: suggested,
        confidence,
        score,
        attributeKeys: [],
        importMode,
        selectedSheet: selectedSheet ?? null,
        rawData: parsed.rows.slice(0, 10),
        rawFileBase64: buffer.toString("base64"),
        rawFileType: isXlsx ? "xlsx" : "csv",
        columnClassification: columnClassification as unknown as Prisma.InputJsonValue,
        ...(compoundConfig ? { compound: compoundConfig } : {}),
      },
    },
  });

  const detectedDescription = compoundDetection
    ? describeCompoundDetection(compoundDetection.compound, compoundDetection.fileType, parsed.rowCount)
    : describeDetection(entity, parsed.rowCount);

  return NextResponse.json({
    sourceId: source.id,
    headers: parsed.headers,
    suggestedMapping: suggested,
    confidence,
    /** Numeric scores 0–1 per canonical field — used by the UI to decide
     *  whether to skip the mapping review screen (all required ≥ threshold). */
    score,
    sampleValues,
    columnTypes,
    unmappedColumns,
    previewRows: parsed.rows.slice(0, 10),
    rowCount: parsed.rowCount,
    entity,
    columnClassification,
    detectedEntities,
    /** Resolved entity + metadata. The UI shows this as a confirmation the
     *  user can override, so hint-less uploads don't need an entity picker. */
    detectedEntity: {
      entity,
      confidence: detectedConfidence,
      wasAutoDetected,
      alternativeEntities: detectedEntities.filter((e) => e.entity !== entity),
      filenameEntity: filenameEntity ?? null,
    },
    detectedDescription,
    /** When the upload is recognised as a compound concept (e.g. Purchase
     *  Orders), the UI can surface "headers + lines" instead of two picker
     *  rows. The processor also uses this to run its two-pass flow. */
    detectedCompound: compoundDetection
      ? {
          type: compoundDetection.compound,
          label: COMPOUND_ENTITIES[compoundDetection.compound].label,
          fileType: compoundDetection.fileType,
          headerEntity: COMPOUND_ENTITIES[compoundDetection.compound].headerEntity,
          lineEntity: COMPOUND_ENTITIES[compoundDetection.compound].lineEntity,
          headerMatches: compoundDetection.headerMatches,
          lineMatches: compoundDetection.lineMatches,
          headerMapping: compoundDetection.headerMapping,
          lineMapping: compoundDetection.lineMapping,
        }
      : null,
    // Sheet metadata — always included so the UI can offer an escape hatch
    selectedSheet: selectedSheet ?? null,
    allSheets,
    wasAutoSelected,
  });
}
