export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6),
});

/** GET /api/auth/reset-password?token=xxx — validate token without consuming it */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const record = await prisma.verificationToken.findUnique({ where: { token } });
  if (!record || !record.identifier.startsWith("reset:")) {
    return NextResponse.json({ valid: false });
  }
  if (new Date() > record.expires) {
    return NextResponse.json({ valid: false });
  }
  return NextResponse.json({ valid: true });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || !record.identifier.startsWith("reset:")) {
    console.warn("[AUTH][reset-password] Invalid or unknown reset token");
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  // Check expiry BEFORE deleting — so an expired token isn't silently consumed
  // and the user can request a fresh reset link without confusion.
  if (new Date() > record.expires) {
    console.warn("[AUTH][reset-password] Expired reset token for", record.identifier);
    await prisma.verificationToken.delete({ where: { token } });
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await prisma.verificationToken.delete({ where: { token } });

  const email = record.identifier.replace("reset:", "");
  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.update({ where: { email }, data: { passwordHash } });

  console.log("[AUTH][reset-password] Password reset complete for", email);
  return NextResponse.json({ ok: true });
}
