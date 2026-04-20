export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { SNAPSHOT_ENTITIES } from "@/lib/ingestion/snapshot-config";
import type { MappingConfig } from "@/lib/ingestion/field-mapper";

const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /api/data/sources/[id]/undo-snapshot
 *
 * Reactivates records that were deactivated by a specific snapshot import.
 * Only available within 24 hours of the import completing.
 */
export async function POST(
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

  // Check undo window
  if (!source.snapshotCompletedAt) {
    return NextResponse.json(
      { error: "No snapshot deactivation was performed by this import." },
      { status: 400 }
    );
  }

  const elapsed = Date.now() - source.snapshotCompletedAt.getTime();
  if (elapsed > UNDO_WINDOW_MS) {
    return NextResponse.json(
      { error: "Undo window has expired (24 hours)." },
      { status: 400 }
    );
  }

  const config = source.mappingConfig as MappingConfig | null;
  if (!config) {
    return NextResponse.json(
      { error: "No mapping configuration found." },
      { status: 400 }
    );
  }

  const snapshotConfig = SNAPSHOT_ENTITIES[config.entity];
  if (!snapshotConfig) {
    return NextResponse.json(
      { error: "This entity type does not support snapshot deactivation." },
      { status: 400 }
    );
  }

  try {
    // Reactivate only records deactivated by THIS specific import
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reactivated = await (prisma as any)[snapshotConfig.model].updateMany({
      where: {
        [snapshotConfig.orgField]: ctx.org.id,
        isActive: false,
        deactivatedBySourceId: id,
      },
      data: {
        isActive: true,
        deactivatedAt: null,
        deactivatedBySourceId: null,
      },
    });

    // Clear snapshot tracking on the DataSource
    await prisma.dataSource.update({
      where: { id },
      data: {
        snapshotDeactivatedCount: null,
        snapshotCompletedAt: null,
      },
    });

    return NextResponse.json({ reactivated: reactivated.count });
  } catch (err) {
    console.error("[undo-snapshot] Error:", err);
    return NextResponse.json(
      { error: "Failed to undo deactivation." },
      { status: 500 }
    );
  }
}
