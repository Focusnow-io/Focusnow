export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { aggregateRecords } from "@/lib/chat/record-query";

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;

  const [
    products, inventory, suppliers, purchaseOrders, salesOrders,
    customers, locations, boms,
  ] = await Promise.all([
    aggregateRecords({ dataset: "products",        orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "inventory",       orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "suppliers",       orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "purchase_orders", orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "sales_orders",    orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "customers",       orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "locations",       orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
    aggregateRecords({ dataset: "bom",             orgId, metric: "COUNT" }).then((r) => Number(r.result ?? 0)).catch(() => 0),
  ]);

  return NextResponse.json({
    products,
    inventory,
    suppliers,
    purchaseOrders,
    salesOrders,
    workOrders: 0,
    lots: 0,
    customers,
    locations,
    boms,
    forecasts: 0,
    stockOuts: 0,
    overduePOs: 0,
  });
}
