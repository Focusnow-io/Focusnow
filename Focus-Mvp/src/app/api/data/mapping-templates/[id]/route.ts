export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const template = await prisma.mappingTemplate.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!template) return notFound();

  await prisma.mappingTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
