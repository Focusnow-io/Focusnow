/**
 * Multi-pass mapping: clone an existing DataSource to map the same raw file
 * against a different entity type.
 *
 * POST /api/data/sources/:id/clone-pass
 * Body: { entity: EntityType }
 * Returns: { sourceId, headers, suggestedMapping, confidence, sampleValues,
 *            columnTypes, previewRows, rowCount, entity }
 */
import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  suggestMappingWithConfidence,
  inferColumnType,
  type EntityType,
  type MappingConfig,
} from "@/lib/ingestion/field-mapper";

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

  const body = await req.json();
  const { entity } = body as { entity: EntityType };

  const parentConfig = source.mappingConfig as MappingConfig | null;

  if (!parentConfig?.rawFileBase64) {
    return NextResponse.json(
      { error: "Original file data not found on this source" },
      { status: 400 }
    );
  }

  // Reuse already-stored headers and preview rows — no need to re-parse the file
  const headers = source.rawHeaders;
  const rows = parentConfig.rawData ?? [];
  const rowCount = source.rowCount ?? rows.length;

  const { mapping: suggested, confidence } = suggestMappingWithConfidence(headers, entity);

  // Single pass: compute sampleValues and columnTypes together
  const sampleValues: Record<string, string[]> = {};
  const columnTypes: Record<string, string> = {};
  for (const h of headers) {
    const samples = rows.map((r) => String(r[h] ?? "").trim()).filter(Boolean).slice(0, 3);
    sampleValues[h] = samples;
    columnTypes[h] = inferColumnType(samples);
  }

  // Create a new DataSource that shares the raw file bytes
  const newSource = await prisma.dataSource.create({
    data: {
      organizationId: ctx.org.id,
      name: `${source.name} (${entity})`,
      type: source.type,
      originalName: source.originalName,
      fileSize: source.fileSize,
      status: "MAPPING",
      rowCount,
      rawHeaders: headers,
      mappingConfig: {
        entity,
        mapping: suggested,
        confidence,
        attributeKeys: [],
        selectedSheet: parentConfig.selectedSheet ?? null,
        rawData: rows.slice(0, 10),
        rawFileBase64: parentConfig.rawFileBase64,
        rawFileType: parentConfig.rawFileType ?? "csv",
        // Forward parent's column classification so fill-down and
        // LogicParam capture work on clone-pass imports too
        ...(parentConfig.columnClassification
          ? { columnClassification: parentConfig.columnClassification as unknown as Prisma.InputJsonValue }
          : {}),
      },
    },
  });

  return NextResponse.json({
    sourceId: newSource.id,
    headers,
    suggestedMapping: suggested,
    confidence,
    sampleValues,
    columnTypes,
    previewRows: rows.slice(0, 10),
    rowCount,
    entity,
  });
}
