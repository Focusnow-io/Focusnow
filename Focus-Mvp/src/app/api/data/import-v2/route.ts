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

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const datasetRaw = formData.get("dataset") as string | null;
  const importMode =
    (formData.get("importMode") as "replace" | "merge" | null) ?? "merge";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
  const { mapping, confidence, unmappedColumns } = suggestDatasetMapping(
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
    dataset,
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
    suggestedMapping: mapping,
    confidence,
    sampleValues,
    unmappedColumns,
    rowCount: parsed.rowCount,
  });
}
