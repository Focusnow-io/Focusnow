import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const inventory = await prisma.inventoryItem.findMany({
    where: { organizationId: ctx.org.id },
    include: { product: true, location: true },
    orderBy: { quantity: "asc" },
  });

  // Compute alert levels and aggregates
  let totalValue = 0;
  let daysOfSupplySum = 0;
  let daysOfSupplyCount = 0;
  let reorderCount = 0;
  let buyRecCount = 0;
  let belowSafetyStock = 0;
  let totalOutflow30d = 0;
  let outflowItemCount = 0;

  // ABC classification counts
  const abcCounts: Record<string, number> = {};
  const abcValues: Record<string, number> = {};

  const items = inventory.map((item) => {
    const qty = Number(item.quantity);
    const reorder = item.reorderPoint ? Number(item.reorderPoint) : null;
    const value = item.totalValue ? Number(item.totalValue) : (item.unitCost ? Number(item.unitCost) * qty : 0);
    const dos = item.daysOfSupply ? Number(item.daysOfSupply) : null;
    const safetyStock = item.product.safetyStock ? Number(item.product.safetyStock) : null;
    const o7d = item.outflow7d ?? null;
    const o30d = item.outflow30d ?? null;
    const o60d = item.outflow60d ?? null;
    const o92d = item.outflow92d ?? null;

    totalValue += value;
    if (dos !== null && dos > 0) {
      daysOfSupplySum += dos;
      daysOfSupplyCount++;
    }

    // Outflow tracking for inventory turns
    if (o30d !== null && o30d > 0) {
      totalOutflow30d += o30d;
      outflowItemCount++;
    }

    // ABC classification
    const abc = item.product.abcClass ?? "Unclassified";
    abcCounts[abc] = (abcCounts[abc] ?? 0) + 1;
    abcValues[abc] = (abcValues[abc] ?? 0) + value;

    // Buy recommendations
    if (item.buyRecommendation === true) buyRecCount++;

    // Safety stock check
    if (safetyStock !== null && qty < safetyStock) belowSafetyStock++;

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
      id: item.id,
      quantity: qty,
      reorderPoint: reorder,
      daysOfSupply: dos,
      value,
      alertLevel,
      safetyStock,
      buyRecommendation: item.buyRecommendation ?? false,
      recommendedQty: item.recommendedQty ? Number(item.recommendedQty) : null,
      demandCurrentMonth: item.demandCurrentMonth ? Number(item.demandCurrentMonth) : null,
      demandNextMonth: item.demandNextMonth ? Number(item.demandNextMonth) : null,
      demandMonth3: item.demandMonth3 ? Number(item.demandMonth3) : null,
      outflow7d: o7d,
      outflow30d: o30d,
      outflow60d: o60d,
      outflow92d: o92d,
      product: {
        sku: item.product.sku,
        name: item.product.name,
        category: item.product.category,
        abcClass: item.product.abcClass,
      },
      location: item.location ? { name: item.location.name, code: item.location.code } : null,
    };
  });

  // Counts
  const counts = {
    critical: items.filter((i) => i.alertLevel === "critical").length,
    low: items.filter((i) => i.alertLevel === "low").length,
    ok: items.filter((i) => i.alertLevel === "ok").length,
  };

  // Category breakdown (top 10 by value)
  const categoryMap = new Map<string, number>();
  for (const item of items) {
    const cat = item.product.category || "Uncategorized";
    categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + item.value);
  }
  const categoryBreakdown = [...categoryMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([category, value]) => ({ category, value: Math.round(value) }));

  // ABC breakdown
  const abcBreakdown = Object.entries(abcCounts)
    .map(([cls, count]) => ({
      class: cls,
      count,
      value: Math.round(abcValues[cls] ?? 0),
    }))
    .sort((a, b) => {
      // Sort A, B, C first, then Unclassified last
      const order: Record<string, number> = { A: 0, B: 1, C: 2 };
      return (order[a.class] ?? 99) - (order[b.class] ?? 99);
    });

  // Velocity distribution based on outflow data
  const velocityBuckets = { fast: 0, medium: 0, slow: 0, dead: 0 };
  for (const item of items) {
    if (item.outflow30d !== null) {
      if (item.outflow30d >= 100) velocityBuckets.fast++;
      else if (item.outflow30d >= 20) velocityBuckets.medium++;
      else if (item.outflow30d > 0) velocityBuckets.slow++;
      else velocityBuckets.dead++;
    }
  }

  // Inventory turns estimate: annualized COGS / avg inventory value
  // Using outflow30d as proxy for monthly COGS
  const estimatedAnnualOutflowValue = totalOutflow30d > 0 && outflowItemCount > 0
    ? (totalOutflow30d * 12) // rough annualized units — needs unit cost for true turns
    : null;
  const inventoryTurns = totalValue > 0 && estimatedAnnualOutflowValue !== null
    ? Math.round((estimatedAnnualOutflowValue / totalValue) * 10) / 10
    : null;

  // Sort items: critical first, then low, then ok
  const sortOrder = { critical: 0, low: 1, ok: 2 };
  items.sort((a, b) => sortOrder[a.alertLevel] - sortOrder[b.alertLevel]);

  return NextResponse.json({
    items,
    kpis: {
      totalValue: Math.round(totalValue),
      atRisk: counts.critical + counts.low,
      avgDaysOfSupply: daysOfSupplyCount > 0 ? Math.round(daysOfSupplySum / daysOfSupplyCount) : null,
      needReorder: reorderCount,
      totalSKUs: items.length,
      inventoryTurns,
      buyRecommendations: buyRecCount,
      belowSafetyStock,
    },
    counts,
    categoryBreakdown,
    abcBreakdown,
    velocityBuckets,
  });
}
