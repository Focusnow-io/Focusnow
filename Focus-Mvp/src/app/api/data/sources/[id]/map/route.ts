export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * PUT /api/data/sources/[id]/map
 *
 * Update the saved mapping for a DataSource. Used by the import
 * wizard's Map step when the user overrides the auto-generated
 * column mapping before confirming the import. The process-v2
 * route reads mappingConfig.{dataset, mapping, attributeKeys}
 * back out when it materialises the ImportRecord rows.
 */
export async function PUT(
  req: Request,
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

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  const body = await req.json();
  const {
    mapping,
    entity,
    dataset,
    attributeKeys = [],
  } = body as {
    mapping: Record<string, string>;
    /** Legacy entity label — still accepted so pre-migration callers
     *  don't break, but the process-v2 route reads `dataset` only. */
    entity?: string;
    dataset?: string;
    attributeKeys?: string[];
  };

  const existing = (source.mappingConfig ?? {}) as Record<string, unknown>;

  await prisma.dataSource.update({
    where: { id },
    data: {
      mappingConfig: {
        ...existing,
        mapping,
        attributeKeys,
        ...(entity ? { entity } : {}),
        ...(dataset ? { dataset } : {}),
      },
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true });
}
