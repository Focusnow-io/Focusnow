/**
 * Chat tools — backed by the new JSONB import store.
 *
 * Every request flows through `queryRecords` / `aggregateRecords` in
 * record-query.ts, which scopes to (organizationId, datasetName) and
 * validates every field against the DATASETS vocabulary before it
 * reaches SQL. The legacy ENTITY_MAP → Prisma-model layer is gone.
 *
 * Tool names stay the same (query_records, aggregate_records,
 * get_record_by_id, query_custom_field, get_traceability) so the LLM
 * doesn't need retraining; `get_entity_by_id` is still accepted as an
 * alias of `get_record_by_id` for any in-flight conversations.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";
import { aggregateRecords, queryRecords } from "./record-query";

// ─── Entity / dataset aliasing ─────────────────────────────────────────────
//
// The old tools accepted "product", "po_line", "bom_line" etc. — route
// these to the new canonical dataset names so existing chat histories
// keep working.
const ENTITY_TO_DATASET: Record<string, DatasetName> = {
  // Canonical dataset keys (passthrough)
  products: "products",
  suppliers: "suppliers",
  customers: "customers",
  locations: "locations",
  inventory: "inventory",
  purchase_orders: "purchase_orders",
  sales_orders: "sales_orders",
  bom: "bom",
  // Legacy snake_case tool names
  product: "products",
  supplier: "suppliers",
  customer: "customers",
  location: "locations",
  inventory_item: "inventory",
  purchase_order: "purchase_orders",
  po_line: "purchase_orders",
  sales_order: "sales_orders",
  so_line: "sales_orders",
  bom_header: "bom",
  bom_line: "bom",
  // Legacy camelCase aliases — the AI may still emit these from chat
  // histories that predate the snake_case migration. Map them all so
  // the tool call resolves without a re-prompt round.
  inventoryItem: "inventory",
  purchaseOrder: "purchase_orders",
  poLine: "purchase_orders",
  salesOrder: "sales_orders",
  soLine: "sales_orders",
  bomLine: "bom",
  // Legacy PascalCase (older still)
  Product: "products",
  Supplier: "suppliers",
  Customer: "customers",
  Location: "locations",
  InventoryItem: "inventory",
  PurchaseOrder: "purchase_orders",
  POLine: "purchase_orders",
  SalesOrder: "sales_orders",
  SOLine: "sales_orders",
  BOMHeader: "bom",
  BOMLine: "bom",
  BOM: "bom",
};

function resolveDataset(entity: unknown): DatasetName {
  const raw = String(entity ?? "").trim();
  const mapped = ENTITY_TO_DATASET[raw];
  if (!mapped) {
    throw new Error(
      `Unknown dataset "${raw}". Use one of: ${Object.keys(DATASETS).join(", ")}`,
    );
  }
  return mapped;
}

// ─── Tool descriptions ─────────────────────────────────────────────────────

const DATASET_LIST = Object.keys(DATASETS).join(", ");

const FIELD_REFERENCE = `
Field names use snake_case and match the canonical dataset vocabulary:
- inventory: sku, location_code, quantity, reorder_point, safety_stock,
  unit_cost, total_value, uom, lead_time_days, moq, order_multiple,
  on_hold_qty, reserved_qty, open_po_qty, days_of_supply, demand_per_day,
  buy_recommendation, recommended_qty, last_receipt_date
- purchase_orders: po_number, supplier_code, supplier_name, sku, item_name,
  line_number, qty_ordered, qty_received, qty_open, unit_cost, line_value,
  currency, status, order_date, expected_date, confirmed_eta, buyer
- sales_orders: so_number, customer_code, customer_name, sku, item_name,
  line_number, qty_ordered, qty_shipped, qty_open, unit_price, line_value,
  currency, status, order_date, requested_date
- products: sku, name, type, uom, unit_cost, list_price, make_buy,
  lead_time_days, moq, order_multiple, product_family, abc_class,
  safety_stock, reorder_point
- suppliers: supplier_code, name, country, city, email, phone,
  lead_time_days, payment_terms, currency, quality_rating, on_time_pct,
  certifications, status, approved_since
- customers: customer_code, name, country, city, email, currency,
  payment_terms, credit_limit, type, status
- locations: location_code, name, type, city, country, parent_code
- bom: fg_sku, fg_name, component_sku, component_name, qty_per, uom,
  section, make_buy, is_critical, component_cost, extended_cost, revision
`.trim();

// ─── Tool definitions ──────────────────────────────────────────────────────

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "query_records",
    description:
      `Query records from a canonical dataset. Returns matching rows as JSON along with totalCount (exact count matching filters) and returnedCount. ` +
      `Use this to list specific records or search by filters. Use aggregate_records for counts or totals — query_records is capped at 500 rows.\n\n` +
      FIELD_REFERENCE,
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description:
            "Dataset to query. One of: inventory, purchase_orders, products, suppliers, customers, sales_orders, bom, locations. Legacy aliases (product, poLine, PurchaseOrder, BOMLine, …) are also accepted and mapped to the canonical dataset.",
        },
        filters: {
          type: "object",
          description:
            "Field filters using snake_case field names from the dataset. Example: { quantity: { lt: 100 } } or { status: 'Open' }. Use exact status values from the build context. Operators: eq / ne / gt / gte / lt / lte / contains / in / not. Cross-column comparisons are NOT supported here — use rawWhere in aggregate_records.",
          additionalProperties: true,
        },
        search: {
          type: "string",
          description: "Case-insensitive ILIKE substring search. Pair with searchFields to pick which columns to search.",
        },
        searchFields: {
          type: "array",
          items: { type: "string" },
          description: "Canonical snake_case fields to search in (must be string-typed).",
        },
        orderBy: {
          type: "object",
          description:
            "Sort order. `field` must be snake_case. Example: { field: 'quantity', direction: 'asc' }. Numeric fields are sorted arithmetically.",
          additionalProperties: true,
        },
        limit: {
          type: "number",
          description: "Max rows to return (1–500, default 100). For counting, use aggregate_records.",
        },
        offset: { type: "number" },
      },
      required: ["entity"],
    },
  },
  {
    name: "aggregate_records",
    description:
      `Aggregate records from a dataset — COUNT, SUM, or AVG, optionally grouped by a field. Returns an exact answer for the whole dataset (no row limit).\n\n` +
      FIELD_REFERENCE,
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description:
            "Dataset to query. One of: inventory, purchase_orders, products, suppliers, customers, sales_orders, bom, locations.",
        },
        metric: {
          type: "string",
          enum: ["COUNT", "SUM", "AVG"],
          description: "Aggregation metric.",
        },
        valueField: {
          type: "string",
          description:
            "The snake_case field name to aggregate. Examples: quantity, line_value, unit_cost, qty_ordered. Required for SUM/AVG.",
        },
        groupByField: {
          type: "string",
          description:
            "The snake_case field name to group by. Examples: status, supplier_code, location_code, type. Returns { [groupValue]: aggregateResult }.",
        },
        filters: {
          type: "object",
          description:
            "Field filter map using snake_case field names. Same operator shape as query_records. Use exact status values from the build context.",
          additionalProperties: true,
        },
        rawWhere: {
          type: "string",
          description:
            "Simple two-operand comparison across canonical snake_case fields. Example: 'quantity < reorder_point' or 'days_of_supply <= 10'. Operators: <, <=, >, >=, =, !=. Both sides must be snake_case canonical names or numeric literals.",
        },
      },
      required: ["entity", "metric"],
    },
  },
  {
    name: "get_record_by_id",
    description:
      "Get a single ImportRecord by its id with the full data blob. Use after query_records when you have the record id and need the complete fields.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "ImportRecord.id" },
      },
      required: ["id"],
    },
  },
  {
    name: "query_custom_field",
    description:
      "Query records by a field stored in the JSONB data that isn't one of the canonical dataset fields. Use this for user-specific columns surfaced in the Custom Fields section of the context.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description: `Dataset name: ${DATASET_LIST}.`,
        },
        fieldKey: {
          type: "string",
          description: "Exact JSONB key as stored in the data blob (snake_case).",
        },
        operator: {
          type: "string",
          enum: ["eq", "lt", "lte", "gt", "gte", "contains", "exists"],
          description: "Comparison operator. 'exists' returns every record that has this field set.",
        },
        value: {
          type: "string",
          description: "Comparison value. Numeric ops cast to numeric automatically.",
        },
        limit: {
          type: "number",
          description: "Max records to return (default 50, max 500).",
        },
      },
      required: ["entity", "fieldKey", "operator"],
    },
  },
];

// ─── Tool execution ────────────────────────────────────────────────────────

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string,
): Promise<unknown> {
  switch (toolName) {
    case "query_records":
      return executeQueryRecords(input, orgId);
    case "aggregate_records":
      return executeAggregateRecords(input, orgId);
    case "get_record_by_id":
    // Legacy alias — earlier releases shipped the tool as get_entity_by_id.
    case "get_entity_by_id":
      return executeGetRecordById(input, orgId);
    case "query_custom_field":
      return executeQueryCustomField(input, orgId);
    case "get_traceability":
      return {
        error:
          "get_traceability is not available on the JSONB store — trace queries need relational lot / serial data.",
      };
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ─── query_records ─────────────────────────────────────────────────────────

async function executeQueryRecords(
  input: Record<string, unknown>,
  orgId: string,
): Promise<unknown> {
  try {
    const dataset = resolveDataset(input.entity);
    const filters = (input.filters ?? {}) as Record<string, unknown>;
    const search = typeof input.search === "string" ? input.search : undefined;
    const searchFields = Array.isArray(input.searchFields)
      ? (input.searchFields as string[])
      : undefined;
    const orderByRaw = input.orderBy as
      | { field?: string; direction?: "asc" | "desc" }
      | string
      | undefined;
    const orderBy = (() => {
      if (!orderByRaw) return undefined;
      // Accept the legacy "-createdAt" shorthand as a soft fallback.
      if (typeof orderByRaw === "string") {
        const desc = orderByRaw.startsWith("-");
        return { field: desc ? orderByRaw.slice(1) : orderByRaw, direction: desc ? "desc" : "asc" } as const;
      }
      if (orderByRaw.field) {
        return {
          field: orderByRaw.field,
          direction: orderByRaw.direction === "asc" ? "asc" : "desc",
        } as const;
      }
      return undefined;
    })();
    const limit = typeof input.limit === "number" ? input.limit : undefined;
    const offset = typeof input.offset === "number" ? input.offset : undefined;

    const result = await queryRecords({
      dataset,
      orgId,
      filters,
      search,
      searchFields,
      orderBy,
      limit,
      offset,
    });

    return {
      rows: result.rows,
      totalCount: result.total,
      returnedCount: result.returnedCount,
      dataset,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── aggregate_records ─────────────────────────────────────────────────────

async function executeAggregateRecords(
  input: Record<string, unknown>,
  orgId: string,
): Promise<unknown> {
  try {
    const dataset = resolveDataset(input.entity);
    const metric = String(input.metric ?? "").toUpperCase() as "COUNT" | "SUM" | "AVG";
    if (!["COUNT", "SUM", "AVG"].includes(metric)) {
      return { error: `Invalid metric "${metric}". Use COUNT, SUM, or AVG.` };
    }
    const result = await aggregateRecords({
      dataset,
      orgId,
      metric,
      valueField: typeof input.valueField === "string" ? input.valueField : undefined,
      groupByField:
        typeof input.groupByField === "string" ? input.groupByField : undefined,
      filters: (input.filters ?? {}) as Record<string, unknown>,
      rawWhere: typeof input.rawWhere === "string" ? input.rawWhere : undefined,
    });
    return { ...result, dataset, metric };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── get_record_by_id ──────────────────────────────────────────────────────

async function executeGetRecordById(
  input: Record<string, unknown>,
  orgId: string,
): Promise<unknown> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { error: "id is required" };

  const record = await prisma.importRecord.findFirst({
    where: { id, organizationId: orgId },
    select: {
      id: true,
      datasetName: true,
      externalId: true,
      data: true,
      importedAt: true,
    },
  });
  if (!record) return { error: "Record not found" };
  return record;
}

// ─── query_custom_field ────────────────────────────────────────────────────

const FIELD_KEY_REGEX = /^[a-z0-9_]+$/;

async function executeQueryCustomField(
  input: Record<string, unknown>,
  orgId: string,
): Promise<unknown> {
  try {
    const dataset = resolveDataset(input.entity);
    const fieldKey = String(input.fieldKey ?? "");
    const operator = String(input.operator ?? "eq").toLowerCase();
    const value = input.value !== undefined ? String(input.value) : "";
    const limit = Math.min(
      typeof input.limit === "number" ? input.limit : 50,
      500,
    );

    if (!FIELD_KEY_REGEX.test(fieldKey)) {
      return { error: `Invalid fieldKey "${fieldKey}" — must be snake_case.` };
    }

    // Translate to the generic queryRecords filter shape. Numeric ops
    // coerce to numbers so comparisons cast correctly inside the query
    // engine. 'exists' maps to a NOT-NULL check via `not: null`
    // semantics — we fall back to a raw NOT-NULL search.
    let filters: Record<string, unknown> = {};
    let rawExists = false;

    switch (operator) {
      case "eq":
        filters = { [fieldKey]: value };
        break;
      case "contains":
        filters = { [fieldKey]: { contains: value } };
        break;
      case "lt":
        filters = { [fieldKey]: { lt: Number(value) } };
        break;
      case "lte":
        filters = { [fieldKey]: { lte: Number(value) } };
        break;
      case "gt":
        filters = { [fieldKey]: { gt: Number(value) } };
        break;
      case "gte":
        filters = { [fieldKey]: { gte: Number(value) } };
        break;
      case "exists":
        rawExists = true;
        break;
      default:
        return { error: `Unknown operator "${operator}"` };
    }

    // Custom fields aren't in the DATASETS vocabulary, so bypass the
    // validated path and use a direct raw query scoped by org+dataset.
    const { Prisma } = await import("@prisma/client");
    const orgClause = Prisma.sql`"organizationId" = ${orgId} AND "datasetName" = ${dataset}`;

    let condition: import("@prisma/client").Prisma.Sql;
    if (rawExists) {
      condition = Prisma.sql`"data" ? ${fieldKey}`;
    } else if (operator === "contains") {
      condition = Prisma.sql`"data"->>${fieldKey} ILIKE ${`%${value}%`}`;
    } else if (operator === "eq") {
      condition = Prisma.sql`"data"->>${fieldKey} = ${value}`;
    } else {
      const opSql = ({
        lt: Prisma.sql`<`,
        lte: Prisma.sql`<=`,
        gt: Prisma.sql`>`,
        gte: Prisma.sql`>=`,
      } as const)[operator as "lt" | "lte" | "gt" | "gte"];
      condition = Prisma.sql`("data"->>${fieldKey})::numeric ${opSql} ${Number(value)}`;
    }

    // Pass filters through even though we've built the condition
    // directly; filters stays in scope to allow future compound
    // (custom field + canonical field) support.
    void filters;

    const rows = await prisma.$queryRaw<Array<{ data: import("@prisma/client").Prisma.JsonValue }>>(
      Prisma.sql`
        SELECT "data"
        FROM "ImportRecord"
        WHERE ${orgClause} AND ${condition}
        ORDER BY "importedAt" DESC
        LIMIT ${limit}
      `,
    );

    return {
      rows: rows.map((r) => r.data),
      returnedCount: rows.length,
      dataset,
      fieldKey,
      operator,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
