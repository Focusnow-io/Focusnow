import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, forbidden, hasRole } from "@/lib/api-helpers";

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  const { prisma } = await import("@/lib/prisma");

  const members = await prisma.orgMember.findMany({
    where: { organizationId: ctx.org.id },
    include: {
      user: { select: { id: true, name: true, email: true, image: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[ADMIN][members] Listed ${members.length} members for org ${ctx.org.id}`, {
    userId: ctx.session.user.id,
  });

  return NextResponse.json({ members });
}
