import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateOrgContextCache } from "@/lib/chat/build-context";
import { deleteEntityData } from "@/lib/ingestion/entity-cleanup";

// ---------------------------------------------------------------------------
// GET /api/data/sources/:id — reconstruct UploadResult for the resume flow
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  // Reconstruct sampleValues from stored rawData
  const rawData = (config.rawData ?? []) as Record<string, unknown>[];
  const sampleValues: Record<string, string[]> = {};
  for (const header of headers) {
    sampleValues[header] = rawData
      .map((row) => String(row[header] ?? ""))
      .filter(Boolean)
      .slice(0, 5);
  }

  // Reconstruct columnTypes from columnClassification
  const columnClassification = (config.columnClassification ?? {}) as Record<string, { type?: string }>;
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
    columnClassification,
    detectedEntities: [],
    selectedSheet: (config.selectedSheet ?? null) as string | null,
    allSheets: [],
    wasAutoSelected: false,
    attributeKeys: (config.attributeKeys ?? []) as string[],
  });
}



// ---------------------------------------------------------------------------
// DELETE /api/data/sources/:id
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(ctx.member.role, ctx.member.permissions as Record<string, unknown> | null);
  if (!perms.import) return forbidden();

  const { id } = await params;
  const orgId = ctx.org.id;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!source) return notFound();

  // Determine entity type from the mapping config
  const config = source.mappingConfig as { entity?: string } | null;
  const entity = config?.entity;

  console.log("[API][datasource/delete]", {
    userId: ctx.session.user.id,
    orgId,
    sourceId: id,
    entity,
  });

  if (entity) {
    // Count siblings — other sources for the same entity (excluding this one).
    const siblingCount = await prisma.dataSource.count({
      where: {
        organizationId: orgId,
        id: { not: id },
        mappingConfig: { path: ["entity"], equals: entity },
      },
    });

    if (siblingCount === 0) {
      // Last (or only) source — wipe all entity data cleanly.
      await deleteEntityData(orgId, entity);
    } else {
      // Other sources exist — only remove rows that this source created.
      // Each row stores its creator in attributes.sourceId (set during import).
      // Rows from other sources are untouched.
      if (entity === "InventoryItem") {
        await prisma.$executeRaw`
          DELETE FROM "InventoryItem"
          WHERE "organizationId" = ${orgId}
            AND "attributes"->>'sourceId' = ${id}
        `;
      }
      // For other entity types that don't track sourceId, we cannot selectively
      // remove rows — leave the data intact and only remove the source record.
    }

    // Always delete just this source record.
    await prisma.dataSource.delete({ where: { id } });
  } else {
    // No entity resolved — fall back to deleting just this record
    await prisma.dataSource.delete({ where: { id } });
  }

  // Invalidate AI chat context cache so Explorer reflects the deletion immediately
  invalidateOrgContextCache(orgId);

  return new NextResponse(null, { status: 204 });
}
