import crypto from "crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, otpEmailHtml, verifyEmailHtml } from "@/lib/email";

// Hint for the VS Code TypeScript Language Server to pick up the generated
// Prisma model types (the compiler `tsc` already resolves them correctly).
void (0 as unknown as PrismaClient);

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const SIGN_IN_TOKEN_EXPIRY_SECONDS = 300; // 5 min to complete sign-in after OTP
const EMAIL_VERIFY_EXPIRY_HOURS = 24;

// ── Helpers ───────────────────────────────────────────────────────────────────

function randomCode(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── Login OTP flow ────────────────────────────────────────────────────────────

/**
 * Verifies the user's credentials (password + emailVerified).
 * If valid, generates a 6-digit OTP, stores it, and sends it via email.
 * Returns the OTP record ID (pendingId) for the client to track the flow.
 */
export async function sendLoginOtp(
  email: string,
  password: string
): Promise<{ pendingId: string } | { error: string }> {
  const bcrypt = await import("bcryptjs");

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user?.passwordHash) {
    console.warn("[OTP][login] Unknown email attempted", { email });
    return { error: "invalid_credentials" };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    console.warn("[OTP][login] Wrong password attempt", { userId: user.id });
    return { error: "invalid_credentials" };
  }

  if (!user.emailVerified) {
    console.warn("[OTP][login] Unverified email login attempt", { userId: user.id });
    return { error: "email_not_verified" };
  }

  // Replace any existing OTP for this user
  await prisma.otpCode.deleteMany({ where: { userId: user.id } });

  const code = randomCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
  const otp = await prisma.otpCode.create({
    data: { userId: user.id, code, expiresAt },
  });

  await sendEmail({
    to: user.email,
    subject: "Your Focus sign-in code",
    html: otpEmailHtml(code, OTP_EXPIRY_MINUTES),
  });

  console.log(
    `[OTP][login] Code sent to ${user.email} — expires in ${OTP_EXPIRY_MINUTES}min | pendingId: ${otp.id}`
  );

  return { pendingId: otp.id };
}

// ── OTP verification ──────────────────────────────────────────────────────────

export type OtpVerifyResult =
  | { ok: true; signInToken: string }
  | { ok: false; error: "invalid" | "expired" | "locked"; attemptsLeft?: number };

/**
 * Validates a submitted OTP code. On success, deletes the OTP and issues
 * a short-lived signInToken that the client uses to complete the NextAuth sign-in.
 */
export async function verifyLoginOtp(
  pendingId: string,
  submittedCode: string
): Promise<OtpVerifyResult> {
  const otp = await prisma.otpCode.findUnique({ where: { id: pendingId } });

  if (!otp) {
    console.warn("[OTP][verify] OTP record not found", { pendingId });
    return { ok: false, error: "expired" };
  }

  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    console.error("[OTP][verify] Account locked — too many attempts", {
      userId: otp.userId,
      pendingId,
    });
    await prisma.otpCode.delete({ where: { id: pendingId } });
    return { ok: false, error: "locked" };
  }

  if (new Date() > otp.expiresAt) {
    console.warn("[OTP][verify] OTP expired", { userId: otp.userId });
    await prisma.otpCode.delete({ where: { id: pendingId } });
    return { ok: false, error: "expired" };
  }

  if (otp.code !== submittedCode.trim()) {
    const newAttempts = otp.attempts + 1;
    const remaining = OTP_MAX_ATTEMPTS - newAttempts;

    await prisma.otpCode.update({
      where: { id: pendingId },
      data: { attempts: newAttempts },
    });

    if (newAttempts >= OTP_MAX_ATTEMPTS) {
      console.error("[OTP][verify] Account locked after final wrong attempt", {
        userId: otp.userId,
      });
      await prisma.otpCode.delete({ where: { id: pendingId } });
      return { ok: false, error: "locked" };
    }

    console.warn("[OTP][verify] Wrong code", {
      userId: otp.userId,
      attempts: newAttempts,
      remaining,
    });
    return { ok: false, error: "invalid", attemptsLeft: remaining };
  }

  // Code is correct — clean up and issue a one-time sign-in token
  await prisma.otpCode.delete({ where: { id: pendingId } });

  const token = randomToken();
  const identifier = `signin:${otp.userId}`;
  const expires = new Date(Date.now() + SIGN_IN_TOKEN_EXPIRY_SECONDS * 1_000);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token, expires } });

  console.log("[OTP][verify] OTP verified — sign-in token issued", {
    userId: otp.userId,
  });

  return { ok: true, signInToken: token };
}

