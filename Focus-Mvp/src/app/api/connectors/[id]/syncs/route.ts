/**
 * GET /api/connectors/[id]/syncs
 *
 * Returns the sync history for a connector (most recent first).
 * Supports ?limit=N (default 20, max 100).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: ctx.org.id },
  });

  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  const limit = Math.min(
    100,
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10) || 20
  );

  const syncs = await prisma.connectorSync.findMany({
    where: { connectorId: id },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ syncs });
}
