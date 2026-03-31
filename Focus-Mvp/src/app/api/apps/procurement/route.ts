import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  // Fetch POs
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { orgId: ctx.org.id },
    include: { supplier: true, lines: true },
    orderBy: { createdAt: "desc" },
  });

  // Fetch suppliers with orders for scorecard
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: ctx.org.id, active: true },
    include: {
      orders: {
        include: { lines: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });

  // Fetch SupplierItem for single-source risk analysis
  const supplierItems = await prisma.supplierItem.findMany({
    where: { orgId: ctx.org.id },
    select: { productId: true, supplierId: true },
  });

  const now = new Date();

  // KPIs
  const openStatuses = ["DRAFT", "SENT", "CONFIRMED", "PARTIAL"] as const;
  const openPOs = purchaseOrders.filter((po) => openStatuses.includes(po.status as typeof openStatuses[number]));
  const openPOValue = openPOs.reduce((sum, po) => sum + Number(po.totalAmount ?? 0), 0);

  const atRiskPOs = openPOs.filter((po) => {
    const expected = po.expectedDate ?? po.confirmedETA;
    return expected && new Date(expected) < now;
  });

  // Supplier scorecard with composite risk score
  const scorecard = suppliers.map((supplier) => {
    const orders = supplier.orders;
    const totalOrders = orders.length;
    const received = orders.filter((o) => o.status === "RECEIVED").length;

    // Use actual onTimePct from schema if available, else calculate
    const onTimeDelivery = supplier.onTimePct
      ? Number(supplier.onTimePct)
      : totalOrders > 0
      ? Math.round((received / totalOrders) * 100)
      : null;

    const totalSpend = orders.reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
    const qualityRating = supplier.qualityRating ? Number(supplier.qualityRating) : null;

    // Composite risk score (0-100, higher = riskier)
    let riskScore = 0;
    let riskFactors = 0;

    // On-time factor (0-40 points)
    if (onTimeDelivery !== null) {
      riskScore += Math.max(0, 40 - (onTimeDelivery * 0.4));
      riskFactors++;
    }

    // Quality factor (0-30 points, rating is 0-5)
    if (qualityRating !== null) {
      riskScore += Math.max(0, 30 - (qualityRating * 6));
      riskFactors++;
    }

    // Lead time factor (0-30 points)
    if (supplier.leadTimeDays !== null) {
      riskScore += Math.min(30, supplier.leadTimeDays * 0.5);
      riskFactors++;
    }

    const normalizedRisk = riskFactors > 0 ? Math.round(riskScore / riskFactors * (3 / riskFactors + 1)) : null;
    const riskLevel: "low" | "medium" | "high" | null =
      normalizedRisk === null ? null :
      normalizedRisk >= 60 ? "high" :
      normalizedRisk >= 30 ? "medium" : "low";

    return {
      id: supplier.id,
      code: supplier.code,
      name: supplier.name,
      country: supplier.country,
      leadTimeDays: supplier.leadTimeDays,
      leadTimeCategory: supplier.leadTimeCategory,
      totalOrders,
      onTimeDelivery,
      qualityRating,
      avgOrderValue,
      totalSpend,
      riskLevel,
      certifications: supplier.certifications,
    };
  });

  const avgOnTime = scorecard.filter((s) => s.onTimeDelivery !== null).length > 0
    ? Math.round(
        scorecard.filter((s) => s.onTimeDelivery !== null).reduce((s, p) => s + (p.onTimeDelivery ?? 0), 0) /
        scorecard.filter((s) => s.onTimeDelivery !== null).length
      )
    : null;

  // PO pipeline counts
  const pipeline = {
    DRAFT: purchaseOrders.filter((po) => po.status === "DRAFT").length,
    SENT: purchaseOrders.filter((po) => po.status === "SENT").length,
    CONFIRMED: purchaseOrders.filter((po) => po.status === "CONFIRMED").length,
    PARTIAL: purchaseOrders.filter((po) => po.status === "PARTIAL").length,
    RECEIVED: purchaseOrders.filter((po) => po.status === "RECEIVED").length,
    CANCELLED: purchaseOrders.filter((po) => po.status === "CANCELLED").length,
  };

  // Open orders for table
  const openOrders = openPOs.map((po) => {
    const expected = po.expectedDate ?? po.confirmedETA;
    const daysUntilDue = expected ? Math.ceil((new Date(expected).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

    return {
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier.name,
      status: po.status,
      orderDate: po.orderDate ?? po.createdAt,
      expectedDate: expected,
      totalAmount: Number(po.totalAmount ?? 0),
      lineCount: po.lines.length,
      daysUntilDue,
      isOverdue: daysUntilDue !== null && daysUntilDue < 0,
    };
  }).sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (a.expectedDate && b.expectedDate) return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime();
    return 0;
  });

  // Spend concentration (Pareto)
  const sortedBySpend = [...scorecard].sort((a, b) => b.totalSpend - a.totalSpend);
  const totalSpend = sortedBySpend.reduce((s, sup) => s + sup.totalSpend, 0);
  const spendConcentration = sortedBySpend.slice(0, 5).map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + "..." : s.name,
    spend: Math.round(s.totalSpend),
    pct: totalSpend > 0 ? Math.round((s.totalSpend / totalSpend) * 100) : 0,
  }));

  // Single-source risk: products with only 1 approved supplier
  const productSupplierMap = new Map<string, Set<string>>();
  for (const si of supplierItems) {
    if (!productSupplierMap.has(si.productId)) {
      productSupplierMap.set(si.productId, new Set());
    }
    productSupplierMap.get(si.productId)!.add(si.supplierId);
  }
  const singleSourceCount = [...productSupplierMap.values()].filter((s) => s.size === 1).length;
  const multiSourceCount = [...productSupplierMap.values()].filter((s) => s.size > 1).length;
  const totalTrackedProducts = productSupplierMap.size;

  return NextResponse.json({
    kpis: {
      openPOValue: Math.round(openPOValue),
      atRiskCount: atRiskPOs.length,
      avgOnTime,
      activeSuppliers: suppliers.length,
      totalPOs: purchaseOrders.length,
      singleSourceCount,
      totalTrackedProducts,
    },
    pipeline,
    openOrders,
    scorecard: scorecard.sort((a, b) => b.totalSpend - a.totalSpend),
    spendConcentration,
    sourceRisk: {
      singleSource: singleSourceCount,
      multiSource: multiSourceCount,
      total: totalTrackedProducts,
    },
  });
}
