export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { parseCSVBuffer } from "@/lib/ingestion/csv-parser";
import { parseXLSXBuffer } from "@/lib/ingestion/xlsx-parser";
import { applyDatasetMapping } from "@/lib/ingestion/dataset-mapper";
import { importRecords } from "@/lib/ingestion/record-importer";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

/**
 * POST /api/data/sources/[id]/process-v2
 *
 * Process a DataSource staged by /api/data/import-v2. Creates one
 * ImportDataset and a batch of ImportRecords (one per row) with all
 * canonical fields coerced + stored on `data` JSONB.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  const config = source.mappingConfig as {
    dataset?: DatasetName;
    mapping?: Record<string, string>;
    importMode?: "merge" | "replace";
    rawFileBase64?: string;
    rawFileType?: "csv" | "xlsx";
  } | null;

  if (!config?.dataset || !config?.mapping) {
    return NextResponse.json({ error: "No mapping configured" }, { status: 400 });
  }
  if (!(config.dataset in DATASETS)) {
    return NextResponse.json(
      { error: `Unknown dataset: ${config.dataset}` },
      { status: 400 },
    );
  }
  if (!config.rawFileBase64 || !config.rawFileType) {
    return NextResponse.json(
      { error: "Source file has been discarded — please re-upload" },
      { status: 410 },
    );
  }

  const importMode: "merge" | "replace" = config.importMode ?? "merge";

  // Re-parse the stored file. The import-v2 route persists the raw
  // bytes (base64) alongside the mapping so /process-v2 doesn't need
  // another client upload round-trip.
  const buffer = Buffer.from(config.rawFileBase64, "base64");
  const parsed =
    config.rawFileType === "xlsx" ? parseXLSXBuffer(buffer) : parseCSVBuffer(buffer);

  // Transform every raw row into canonical-key shape. Coercion to types
  // (number/boolean/date) happens inside record-importer so the dataset
  // definitions stay the single source of truth.
  const canonicalRows = parsed.rows.map((row) =>
    applyDatasetMapping(row, config.mapping!),
  );

  const datasetDef = DATASETS[config.dataset];
  const importDataset = await prisma.importDataset.create({
    data: {
      organizationId: ctx.org.id,
      name: config.dataset,
      label: datasetDef.label,
      sourceFile: source.originalName,
      rowCount: parsed.rowCount,
      columnMap: config.mapping as Prisma.InputJsonValue,
      rawHeaders: source.rawHeaders,
      importMode,
      importedBy: ctx.session.user.id,
      status: "complete",
    },
  });

  const result = await importRecords(
    ctx.org.id,
    importDataset.id,
    config.dataset,
    canonicalRows,
    importMode,
  );

  const importedRows = result.created + result.updated;
  const datasetStatus =
    result.skipped === parsed.rowCount
      ? "failed"
      : result.skipped > 0
        ? "partial"
        : "complete";

  await prisma.importDataset.update({
    where: { id: importDataset.id },
    data: {
      importedRows,
      skippedRows: result.skipped,
      status: datasetStatus,
      errorSummary:
        result.errors.length > 0
          ? result.errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`).join("; ")
          : null,
    },
  });

  // Mark the originating DataSource complete so the legacy Sources UI
  // still shows the upload as done — we don't yet have a separate
  // ImportDataset listing view.
  await prisma.dataSource.update({
    where: { id },
    data: {
      status:
        datasetStatus === "failed" ? "FAILED" : "COMPLETED",
      importedRows,
      errorMessage:
        result.errors.length > 0
          ? result.errors
              .slice(0, 5)
              .map((e) => `Row ${e.row}: ${e.message}`)
              .join("; ")
          : null,
    },
  });

  return NextResponse.json({
    imported: importedRows,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors.slice(0, 10),
    dataset: config.dataset,
    datasetId: importDataset.id,
  });
}
