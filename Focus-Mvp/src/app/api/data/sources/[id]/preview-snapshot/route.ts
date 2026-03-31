import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { applyMappingWithAttributes, type MappingConfig } from "@/lib/ingestion/field-mapper";
import { loadRowsFromConfig } from "@/lib/ingestion/source-loader";
import { SNAPSHOT_ENTITIES } from "@/lib/ingestion/snapshot-config";

/**
 * POST /api/data/sources/[id]/preview-snapshot
 *
 * Computes the diff between the uploaded file's keys and the active DB records
 * BEFORE any writes. Returns counts + sample of records that would be deactivated.
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

  const config = source.mappingConfig as MappingConfig | null;
  if (!config) {
    return NextResponse.json({ snapshotApplicable: false });
  }

  const { entity, mapping } = config;
  const snapshotConfig = SNAPSHOT_ENTITIES[entity];

  if (!snapshotConfig) {
    return NextResponse.json({ snapshotApplicable: false });
  }

  try {
    // 1. Extract unique keys from the file
    const rows = await loadRowsFromConfig(config);
    const fileKeys = new Set<string>();
    for (const row of rows) {
      const { canonical } = applyMappingWithAttributes(row, mapping, []);
      const key = snapshotConfig.uniqueKeyExtractor(canonical);
      if (key) fileKeys.add(key);
    }

    // 2. Get all active unique keys from the DB
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeRecords = await (prisma as any)[snapshotConfig.model].findMany({
      where: {
        [snapshotConfig.orgField]: ctx.org.id,
        isActive: true,
      },
      select: {
        [snapshotConfig.uniqueKeyDbField]: true,
      },
    });

    const dbKeys = new Set<string>();
    for (const record of activeRecords) {
      const key = record[snapshotConfig.uniqueKeyDbField];
      if (key) dbKeys.add(key);
    }

    // 3. Compute set differences
    const toDeactivate: string[] = [];
    for (const key of dbKeys) {
      if (!fileKeys.has(key)) toDeactivate.push(key);
    }

    const toCreate: string[] = [];
    for (const key of fileKeys) {
      if (!dbKeys.has(key)) toCreate.push(key);
    }

    const toUpdateCount = fileKeys.size - toCreate.length;

    return NextResponse.json({
      snapshotApplicable: true,
      entity,
      activeInDb: dbKeys.size,
      inFile: fileKeys.size,
      toDeactivate: toDeactivate.length,
      toCreate: toCreate.length,
      toUpdate: toUpdateCount,
      deactivationSample: toDeactivate.slice(0, 10),
    });
  } catch (err) {
    console.error("[preview-snapshot] Error:", err);
    return NextResponse.json({ snapshotApplicable: false, error: String(err) });
  }
}
