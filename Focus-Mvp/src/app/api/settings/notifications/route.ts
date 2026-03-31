import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";

const updateNotificationsSchema = z.object({
  notifyImportCompleted: z.boolean(),
  notifyImportFailed: z.boolean(),
  notifyRuleUpdated: z.boolean(),
  notifyBillingIssue: z.boolean(),
  notifyProductUpdates: z.boolean(),
});

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  return NextResponse.json({
    notifyImportCompleted: ctx.org.notifyImportCompleted,
    notifyImportFailed: ctx.org.notifyImportFailed,
    notifyRuleUpdated: ctx.org.notifyRuleUpdated,
    notifyBillingIssue: ctx.org.notifyBillingIssue,
    notifyProductUpdates: ctx.org.notifyProductUpdates,
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const parsed = updateNotificationsSchema.safeParse(body);
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
