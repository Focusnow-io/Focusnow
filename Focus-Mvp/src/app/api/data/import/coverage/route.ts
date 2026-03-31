import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/import/coverage
 *
 * Returns the total imported rows per EntityType, derived from completed
 * DataSource records. Covers all 16 entity types (unlike the normalization
 * freshness endpoint which only tracks first-class Prisma models).
 */
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const sources = await prisma.dataSource.findMany({
    where: { organizationId: ctx.org.id, status: "COMPLETED" },
    select: { mappingConfig: true, importedRows: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });

  // Aggregate by entity type extracted from the mappingConfig JSON field.
  // updatedAt is desc-sorted so the first occurrence per entity is the most recent.
  const coverage: Record<string, { importedRows: number; lastImported: string }> = {};
  for (const s of sources) {
    const cfg = s.mappingConfig as { entity?: string } | null;
    const entity = cfg?.entity;
    if (!entity) continue;
    if (!coverage[entity]) {
      coverage[entity] = {
        importedRows: 0,
        lastImported: s.updatedAt.toISOString(),
      };
    }
    coverage[entity].importedRows += s.importedRows ?? 0;
  }

  return NextResponse.json({ coverage });
}
