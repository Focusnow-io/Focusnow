export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { getSessionOrg, unauthorized, forbidden, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

const LOG = "[ADMIN][create-user]";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email(),
  role: z.enum(["ADMIN", "MEMBER", "VIEWER"]),
});

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  if (ctx.member.role !== "OWNER" && ctx.member.role !== "ADMIN") {
    console.warn(`${LOG} Forbidden — insufficient role`, {
      userId: ctx.session.user.id,
      role: ctx.member.role,
    });
    return forbidden();
  }

  console.log(`${LOG} Create user attempt`, { actorId: ctx.session.user.id, orgId: ctx.org.id });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    console.warn(`${LOG} Invalid input`, { errors: parsed.error.flatten() });
    return badRequest("invalid_input");
  }

  const { name, email, role } = parsed.data;

  // Check for duplicate email before touching anything else
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.warn(`${LOG} Email already taken`, { email });
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  // Generate invite token before the transaction so it's ready to send
  const bcrypt = await import("bcryptjs");
  const tempPassword = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(tempPassword, 12);
  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetIdentifier = `reset:${email}`;
  const resetExpires = new Date(Date.now() + 48 * 3_600_000); // 48-hour invite window

  // Create user + membership + invite token atomically
  let member: { id: string; role: string; createdAt: Date; user: { id: string; name: string | null; email: string } };
  try {
    await prisma.verificationToken.deleteMany({ where: { identifier: resetIdentifier } });

    const [newUser] = await prisma.$transaction([
      prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          emailVerified: new Date(),
          memberships: {
            create: { organizationId: ctx.org.id, role },
          },
        },
      }),
    ]);

    await prisma.verificationToken.create({
      data: { identifier: resetIdentifier, token: resetToken, expires: resetExpires },
    });

    member = await prisma.orgMember.findFirstOrThrow({
      where: { userId: newUser.id, organizationId: ctx.org.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    console.log(`${LOG} User + membership created`, {
      userId: newUser.id,
      memberId: member.id,
      orgId: ctx.org.id,
      role,
    });
  } catch (err) {
    console.error(`${LOG} Failed to create user or membership`, err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Build invite URL — use env var in production to avoid localhost links behind proxies
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const setPasswordUrl = `${origin}/reset-password?token=${resetToken}`;

  console.log(
    `\n${LOG} ─── Invite link for ${email} ──────────────\n` +
    `  → ${setPasswordUrl}\n` +
    `────────────────────────────────────────────\n`
  );

  try {
    await sendEmail({
      to: email,
      subject: `You've been invited to Focus`,
      html: `
        <p>Hi ${name},</p>
        <p>You've been added to a workspace on <strong>Focus</strong> as <strong>${role}</strong>.</p>
        <p>Click the link below to set your password and get started:</p>
        <p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
        <p>This link expires in 48 hours.</p>
        <p>— The Focus Team</p>
      `,
    });
    console.log(`${LOG} Invite email sent to ${email}`);
  } catch (emailErr) {
    console.warn(`${LOG} Invite email delivery failed (non-fatal):`, emailErr);
  }

  return NextResponse.json(
    {
      member: {
        id: member.id,
        role: member.role,
        createdAt: member.createdAt,
        user: member.user,
      },
    },
    { status: 201 }
  );
}
