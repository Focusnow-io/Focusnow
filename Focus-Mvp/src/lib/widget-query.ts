/**
 * Widget data engine — reads from ImportRecord.
 *
 * Dashboard widgets (StatCard / Chart / Table / AlertList / Insight /
 * Simulator / Form) all call runQuery() or fetchRawRows() to pull
 * typed data. This implementation routes every call through the same
 * JSONB query engine the chat tools use, so widgets and the AI see
 * the same numbers.
 *
 * Public API preserved from the pre-migration version so callers
 * (widget-data route, widget-insight route, any widget that imported
 * a helper) compile unchanged:
 *   - runQuery(orgId, query, filters)
 *   - fetchRawRows(orgId, query, filters)
 *   - toWhereClause(filters)         — identity passthrough now
 *   - filterCompatibleFilters(…)     — identity passthrough now
 *   - buildOrgWhere(entity, orgId)   — returns {} now (orgId scope
 *                                      handled inside queryRecords)
 */

import { queryRecords, aggregateRecords } from "@/lib/chat/record-query";
import type { DatasetName } from "@/lib/ingestion/datasets";
import type { DataFilter, DataQuery } from "@/components/apps/widgets/types";

// ─── Field name normalisation ──────────────────────────────────────────────
//
// Apps generated before the system-prompt fix used camelCase field names
// (e.g. totalAmount, createdAt, poNumber). `assertField` in record-query.ts
// rejects these, causing silent 0/empty results. We normalise every field
// reference to snake_case before it reaches the query engine so old configs
// continue to work without migration.

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** Explicit aliases for renames that aren't pure casing changes. */
const FIELD_ALIASES: Record<string, string> = {
  // old AI name → canonical
  total_amount:   "line_value",
  amount:         "line_value",
  total_value:    "line_value",   // inventory has its own total_value, keep as-is below
  // prisma/camel aliases → canonical date fields
  created_at:     "order_date",
  updated_at:     "order_date",
  // product field renamed in system prompt
  category:       "type",
  // supplier aliases
  on_time:        "on_time_pct",
  on_time_delivery: "on_time_pct",
};

// Fields that exist verbatim in a dataset should NOT be re-aliased above.
// total_value IS a real inventory field, so we keep it only for datasets
// that don't have it. The query engine's assertField will accept it for
// inventory and reject it elsewhere — that's the desired behavior.
delete FIELD_ALIASES["total_value"];

function normalizeField(field: string): string {
  if (!field) return field;
  // Skip dot-notation relation references (e.g. "supplier.name") —
  // buildFilterMap already strips these, and we don't want to mangle them.
  if (field.includes(".")) return field;
  const snake = camelToSnake(field);
  return FIELD_ALIASES[snake] ?? snake;
}

// ─── Widget entity → dataset mapping ───────────────────────────────────────

const ENTITY_TO_DATASET: Record<string, DatasetName | null> = {
  // Direct matches — widget EntityType uses snake_case that already
  // lines up with DatasetName for the 6 overlapping concepts.
  products: "products",
  inventory: "inventory",
  suppliers: "suppliers",
  customers: "customers",
  purchase_orders: "purchase_orders",
  sales_orders: "sales_orders",
  bom: "bom",
  locations: "locations",

  // Singular forms — old AI-generated apps may use singular entity names.
  product: "products",
  supplier: "suppliers",
  customer: "customers",
  location: "locations",
  purchase_order: "purchase_orders",
  sales_order: "sales_orders",

  // Abbreviations / common aliases from old prompts.
  orders: "purchase_orders",   // legacy
  po: "purchase_orders",
  pos: "purchase_orders",
  so: "sales_orders",
  sos: "sales_orders",
  inv: "inventory",
  stock: "inventory",
  items: "inventory",
  item: "inventory",
  skus: "inventory",
  parts: "products",
  catalog: "products",
  vendors: "suppliers",
  vendor: "suppliers",
  clients: "customers",
  client: "customers",
  warehouses: "locations",
  warehouse: "locations",

  // Not yet in the JSONB store — widgets get an empty result until
  // these land. Returning null (vs. a random dataset) means
  // aggregations return 0 and list queries return [] cleanly.
  work_orders: null,
  work_order: null,
  lots: null,
  lot: null,
  forecasts: null,
  forecast: null,
  shipments: null,
  shipment: null,
};

// ─── Backward-compat passthroughs (no-ops in the new world) ────────────────
//
// Every caller still imports these names; we keep the exports but they
// no longer translate to Prisma-where shape. Filter composition now
// happens inside runQuery() via the record-query engine.

export function toWhereClause(filters: DataFilter[] | undefined): DataFilter[] {
  return filters ?? [];
}

