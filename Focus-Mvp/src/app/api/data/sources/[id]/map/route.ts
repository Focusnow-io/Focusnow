import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
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

  await prisma.dataSource.update({
    where: { id },
    data: {
      mappingConfig: { ...existing, mapping, entity, attributeKeys },
      status: "PENDING",
    },
  });

  return NextResponse.json({ ok: true });
}
