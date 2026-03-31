/**
 * GET /api/ode/state
 *
 * Returns the current operational state snapshot for the authenticated
 * organisation: entity counts, low-stock alerts, open orders, etc.
 *
 * This is NOT a BI aggregate — it reflects the live state of operations.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { getOperationalState } from "@/lib/ode/state-manager";

export async function GET(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  try {
    const state = await getOperationalState(ctx.org.id);
    return NextResponse.json(state);
  } catch (err) {
    console.error("[ODE] state snapshot failed:", err);
    return NextResponse.json(
      { error: "Failed to retrieve operational state" },
      { status: 500 }
    );
  }
}
