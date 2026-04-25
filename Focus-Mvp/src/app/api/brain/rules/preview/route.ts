export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { queryRecords, aggregateRecords } from "@/lib/chat/record-query";
import type { DatasetName } from "@/lib/ingestion/datasets";

/**
 * POST /api/brain/rules/preview
 * Live data preview — shows match count and sample records for a rule condition.
 * Reads from ImportRecord (the canonical JSONB store) instead of old entity tables.
 */

// Map old entity names (from stored rules) + new canonical names to dataset keys.
const ENTITY_TO_DATASET: Record<string, DatasetName> = {
  // New canonical names
  inventory:       "inventory",
  products:        "products",
  suppliers:       "suppliers",
  purchase_orders: "purchase_orders",
  sales_orders:    "sales_orders",
  // Legacy names from rules created before migration
  InventoryItem:   "inventory",
  Product:         "products",
  Supplier:        "suppliers",
  Order:           "purchase_orders",
};

// Normalise camelCase field names from old rules to snake_case canonical names.
function normaliseField(field: string): string {
  const ALIASES: Record<string, string> = {
    reorderPoint:         "reorder_point",
    reorderQty:           "recommended_qty",
    reservedQty:          "reserved_qty",
    safetyStock:          "safety_stock",
    daysOfSupply:         "days_of_supply",
    leadTimeDays:         "lead_time_days",
    unitCost:             "unit_cost",
    totalValue:           "total_value",
    onHoldQty:            "on_hold_qty",
    openPOQty:            "open_po_qty",
    demandPerDay:         "demand_per_day",
    buyRecommendation:    "buy_recommendation",
    recommendedQty:       "recommended_qty",
    lastReceiptDate:      "last_receipt_date",
    orderMultiple:        "order_multiple",
    // products
    listPrice:            "list_price",
    makeBuy:              "make_buy",
    productFamily:        "product_family",
    abcClass:             "abc_class",
    // suppliers
    supplierCode:         "supplier_code",
    qualityRating:        "quality_rating",
    onTimePct:            "on_time_pct",
    paymentTerms:         "payment_terms",
    approvedSince:        "approved_since",
    // purchase_orders
    poNumber:             "po_number",
    supplierName:         "supplier_name",
    itemName:             "item_name",
    lineNumber:           "line_number",
    qtyOrdered:           "qty_ordered",
    qtyReceived:          "qty_received",
    qtyOpen:              "qty_open",
    lineValue:            "line_value",
    orderDate:            "order_date",
    expectedDate:         "expected_date",
    confirmedEta:         "confirmed_eta",
    totalAmount:          "line_value",  // legacy alias
  };
  if (ALIASES[field]) return ALIASES[field];
  // camelCase → snake_case fallback
  return field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { entity, condition } = body;

  if (!entity || !condition?.field || !condition?.operator) {
    return badRequest("entity and condition (field, operator, value) required");
  }

  const orgId = ctx.org.id;
  const dataset = ENTITY_TO_DATASET[entity];
  if (!dataset) return badRequest(`Unsupported entity: ${entity}`);

  const rawField = condition.field as string;
  const operator = condition.operator as string;
  const rawValue = condition.value;

  const field = normaliseField(rawField);

  // Build a filter map the record-query engine understands
  const OP_MAP: Record<string, string> = {
    lt: "lt", lte: "lte", gt: "gt", gte: "gte", eq: "eq", neq: "not",
  };
  const mappedOp = OP_MAP[operator];
  if (!mappedOp) return badRequest(`Unsupported operator: ${operator}`);

  // Coerce value — numeric where possible
  const coerced =
    rawValue === "" || rawValue === null || rawValue === undefined
      ? 0
      : isNaN(Number(rawValue))
      ? rawValue
      : Number(rawValue);

  const filterValue =
    mappedOp === "eq"
      ? coerced
      : { [mappedOp]: coerced };

  const matchFilters: Record<string, unknown> = { [field]: filterValue };

  try {
    const [matchResult, totalResult] = await Promise.all([
      // Count matching rows by fetching with filter
      aggregateRecords({ dataset, orgId, metric: "COUNT", filters: matchFilters }).catch(() => ({ result: 0 })),
      // Total rows in this dataset
      aggregateRecords({ dataset, orgId, metric: "COUNT" }).catch(() => ({ result: 0 })),
    ]);

    // Fetch sample rows that match the filter
    const { rows: samples } = await queryRecords({
      dataset,
      orgId,
      filters: matchFilters,
      limit: 5,
    }).catch(() => ({ rows: [] }));

    return NextResponse.json({
      matchCount: Number(matchResult.result ?? 0),
      totalCount: Number(totalResult.result ?? 0),
      samples,
    });
  } catch (err) {
    console.error("[preview] Query error:", err);
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
