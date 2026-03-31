import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const rule = await prisma.brainRule.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!rule) return notFound();

  const body = await req.json().catch(() => ({}));
  const commitMessage = body.commitMessage ?? "Published";

  const nextVersion = rule.currentVersion + 1;

  const [updated] = await prisma.$transaction([
    prisma.brainRule.update({
      where: { id },
      data: {
        status: "ACTIVE",
        currentVersion: nextVersion,
        updatedBy: ctx.session.user?.id ?? "",
      },
    }),
    prisma.brainRuleVersion.create({
      data: {
        ruleId: id,
        version: nextVersion,
        snapshot: {
          name: rule.name,
          description: rule.description,
          category: rule.category,
          entity: rule.entity,
          condition: rule.condition,
          parameters: rule.parameters,
          tags: rule.tags,
        },
        commitMessage,
        committedBy: ctx.session.user?.id ?? "",
      },
    }),
  ]);

  return NextResponse.json(updated);
}
