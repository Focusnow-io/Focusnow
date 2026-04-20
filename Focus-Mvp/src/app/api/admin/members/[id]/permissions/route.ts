export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionOrg, unauthorized, forbidden } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { createLicense } from "@/lib/permissions";

const schema = z.object({
  brain:    z.boolean(),
  import:   z.boolean(),
  sources:  z.boolean(),
  explorer: z.boolean(),
  apps:     z.boolean(),
  chat:     z.boolean(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  if (ctx.member.role !== "OWNER") return forbidden();

  const { id } = await params;

  const target = await prisma.orgMember.findFirst({
    where: { id, organizationId: ctx.org.id },
  });

  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  if (target.role === "OWNER") {
    return NextResponse.json({ error: "Cannot restrict owner permissions" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  // Build a full license from the validated permission booleans
  const license = {
    ...createLicense(target.role),
    ...parsed.data,
  };

  await prisma.orgMember.update({
    where: { id },
    data: { permissions: license },
  });

  console.log(`[ADMIN][permissions] Owner ${ctx.session.user.id} updated permissions for member ${id}`);

  return NextResponse.json({ ok: true });
}
