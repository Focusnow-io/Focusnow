export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { queryRecords } from "@/lib/chat/record-query";

function n(v: unknown): number { return isFinite(Number(v)) ? Number(v) : 0; }
function maybeN(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v); return isFinite(x) ? x : null;
}

/** Map raw CSV status values to normalized internal status. */
function normalizeStatus(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "open" || s === "draft" || s === "new") return "SENT";
  if (s === "partial" || s === "partially received") return "PARTIAL";
  if (s === "closed" || s === "received" || s === "complete" || s === "completed") return "RECEIVED";
  if (s === "cancelled" || s === "canceled") return "CANCELLED";
  if (s === "confirmed") return "CONFIRMED";
  if (s === "sent") return "SENT";
  return String(raw ?? "").toUpperCase();
}

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;
  const now = new Date();

  const [{ rows: poRows }, { rows: supplierRows }] = await Promise.all([
    queryRecords({ dataset: "purchase_orders", orgId, limit: 10000 }),
    queryRecords({ dataset: "suppliers",       orgId, limit: 10000 }),
  ]);

  // Build supplier map: supplier_code → supplier row
  const supplierMap = new Map<string, Record<string, unknown>>();
  for (const s of supplierRows) {
    if (s.supplier_code) supplierMap.set(String(s.supplier_code), s);
    // Also index by name in case code isn't present in PO rows
    if (s.name) supplierMap.set(String(s.name), s);
  }

  // Group PO lines by po_number to build PO-level aggregations
  interface POGroup {
    po_number: string;
    supplier_code: string;
    supplier_name: string;
    status: string;
    order_date: string | null;
    expected_date: string | null;
    confirmed_eta: string | null;
    totalValue: number;
    lineCount: number;
  }
  const poGroups = new Map<string, POGroup>();
  for (const row of poRows) {
    const poNum = String(row.po_number ?? "UNKNOWN");
    const existing = poGroups.get(poNum);
    const lineVal = n(row.line_value);
    if (existing) {
      existing.totalValue += lineVal;
      existing.lineCount++;
      // Keep earliest expected date
      if (row.expected_date && (!existing.expected_date || String(row.expected_date) < existing.expected_date)) {
        existing.expected_date = String(row.expected_date);
      }
    } else {
      poGroups.set(poNum, {
        po_number: poNum,
        supplier_code: String(row.supplier_code ?? ""),
        supplier_name: String(row.supplier_name ?? row.supplier_code ?? ""),
        status: normalizeStatus(row.status),
        order_date: row.order_date ? String(row.order_date) : null,
        expected_date: row.expected_date ? String(row.expected_date) : null,
        confirmed_eta: row.confirmed_eta ? String(row.confirmed_eta) : null,
        totalValue: lineVal,
        lineCount: 1,
      });
    }
  }

  const allPOs = [...poGroups.values()];
  const openStatuses = new Set(["DRAFT", "SENT", "CONFIRMED", "PARTIAL"]);
  const openPOs = allPOs.filter((po) => openStatuses.has(po.status));
  const openPOValue = openPOs.reduce((s, po) => s + po.totalValue, 0);

  const atRiskPOs = openPOs.filter((po) => {
    const dateStr = po.expected_date ?? po.confirmed_eta;
    return dateStr && new Date(dateStr) < now;
  });

  // PO pipeline counts
  const pipeline = {
    DRAFT:     allPOs.filter((p) => p.status === "DRAFT").length,
    SENT:      allPOs.filter((p) => p.status === "SENT").length,
    CONFIRMED: allPOs.filter((p) => p.status === "CONFIRMED").length,
    PARTIAL:   allPOs.filter((p) => p.status === "PARTIAL").length,
    RECEIVED:  allPOs.filter((p) => p.status === "RECEIVED").length,
    CANCELLED: allPOs.filter((p) => p.status === "CANCELLED").length,
  };

  // Open orders table
  const openOrders = openPOs.map((po, idx) => {
    const dateStr = po.expected_date ?? po.confirmed_eta;
    const daysUntilDue = dateStr
      ? Math.ceil((new Date(dateStr).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      id: String(idx),
      poNumber: po.po_number,
      supplier: po.supplier_name,
      status: po.status,
      orderDate: po.order_date,
      expectedDate: dateStr,
      totalAmount: Math.round(po.totalValue * 100) / 100,
      lineCount: po.lineCount,
      daysUntilDue,
      isOverdue: daysUntilDue !== null && daysUntilDue < 0,
    };
  }).sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (a.expectedDate && b.expectedDate) {
      return new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime();
    }
    return 0;
  });

  // Spend per supplier from PO data
  const spendBySupplier = new Map<string, number>();
  for (const po of allPOs) {
    const key = po.supplier_code || po.supplier_name;
    spendBySupplier.set(key, (spendBySupplier.get(key) ?? 0) + po.totalValue);
  }
  const poCountBySupplier = new Map<string, number>();
  for (const po of allPOs) {
    const key = po.supplier_code || po.supplier_name;
    poCountBySupplier.set(key, (poCountBySupplier.get(key) ?? 0) + 1);
  }

  // Build supplier scorecard
  // Prefer supplier dataset for quality/on-time; fall back to PO data
  const processedCodes = new Set<string>();
  const scorecard = supplierRows.map((s, idx) => {
    const code = String(s.supplier_code ?? "");
    processedCodes.add(code);
    const totalSpend = spendBySupplier.get(code) ?? spendBySupplier.get(String(s.name ?? "")) ?? 0;
    const totalOrders = poCountBySupplier.get(code) ?? poCountBySupplier.get(String(s.name ?? "")) ?? 0;
    const qualityRating = maybeN(s.quality_rating);
    const onTimeDelivery = maybeN(s.on_time_pct);
    const leadTimeDays = maybeN(s.lead_time_days);

    let riskScore = 0;
    let riskFactors = 0;
    if (onTimeDelivery !== null) { riskScore += Math.max(0, 40 - onTimeDelivery * 0.4); riskFactors++; }
    if (qualityRating !== null)  { riskScore += Math.max(0, 30 - qualityRating * 6); riskFactors++; }
    if (leadTimeDays !== null)   { riskScore += Math.min(30, leadTimeDays * 0.5); riskFactors++; }
    const normalizedRisk = riskFactors > 0 ? Math.round(riskScore / riskFactors * (3 / riskFactors + 1)) : null;
    const riskLevel: "low" | "medium" | "high" | null =
      normalizedRisk === null ? null : normalizedRisk >= 60 ? "high" : normalizedRisk >= 30 ? "medium" : "low";

    return {
      id: String(idx),
      code,
      name: String(s.name ?? code),
      country: s.country ? String(s.country) : null,
      leadTimeDays,
      leadTimeCategory: null as string | null,
      totalOrders,
      onTimeDelivery,
      qualityRating,
      avgOrderValue: totalOrders > 0 ? Math.round(totalSpend / totalOrders) : 0,
      totalSpend: Math.round(totalSpend),
      riskLevel,
      certifications: s.certifications ? String(s.certifications) : null,
    };
  });

  // Also include suppliers visible in POs but not in the supplier dataset
  for (const [code, spend] of spendBySupplier) {
    if (!processedCodes.has(code)) {
      scorecard.push({
        id: `po-${code}`,
        code,
        name: code,
        country: null,
        leadTimeDays: null,
        leadTimeCategory: null,
        totalOrders: poCountBySupplier.get(code) ?? 0,
        onTimeDelivery: null,
        qualityRating: null,
        avgOrderValue: 0,
        totalSpend: Math.round(spend),
        riskLevel: null,
        certifications: null,
      });
    }
  }

  const avgOnTime = scorecard.filter((s) => s.onTimeDelivery !== null).length > 0
    ? Math.round(
        scorecard.filter((s) => s.onTimeDelivery !== null)
          .reduce((acc, s) => acc + (s.onTimeDelivery ?? 0), 0) /
        scorecard.filter((s) => s.onTimeDelivery !== null).length,
      )
    : null;

  // Spend concentration (top 5 suppliers)
  const totalSpendAll = scorecard.reduce((s, sup) => s + sup.totalSpend, 0);
  const spendConcentration = [...scorecard]
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, 5)
    .map((s) => ({
      name: s.name.length > 20 ? s.name.slice(0, 18) + "…" : s.name,
      spend: s.totalSpend,
      pct: totalSpendAll > 0 ? Math.round((s.totalSpend / totalSpendAll) * 100) : 0,
    }));

  // Single-source risk: SKUs that only appear with one supplier in POs
  const skuSuppliers = new Map<string, Set<string>>();
  for (const row of poRows) {
    const sku = String(row.sku ?? "");
    const sup = String(row.supplier_code ?? row.supplier_name ?? "");
    if (!sku || !sup) continue;
    if (!skuSuppliers.has(sku)) skuSuppliers.set(sku, new Set());
    skuSuppliers.get(sku)!.add(sup);
  }
  const singleSourceCount = [...skuSuppliers.values()].filter((s) => s.size === 1).length;
  const multiSourceCount  = [...skuSuppliers.values()].filter((s) => s.size > 1).length;

  return NextResponse.json({
    kpis: {
      openPOValue: Math.round(openPOValue),
      atRiskCount: atRiskPOs.length,
      avgOnTime,
      activeSuppliers: supplierRows.length || spendBySupplier.size,
      totalPOs: allPOs.length,
      singleSourceCount,
      totalTrackedProducts: skuSuppliers.size,
    },
    pipeline,
    openOrders,
    scorecard: scorecard.sort((a, b) => b.totalSpend - a.totalSpend),
    spendConcentration,
    sourceRisk: {
      singleSource: singleSourceCount,
      multiSource: multiSourceCount,
      total: skuSuppliers.size,
    },
  });
}
