export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { COMPOUND_ENTITIES, type CompoundEntityType } from "@/lib/ingestion/field-mapper";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(ctx.member.role, ctx.member.permissions as Record<string, unknown> | null);
  if (!perms.import) return forbidden();
  console.log("[API][datasource/map]", { userId: ctx.session.user.id, orgId: ctx.org.id });
  const { id } = await params;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  const body = await req.json();
  const { mapping, entity, attributeKeys = [] } = body as {
    mapping: Record<string, string>;
    entity: string;
    attributeKeys?: string[];
  };

  const existing = (source.mappingConfig as Record<string, unknown>) ?? {};

  // Compound-aware update: when this DataSource was uploaded as a compound
  // (Purchase Orders / Sales Orders / Bill of Materials), the incoming
  // `mapping` is for the primary side (header OR line). Mirror it into
  // the matching slot on mappingConfig.compound so the two-pass processor
  // sees the user's latest edits, not the mapping captured at upload.
  const existingCompound = existing.compound as
    | {
        type: CompoundEntityType;
        fileType: "flat" | "header-only" | "line-only" | "unknown";
        headerMapping: Record<string, string>;
        lineMapping: Record<string, string>;
      }
    | undefined;

  let nextCompound = existingCompound;
  if (existingCompound) {
    const def = COMPOUND_ENTITIES[existingCompound.type];
    if (entity === def.headerEntity) {
      nextCompound = { ...existingCompound, headerMapping: mapping };
    } else if (entity === def.lineEntity) {
      nextCompound = { ...existingCompound, lineMapping: mapping };
    }
    // Any other entity override means the user opted out of the compound
    // flow via the Review UI — keep the compound block so re-selecting
    // the primary entity resumes two-pass behaviour, but a mismatched
    // entity is already handled by the process route's compound guard.
  }

  await prisma.dataSource.update({
    where: { id },
    data: {
      mappingConfig: {
        ...existing,
        mapping,
        entity,
        attributeKeys,
        ...(nextCompound ? { compound: nextCompound } : {}),
      },
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true });
}
