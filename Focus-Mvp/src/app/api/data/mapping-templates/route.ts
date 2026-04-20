export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity");

  const templates = await prisma.mappingTemplate.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(entity ? { entity } : {}),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      entity: true,
      mapping: true,
      attributeKeys: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { name, entity, mapping, attributeKeys = [] } = body as {
    name: string;
    entity: string;
    mapping: Record<string, string>;
    attributeKeys?: string[];
  };

  if (!name || !entity || !mapping) {
    return NextResponse.json(
      { error: "name, entity, and mapping are required" },
      { status: 400 }
    );
  }

  // Upsert by name within org so saving twice just updates
  const template = await prisma.mappingTemplate.upsert({
    where: { organizationId_name: { organizationId: ctx.org.id, name } },
    create: {
      organizationId: ctx.org.id,
      name,
      entity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapping: mapping as any,
      attributeKeys,
    },
    update: {
      entity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mapping: mapping as any,
      attributeKeys,
    },
  });

  return NextResponse.json({ template });
}
