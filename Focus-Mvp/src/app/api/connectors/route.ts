/**
 * GET  /api/connectors   — list all connectors for the org
 * POST /api/connectors   — create a new connector
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionOrg, unauthorized, forbidden, hasRole } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const CreateConnectorSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  type: z.enum(["FILE_IMPORT", "REST_API", "WEBHOOK", "DATABASE", "SFTP"]),
  config: z.record(z.string(), z.unknown()).default({}),
  syncIntervalMs: z.number().int().positive().optional(),
});

export async function GET(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const connectors = await prisma.connector.findMany({
    where: { organizationId: ctx.org.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { syncs: true } },
      syncs: {
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({ connectors });
}

export async function POST(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  console.log("[API][connector/create]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateConnectorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, description, type, config, syncIntervalMs } = parsed.data;

  if (typeof config !== "object" || !("entityType" in config)) {
    return NextResponse.json(
      { error: "config.entityType is required" },
      { status: 400 }
    );
  }

  try {
    const connector = await prisma.connector.create({
      data: {
        organizationId: ctx.org.id,
        name,
        description: description ?? null,
        type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: config as any,
        syncIntervalMs: syncIntervalMs ?? null,
        status: "INACTIVE",
      },
    });

    return NextResponse.json({ connector }, { status: 201 });
  } catch (err: unknown) {
    console.error("[API][connector/create] error:", err);
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A connector with this name already exists" },
        { status: 409 }
      );
    }
    throw err;
  }
}
