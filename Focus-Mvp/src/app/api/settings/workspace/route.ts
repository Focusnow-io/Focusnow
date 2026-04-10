import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOrg, unauthorized, forbidden, badRequest, hasRole } from "@/lib/api-helpers";

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
  if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();
  console.log("[API][settings/workspace/update]", { userId: ctx.session.user.id, orgId: ctx.org.id });

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
