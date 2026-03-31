import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";

const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  industry: z.string().max(50).optional().nullable(),
  defaultTimezone: z.string().max(50).optional().nullable(),
});

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  return NextResponse.json({
    id: ctx.org.id,
    name: ctx.org.name,
    slug: ctx.org.slug,
    plan: ctx.org.plan,
    industry: ctx.org.industry,
    defaultTimezone: ctx.org.defaultTimezone,
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const parsed = updateWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await prisma.organization.update({
    where: { id: ctx.org.id },
    data: parsed.data,
    select: { id: true },
  });

  return NextResponse.json({ success: true });
}
