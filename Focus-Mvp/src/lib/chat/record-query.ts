/**
 * Typed query engine over ImportRecord, used by the chat tool layer.
 *
 * Every query is scoped by (organizationId, datasetName) so cross-tenant
 * leakage is impossible. Field names are validated against the dataset's
 * declared vocabulary before they're allowed into SQL — an LLM-supplied
 * column reference can't smuggle arbitrary identifiers. User-supplied
 * values are bound as parameters via Prisma.sql tagged templates, never
 * interpolated into the query string.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

// ─── Field validation ──────────────────────────────────────────────────────
//
// LLM output goes directly into these paths. Anything that crosses into
// SQL text (column names on the left of `data->>'...'`) must be in the
// dataset's declared field set. Values on the right of an operator are
// bound as parameters, but column refs can't be parameterised in
// Postgres so we validate by allow-list.

function assertField(dataset: DatasetName, field: string): void {
  const fields = DATASETS[dataset].fields as Record<string, unknown>;
  if (!(field in fields)) {
    throw new Error(
      `Unknown field "${field}" for dataset "${dataset}". ` +
        `Available: ${Object.keys(fields).join(", ")}`,
    );
  }
}

function fieldType(
  dataset: DatasetName,
  field: string,
): "string" | "number" | "boolean" | "date" {
  const def = (DATASETS[dataset].fields as Record<
    string,
    { type: "string" | "number" | "boolean" | "date" }
  >)[field];
  return def.type;
}

/** `data->>'field'` for string/date fields, `(data->>'field')::numeric`
 *  for numeric comparisons. Boolean columns compare against `'true'`/
 *  `'false'` strings since that's how we store them. */
function colExpr(dataset: DatasetName, field: string, asNumeric: boolean): Prisma.Sql {
  assertField(dataset, field);
  if (asNumeric) return Prisma.sql`("data"->>${field})::numeric`;
  return Prisma.sql`"data"->>${field}`;
}

// ─── queryRecords ──────────────────────────────────────────────────────────

