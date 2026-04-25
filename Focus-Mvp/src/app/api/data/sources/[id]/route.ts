export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateOrgContextCache } from "@/lib/chat/build-context";

/**
 * Per-DataSource routes.
 *
 * GET reconstructs the resume payload from mappingConfig so the
 * wizard can pick up where the user left off.
 *
 * DELETE removes the DataSource plus every ImportRecord created by it.
 * The ImportDataset row (one per upload) cascade-deletes its records
 * via the Prisma relation, so we delete the dataset created against
 * this source when there is one.
 */

export async function GET(
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

  const config = (source.mappingConfig ?? {}) as Record<string, unknown>;
  const headers = (source.rawHeaders ?? []) as string[];

  const rawData = (config.rawData ?? []) as Record<string, unknown>[];
  const sampleValues: Record<string, string[]> = {};
  for (const header of headers) {
    sampleValues[header] = rawData
      .map((row) => String(row[header] ?? ""))
      .filter(Boolean)
      .slice(0, 5);
  }

  const columnClassification = (config.columnClassification ?? {}) as Record<
    string,
    { type?: string }
  >;
  const columnTypes: Record<string, string> = {};
  for (const [col, cls] of Object.entries(columnClassification)) {
    columnTypes[col] = cls.type ?? "text";
  }

  return NextResponse.json({
    sourceId: source.id,
    headers,
    suggestedMapping: (config.mapping ?? {}) as Record<string, string>,
    confidence: (config.confidence ?? {}) as Record<string, unknown>,
    score: (config.score ?? {}) as Record<string, number>,
    sampleValues,
    columnTypes,
    previewRows: rawData,
    rowCount: source.rowCount ?? 0,
    entity: (config.entity ?? "Product") as string,
    dataset: (config.dataset ?? null) as string | null,
    columnClassification,
    detectedEntities: [],
    selectedSheet: (config.selectedSheet ?? null) as string | null,
    allSheets: [],
    wasAutoSelected: false,
    attributeKeys: (config.attributeKeys ?? []) as string[],
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(
    ctx.member.role,
    ctx.member.permissions as Record<string, unknown> | null,
  );
  if (!perms.import) return forbidden();

  const { id } = await params;
  const orgId = ctx.org.id;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!source) return notFound();

  // Find the ImportDataset created by this source upload.
  const importDataset = await prisma.importDataset.findFirst({
    where: { dataSourceId: id, organizationId: orgId },
    select: { id: true, name: true, importMode: true },
  });

  if (importDataset) {
    // Always delete only the ImportRecords that belong to this specific
    // upload (identified by datasetId), then the ImportDataset row.
    // This applies to both replace and merge modes — it subtracts only
    // what this file contributed and leaves records from other uploads intact.
    // (In replace mode the import already cleared previous records and
    // re-created them all under this datasetId, so this still removes
    // everything that came from this file.)
    await prisma.importRecord.deleteMany({
      where: { datasetId: importDataset.id },
    });
    await prisma.importDataset.delete({ where: { id: importDataset.id } });
  }

  await prisma.dataSource.delete({ where: { id } });

  invalidateOrgContextCache(orgId);

  return new NextResponse(null, { status: 204 });
}
