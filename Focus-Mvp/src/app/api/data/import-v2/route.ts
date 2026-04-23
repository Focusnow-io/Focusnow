export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { parseCSVBuffer } from "@/lib/ingestion/csv-parser";
import { parseXLSXBuffer, getXLSXWorkbookInfo } from "@/lib/ingestion/xlsx-parser";
import { detectDataset, suggestDatasetMapping } from "@/lib/ingestion/dataset-mapper";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

/**
 * POST /api/data/import-v2
 *
 * New JSONB import entry point. Parses the uploaded file, detects which
 * of the 8 canonical datasets it most resembles, suggests a canonical
 * mapping, and stores the file + config on DataSource.mappingConfig so
 * the companion /process-v2 route can materialise the rows into
 * ImportRecord.
 *
 * Runs in parallel with the legacy /api/data/import endpoint — nothing
 * here mutates the old per-entity Prisma tables.
 */
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(
    ctx.member.role,
    ctx.member.permissions as Record<string, unknown> | null,
  );
  if (!perms.import) return forbidden();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const datasetHintRaw = formData.get("dataset") as string | null;
  const datasetHint: DatasetName | null =
    datasetHintRaw && datasetHintRaw in DATASETS
      ? (datasetHintRaw as DatasetName)
      : null;
  const importMode =
    (formData.get("importMode") as "replace" | "merge" | null) ?? "merge";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

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

  // Detect which dataset the file most resembles.
  const detectionResults = detectDataset(
    parsed.headers,
    parsed.rows.slice(0, 10),
    file.name,
  );

  // Resolve the dataset + confidence level. A user-supplied hint takes
  // precedence over auto-detection; we still surface the auto-detected
  // top result so the UI can note "hint accepted" vs "hint overrode".
  let resolvedDataset: DatasetName;
  let detectionConfidence: "certain" | "high" | "medium" | "low" | "inferred";
  let wasAutoDetected = false;

  if (datasetHint) {
    const hintMatch = detectionResults.find((r) => r.dataset === datasetHint);
    resolvedDataset = datasetHint;
    detectionConfidence =
      hintMatch && hintMatch.identityFieldsMatched >= 1 ? "certain" : "inferred";
  } else if (detectionResults.length > 0) {
    const top = detectionResults[0];
    resolvedDataset = top.dataset;
    wasAutoDetected = true;
    if (top.identityFieldsMatched >= 2) detectionConfidence = "high";
    else if (top.identityFieldsMatched >= 1) detectionConfidence = "medium";
    else detectionConfidence = "low";
  } else {
    resolvedDataset = "products";
    detectionConfidence = "low";
    wasAutoDetected = true;
  }

  const { mapping, confidence, unmappedColumns } = suggestDatasetMapping(
    parsed.headers,
    resolvedDataset,
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
        dataset: resolvedDataset,
        mapping,
        confidence,
        importMode,
        rawData: parsed.rows.slice(0, 10),
        rawFileBase64: buffer.toString("base64"),
        rawFileType: isXlsx ? "xlsx" : "csv",
        unmappedColumns,
      },
    },
  });

  return NextResponse.json({
    sourceId: dataSource.id,
    headers: parsed.headers,
    dataset: resolvedDataset,
    detectedDataset: {
      dataset: resolvedDataset,
      confidence: detectionConfidence,
      wasAutoDetected,
      alternatives: detectionResults.slice(1, 4),
    },
    detectedDescription: `${parsed.rowCount.toLocaleString()} rows of ${resolvedDataset.replace(/_/g, " ")}`,
    suggestedMapping: mapping,
    confidence,
    sampleValues,
    unmappedColumns,
    rowCount: parsed.rowCount,
  });
}
