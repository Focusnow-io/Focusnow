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
  CANONICAL_FIELDS,
  type EntityType,
  type ColumnClassification,
} from "@/lib/ingestion/field-mapper";

interface DetectedEntity {
  entity: string;
  confidence: "high" | "medium" | "low";
  columnsUsed: string[];
  requiredFieldsMatched: number;
}

/** Derive detected entities from column classification output.
 *  Uses identity fields (not all required fields) for confidence scoring —
 *  identity fields are the minimum needed to prove the entity exists in the data,
 *  while non-identity required fields can be defaulted during processing.
 */
function deriveDetectedEntities(
  classification: Record<string, ColumnClassification>,
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
  const detectedEntities = deriveDetectedEntities(columnClassification);

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
      },
    },
  });

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
    detectedDescription: describeDetection(entity, parsed.rowCount),
    // Sheet metadata — always included so the UI can offer an escape hatch
    selectedSheet: selectedSheet ?? null,
    allSheets,
    wasAutoSelected,
  });
}
