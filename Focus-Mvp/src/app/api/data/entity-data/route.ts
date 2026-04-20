export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { deleteEntityData } from "@/lib/ingestion/entity-cleanup";
import { invalidateOrgContextCache } from "@/lib/chat/build-context";

/**
 * DELETE /api/data/entity-data?entity=InventoryItem
 *
 * Immediately deletes all org-scoped records for the given entity type.
 * Called when the user clicks "Start fresh" in the re-upload modal, before
 * uploading the new file — so the old data is gone before the import runs.
 */
export async function DELETE(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");

  if (!entity) {
    return NextResponse.json({ error: "entity param required" }, { status: 400 });
  }

  // Delete entity data AND all DataSource records for this entity,
  // so the sources list reflects the cleared state immediately.
  await deleteEntityData(ctx.org.id, entity);
  await prisma.dataSource.deleteMany({
    where: {
      organizationId: ctx.org.id,
      mappingConfig: { path: ["entity"], equals: entity },
    },
  });
  invalidateOrgContextCache(ctx.org.id);

  return NextResponse.json({ ok: true });
}
