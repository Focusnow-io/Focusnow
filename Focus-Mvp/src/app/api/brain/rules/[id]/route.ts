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
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!rule) return notFound();

  return NextResponse.json(rule);
}

export async function PUT(
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

  const body = await req.json();
  const commitMessage = body.commitMessage ?? "Rule updated";

  const nextVersion = rule.currentVersion + 1;

  const [updated] = await prisma.$transaction([
    prisma.brainRule.update({
      where: { id },
      data: {
        name: body.name ?? rule.name,
        description: body.description ?? rule.description,
        category: body.category ?? rule.category,
        entity: body.entity ?? rule.entity,
        condition: body.condition ?? rule.condition,
        parameters: body.parameters ?? rule.parameters,
        tags: body.tags ?? rule.tags,
        updatedBy: ctx.session.user?.id ?? "",
        currentVersion: nextVersion,
      },
    }),
    prisma.brainRuleVersion.create({
      data: {
        ruleId: id,
        version: nextVersion,
        snapshot: {
          name: body.name ?? rule.name,
          description: body.description ?? rule.description,
          category: body.category ?? rule.category,
          entity: body.entity ?? rule.entity,
          condition: body.condition ?? rule.condition,
          parameters: body.parameters ?? rule.parameters,
          tags: body.tags ?? rule.tags,
        },
        commitMessage,
        committedBy: ctx.session.user?.id ?? "",
      },
    }),
  ]);

  return NextResponse.json(updated);
}

export async function DELETE(
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

  await prisma.brainRule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
