import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(["THRESHOLD", "POLICY", "CONSTRAINT", "KPI"]),
  entity: z.string(),
  condition: z.record(z.string(), z.unknown()),
  parameters: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  commitMessage: z.string().optional(),
});

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");

  const rules = await prisma.brainRule.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(category ? { category: category as never } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { versions: true } },
    },
  });

  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const rule = await prisma.brainRule.create({
    data: {
      organizationId: ctx.org.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      category: parsed.data.category,
      entity: parsed.data.entity,
      condition: parsed.data.condition as Prisma.InputJsonValue,
      parameters: parsed.data.parameters
        ? (parsed.data.parameters as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      tags: parsed.data.tags ?? [],
      createdBy: ctx.session.user?.id ?? "",
      status: "DRAFT",
      currentVersion: 1,
    },
  });

  // Create initial version snapshot
  await prisma.brainRuleVersion.create({
    data: {
      ruleId: rule.id,
      version: 1,
      snapshot: {
        name: rule.name,
        description: rule.description,
        category: rule.category,
        entity: rule.entity,
        condition: rule.condition,
        parameters: rule.parameters,
        tags: rule.tags,
      },
      commitMessage: parsed.data.commitMessage || "Rule created",
      committedBy: ctx.session.user?.id ?? "",
    },
  });

  return NextResponse.json(rule, { status: 201 });
}
