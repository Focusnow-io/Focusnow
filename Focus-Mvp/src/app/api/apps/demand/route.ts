import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  // Fetch sales orders
  const salesOrders = await prisma.salesOrder.findMany({
    where: { orgId: ctx.org.id },
    include: { customer: true, lines: true },
    orderBy: { createdAt: "desc" },
  });

  // Fetch work orders
  const workOrders = await prisma.workOrder.findMany({
    where: { organizationId: ctx.org.id },
    include: { product: true },
    orderBy: { createdAt: "desc" },
  });

  // Fetch inventory for at-risk SKUs (include product for safety stock)
  const inventory = await prisma.inventoryItem.findMany({
    where: { organizationId: ctx.org.id },
    include: { product: true },
  });

  const now = new Date();
  const openSOStatuses = ["DRAFT", "CONFIRMED", "IN_PRODUCTION", "SHIPPED"];

  // KPIs
  const openSOs = salesOrders.filter((so) => openSOStatuses.includes(so.status));
  const openSOValue = openSOs.reduce((sum, so) => sum + Number(so.totalAmount ?? 0), 0);

  const completedWOs = workOrders.filter((wo) => wo.status === "COMPLETED" || wo.status === "CLOSED");
  const productionRate = workOrders.length > 0
    ? Math.round((completedWOs.length / workOrders.length) * 100)
    : null;

  // Fill rate: SO lines fully shipped vs total lines
  let totalSOLines = 0;
  let fullyShippedLines = 0;
  for (const so of salesOrders) {
    for (const line of so.lines) {
      totalSOLines++;
      const ordered = Number(line.qtyOrdered);
      const shipped = Number(line.qtyShipped);
      if (ordered > 0 && shipped >= ordered) fullyShippedLines++;
    }
  }
  const fillRate = totalSOLines > 0 ? Math.round((fullyShippedLines / totalSOLines) * 100) : null;

  // On-time delivery for SOs
  const deliveredSOs = salesOrders.filter((so) => so.status === "DELIVERED");
  let onTimeSOs = 0;
  for (const so of deliveredSOs) {
    const requested = so.requestedDate;
    const actual = so.actualShipDate ?? so.updatedAt;
    if (requested && actual && new Date(actual) <= new Date(requested)) {
      onTimeSOs++;
    }
  }
  const onTimeDeliveryRate = deliveredSOs.length > 0
    ? Math.round((onTimeSOs / deliveredSOs.length) * 100)
    : null;

  // At-risk SKUs: low days of supply or demand exceeds stock
  const atRiskSKUs = inventory.filter((item) => {
    const dos = item.daysOfSupply ? Number(item.daysOfSupply) : null;
    const qty = Number(item.quantity);
    const demand = item.demandCurrentMonth ? Number(item.demandCurrentMonth) : 0;
    return (dos !== null && dos <= 14 && dos >= 0) || (demand > 0 && qty < demand);
  });

  // SO pipeline counts
  const soPipeline = {
    DRAFT: salesOrders.filter((so) => so.status === "DRAFT").length,
    CONFIRMED: salesOrders.filter((so) => so.status === "CONFIRMED").length,
    IN_PRODUCTION: salesOrders.filter((so) => so.status === "IN_PRODUCTION").length,
    SHIPPED: salesOrders.filter((so) => so.status === "SHIPPED").length,
    DELIVERED: salesOrders.filter((so) => so.status === "DELIVERED").length,
    CANCELLED: salesOrders.filter((so) => so.status === "CANCELLED").length,
  };

  // Open SO table
  const openOrdersList = openSOs.map((so) => {
    const totalOrdered = so.lines.reduce((s, l) => s + Number(l.qtyOrdered), 0);
    const totalShipped = so.lines.reduce((s, l) => s + Number(l.qtyShipped), 0);
    const fulfillmentPct = totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100) : 0;

    return {
      id: so.id,
      soNumber: so.soNumber,
      customer: so.customer.name,
      status: so.status,
      orderDate: so.orderDate ?? so.createdAt,
      requestedDate: so.requestedDate,
      totalAmount: Number(so.totalAmount ?? 0),
      lineCount: so.lines.length,
      fulfillmentPct,
    };
  }).sort((a, b) => {
    if (a.requestedDate && b.requestedDate) return new Date(a.requestedDate).getTime() - new Date(b.requestedDate).getTime();
    return 0;
  });

  // Work orders table
  const woList = workOrders
    .filter((wo) => wo.status !== "COMPLETED" && wo.status !== "CLOSED" && wo.status !== "CANCELLED")
    .map((wo) => {
      const planned = Number(wo.plannedQty ?? 0);
      const produced = Number(wo.actualQty ?? 0);
      const progressPct = planned > 0 ? Math.round((produced / planned) * 100) : 0;
      const dueDate = wo.dueDate ?? wo.scheduledEnd;
      const isOverdue = dueDate ? new Date(dueDate) < now : false;

      return {
        id: wo.id,
        woNumber: wo.woNumber ?? wo.orderNumber,
        sku: wo.sku,
        productName: wo.product?.name ?? wo.sku,
        status: wo.status,
        plannedQty: planned,
        producedQty: produced,
        progressPct,
        scheduledDate: wo.scheduledDate,
        dueDate,
        isOverdue,
      };
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      return 0;
    });

  // Enhanced at-risk SKU table with safety stock gap and buy signals
  const atRiskList = atRiskSKUs.map((item) => {
    const qty = Number(item.quantity);
    const dos = item.daysOfSupply ? Number(item.daysOfSupply) : null;
    const demandCurrent = item.demandCurrentMonth ? Number(item.demandCurrentMonth) : null;
    const demandNext = item.demandNextMonth ? Number(item.demandNextMonth) : null;
    const demandMonth3 = item.demandMonth3 ? Number(item.demandMonth3) : null;
    const openPO = Number(item.qtyOpenPO || 0);
    const totalDemand = (demandCurrent ?? 0) + (demandNext ?? 0);
    const totalSupply = qty + openPO;
    const coverageStatus: "covered" | "partial" | "short" =
      totalDemand === 0 ? "covered" : totalSupply >= totalDemand ? "covered" : totalSupply >= totalDemand * 0.5 ? "partial" : "short";

    // Safety stock gap
    const safetyStock = item.product.safetyStock ? Number(item.product.safetyStock) : null;
    const safetyStockGap = safetyStock !== null ? qty - safetyStock : null;

    return {
      id: item.id,
      sku: item.product.sku,
      productName: item.product.name,
      qtyOnHand: qty,
      daysOfSupply: dos,
      demandCurrentMonth: demandCurrent,
      demandNextMonth: demandNext,
      demandMonth3,
      openPOQty: openPO,
      coverageStatus,
      safetyStock,
      safetyStockGap,
      buyRecommendation: item.buyRecommendation ?? false,
      recommendedQty: item.recommendedQty ? Number(item.recommendedQty) : null,
    };
  }).sort((a, b) => {
    const order = { short: 0, partial: 1, covered: 2 };
    return order[a.coverageStatus] - order[b.coverageStatus];
  });

  // Demand coverage horizon: how many months of demand can current stock cover
  const coverageHorizon = inventory.map((item) => {
    const qty = Number(item.quantity) + Number(item.qtyOpenPO || 0);
    const m1 = item.demandCurrentMonth ? Number(item.demandCurrentMonth) : 0;
    const m2 = item.demandNextMonth ? Number(item.demandNextMonth) : 0;
    const m3 = item.demandMonth3 ? Number(item.demandMonth3) : 0;

    let covered = 0;
    let remaining = qty;
    if (m1 > 0 && remaining >= m1) { covered++; remaining -= m1; } else if (m1 > 0) { covered += remaining / m1; return { months: Math.round(covered * 10) / 10 }; }
    if (m2 > 0 && remaining >= m2) { covered++; remaining -= m2; } else if (m2 > 0) { covered += remaining / m2; return { months: Math.round(covered * 10) / 10 }; }
    if (m3 > 0 && remaining >= m3) { covered++; remaining -= m3; } else if (m3 > 0) { covered += remaining / m3; return { months: Math.round(covered * 10) / 10 }; }

    return { months: covered > 0 ? Math.round(covered * 10) / 10 : null };
  }).filter((c) => c.months !== null);

  // Distribution of coverage months
  const coverageDist = { under1: 0, "1to2": 0, "2to3": 0, over3: 0 };
  for (const c of coverageHorizon) {
    if (c.months! < 1) coverageDist.under1++;
    else if (c.months! < 2) coverageDist["1to2"]++;
    else if (c.months! <= 3) coverageDist["2to3"]++;
    else coverageDist.over3++;
  }

  return NextResponse.json({
    kpis: {
      openSOCount: openSOs.length,
      openSOValue: Math.round(openSOValue),
      productionRate,
      projectedStockouts: atRiskSKUs.length,
      totalSOs: salesOrders.length,
      totalWOs: workOrders.length,
      fillRate,
      onTimeDeliveryRate,
    },
    soPipeline,
    openOrders: openOrdersList,
    workOrders: woList,
    atRiskSKUs: atRiskList,
    coverageDistribution: coverageDist,
  });
}
