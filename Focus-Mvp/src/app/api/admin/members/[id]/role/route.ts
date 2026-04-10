import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  console.log("[ADMIN][members] PUT role attempt", { userId: ctx.session.user.id, orgId: ctx.org.id });

  if (ctx.member.role !== "OWNER") {
    return NextResponse.json({ error: "Only owners can change roles" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const target = await prisma.orgMember.findFirst({
    where: { id, organizationId: ctx.org.id },
  });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.userId === ctx.session.user.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const updated = await prisma.orgMember.update({
    where: { id },
    data: { role: parsed.data.role },
  });

  console.log(
    `[ADMIN][members] User ${ctx.session.user.id} changed role of ${id} to ${parsed.data.role} in org ${ctx.org.id}`
  );

  return NextResponse.json({ member: updated });
}
