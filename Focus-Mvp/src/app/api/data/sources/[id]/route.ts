import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, notFound } from "@/lib/api-helpers";
import { resolvePermissions } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const perms = resolvePermissions(ctx.member.role, ctx.member.permissions as Record<string, unknown> | null);
  if (!perms.import) return forbidden();
  console.log("[API][datasource/delete]", { userId: ctx.session.user.id, orgId: ctx.org.id });
  const { id } = await params;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  await prisma.dataSource.delete({ where: { id } });

  return new NextResponse(null, { status: 204 });
}
