import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyLoginOtp, resendLoginOtp } from "@/lib/otp";

const verifySchema = z.object({
  pendingId: z.string().min(1),
  code: z.string().length(6).regex(/^\d{6}$/),
});

const resendSchema = z.object({
  pendingId: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await verifyLoginOtp(parsed.data.pendingId, parsed.data.code);

  if (!result.ok) {
    const status = result.error === "locked" ? 429 : 400;
    return NextResponse.json(
      { error: result.error, attemptsLeft: result.attemptsLeft },
      { status }
    );
  }

  return NextResponse.json({ signInToken: result.signInToken }, { status: 200 });
}

// PATCH = resend OTP for same pendingId
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = resendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await resendLoginOtp(parsed.data.pendingId);
  if (!result.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