/**
 * Validates and consumes a sign-in token.
 * Returns the user if valid, null otherwise.
 * Called by the NextAuth Credentials authorize() function.
 */
export async function consumeSignInToken(
  token: string
): Promise<{ id: string; email: string; name: string | null; image: string | null } | null> {
  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || !record.identifier.startsWith("signin:")) {
    console.warn("[OTP][signin] Sign-in token not found or wrong type");
    return null;
  }

  await prisma.verificationToken.delete({ where: { token } });

  if (new Date() > record.expires) {
    console.warn("[OTP][signin] Sign-in token expired", {
      identifier: record.identifier,
    });
    return null;
  }

  const userId = record.identifier.replace("signin:", "");
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    console.warn("[OTP][signin] User not found for sign-in token", { userId });
    return null;
  }

  console.log("[OTP][signin] Sign-in complete for user", userId);
  return { id: user.id, email: user.email, name: user.name, image: user.image };
}

/**
 * Resends an OTP for an existing pendingId (replaces old code, resets attempts).
 */
export async function resendLoginOtp(pendingId: string): Promise<{ ok: boolean }> {
  const existing = await prisma.otpCode.findUnique({ where: { id: pendingId } });
  if (!existing) return { ok: false };

  const user = await prisma.user.findUnique({ where: { id: existing.userId } });
  if (!user) return { ok: false };

  const code = randomCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);

  await prisma.otpCode.update({
    where: { id: pendingId },
    data: { code, attempts: 0, expiresAt },
  });

  await sendEmail({
    to: user.email,
    subject: "Your new Focus sign-in code",
    html: otpEmailHtml(code, OTP_EXPIRY_MINUTES),
  });

  console.log(`[OTP][resend] New code sent to ${user.email} | pendingId: ${pendingId}`);
  return { ok: true };
}

// ── Email verification (registration) ────────────────────────────────────────

/**
 * Generates an email verification token for a newly registered user and sends the link.
 */
export async function sendEmailVerification(
  userId: string,
  email: string,
  baseUrl: string
): Promise<void> {
  const token = randomToken();
  const identifier = `email-verify:${email}`;
  const expires = new Date(Date.now() + EMAIL_VERIFY_EXPIRY_HOURS * 3_600_000);

  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({ data: { identifier, token, expires } });

  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;

  // Always print the link — useful while the sending domain is pending verification
  console.log(
    "\n[EMAIL][verify] Verification link for", email,
    "\n→", verifyUrl, "\n"
  );

  await sendEmail({
    to: email,
    subject: "Verify your Focus account",
    html: verifyEmailHtml(verifyUrl),
  });
}

/**
 * Marks a user's email as verified using the token from the verification link.
 * Returns the user's email on success, null on failure.
 */
export async function verifyEmailToken(token: string): Promise<string | null> {
  const record = await prisma.verificationToken.findUnique({ where: { token } });

  if (!record || !record.identifier.startsWith("email-verify:")) {
    console.warn("[EMAIL][verify] Invalid or unknown verification token");
    return null;
  }

  await prisma.verificationToken.delete({ where: { token } });

  if (new Date() > record.expires) {
    console.warn("[EMAIL][verify] Verification token expired", {
      identifier: record.identifier,
    });
    return null;
  }

  const email = record.identifier.replace("email-verify:", "");
  await prisma.user.update({
    where: { email },
    data: { emailVerified: new Date() },
  });

  console.log("[EMAIL][verify] Email verified for", email);
  return email;
}
