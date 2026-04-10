/**
 * GET    /api/connectors/[id]   — get a single connector
 * PUT    /api/connectors/[id]   — update connector config / name
 * DELETE /api/connectors/[id]   — delete connector (and its syncs)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionOrg, unauthorized, forbidden, hasRole } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const UpdateConnectorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  syncIntervalMs: z.number().int().positive().nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: ctx.org.id },
    include: {
      syncs: { orderBy: { startedAt: "desc" }, take: 5 },
    },
  });

  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  return NextResponse.json({ connector });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  console.log("[API][connector/update]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  const { id } = await params;
  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UpdateConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updated = await prisma.connector.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(parsed.data.config ? { config: parsed.data.config as any } : {}),
      ...(parsed.data.syncIntervalMs !== undefined ? { syncIntervalMs: parsed.data.syncIntervalMs } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });

  return NextResponse.json({ connector: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  console.log("[API][connector/delete]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  const { id } = await params;
  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  await prisma.connector.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
