import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { runQuery, buildOrgWhere, toWhereClause, filterCompatibleFilters } from "@/lib/widget-query";
import type { DataQuery } from "@/components/apps/widgets/types";

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.query) return badRequest("query required");

  const query = body.query as DataQuery;
  const orgWhere = buildOrgWhere(query.entity, ctx.org.id);
  // Strip relation-based filters not valid for this entity
  const compatibleFilters = filterCompatibleFilters(query.entity, query.filters);
  const filterWhere = toWhereClause(compatibleFilters);
  const where = { ...orgWhere, ...filterWhere };

  try {
    const data = await runQuery(ctx.org.id, query, where);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[widget-data]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Query failed" },
      { status: 500 }
    );
  }
}
