export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionOrg, unauthorized, forbidden, hasRole } from "@/lib/api-helpers";
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
  if (!hasRole(ctx.member.role, "MEMBER")) return forbidden();
  console.log("[API][brain/rule/create]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let rule: Awaited<ReturnType<typeof prisma.brainRule.create>>;
  try {
    rule = await prisma.brainRule.create({
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
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        { error: "A rule with this name already exists in your workspace. Please choose a different name." },
        { status: 409 }
      );
    }
    console.error("[API][brain/rule/create] Unexpected error", err);
    return NextResponse.json({ error: "Failed to create rule." }, { status: 500 });
  }

  // Create initial version snapshot — must succeed or the rule is orphaned; delete it on failure
  try {
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
  } catch (snapshotErr) {
    console.error("[API][brain/rule/create] Version snapshot failed — rolling back rule", snapshotErr);
    await prisma.brainRule.delete({ where: { id: rule.id } }).catch(() => {});
    return NextResponse.json({ error: "Failed to create rule version." }, { status: 500 });
  }

  return NextResponse.json(rule, { status: 201 });
}
