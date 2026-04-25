export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionOrg, unauthorized, forbidden, badRequest } from "@/lib/api-helpers";

const deleteAccountSchema = z.object({
  confirmWorkspaceName: z.string().min(1),
});

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  if (ctx.member.role !== "OWNER") return forbidden();
  console.log("[API][settings/account/delete]", { userId: ctx.session.user.id, orgId: ctx.org.id });

  const body = await req.json();
  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Workspace name confirmation is required.");
  }

  if (parsed.data.confirmWorkspaceName !== ctx.org.name) {
    return badRequest("Workspace name does not match. Deletion cancelled.");
  }

  // Delete the organization (cascades to all related data)
  await prisma.organization.delete({
    where: { id: ctx.org.id },
  });

  // Delete the user account
  await prisma.user.delete({
    where: { id: ctx.session.user!.id! },
  });

  return NextResponse.json({ success: true, message: "Account deleted." });
}
