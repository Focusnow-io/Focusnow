import { NextResponse } from "next/server";
import { z } from "zod";
import { sendLoginOtp } from "@/lib/otp";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Simple in-process rate limiter — max 5 OTP send attempts per email per 15 minutes.
// Good enough for a single-instance server; swap for Redis in multi-instance deployments.
const sendAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 15 * 60 * 1_000; // 15 minutes
const RATE_MAX = 5;

function checkRateLimit(email: string): boolean {
  const now = Date.now();
  const entry = sendAttempts.get(email);

  if (!entry || now > entry.resetAt) {
    sendAttempts.set(email, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true; // allowed
  }

  if (entry.count >= RATE_MAX) {
    console.warn("[OTP][send] Rate limit hit for email", email);
    return false; // blocked
  }

  entry.count++;
  return true; // allowed
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { email, password } = parsed.data;

  if (!checkRateLimit(email)) {
    return NextResponse.json(
      { error: "too_many_requests" },
      { status: 429 }
    );
  }

  const result = await sendLoginOtp(email, password);

  if ("error" in result) {
    if (result.error === "email_not_verified") {
      return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
    }
    // Deliberately vague — don't reveal whether email exists
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ pendingId: result.pendingId }, { status: 200 });
}
