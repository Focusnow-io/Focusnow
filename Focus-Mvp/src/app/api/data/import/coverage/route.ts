export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/data/import/coverage
 *
 * Returns per-dataset coverage for the hub cards, keyed by the canonical
 * dataset name (products, suppliers, inventory, …). The latest
 * ImportDataset row per dataset name wins — a re-import updates the
 * card rather than appending a second entry.
 */
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const datasets = await prisma.importDataset.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { importedAt: "desc" },
    select: {
      name: true,
      label: true,
      importedRows: true,
      rowCount: true,
      importedAt: true,
    },
  });

  const coverage: Record<
    string,
    { importedRows: number; rowCount: number; lastImported: string; label?: string }
  > = {};

  for (const d of datasets) {
    // desc-ordered → first occurrence per name is the most recent import.
    if (!coverage[d.name]) {
      coverage[d.name] = {
        importedRows: d.importedRows,
        rowCount: d.rowCount,
        lastImported: d.importedAt.toISOString(),
        label: d.label,
      };
    }
  }

  return NextResponse.json({ coverage });
}
