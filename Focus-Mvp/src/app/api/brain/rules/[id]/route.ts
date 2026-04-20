export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getSessionOrg, unauthorized, forbidden, notFound, hasRole } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.enum(["THRESHOLD", "POLICY", "CONSTRAINT", "KPI"]).optional(),
  entity: z.string().min(1).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  parameters: z.record(z.string(), z.unknown()).nullable().optional(),
  tags: z.array(z.string()).optional(),
  commitMessage: z.string().optional(),
});

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
  if (!hasRole(ctx.member.role, "MEMBER")) return forbidden();
  console.log("[API][brain/rule/update]", { userId: ctx.session.user.id, orgId: ctx.org.id });
  const { id } = await params;

  const rule = await prisma.brainRule.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!rule) return notFound();

  const rawBody = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const body = parsed.data;
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
        condition: (body.condition ?? rule.condition) as Prisma.InputJsonValue,
        parameters: (body.parameters ?? rule.parameters) as Prisma.InputJsonValue,
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
          condition: (body.condition ?? rule.condition) as Prisma.InputJsonValue,
          parameters: (body.parameters ?? rule.parameters) as Prisma.InputJsonValue,
          tags: body.tags ?? rule.tags,
        } as Prisma.InputJsonValue,
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
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  console.log("[API][brain/rule/delete]", { userId: ctx.session.user.id, orgId: ctx.org.id });
  const { id } = await params;

  const rule = await prisma.brainRule.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!rule) return notFound();

  await prisma.brainRule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
