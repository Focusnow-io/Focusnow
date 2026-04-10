import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  console.log("[ADMIN][members] DELETE attempt", { userId: ctx.session.user.id, orgId: ctx.org.id, targetMemberId: id });

  if (ctx.member.role !== "OWNER" && ctx.member.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.orgMember.findFirst({
    where: { id, organizationId: ctx.org.id },
  });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.userId === ctx.session.user.id) {
    return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
  }

  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot remove an owner" }, { status: 400 });
  }

  const userId = target.userId;

  await prisma.orgMember.delete({ where: { id } });
  await prisma.user.delete({ where: { id: userId } });

  console.log(
    `[ADMIN][members] User ${ctx.session.user.id} removed member ${id} and deleted user ${userId} from org ${ctx.org.id}`
  );

  return NextResponse.json({ ok: true });
}