export interface QueryOptions {
  dataset: DatasetName;
  orgId: string;
  filters?: Record<string, unknown>;
  search?: string;
  searchFields?: string[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  offset?: number;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  total: number;
  returnedCount: number;
}

/** Build the per-filter SQL fragment. Covers both direct equality and
 *  operator objects ({ gt, gte, lt, lte, contains, in, not }). */
function buildFilterFragment(
  dataset: DatasetName,
  field: string,
  value: unknown,
): Prisma.Sql | null {
  if (value === null || value === undefined) return null;

  const type = fieldType(dataset, field);
  const asNumeric = type === "number";

  // Operator object: { gt: 5 }, { in: [...] }, { contains: "abc" }, …
  // String comparisons (eq / ne / in / contains) go through LOWER()
  // on both sides so the AI can emit any case variant of a status
  // value ("Open", "OPEN", "open") and still match the literal the
  // org actually stored. Numeric / boolean comparisons stay exact.
  if (typeof value === "object" && !Array.isArray(value)) {
    const f = value as Record<string, unknown>;
    const col = colExpr(dataset, field, asNumeric);

    if ("gt" in f) return Prisma.sql`${col} > ${Number(f.gt)}`;
    if ("gte" in f) return Prisma.sql`${col} >= ${Number(f.gte)}`;
    if ("lt" in f) return Prisma.sql`${col} < ${Number(f.lt)}`;
    if ("lte" in f) return Prisma.sql`${col} <= ${Number(f.lte)}`;
    if ("contains" in f) {
      const like = `%${String(f.contains)}%`;
      return Prisma.sql`"data"->>${field} ILIKE ${like}`;
    }
    if ("in" in f && Array.isArray(f.in)) {
      if (f.in.length === 0) return Prisma.sql`FALSE`;
      const bound = f.in.map((v) => String(v).toLowerCase());
      return Prisma.sql`LOWER("data"->>${field}) IN (${Prisma.join(bound)})`;
    }
    if ("not" in f) {
      const str = String(f.not);
      if (asNumeric) {
        return Prisma.sql`(${col} != ${Number(f.not)} OR "data"->>${field} IS NULL)`;
      }
      return Prisma.sql`(LOWER("data"->>${field}) != LOWER(${str}) OR "data"->>${field} IS NULL)`;
    }
    return null;
  }

  // Direct equality
  if (typeof value === "string") {
    return Prisma.sql`LOWER("data"->>${field}) = LOWER(${value})`;
  }
  if (typeof value === "number") {
    return Prisma.sql`(${colExpr(dataset, field, true)}) = ${value}`;
  }
  if (typeof value === "boolean") {
    return Prisma.sql`"data"->>${field} = ${String(value)}`;
  }
  return null;
}

/** Order-by clause. Numeric-ish fields cast to numeric so "fewer than 10"
 *  comparisons sort arithmetically. Default ordering is importedAt DESC. */
function buildOrderBy(
  dataset: DatasetName,
  orderBy: QueryOptions["orderBy"],
): Prisma.Sql {
  if (!orderBy) return Prisma.sql`"importedAt" DESC`;
  assertField(dataset, orderBy.field);
  const asNumeric = fieldType(dataset, orderBy.field) === "number";
  const col = colExpr(dataset, orderBy.field, asNumeric);
  const dir = orderBy.direction === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  return Prisma.sql`${col} ${dir} NULLS LAST`;
}

export async function queryRecords(opts: QueryOptions): Promise<QueryResult> {
  const {
    dataset,
    orgId,
    filters = {},
    search,
    searchFields = [],
    orderBy,
    limit = 100,
    offset = 0,
  } = opts;

  const clampedLimit = Math.min(Math.max(1, limit), 500);
  const clampedOffset = Math.max(0, offset);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"organizationId" = ${orgId}`,
    Prisma.sql`"datasetName" = ${dataset}`,
  ];

  for (const [field, value] of Object.entries(filters)) {
    const frag = buildFilterFragment(dataset, field, value);
    if (frag) conditions.push(frag);
  }

  if (search && searchFields.length > 0) {
    // Validate every search field before splicing into the SQL.
    const likes = searchFields.map((f) => {
      assertField(dataset, f);
      const like = `%${search}%`;
      return Prisma.sql`"data"->>${f} ILIKE ${like}`;
    });
    conditions.push(Prisma.sql`(${Prisma.join(likes, " OR ")})`);
  }

  const where = Prisma.join(conditions, " AND ");
  const order = buildOrderBy(dataset, orderBy);

  const [rowResult, countResult] = await Promise.all([
    prisma.$queryRaw<Array<{ data: Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT "data"
        FROM "ImportRecord"
        WHERE ${where}
        ORDER BY ${order}
        LIMIT ${clampedLimit} OFFSET ${clampedOffset}
      `,
    ),
    prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "ImportRecord"
        WHERE ${where}
      `,
    ),
  ]);

  return {
    rows: rowResult.map((r) => r.data as Record<string, unknown>),
    total: Number(countResult[0]?.count ?? 0),
    returnedCount: rowResult.length,
  };
}

// ─── aggregateRecords ──────────────────────────────────────────────────────

export interface AggregateOptions {
  dataset: DatasetName;
  orgId: string;
  metric: "COUNT" | "SUM" | "AVG";
  valueField?: string;
  groupByField?: string;
  filters?: Record<string, unknown>;
  /** Limited cross-column comparison support, e.g. "quantity < reorder_point".
   *  Both sides must be canonical field names; the parser casts both to
   *  numeric so comparisons are arithmetic. Unknown / non-canonical tokens
   *  are rejected. */
  rawWhere?: string;
}

const RAW_WHERE_COMPARE = /^\s*([a-z][a-z0-9_]*)\s*(<=|>=|<|>|=|!=)\s*([a-z][a-z0-9_]*|-?\d+(?:\.\d+)?)\s*$/i;

/** Parse a conservative two-operand cross-column comparison. Rejects
 *  anything that doesn't match the simple `field op field-or-number`
 *  grammar. This keeps the rawWhere surface from being an injection
 *  vector while still covering the 80/20 use cases ("quantity <
 *  reorder_point", "days_of_supply <= 10"). */
function parseRawWhere(dataset: DatasetName, rawWhere: string): Prisma.Sql {
  const match = rawWhere.match(RAW_WHERE_COMPARE);
  if (!match) {
    throw new Error(
      `rawWhere must be a simple comparison like "field < field" or "field > 10" — got: ${rawWhere}`,
    );
  }
  const [, left, op, right] = match;
  assertField(dataset, left);

  const leftSql = colExpr(dataset, left, true);
  const opSql = ({
    "<": Prisma.sql`<`,
    "<=": Prisma.sql`<=`,
    ">": Prisma.sql`>`,
    ">=": Prisma.sql`>=`,
    "=": Prisma.sql`=`,
    "!=": Prisma.sql`!=`,
  } as const)[op as "<" | "<=" | ">" | ">=" | "=" | "!="];

  // Numeric literal on the right.
  if (/^-?\d+(?:\.\d+)?$/.test(right)) {
    return Prisma.sql`${leftSql} ${opSql} ${Number(right)}`;
  }

  // Field reference on the right — validate against the dataset.
  assertField(dataset, right);
  const rightSql = colExpr(dataset, right, true);
  return Prisma.sql`${leftSql} ${opSql} ${rightSql}`;
}

export async function aggregateRecords(
  opts: AggregateOptions,
): Promise<{ result: number | Record<string, number> }> {
  const { dataset, orgId, metric, valueField, groupByField, filters = {}, rawWhere } = opts;

  if (metric !== "COUNT" && !valueField) {
    throw new Error(`valueField is required for ${metric}`);
  }
  if (valueField) assertField(dataset, valueField);
  if (groupByField) assertField(dataset, groupByField);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`"organizationId" = ${orgId}`,
    Prisma.sql`"datasetName" = ${dataset}`,
  ];

  for (const [field, value] of Object.entries(filters)) {
    const frag = buildFilterFragment(dataset, field, value);
    if (frag) conditions.push(frag);
  }
  if (rawWhere && rawWhere.trim() !== "") {
    conditions.push(parseRawWhere(dataset, rawWhere));
  }

  const where = Prisma.join(conditions, " AND ");

  const aggExpr =
    metric === "COUNT"
      ? Prisma.sql`COUNT(*)`
      : metric === "SUM"
        ? Prisma.sql`SUM(${colExpr(dataset, valueField!, true)})`
        : Prisma.sql`AVG(${colExpr(dataset, valueField!, true)})`;

  if (groupByField) {
    const groupExpr = colExpr(dataset, groupByField, false);
    const rows = await prisma.$queryRaw<Array<{ group_val: string | null; result: unknown }>>(
      Prisma.sql`
        SELECT ${groupExpr} AS group_val, ${aggExpr} AS result
        FROM "ImportRecord"
        WHERE ${where}
        GROUP BY ${groupExpr}
        ORDER BY result DESC NULLS LAST
        LIMIT 50
      `,
    );
    const grouped: Record<string, number> = {};
    for (const row of rows) {
      grouped[row.group_val ?? "null"] = Number(row.result ?? 0);
    }
    return { result: grouped };
  }

  const [{ result }] = await prisma.$queryRaw<[{ result: unknown }]>(
    Prisma.sql`
      SELECT ${aggExpr} AS result
      FROM "ImportRecord"
      WHERE ${where}
    `,
  );
  return { result: Number(result ?? 0) };
}
