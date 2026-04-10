import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const schema = z.object({ email: z.string().email() });

const EXPIRY_HOURS = 1;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);

  // Always return 200 — don't reveal whether the email exists
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const { email } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log("[AUTH][forgot-password] Reset requested for unknown email (ignored):", email);
    return NextResponse.json({ ok: true });
  }

  console.log("[AUTH][forgot-password] Generating reset token", { userId: user.id });
  const token = crypto.randomBytes(32).toString("hex");
  const identifier = `reset:${email}`;
  const expires = new Date(Date.now() + EXPIRY_HOURS * 3_600_000);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token, expires } });

  const origin = new URL(req.url).origin;
  const resetUrl = `${origin}/reset-password?token=${token}`;

  console.log(`[AUTH][forgot-password] Reset link for ${email}:\n→ ${resetUrl}`);

  return NextResponse.json({ ok: true });
}
