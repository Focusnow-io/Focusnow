export const dynamic = "force-dynamic";

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

  const rule = await prisma.brainRule.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!rule) return notFound();

  const versions = await prisma.brainRuleVersion.findMany({
    where: { ruleId: id },
    orderBy: { version: "desc" },
  });

  return NextResponse.json({ versions });
}