export function filterCompatibleFilters(
  _entity: string,
  filters: DataFilter[] | undefined,
): DataFilter[] {
  // The JSONB query engine validates every field name against the
  // DATASETS vocabulary, so incompatible filters throw there rather
  // than needing to be stripped upfront. Kept as an identity pass
  // so callers don't need updates.
  return filters ?? [];
}

export function buildOrgWhere(_entity: string, _orgId: string): Record<string, unknown> {
  // Org scoping is applied inside queryRecords / aggregateRecords by
  // passing orgId to the query engine — no Prisma where clause needed.
  return {};
}

// ─── Time bucketing ────────────────────────────────────────────────────────

function bucketDate(
  d: Date,
  bucket: "day" | "week" | "month" | "quarter",
): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const date = d.getUTCDate();
  if (bucket === "day") {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  }
  if (bucket === "week") {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const weekNum =
      1 +
      Math.round(
        ((d.getTime() - jan4.getTime()) / 86_400_000 -
          3 +
          ((jan4.getUTCDay() + 6) % 7)) /
          7,
      );
    return `${year}-W${String(weekNum).padStart(2, "0")}`;
  }
  if (bucket === "month") {
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  }
  return `${year}-Q${Math.floor(month / 3) + 1}`;
}

function applyTimeBucket<T extends Record<string, unknown>>(
  rows: T[],
  groupBy: string,
  bucket: "day" | "week" | "month" | "quarter",
  aggregation: "count" | "sum" | "avg" | "min" | "max",
  field: string | undefined,
): Array<{ label: string; value: number }> {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const raw = row[groupBy];
    if (!raw) continue;
    const date = raw instanceof Date ? raw : new Date(String(raw));
    if (isNaN(date.getTime())) continue;
    const label = bucketDate(date, bucket);
    const valueRaw = field ? row[field] : 1;
    const value = typeof valueRaw === "number" ? valueRaw : Number(valueRaw);
    if (!isFinite(value)) continue;
    const cur = groups.get(label) ?? [];
    cur.push(value);
    groups.set(label, cur);
  }
  const result: Array<{ label: string; value: number }> = [];
  for (const [label, nums] of groups) {
    let value = 0;
    if (aggregation === "count") value = nums.length;
    else if (aggregation === "sum") value = nums.reduce((a, b) => a + b, 0);
    else if (aggregation === "avg")
      value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
    else if (aggregation === "min") value = Math.min(...nums);
    else if (aggregation === "max") value = Math.max(...nums);
    result.push({ label, value });
  }
  return result.sort((a, b) => (a.label < b.label ? -1 : 1));
}

// ─── Computed fields ───────────────────────────────────────────────────────

function computeFieldValue(
  rows: Array<Record<string, unknown>>,
  operation: "ratio" | "percentage" | "delta",
  numerator: string,
  denominator: string,
): { value: number } {
  let numSum = 0;
  let denomSum = 0;
  for (const row of rows) {
    const n = Number(row[numerator]);
    const d = Number(row[denominator]);
    if (isFinite(n)) numSum += n;
    if (isFinite(d)) denomSum += d;
  }
  if (operation === "ratio") {
    return { value: denomSum === 0 ? 0 : numSum / denomSum };
  }
  if (operation === "percentage") {
    return { value: denomSum === 0 ? 0 : (numSum / denomSum) * 100 };
  }
  return { value: numSum - denomSum };
}

// ─── Filter adapter: DataFilter[] → record-query filter map ────────────────

function buildFilterMap(filters: DataFilter[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of filters ?? []) {
    if (f.field.includes(".")) continue;

    const key = normalizeField(f.field);

    if (f.value === "TODAY") {
      out[key] = { lt: new Date().toISOString().split("T")[0] };
      continue;
    }

    switch (f.op) {
      case "eq":
        out[key] = f.value;
        break;
      case "ne":
        out[key] = { not: f.value };
        break;
      case "lt":
        out[key] = { lt: f.value };
        break;
      case "lte":
        out[key] = { lte: f.value };
        break;
      case "gt":
        out[key] = { gt: f.value };
        break;
      case "gte":
        out[key] = { gte: f.value };
        break;
      case "contains":
        out[key] = { contains: f.value };
        break;
    }
  }
  return out;
}

// ─── runQuery ──────────────────────────────────────────────────────────────

