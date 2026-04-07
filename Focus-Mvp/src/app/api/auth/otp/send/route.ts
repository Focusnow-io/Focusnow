import { NextResponse } from "next/server";
import { z } from "zod";
import { sendLoginOtp } from "@/lib/otp";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await sendLoginOtp(parsed.data.email, parsed.data.password);

  if ("error" in result) {
    if (result.error === "email_not_verified") {
      return NextResponse.json({ error: "email_not_verified" }, { status: 403 });
    }
    // Deliberately vague for security — don't reveal which field is wrong
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }

  return NextResponse.json({ pendingId: result.pendingId }, { status: 200 });
}
