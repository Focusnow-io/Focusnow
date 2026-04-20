export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { executeReviewedMerge, markReviewedKept } from "@/lib/normalization/entity-resolver";

/**
 * PATCH /api/normalization/resolution/[id]
 *
 * Human review decision for a PENDING resolution log entry.
 * Body: { action: "merge" | "keep" }
 *
 * - "merge" → runs mergeEntities and sets status to REVIEWED_MERGED
 * - "keep"  → marks entities as distinct, sets status to REVIEWED_KEPT
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const body = await req.json() as { action?: string };

  if (!body.action || !["merge", "keep"].includes(body.action)) {
    return badRequest('action must be "merge" or "keep"');
  }

  const log = await prisma.entityResolutionLog.findUnique({ where: { id } });
  if (!log || log.organizationId !== ctx.org.id) return notFound();
  if (log.status !== "PENDING") {
    return badRequest("Resolution log is not in PENDING status");
  }

  const userId = ctx.session.user?.id ?? "unknown";

  if (body.action === "merge") {
    await executeReviewedMerge(id, userId);
  } else {
    await markReviewedKept(id, userId);
  }

  const updated = await prisma.entityResolutionLog.findUnique({ where: { id } });
  return NextResponse.json(updated);
}

/**
 * GET /api/normalization/resolution/[id]
 *
 * Returns a single EntityResolutionLog entry with its details.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const log = await prisma.entityResolutionLog.findUnique({ where: { id } });
  if (!log || log.organizationId !== ctx.org.id) return notFound();

  return NextResponse.json(log);
}
