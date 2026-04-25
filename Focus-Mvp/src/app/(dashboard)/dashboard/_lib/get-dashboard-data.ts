import { prisma } from "@/lib/prisma";
import { aggregateRecords, queryRecords } from "@/lib/chat/record-query";
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

/** Read a COUNT from ImportRecord for a given dataset. Returns 0 on error. */
async function countDataset(dataset: Parameters<typeof aggregateRecords>[0]["dataset"], orgId: string): Promise<number> {
  return aggregateRecords({ dataset, orgId, metric: "COUNT" })
    .then((r) => Number(r.result ?? 0))
    .catch(() => 0);
}

export async function getDashboardData(
  orgId: string
): Promise<DashboardData> {
  const [
    productCount,
    supplierCount,
    inventoryCount,
    poCount,
    soCount,
    activeRules,
    draftRuleCount,
    rawDataSources,
    apps,
    operationalState,
  ] = await Promise.all([
    countDataset("products",        orgId),
    countDataset("suppliers",       orgId),
    countDataset("inventory",       orgId),
    countDataset("purchase_orders", orgId),
    countDataset("sales_orders",    orgId),
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

  const orderCount = poCount + soCount;
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

  // Compute operational KPIs from ImportRecord inventory rows
  let operationalKPIs: OperationalKPIs | null = null;
  if (journeyState === "ACTIVE" && inventoryCount > 0) {
    const [invResult, poResult] = await Promise.all([
      queryRecords({ dataset: "inventory", orgId, limit: 500 }),
      queryRecords({
        dataset: "purchase_orders",
        orgId,
        filters: { status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIAL", "Open", "open", "Partial", "partial"] } },
        limit: 500,
      }),
    ]);

    const invRows = invResult.rows;
    const now = new Date();
    let totalValue = 0;
    let dosSum = 0;
    let dosCount = 0;
    let atRisk = 0;
    let buyRecs = 0;

    for (const item of invRows) {
      const qty = Number(item.quantity ?? 0);
      const reorder = item.reorder_point ? Number(item.reorder_point) : null;
      const dos = item.days_of_supply ? Number(item.days_of_supply) : null;
      const val = item.total_value ? Number(item.total_value) : 0;

      totalValue += isFinite(val) ? val : 0;
      if (dos !== null && dos > 0 && isFinite(dos)) { dosSum += dos; dosCount++; }
      if ((reorder !== null && qty <= reorder) || qty === 0) atRisk++;
      if (item.buy_recommendation === true || String(item.buy_recommendation).toLowerCase() === "true") buyRecs++;
    }

    // Overdue POs: open POs where expected_date is in the past
    const poRows = poResult.rows;
    const overduePOs = poRows.filter((po) => {
      const dateStr = po.expected_date ?? po.confirmed_eta;
      return dateStr && new Date(String(dateStr)) < now;
    }).length;

    const openPOValue = poRows.reduce((s, po) => {
      const v = Number(po.line_value ?? 0);
      return s + (isFinite(v) ? v : 0);
    }, 0);

    operationalKPIs = {
      inventoryHealthPct: invRows.length > 0 ? Math.round(((invRows.length - atRisk) / invRows.length) * 100) : 100,
      skusAtRisk: atRisk,
      totalSKUs: invRows.length,
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
