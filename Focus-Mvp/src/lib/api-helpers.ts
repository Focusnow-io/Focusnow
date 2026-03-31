import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getSessionOrg() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const member = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
  });
  if (!member) return null;

  return { session, member, org: member.organization };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function badRequest(msg = "Bad request") {
  return NextResponse.json({ error: msg }, { status: 400 });
}