export async function runQuery(
  orgId: string,
  query: DataQuery,
  filters?: DataFilter[],
): Promise<unknown> {
  const {
    entity,
    aggregation,
    sort,
    limit,
    timeBucket,
    computedField,
  } = query;

  // Normalise field references: camelCase → snake_case + explicit aliases.
  // This makes apps generated before the system-prompt fix work without
  // needing to migrate their stored configs.
  const field   = query.field   ? normalizeField(query.field)   : query.field;
  const groupBy = query.groupBy ? normalizeField(query.groupBy) : query.groupBy;

  const datasetName = ENTITY_TO_DATASET[entity];
  if (!datasetName) {
    return aggregation ? { value: 0 } : [];
  }

  const sourceFilters = filters ?? query.filters;
  const recordFilters = buildFilterMap(sourceFilters);

  try {
    if (computedField) {
      const { rows } = await queryRecords({
        dataset: datasetName,
        orgId,
        filters: recordFilters,
        limit: 10_000,
      });
      return computeFieldValue(
        rows,
        computedField.operation,
        computedField.numerator,
        computedField.denominator,
      );
    }

    if (timeBucket && groupBy) {
      const { rows } = await queryRecords({
        dataset: datasetName,
        orgId,
        filters: recordFilters,
        limit: 10_000,
      });
      return applyTimeBucket(
        rows,
        groupBy,
        timeBucket,
        aggregation ?? "count",
        field,
      );
    }

    if (groupBy && aggregation) {
      // All groupBy aggregations run client-side over raw rows for reliability.
      // The SQL GROUP BY path (aggregateRecords with groupByField) can silently
      // fail with composite Prisma.Sql fragments, causing the catch to return
      // { value: 0 } instead of [], which makes ChartWidget show "No data available"
      // even when the dataset has records. Client-side grouping is always correct.
      const { rows } = await queryRecords({
        dataset: datasetName,
        orgId,
        filters: recordFilters,
        limit: 10_000,
      });

      const agg = aggregation.toLowerCase();
      const groups = new Map<string, number[]>();
      for (const row of rows) {
        const rawLabel = row[groupBy];
        const labelStr = rawLabel !== null && rawLabel !== undefined ? String(rawLabel).trim() : "";
        const label = labelStr !== "" ? labelStr : "(None)";
        const valRaw = field ? row[field] : 1;
        const v = agg === "count" ? 1 : (typeof valRaw === "number" ? valRaw : Number(valRaw));
        if (agg !== "count" && !isFinite(v)) continue;
        const arr = groups.get(label) ?? [];
        arr.push(v);
        groups.set(label, arr);
      }

      return Array.from(groups.entries())
        .map(([label, nums]) => {
          let value = 0;
          if (agg === "count")  value = nums.length;
          else if (agg === "sum")  value = nums.reduce((a, b) => a + b, 0);
          else if (agg === "avg")  value = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          else if (agg === "min")  value = Math.min(...nums);
          else if (agg === "max")  value = Math.max(...nums);
          return { label, value };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, limit ?? 50);
    }

    if (aggregation && !groupBy) {
      if (aggregation === "min" || aggregation === "max") {
        const { rows } = await queryRecords({
          dataset: datasetName,
          orgId,
          filters: recordFilters,
          limit: 10_000,
        });
        const nums = rows
          .map((r) => {
            const v = field ? r[field] : 1;
            return typeof v === "number" ? v : Number(v);
          })
          .filter((n) => isFinite(n));
        if (nums.length === 0) return { value: 0 };
        return {
          value: aggregation === "min" ? Math.min(...nums) : Math.max(...nums),
        };
      }

      const result = await aggregateRecords({
        dataset: datasetName,
        orgId,
        metric: aggregation.toUpperCase() as "COUNT" | "SUM" | "AVG",
        valueField: field,
        filters: recordFilters,
      });
      return { value: typeof result.result === "number" ? result.result : 0 };
    }

    const { rows } = await queryRecords({
      dataset: datasetName,
      orgId,
      filters: recordFilters,
      orderBy: sort ? { field: normalizeField(sort.field), direction: sort.dir } : undefined,
      limit: limit ?? 100,
    });
    return rows;
  } catch (err) {
    console.error(
      `[widget-query] ${datasetName} failed:`,
      err instanceof Error ? err.message : err,
    );
    // groupBy queries must return [] so ChartWidget's Array.isArray check passes.
    // Returning { value: 0 } would make every chart show "No data available".
    return groupBy ? [] : aggregation ? { value: 0 } : [];
  }
}

// ─── fetchRawRows ──────────────────────────────────────────────────────────

export async function fetchRawRows(
  orgId: string,
  query: DataQuery,
  filters?: DataFilter[],
): Promise<Array<Record<string, unknown>>> {
  const datasetName = ENTITY_TO_DATASET[query.entity];
  if (!datasetName) return [];

  const sourceFilters = filters ?? query.filters;
  const recordFilters = buildFilterMap(sourceFilters);

  try {
    const { rows } = await queryRecords({
      dataset: datasetName,
      orgId,
      filters: recordFilters,
      orderBy: query.sort
        ? { field: normalizeField(query.sort.field), direction: query.sort.dir }
        : undefined,
      limit: query.limit ?? 500,
    });
    return rows;
  } catch (err) {
    console.error(
      `[widget-query] fetchRawRows ${datasetName} failed:`,
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
