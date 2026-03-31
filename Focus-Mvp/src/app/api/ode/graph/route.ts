/**
 * GET /api/ode/graph
 *
 * Builds (or refreshes) the operational graph for the authenticated
 * organisation and returns it as JSON.
 *
 * The graph is a real-time model of operational relationships:
 *   nodes  — Products, Suppliers, Locations, Orders
 *   edges  — SUPPLIES, STOCKS_AT, SOURCES_FROM, FULFILLS, COMPONENT_OF,
 *            LOCATED_IN, TRANSFERS_BETWEEN, SHIPS_TO
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { buildOperationalGraph } from "@/lib/ode/graph-builder";

export async function GET(req: NextRequest) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  try {
    const graph = await buildOperationalGraph(ctx.org.id);
    return NextResponse.json(graph);
  } catch (err) {
    console.error("[ODE] graph build failed:", err);
    return NextResponse.json(
      { error: "Failed to build operational graph" },
      { status: 500 }
    );
  }
}
