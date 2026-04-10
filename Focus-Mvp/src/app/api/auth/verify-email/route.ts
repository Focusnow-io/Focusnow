import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/otp";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  const email = await verifyEmailToken(token);

  if (!email) {
    return NextResponse.redirect(new URL("/login?error=invalid_token", req.url));
  }

  return NextResponse.redirect(new URL("/login?verified=1", req.url));
}
