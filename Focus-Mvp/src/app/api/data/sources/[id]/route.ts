import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { invalidateOrgContextCache } from "@/lib/chat/build-context";

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
// Entity cleanup — deletes all org records for the entity type(s) in the source
// ---------------------------------------------------------------------------

async function deleteEntityData(orgId: string, entity: string) {
  switch (entity) {
    case "InventoryItem":
      await prisma.inventoryItem.deleteMany({ where: { organizationId: orgId } });
      break;

    case "Product":
      // Delete dependents first to avoid FK violations
      await prisma.pOLine.deleteMany({
        where: { purchaseOrder: { orgId } },
      });
      await prisma.sOLine.deleteMany({
        where: { salesOrder: { orgId } },
      });
      await prisma.inventoryItem.deleteMany({ where: { organizationId: orgId } });
      await prisma.bOMLine.deleteMany({
        where: { bomHeader: { orgId } },
      });
      await prisma.bOMHeader.deleteMany({ where: { orgId } });
      await prisma.product.deleteMany({ where: { organizationId: orgId } });
      break;

    case "Supplier":
      await prisma.pOLine.deleteMany({
        where: { purchaseOrder: { orgId } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { orgId } });
      await prisma.supplier.deleteMany({ where: { organizationId: orgId } });
      break;

    case "Customer":
      await prisma.sOLine.deleteMany({
        where: { salesOrder: { orgId } },
      });
      await prisma.salesOrder.deleteMany({ where: { orgId } });
      await prisma.customer.deleteMany({ where: { orgId } });
      break;

    case "PurchaseOrder":
      await prisma.pOLine.deleteMany({
        where: { purchaseOrder: { orgId } },
      });
      await prisma.purchaseOrder.deleteMany({ where: { orgId } });
      break;

    case "POLine":
      await prisma.pOLine.deleteMany({
        where: { purchaseOrder: { orgId } },
      });
      break;

    case "SalesOrder":
      await prisma.sOLine.deleteMany({
        where: { salesOrder: { orgId } },
      });
      await prisma.salesOrder.deleteMany({ where: { orgId } });
      break;

    case "SalesOrderLine":
      await prisma.sOLine.deleteMany({
        where: { salesOrder: { orgId } },
      });
      break;

    case "Location":
      // locationId is nullable — clear it on inventory items before deleting
      await prisma.inventoryItem.updateMany({
        where: { organizationId: orgId },
        data: { locationId: null },
      });
      await prisma.location.deleteMany({ where: { organizationId: orgId } });
      break;

    case "BOMHeader":
    case "BOM":
      await prisma.bOMLine.deleteMany({
        where: { bomHeader: { orgId } },
      });
      await prisma.bOMHeader.deleteMany({ where: { orgId } });
      break;

    case "BOMLine":
      await prisma.bOMLine.deleteMany({
        where: { bomHeader: { orgId } },
      });
      break;

    default:
      // Unknown entity type — no data to delete
      break;
  }
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

  // Delete entity data first, then the source record
  if (entity) {
    await deleteEntityData(orgId, entity);
  }

  await prisma.dataSource.delete({ where: { id } });

  // Invalidate AI chat context cache so Explorer reflects the deletion immediately
  invalidateOrgContextCache(orgId);

  return new NextResponse(null, { status: 204 });
}
