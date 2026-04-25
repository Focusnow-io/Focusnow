export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { queryRecords } from "@/lib/chat/record-query";

function n(v: unknown): number { return isFinite(Number(v)) ? Number(v) : 0; }
function maybeN(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
}
function bool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").toLowerCase();
  return ["true", "yes", "y", "1", "x"].includes(s);
}

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;

  const [{ rows: invRows }, { rows: productRows }] = await Promise.all([
    queryRecords({ dataset: "inventory", orgId, limit: 10000 }),
    queryRecords({ dataset: "products",  orgId, limit: 10000 }),
  ]);

  // Build SKU → product map for name / type / abc_class
  const productMap = new Map<string, Record<string, unknown>>();
  for (const p of productRows) {
    if (p.sku) productMap.set(String(p.sku), p);
  }

  let totalValue = 0;
  let daysOfSupplySum = 0;
  let daysOfSupplyCount = 0;
  let reorderCount = 0;
  let buyRecCount = 0;
  let belowSafetyStock = 0;
  const abcCounts: Record<string, number> = {};
  const abcValues: Record<string, number> = {};
  const locationCodes = new Set<string>();

  const items = invRows.map((row, idx) => {
    const sku = String(row.sku ?? "");
    const qty = n(row.quantity);
    const reorder = maybeN(row.reorder_point);
    const safety = maybeN(row.safety_stock);
    const dos = maybeN(row.days_of_supply);
    const unitCost = maybeN(row.unit_cost);
    const totalVal = maybeN(row.total_value) ?? (unitCost ? unitCost * qty : 0);
    const buyRec = bool(row.buy_recommendation);
    const recommendedQty = maybeN(row.recommended_qty);

    const product = productMap.get(sku);
    const abcClass =
      (row.abc_class ? String(row.abc_class) : null) ??
      (product?.abc_class ? String(product.abc_class) : null) ??
      "Unclassified";

    totalValue += totalVal;
    if (dos !== null && dos > 0) { daysOfSupplySum += dos; daysOfSupplyCount++; }
    if (buyRec) buyRecCount++;
    if (safety !== null && qty < safety) belowSafetyStock++;
    abcCounts[abcClass] = (abcCounts[abcClass] ?? 0) + 1;
    abcValues[abcClass] = (abcValues[abcClass] ?? 0) + totalVal;

    const locCode = row.location_code ? String(row.location_code) : null;
    if (locCode) locationCodes.add(locCode);

    let alertLevel: "ok" | "low" | "critical" = "ok";
    if (reorder !== null) {
      if (qty === 0) alertLevel = "critical";
      else if (qty <= reorder) alertLevel = "low";
      else if (qty <= reorder * 1.2) alertLevel = "low";
    } else if (qty === 0) {
      alertLevel = "critical";
    }
    if (reorder !== null && qty <= reorder) reorderCount++;

    return {
      id: String(sku || idx),
      quantity: qty,
      reorderPoint: reorder,
      daysOfSupply: dos,
      value: Math.round(totalVal * 100) / 100,
      alertLevel,
      safetyStock: safety,
      buyRecommendation: buyRec,
      recommendedQty,
      demandCurrentMonth: null as number | null,
      demandNextMonth: null as number | null,
      demandMonth3: null as number | null,
      outflow7d: null as number | null,
      outflow30d: null as number | null,
      outflow60d: null as number | null,
      outflow92d: null as number | null,
      product: {
        sku,
        name: product ? String(product.name ?? sku) : sku,
        category: product ? (product.type ? String(product.type) : null) : null,
        abcClass: abcClass !== "Unclassified" ? abcClass : null,
      },
      location: locCode ? { name: locCode, code: locCode } : null,
    };
  });

  const sortOrder = { critical: 0, low: 1, ok: 2 };
  items.sort((a, b) => sortOrder[a.alertLevel] - sortOrder[b.alertLevel]);

  const counts = {
    critical: items.filter((i) => i.alertLevel === "critical").length,
    low: items.filter((i) => i.alertLevel === "low").length,
    ok: items.filter((i) => i.alertLevel === "ok").length,
  };

  const categoryMap = new Map<string, number>();
  for (const item of items) {
    const cat = item.product.category || "Uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + item.value);
  }
  const categoryBreakdown = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([category, value]) => ({ category, value: Math.round(value) }));

  const abcBreakdown = Object.entries(abcCounts)
    .map(([cls, count]) => ({
      class: cls, count,
      value: Math.round(abcValues[cls] ?? 0),
    }))
    .sort((a, b) => {
      const order: Record<string, number> = { A: 0, B: 1, C: 2 };
      return (order[a.class] ?? 99) - (order[b.class] ?? 99);
    });

  return NextResponse.json({
    items,
    kpis: {
      totalValue: Math.round(totalValue),
      atRisk: counts.critical + counts.low,
      avgDaysOfSupply: daysOfSupplyCount > 0 ? Math.round(daysOfSupplySum / daysOfSupplyCount) : null,
      needReorder: reorderCount,
      totalSKUs: items.length,
      locationCount: locationCodes.size,
      inventoryTurns: null,
      buyRecommendations: buyRecCount,
      belowSafetyStock,
    },
    counts,
    categoryBreakdown,
    abcBreakdown,
    velocityBuckets: { fast: 0, medium: 0, slow: 0, dead: 0 },
  });
}
