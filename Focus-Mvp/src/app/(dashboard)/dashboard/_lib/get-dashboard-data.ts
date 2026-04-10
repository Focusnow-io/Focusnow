import { prisma } from "@/lib/prisma";
import { getOperationalState } from "@/lib/ode/state-manager";
import type { DashboardData, DashboardJourneyState, OperationalKPIs } from "./types";

function detectJourneyState(counts: {
  hasData: boolean;
  hasRules: boolean;
  hasApps: boolean;
}): DashboardJourneyState {
  if (!counts.hasData) return "NEW";
  if (!counts.hasRules) return "DATA_ONLY";
  if (!counts.hasApps) return "DATA_AND_BRAIN";
  return "ACTIVE";
}

/** Deduplicate data sources by originalName, keeping the most recent per file. */
function deduplicateDataSources<
  T extends { originalName: string; createdAt: Date },
>(sources: T[]): T[] {
  const map = new Map<string, T>();
  for (const source of sources) {
    const existing = map.get(source.originalName);
    if (!existing || source.createdAt > existing.createdAt) {
      map.set(source.originalName, source);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getDashboardData(
  orgId: string
): Promise<DashboardData> {
  const [
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    activeRules,
    draftRuleCount,
    rawDataSources,
    apps,
    operationalState,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.order.count({ where: { organizationId: orgId } }),
    prisma.brainRule.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        name: true,
        category: true,
        entity: true,
        updatedAt: true,
      },
    }),
    prisma.brainRule.count({
      where: { organizationId: orgId, status: "DRAFT" },
    }),
    prisma.dataSource.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        originalName: true,
        rowCount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.appInstance.findMany({
      where: { organizationId: orgId, active: true },
      take: 10,
      select: { id: true, name: true, template: true },
    }),
    getOperationalState(orgId),
  ]);

  const activeRuleCount = activeRules.length;
  const activeAppCount = apps.length;
  const hasData =
    productCount > 0 ||
    supplierCount > 0 ||
    inventoryCount > 0 ||
    orderCount > 0;

  // Extract unique domains from active rules' entity field
  const domainSet = new Set<string>();
  for (const rule of activeRules) {
    if (rule.entity) {
      domainSet.add(
        rule.entity
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c: string) => c.toUpperCase())
      );
    }
  }
  const ruleDomains = Array.from(domainSet);

  const dataSources = deduplicateDataSources(rawDataSources).slice(0, 5) as DashboardData["dataSources"];

  // DATA_CHAT is a utility app — only count operational dashboard apps for journey state
  const operationalAppCount = apps.filter((a) => a.template !== "DATA_CHAT").length;

  const journeyState = detectJourneyState({
    hasData,
    hasRules: activeRuleCount > 0 || draftRuleCount > 0,
    hasApps: operationalAppCount > 0,
  });

  // Compute operational KPIs for ACTIVE users
  let operationalKPIs: OperationalKPIs | null = null;
  if (journeyState === "ACTIVE" && inventoryCount > 0) {
    const invItems = await prisma.inventoryItem.findMany({
      where: { organizationId: orgId },
      select: {
        quantity: true,
        reorderPoint: true,
        daysOfSupply: true,
        totalValue: true,
        buyRecommendation: true,
      },
    });

    let totalValue = 0;
    let dosSum = 0;
    let dosCount = 0;
    let atRisk = 0;
    let buyRecs = 0;

    for (const item of invItems) {
      const qty = Number(item.quantity);
      const reorder = item.reorderPoint ? Number(item.reorderPoint) : null;
      const dos = item.daysOfSupply ? Number(item.daysOfSupply) : null;
      const val = item.totalValue ? Number(item.totalValue) : 0;

      totalValue += val;
      if (dos !== null && dos > 0) { dosSum += dos; dosCount++; }
      if ((reorder !== null && qty <= reorder) || qty === 0) atRisk++;
      if (item.buyRecommendation === true) buyRecs++;
    }

    // Count overdue POs
    const now = new Date();
    const overduePOs = await prisma.purchaseOrder.count({
      where: {
        orgId,
        status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIAL"] },
        OR: [
          { expectedDate: { lt: now } },
          { confirmedETA: { lt: now } },
        ],
      },
    });

    // Open PO value
    const openPOs = await prisma.purchaseOrder.findMany({
      where: {
        orgId,
        status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIAL"] },
      },
      select: { totalAmount: true },
    });
    const openPOValue = openPOs.reduce((s: number, po: { totalAmount: unknown }) => s + Number(po.totalAmount ?? 0), 0);

    operationalKPIs = {
      inventoryHealthPct: invItems.length > 0 ? Math.round(((invItems.length - atRisk) / invItems.length) * 100) : 100,
      skusAtRisk: atRisk,
      totalSKUs: invItems.length,
      avgDaysOfSupply: dosCount > 0 ? Math.round(dosSum / dosCount) : null,
      totalInventoryValue: Math.round(totalValue),
      buyRecommendations: buyRecs,
      overduePOs,
      openPOValue: Math.round(openPOValue),
    };
  }

  return {
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    activeRuleCount,
    draftRuleCount,
    activeAppCount,
    ruleDomains,
    activeRules,
    apps,
    dataSources,
    alerts: operationalState.alerts.slice(0, 5),
    journeyState,
    operationalKPIs,
  };
}
