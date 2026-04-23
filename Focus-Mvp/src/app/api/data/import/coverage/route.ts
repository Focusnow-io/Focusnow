export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { COMPOUND_ENTITIES, type CompoundEntityType } from "@/lib/ingestion/field-mapper";

interface CoverageEntry {
  importedRows: number;
  lastImported: string;
  breakdown?: Record<string, number>;
}

/**
 * GET /api/data/import/coverage
 *
 * Returns the total imported rows per EntityType, derived from completed
 * DataSource records. Covers all 16 entity types (unlike the normalization
 * freshness endpoint which only tracks first-class Prisma models).
 *
 * Rolls compound concepts (PurchaseOrders, SalesOrders, BillOfMaterials) up
 * to their own coverage entries alongside the individual header/line rows,
 * so the new 8-concept import hub can show one unified count per card.
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
  const coverage: Record<string, CoverageEntry> = {};
  // Track per-entity totals separately so we can roll compound header+line
  // pairs into a single count. Delta fields from /process already split
  // header vs line for compound imports, but the simpler `importedRows`
  // counter on DataSource only counts the primary (final) pass — so we
  // query the Prisma tables directly below for compound rollups.
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

  // Compound rollups — sum the header + line counts from real Prisma tables
  // rather than DataSource.importedRows, because a flat-file compound import
  // reports imported=<line count> on DataSource (headers are deduped) and
  // that under-counts the header side.
  const [poCount, poLineCount, soCount, soLineCount, bomCount, bomLineCount] =
    await Promise.all([
      prisma.purchaseOrder.count({ where: { orgId: ctx.org.id } }),
      prisma.pOLine.count({ where: { purchaseOrder: { orgId: ctx.org.id } } }),
      prisma.salesOrder.count({ where: { orgId: ctx.org.id } }),
      prisma.sOLine.count({ where: { salesOrder: { orgId: ctx.org.id } } }),
      prisma.bOMHeader.count({ where: { orgId: ctx.org.id } }),
      prisma.bOMLine.count({ where: { bomHeader: { orgId: ctx.org.id } } }),
    ]);

  function rollup(
    compound: CompoundEntityType,
    headerCount: number,
    lineCount: number,
  ) {
    const def = COMPOUND_ENTITIES[compound];
    const headerEntry = coverage[def.headerEntity];
    const lineEntry = coverage[def.lineEntity];
    const lastImported =
      headerEntry && lineEntry
        ? headerEntry.lastImported > lineEntry.lastImported
          ? headerEntry.lastImported
          : lineEntry.lastImported
        : headerEntry?.lastImported ?? lineEntry?.lastImported;
    if (headerCount === 0 && lineCount === 0) return;
    coverage[compound] = {
      importedRows: headerCount + lineCount,
      lastImported: lastImported ?? new Date(0).toISOString(),
      breakdown: { headers: headerCount, lines: lineCount },
    };
  }

  rollup("PurchaseOrders", poCount, poLineCount);
  rollup("SalesOrders", soCount, soLineCount);
  rollup("BillOfMaterials", bomCount, bomLineCount);

  return NextResponse.json({ coverage });
}
