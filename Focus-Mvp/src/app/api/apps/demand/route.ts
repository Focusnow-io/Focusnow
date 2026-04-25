export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { queryRecords } from "@/lib/chat/record-query";

function n(v: unknown): number { return isFinite(Number(v)) ? Number(v) : 0; }
function maybeN(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v); return isFinite(x) ? x : null;
}

/** Map raw CSV SO status values to normalized internal status. */
function normalizeSOStatus(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "new" || s === "draft") return "CONFIRMED";
  if (s === "in_production" || s === "in production" || s === "production") return "IN_PRODUCTION";
  if (s === "shipped" || s === "dispatched") return "SHIPPED";
  if (s === "delivered" || s === "complete" || s === "completed" || s === "closed") return "DELIVERED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "confirmed") return "CONFIRMED";
  return String(raw ?? "").toUpperCase();
}

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;
  const now = new Date();

  const [{ rows: soRows }, { rows: invRows }] = await Promise.all([
    queryRecords({ dataset: "sales_orders", orgId, limit: 10000 }),
    queryRecords({ dataset: "inventory",    orgId, limit: 10000 }),
  ]);

  // Group SO lines by so_number
  interface SOGroup {
    so_number: string;
    customer_code: string;
    customer_name: string;
    status: string;
    order_date: string | null;
    requested_date: string | null;
    totalValue: number;
    totalOrdered: number;
    totalShipped: number;
    lineCount: number;
  }
  const soGroups = new Map<string, SOGroup>();
  for (const row of soRows) {
    const soNum = String(row.so_number ?? "UNKNOWN");
    const existing = soGroups.get(soNum);
    const lineVal = n(row.line_value);
    const qtyOrdered = n(row.qty_ordered);
    const qtyShipped = n(row.qty_shipped);
    if (existing) {
      existing.totalValue   += lineVal;
      existing.totalOrdered += qtyOrdered;
      existing.totalShipped += qtyShipped;
      existing.lineCount++;
    } else {
      soGroups.set(soNum, {
        so_number:      soNum,
        customer_code:  String(row.customer_code ?? ""),
        customer_name:  String(row.customer_name ?? row.customer_code ?? ""),
        status:         normalizeSOStatus(row.status),
        order_date:     row.order_date ? String(row.order_date) : null,
        requested_date: row.requested_date ? String(row.requested_date) : null,
        totalValue:     lineVal,
        totalOrdered:   qtyOrdered,
        totalShipped:   qtyShipped,
        lineCount:      1,
      });
    }
  }

  const allSOs = [...soGroups.values()];
  const openSOStatuses = new Set(["DRAFT", "CONFIRMED", "IN_PRODUCTION", "SHIPPED"]);
  const openSOs = allSOs.filter((so) => openSOStatuses.has(so.status));
  const openSOValue = openSOs.reduce((s, so) => s + so.totalValue, 0);

  // Fill rate (shipped / ordered across all SOs)
  const totalOrdered = allSOs.reduce((s, so) => s + so.totalOrdered, 0);
  const totalShipped = allSOs.reduce((s, so) => s + so.totalShipped, 0);
  const fillRate = totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100) : null;

  // SO pipeline counts
  const soPipeline = {
    DRAFT:         allSOs.filter((s) => s.status === "DRAFT").length,
    CONFIRMED:     allSOs.filter((s) => s.status === "CONFIRMED").length,
    IN_PRODUCTION: allSOs.filter((s) => s.status === "IN_PRODUCTION").length,
    SHIPPED:       allSOs.filter((s) => s.status === "SHIPPED").length,
    DELIVERED:     allSOs.filter((s) => s.status === "DELIVERED").length,
    CANCELLED:     allSOs.filter((s) => s.status === "CANCELLED").length,
  };

  // Open SO table
  const openOrders = openSOs.map((so, idx) => {
    const fulfillmentPct = so.totalOrdered > 0
      ? Math.round((so.totalShipped / so.totalOrdered) * 100)
      : 0;
    return {
      id: String(idx),
      soNumber:      so.so_number,
      customer:      so.customer_name,
      status:        so.status,
      orderDate:     so.order_date,
      requestedDate: so.requested_date,
      totalAmount:   Math.round(so.totalValue * 100) / 100,
      lineCount:     so.lineCount,
      fulfillmentPct,
    };
  }).sort((a, b) => {
    if (a.requestedDate && b.requestedDate) {
      return new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime();
    }
    return 0;
  });

  // At-risk SKUs from inventory (days_of_supply ≤ 14 or qty = 0)
  const atRiskInv = invRows.filter((row) => {
    const dos = maybeN(row.days_of_supply);
    const qty = n(row.quantity);
    return (dos !== null && dos <= 14 && dos >= 0) || qty === 0;
  });

  const atRiskSKUs = atRiskInv.map((row, idx) => {
    const sku      = String(row.sku ?? "");
    const qty      = n(row.quantity);
    const dos      = maybeN(row.days_of_supply);
    const openPOQty = n(row.open_po_qty);
    const safety   = maybeN(row.safety_stock);

    // Rough coverage: can current stock + open PO cover next 30 days?
    // We use demand_per_day * 30 as a proxy for monthly demand
    const demandPerDay = maybeN(row.demand_per_day);
    const monthlyDemand = demandPerDay !== null ? demandPerDay * 30 : null;
    const totalSupply = qty + openPOQty;
    const coverageStatus: "covered" | "partial" | "short" =
      monthlyDemand === null || monthlyDemand === 0
        ? (qty === 0 ? "short" : "covered")
        : totalSupply >= monthlyDemand ? "covered"
        : totalSupply >= monthlyDemand * 0.5 ? "partial"
        : "short";

    return {
      id: String(idx),
      sku,
      productName:         sku,
      qtyOnHand:           qty,
      daysOfSupply:        dos,
      demandCurrentMonth:  monthlyDemand !== null ? Math.round(monthlyDemand) : null,
      demandNextMonth:     null as number | null,
      demandMonth3:        null as number | null,
      openPOQty,
      coverageStatus,
      safetyStock:         safety,
      safetyStockGap:      safety !== null ? qty - safety : null,
      buyRecommendation:   row.buy_recommendation === true || String(row.buy_recommendation).toLowerCase() === "true",
      recommendedQty:      maybeN(row.recommended_qty),
    };
  }).sort((a, b) => {
    const order = { short: 0, partial: 1, covered: 2 };
    return order[a.coverageStatus] - order[b.coverageStatus];
  });

  // Coverage distribution across all inventory
  const coverageDist = { under1: 0, "1to2": 0, "2to3": 0, over3: 0 };
  for (const row of invRows) {
    const dos = maybeN(row.days_of_supply);
    if (dos === null) continue;
    const months = dos / 30;
    if (months < 1) coverageDist.under1++;
    else if (months < 2) coverageDist["1to2"]++;
    else if (months <= 3) coverageDist["2to3"]++;
    else coverageDist.over3++;
  }

  return NextResponse.json({
    kpis: {
      openSOCount:        openSOs.length,
      openSOValue:        Math.round(openSOValue),
      productionRate:     null,
      projectedStockouts: atRiskSKUs.filter((s) => s.coverageStatus === "short").length,
      totalSOs:           allSOs.length,
      totalWOs:           0,
      fillRate,
      onTimeDeliveryRate: null,
    },
    soPipeline,
    openOrders,
    workOrders: [],
    atRiskSKUs,
    coverageDistribution: coverageDist,
  });
}
