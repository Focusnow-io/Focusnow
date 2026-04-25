export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseCSVBuffer } from "@/lib/ingestion/csv-parser";
import { parseXLSXBuffer, getXLSXWorkbookInfo } from "@/lib/ingestion/xlsx-parser";
import { suggestDatasetMapping } from "@/lib/ingestion/dataset-mapper";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

/**
 * POST /api/data/import-v2
 *
 * Upload entry point for the JSONB import pipeline. The dataset must be
 * supplied explicitly by the caller — the 8-concept hub is the only
 * entry point, and every click seeds the `dataset` form field before
 * the file is submitted. Auto-detection has been retired (it produced
 * surprising results often enough that users ended up in the wrong
 * dataset); requiring an explicit pick keeps the mapping deterministic.
 */
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(
    ctx.member.role,
    ctx.member.permissions as Record<string, unknown> | null,
  );
  if (!perms.import) return forbidden();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not read the uploaded file. Please make sure you are uploading a CSV (.csv) or Excel (.xlsx / .xls) file.",
      },
      { status: 400 },
    );
  }

  const file = formData.get("file") as File | null;
  const datasetRaw = formData.get("dataset") as string | null;
  const importMode =
    (formData.get("importMode") as "replace" | "merge" | null) ?? "merge";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum allowed size is 50 MB." },
      { status: 413 },
    );
  }

  const allowedExtensions = [".csv", ".xlsx", ".xls"];
  const fileExt = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!allowedExtensions.includes(fileExt)) {
    return NextResponse.json(
      {
        error: `Unsupported file type "${fileExt}". Please upload a CSV (.csv) or Excel (.xlsx / .xls) file.`,
      },
      { status: 400 },
    );
  }
  if (!datasetRaw || !(datasetRaw in DATASETS)) {
    return NextResponse.json(
      { error: "Please select a data type before uploading." },
      { status: 400 },
    );
  }
  const dataset = datasetRaw as DatasetName;

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

  let parsed: {
    headers: string[];
    rows: Record<string, string>[];
    rowCount: number;
  };
  try {
    if (isXlsx) {
      const workbookInfo = getXLSXWorkbookInfo(buffer);
      // Auto-pick the largest sheet. If the user needs another sheet we
      // add a `sheet` form param later — v1 keeps the surface small.
      const selectedSheet = workbookInfo.sheetNames.reduce((best, s) =>
        (workbookInfo.rowCounts[s] ?? 0) > (workbookInfo.rowCounts[best] ?? 0)
          ? s
          : best,
      );
      parsed = parseXLSXBuffer(buffer, selectedSheet);
    } else {
      parsed = parseCSVBuffer(buffer);
    }
  } catch (err) {
    console.error("[import-v2] Failed to parse file:", err);
    return NextResponse.json(
      { error: "Failed to parse file. Make sure it is a valid CSV or Excel file." },
      { status: 422 },
    );
  }

  // Column mapping is still needed — the dataset tells us WHICH set of
  // canonical fields to map against; suggestDatasetMapping figures out
  // which source column feeds each field via the alias registry.
  // `unmappedColumns` from the alias pass is intentionally discarded —
  // we recompute it after the AI merge below so the response reflects
  // the final state (AI may rescue some of these, leave others).
  const { mapping, confidence, fallbackMapping } = suggestDatasetMapping(
    parsed.headers,
    dataset,
  );

  // First-three-values preview per column, reused by the UI's mapping
  // review table without the client having to re-scan the raw rows.
  const sampleValues: Record<string, string[]> = {};
  for (const h of parsed.headers) {
    sampleValues[h] = parsed.rows
      .map((r) => String(r[h] ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
  }

  // ─── AI-assisted mapping rescue ──────────────────────────────────────
  //
  // The alias matcher in dataset-mapper.ts handles the easy 80% of
  // columns. The other 20% — headers that collide in the alias list
  // (e.g. "BOM ID" and "FG SKU" both looked like fg_sku candidates),
  // or columns with no alias hit at all — are handed to Claude Haiku
  // via /api/data/ai-map-v2 for value-aware classification. The AI
  // gets 5 sample values per ambiguous column and the list of still-
  // open canonical fields so it can't reassign a confirmed one.

  const AI_CONFIDENCE_THRESHOLD = 0.75;

  const confirmedMappings: Record<string, string> = {};
  for (const [canonicalKey, sourceHeader] of Object.entries(mapping)) {
    if ((confidence[canonicalKey] ?? 0) >= AI_CONFIDENCE_THRESHOLD) {
      confirmedMappings[canonicalKey] = sourceHeader;
    }
  }

  const ambiguousColumns: Array<{
    header: string;
    sampleValues: string[];
    currentMapping: string | null;
    confidence: number;
  }> = [];
  for (const header of parsed.headers) {
    const mappedTo = Object.entries(mapping).find(([, h]) => h === header);
    const conf = mappedTo ? confidence[mappedTo[0]] ?? 0 : 0;
    if (!mappedTo || conf < AI_CONFIDENCE_THRESHOLD) {
      const samples = parsed.rows
        .map((r) => String(r[header] ?? "").trim())
        .filter(Boolean)
        .slice(0, 5);
      ambiguousColumns.push({
        header,
        sampleValues: samples,
        currentMapping: mappedTo ? mappedTo[0] : null,
        confidence: conf,
      });
    }
  }

  let aiMapping: Record<string, string | null> = {};
  // Cap at 20 ambiguous columns so a wide mystery file doesn't blow
  // the Haiku prompt budget. Files with >20 mysteries fall back to
  // alias-only mapping and the Confirm screen lets the user fix by
  // hand (future Map step).
  if (ambiguousColumns.length > 0 && ambiguousColumns.length <= 20) {
    try {
      const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
      const aiRes = await fetch(`${base}/api/data/ai-map-v2`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward the session cookie so ai-map-v2's getSessionOrg
          // resolves against the same user.
          cookie: req.headers.get("cookie") ?? "",
        },
        body: JSON.stringify({
          dataset,
          ambiguousColumns,
          confirmedMappings,
        }),
      });
      if (aiRes.ok) {
        const aiData = (await aiRes.json()) as {
          mappings: Record<string, string | null>;
        };
        aiMapping = aiData.mappings ?? {};
      }
    } catch (err) {
      console.warn(
        "[import-v2] AI mapping failed, using alias mapping only:",
        err,
      );
    }
  }

  // Merge: AI output overrides the alias mapping for ambiguous columns.
  // High-confidence alias mappings (already in confirmedMappings) are
  // preserved — the AI can't touch them because confirmedMappings was
  // passed as an assignment blacklist above.
  const finalMapping = { ...mapping };
  for (const [header, canonicalKey] of Object.entries(aiMapping)) {
    // First drop any existing mapping that points at this header —
    // whether that's a previous canonical field claim or a stale
    // entry. Stops the same header from appearing under two keys.
    for (const [k, h] of Object.entries(finalMapping)) {
      if (h === header) delete finalMapping[k];
    }
    if (canonicalKey === null) {
      // AI says this column doesn't match any canonical field —
      // leave it unmapped (it'll land in the unmapped list).
      continue;
    }
    // Also drop the target canonical's existing mapping so we don't
    // leave a duplicate when the AI re-routes the field.
    delete finalMapping[canonicalKey];
    finalMapping[canonicalKey] = header;
  }

  const finalMappedHeaders = new Set(Object.values(finalMapping));
  const finalUnmappedColumns = parsed.headers.filter(
    (h) => !finalMappedHeaders.has(h),
  );
  const aiEnhanced = Object.keys(aiMapping).length > 0;

  const dataSource = await prisma.dataSource.create({
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
        dataset,
        mapping: finalMapping,
        confidence,
        fallbackMapping,
        importMode,
        rawData: parsed.rows.slice(0, 10),
        rawFileBase64: buffer.toString("base64"),
        rawFileType: isXlsx ? "xlsx" : "csv",
        unmappedColumns: finalUnmappedColumns,
        aiEnhanced,
      },
    },
  });

  return NextResponse.json({
    sourceId: dataSource.id,
    headers: parsed.headers,
    dataset,
    aiEnhanced,
    // `detectedDataset` still present for backward compat with UI code
    // that reads it — flagged as an explicit selection so the Confirm
    // screen doesn't render an "auto-detected" badge.
    detectedDataset: {
      dataset,
      confidence: "certain",
      wasAutoDetected: false,
      alternatives: [],
    },
    detectedDescription: `${parsed.rowCount.toLocaleString()} rows of ${dataset.replace(/_/g, " ")}`,
    suggestedMapping: finalMapping,
    confidence,
    sampleValues,
    unmappedColumns: finalUnmappedColumns,
    rowCount: parsed.rowCount,
  });
}
