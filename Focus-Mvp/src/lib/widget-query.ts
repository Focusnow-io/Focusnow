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
  // Legacy alias — "orders" used to mean POs in the widget layer.
  orders: "purchase_orders",
  // Not yet in the JSONB store — widgets get an empty result until
  // these land. Returning null (vs. a random dataset) means
  // aggregations return 0 and list queries return [] cleanly.
  work_orders: null,
  lots: null,
  forecasts: null,
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

    if (f.value === "TODAY") {
      out[f.field] = { lt: new Date().toISOString().split("T")[0] };
      continue;
    }

    switch (f.op) {
      case "eq":
        out[f.field] = f.value;
        break;
      case "ne":
        out[f.field] = { not: f.value };
        break;
      case "lt":
        out[f.field] = { lt: f.value };
        break;
      case "lte":
        out[f.field] = { lte: f.value };
        break;
      case "gt":
        out[f.field] = { gt: f.value };
        break;
      case "gte":
        out[f.field] = { gte: f.value };
        break;
      case "contains":
        out[f.field] = { contains: f.value };
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
    field,
    groupBy,
    sort,
    limit,
    timeBucket,
    computedField,
  } = query;

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
      const metric = aggregation.toUpperCase();
      if (metric !== "COUNT" && metric !== "SUM" && metric !== "AVG") {
        // min / max not supported server-side — client-side over raw rows.
        const { rows } = await queryRecords({
          dataset: datasetName,
          orgId,
          filters: recordFilters,
          limit: 10_000,
        });
        const groups = new Map<string, number[]>();
        for (const row of rows) {
          const label = String(row[groupBy] ?? "null");
          const valRaw = field ? row[field] : 1;
          const v = typeof valRaw === "number" ? valRaw : Number(valRaw);
          if (!isFinite(v)) continue;
          const arr = groups.get(label) ?? [];
          arr.push(v);
          groups.set(label, arr);
        }
        return Array.from(groups.entries())
          .map(([label, nums]) => ({
            label,
            value: aggregation === "min" ? Math.min(...nums) : Math.max(...nums),
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit ?? 50);
      }

      const result = await aggregateRecords({
        dataset: datasetName,
        orgId,
        metric,
        valueField: field,
        groupByField: groupBy,
        filters: recordFilters,
      });
      if (typeof result.result === "object" && result.result !== null) {
        return Object.entries(result.result as Record<string, number>)
          .map(([label, value]) => ({ label, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, limit ?? 50);
      }
      return [];
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
      orderBy: sort ? { field: sort.field, direction: sort.dir } : undefined,
      limit: limit ?? 100,
    });
    return rows;
  } catch (err) {
    console.error(
      `[widget-query] ${datasetName} failed:`,
      err instanceof Error ? err.message : err,
    );
    return aggregation ? { value: 0 } : [];
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
        ? { field: query.sort.field, direction: query.sort.dir }
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
