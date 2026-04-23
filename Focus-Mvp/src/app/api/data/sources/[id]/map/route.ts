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
  const {
    mapping,
    entity,
    dataset,
    attributeKeys = [],
    compound: incomingCompound,
  } = body as {
    mapping: Record<string, string>;
    entity: string;
    /** New dataset name for the JSONB import pipeline. When provided,
     *  overwrites mappingConfig.dataset so the process-v2 route picks
     *  up disambiguation changes. Optional for backward compat with
     *  legacy callers that only supply `entity`. */
    dataset?: string;
    attributeKeys?: string[];
    compound?: {
      compound: CompoundEntityType;
      fileType: "flat" | "header-only" | "line-only" | "unknown";
      headerMapping: Record<string, string>;
      lineMapping: Record<string, string>;
    };
  };

  const existing = (source.mappingConfig as Record<string, unknown>) ?? {};

  // Compound-aware update. Two flows to cover:
  //   (a) An incoming compound block from the UI (set in the disambiguate
  //       flow when the user picks e.g. "Purchase Orders") — install or
  //       replace the stored compound context.
  //   (b) No incoming compound, but this DataSource was uploaded as a
  //       compound — mirror the saved primary mapping into the matching
  //       slot of the existing compound so the two-pass processor picks
  //       up the user's latest edits rather than the upload-time mapping.
  const existingCompound = existing.compound as
    | {
        type: CompoundEntityType;
        fileType: "flat" | "header-only" | "line-only" | "unknown";
        headerMapping: Record<string, string>;
        lineMapping: Record<string, string>;
      }
    | undefined;

  let nextCompound = existingCompound;
  if (incomingCompound) {
    // UI-provided compound wins. Use the posted mapping as the side of
    // the compound the user is actually editing; fall back to the
    // incoming compound's pre-detected mapping for the other side.
    const def = COMPOUND_ENTITIES[incomingCompound.compound];
    const headerMapping =
      entity === def.headerEntity ? mapping : incomingCompound.headerMapping;
    const lineMapping =
      entity === def.lineEntity ? mapping : incomingCompound.lineMapping;
    nextCompound = {
      type: incomingCompound.compound,
      fileType: incomingCompound.fileType,
      headerMapping,
      lineMapping,
    };
  } else if (existingCompound) {
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
        // Only overwrite dataset when the client explicitly sent one;
        // the upload-v2 route already persists it and legacy callers
        // don't include it in their body.
        ...(dataset ? { dataset } : {}),
        ...(nextCompound ? { compound: nextCompound } : {}),
      },
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true });
}
