import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { runQuery, filterCompatibleFilters } from "@/lib/widget-query";
import type { DataQuery } from "@/components/apps/widgets/types";

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.query) return badRequest("query required");

  const query = body.query as DataQuery;
  // Org scoping is handled inside runQuery against ImportRecord;
  // we just pre-filter the DataFilter[] for any relation-based
  // conditions that aren't representable against the JSONB store.
  const compatibleFilters = filterCompatibleFilters(query.entity, query.filters);

  try {
    const data = await runQuery(ctx.org.id, query, compatibleFilters);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[widget-data]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 500 }
    );
  }
}
