import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const instance = await prisma.appInstance.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!instance) return notFound();
  return NextResponse.json(instance);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const existing = await prisma.appInstance.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!existing) return notFound();

  const body = await req.json().catch(() => ({})) as {
    name?: string;
    description?: string;
    config?: Record<string, unknown>;
    pinned?: boolean;
    active?: boolean;
  };

  const updated = await prisma.appInstance.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.config !== undefined && { config: body.config as Record<string, never> }),
      ...(body.pinned !== undefined && { pinned: body.pinned }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;
  const existing = await prisma.appInstance.findFirst({ where: { id, organizationId: ctx.org.id } });
  if (!existing) return notFound();
  await prisma.appInstance.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
