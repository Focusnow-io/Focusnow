import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSessionOrg() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" }, // deterministic for multi-org users
    include: { organization: true },
  });
  if (!member) return null;

  return { session, member, org: member.organization };
}

type OrgRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_RANK: Record<OrgRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/**
 * Returns true if the member's role meets the minimum required role.
 * Usage: if (!hasRole(ctx.member.role, "MEMBER")) return forbidden();
 */
export function hasRole(memberRole: string, minimum: OrgRole): boolean {
  return (ROLE_RANK[memberRole as OrgRole] ?? 0) >= ROLE_RANK[minimum];
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function badRequest(msg = "Bad request") {
  return NextResponse.json({ error: msg }, { status: 400 });
}
