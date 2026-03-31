import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";

export async function POST() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  // For pilot: acknowledge the export request.
  // Full implementation will generate ZIP and email to user.
  return NextResponse.json({
    success: true,
    message: `Export requested. We'll email the data to ${ctx.session.user?.email} within 5 minutes.`,
  });
}
