"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Settings, ShoppingCart, DollarSign,
  Factory, AlertTriangle, PackageCheck, ClipboardList,
  Target, CheckCircle,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { VibeCodingPanel } from "@/components/apps/VibeCodingPanel";

interface OpenSO {
  id: string;
  soNumber: string;
  customer: string;
  status: string;
  orderDate: string;
  requestedDate: string | null;
  totalAmount: number;
  lineCount: number;
  fulfillmentPct: number;
}

interface WorkOrderItem {
  id: string;
  woNumber: string;
  sku: string;
  productName: string;
  status: string;
  plannedQty: number;
  producedQty: number;
  progressPct: number;
  scheduledDate: string | null;
  dueDate: string | null;
  isOverdue: boolean;
}

interface AtRiskSKU {
  id: string;
  sku: string;
  productName: string;
  qtyOnHand: number;
  daysOfSupply: number | null;
  demandCurrentMonth: number | null;
  demandNextMonth: number | null;
  demandMonth3: number | null;
  openPOQty: number;
  coverageStatus: "covered" | "partial" | "short";
  safetyStock: number | null;
  safetyStockGap: number | null;
  buyRecommendation: boolean;
  recommendedQty: number | null;
}

interface KPIs {
  openSOCount: number;
  openSOValue: number;
  productionRate: number | null;
  projectedStockouts: number;
  totalSOs: number;
  totalWOs: number;
  fillRate: number | null;
  onTimeDeliveryRate: number | null;
}

interface SOPipeline {
  DRAFT: number;
  CONFIRMED: number;
  IN_PRODUCTION: number;
  SHIPPED: number;
  DELIVERED: number;
  CANCELLED: number;
}

interface CoverageDist {
  under1: number;
  "1to2": number;
  "2to3": number;
  over3: number;
}

const SO_STATUS_COLORS: Record<string, string> = {
  Draft: "#9ca3af",
  Confirmed: "#3b82f6",
  "In Production": "#f59e0b",
  Shipped: "#8b5cf6",
  Delivered: "#10b981",
};

const COVERAGE_COLORS = {
  "<1 mo": "#ef4444",
  "1-2 mo": "#f59e0b",
  "2-3 mo": "#3b82f6",
  "3+ mo": "#10b981",
};

export default function DemandFulfillmentPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [soPipeline, setSoPipeline] = useState<SOPipeline | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenSO[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([]);
  const [atRiskSKUs, setAtRiskSKUs] = useState<AtRiskSKU[]>([]);
  const [coverageDist, setCoverageDist] = useState<CoverageDist | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomize, setShowCustomize] = useState(false);
  const [instanceId, setInstanceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/apps/instances")
      .then((r) => r.json())
      .then((d: { instances?: { id: string; template: string }[] }) => {
        const inst = d.instances?.find((i) => i.template === "DEMAND_FULFILLMENT");
        if (inst) setInstanceId(inst.id);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/apps/demand")
      .then((r) => r.json())
      .then((d) => {
        setKpis(d.kpis ?? null);
        setSoPipeline(d.soPipeline ?? null);
        setOpenOrders(d.openOrders ?? []);
        setWorkOrders(d.workOrders ?? []);
        setAtRiskSKUs(d.atRiskSKUs ?? []);
        setCoverageDist(d.coverageDistribution ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const pipelineData = soPipeline
    ? [
        { status: "Draft", count: soPipeline.DRAFT, fill: SO_STATUS_COLORS.Draft },
        { status: "Confirmed", count: soPipeline.CONFIRMED, fill: SO_STATUS_COLORS.Confirmed },
        { status: "In Production", count: soPipeline.IN_PRODUCTION, fill: SO_STATUS_COLORS["In Production"] },
        { status: "Shipped", count: soPipeline.SHIPPED, fill: SO_STATUS_COLORS.Shipped },
        { status: "Delivered", count: soPipeline.DELIVERED, fill: SO_STATUS_COLORS.Delivered },
      ].filter((d) => d.count > 0)
    : [];

  const noData = !loading && kpis?.totalSOs === 0 && kpis?.totalWOs === 0 && atRiskSKUs.length === 0;

  const coverageData = coverageDist ? [
    { range: "<1 mo", count: coverageDist.under1, fill: COVERAGE_COLORS["<1 mo"] },
    { range: "1-2 mo", count: coverageDist["1to2"], fill: COVERAGE_COLORS["1-2 mo"] },
    { range: "2-3 mo", count: coverageDist["2to3"], fill: COVERAGE_COLORS["2-3 mo"] },
    { range: "3+ mo", count: coverageDist.over3, fill: COVERAGE_COLORS["3+ mo"] },
  ].filter((d) => d.count > 0) : [];

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Demand & Fulfillment</h1>
            <p className="text-sm text-gray-500">Service levels, demand coverage, and production tracking</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCustomize(true)}>
          <Settings className="w-4 h-4 mr-2" />
          Customize
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : noData ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <ShoppingCart className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No demand or fulfillment data yet</p>
          <p className="text-sm text-gray-400 mt-1">Import sales orders, work orders, or demand forecasts to get started</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Fill Rate */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Target className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Fill Rate</p>
                </div>
                <p className={`text-2xl font-bold ${
                  kpis?.fillRate !== null
                    ? (kpis?.fillRate ?? 0) >= 95 ? "text-emerald-700" : (kpis?.fillRate ?? 0) >= 80 ? "text-amber-700" : "text-red-700"
                    : ""
                }`}>
                  {kpis?.fillRate !== null ? `${kpis?.fillRate}%` : "\u2014"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Lines fully shipped</p>
              </CardContent>
            </Card>

            {/* On-Time Delivery */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">On-Time Delivery</p>
                </div>
                <p className={`text-2xl font-bold ${
                  kpis?.onTimeDeliveryRate !== null
                    ? (kpis?.onTimeDeliveryRate ?? 0) >= 90 ? "text-emerald-700" : (kpis?.onTimeDeliveryRate ?? 0) >= 70 ? "text-amber-700" : "text-red-700"
                    : ""
                }`}>
                  {kpis?.onTimeDeliveryRate !== null ? `${kpis?.onTimeDeliveryRate}%` : "\u2014"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">Delivered on requested date</p>
              </CardContent>
            </Card>

            {/* Production Rate */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Factory className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Production Rate</p>
                </div>
                <p className="text-2xl font-bold">
                  {kpis?.productionRate !== null ? `${kpis?.productionRate}%` : "\u2014"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {kpis?.openSOCount ?? 0} open SOs ({formatCurrency(kpis?.openSOValue ?? 0)})
                </p>
              </CardContent>
            </Card>

            {/* At-Risk SKUs */}
            <Card className={kpis && kpis.projectedStockouts > 0 ? "border-red-200 bg-red-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <p className="text-xs text-red-600 font-medium uppercase">At-Risk SKUs</p>
                </div>
                <p className="text-2xl font-bold text-red-700">{kpis?.projectedStockouts ?? 0}</p>
                <p className="text-xs text-red-500 mt-0.5">Low coverage or stockout risk</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Fulfillment Pipeline */}
            {pipelineData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Fulfillment Pipeline</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={pipelineData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                      <XAxis dataKey="status" fontSize={11} tick={{ fill: "#6b7280" }} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                        {pipelineData.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Demand Coverage Horizon */}
            {coverageData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Demand Coverage Horizon</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={coverageData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                      <XAxis dataKey="range" fontSize={11} tick={{ fill: "#6b7280" }} />
                      <YAxis fontSize={11} allowDecimals={false} />
                      <Tooltip formatter={(v) => `${v} SKUs`} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                        {coverageData.map((entry) => (
                          <Cell key={entry.range} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    How many months of demand each SKU&apos;s stock + open POs can cover
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Tabs */}
          <Tabs defaultValue="orders" className="w-full">
            <TabsList>
              <TabsTrigger value="orders">
                Sales Orders{openOrders.length > 0 && ` (${openOrders.length})`}
              </TabsTrigger>
              <TabsTrigger value="production">
                Production{workOrders.length > 0 && ` (${workOrders.length})`}
              </TabsTrigger>
              <TabsTrigger value="risk">
                At-Risk SKUs{atRiskSKUs.length > 0 && ` (${atRiskSKUs.length})`}
              </TabsTrigger>
            </TabsList>

            {/* Sales Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              {openOrders.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl">
                  <ClipboardList className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">No open sales orders</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">SO Number</th>
                        <th className="px-4 py-3 text-left">Customer</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-left">Requested</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Lines</th>
                        <th className="px-4 py-3 text-left w-32">Fulfillment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {openOrders.map((so) => (
                        <tr key={so.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                            {so.soNumber}
                          </td>
                          <td className="px-4 py-3 font-medium">{so.customer}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                so.status === "CONFIRMED" ? "info" :
                                so.status === "IN_PRODUCTION" ? "warning" :
                                so.status === "SHIPPED" ? "success" : "outline"
                              }
                            >
                              {so.status.toLowerCase().replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {so.requestedDate ? formatDate(so.requestedDate) : "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(so.totalAmount)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{so.lineCount}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={so.fulfillmentPct}
                                className={`h-2 flex-1 ${
                                  so.fulfillmentPct >= 80 ? "[&>div]:bg-emerald-500" :
                                  so.fulfillmentPct >= 40 ? "[&>div]:bg-amber-500" :
                                  "[&>div]:bg-gray-400"
                                }`}
                              />
                              <span className="text-xs font-semibold text-gray-600 w-9">
                                {so.fulfillmentPct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* Production Tab */}
            <TabsContent value="production" className="mt-4">
              {workOrders.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl">
                  <Factory className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">No active work orders</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">WO Number</th>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-right">Planned</th>
                        <th className="px-4 py-3 text-right">Produced</th>
                        <th className="px-4 py-3 text-left w-32">Progress</th>
                        <th className="px-4 py-3 text-left">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {workOrders.map((wo) => (
                        <tr
                          key={wo.id}
                          className={`transition-colors ${wo.isOverdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                            {wo.woNumber}
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{wo.productName}</p>
                            <p className="text-xs text-gray-400 font-mono">{wo.sku}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                wo.status === "IN_PROGRESS" || wo.status === "RELEASED" ? "info" :
                                wo.status === "PLANNED" ? "outline" : "warning"
                              }
                            >
                              {wo.status.toLowerCase().replace(/_/g, " ")}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">
                            {formatNumber(wo.plannedQty)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatNumber(wo.producedQty)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Progress
                                value={wo.progressPct}
                                className={`h-2 flex-1 ${
                                  wo.progressPct >= 80 ? "[&>div]:bg-emerald-500" :
                                  wo.progressPct >= 40 ? "[&>div]:bg-blue-500" :
                                  "[&>div]:bg-gray-400"
                                }`}
                              />
                              <span className="text-xs font-semibold text-gray-600 w-9">
                                {wo.progressPct}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {wo.dueDate ? (
                              <span className={`text-xs ${wo.isOverdue ? "text-red-600 font-semibold" : "text-gray-500"}`}>
                                {formatDate(wo.dueDate)}
                                {wo.isOverdue && " (overdue)"}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{"\u2014"}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* At-Risk SKUs Tab — Enhanced */}
            <TabsContent value="risk" className="mt-4">
              {atRiskSKUs.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl">
                  <PackageCheck className="w-8 h-8 text-emerald-200 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">All SKUs have adequate coverage</p>
                  <p className="text-sm text-gray-400 mt-1">No projected stockouts detected</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">SKU</th>
                        <th className="px-4 py-3 text-left">Product</th>
                        <th className="px-4 py-3 text-right">On Hand</th>
                        <th className="px-4 py-3 text-right">Safety Stock Gap</th>
                        <th className="px-4 py-3 text-right">Days of Supply</th>
                        <th className="px-4 py-3 text-right">Demand (3mo)</th>
                        <th className="px-4 py-3 text-right">Open PO</th>
                        <th className="px-4 py-3 text-center">Signal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {atRiskSKUs.map((item) => (
                        <tr
                          key={item.id}
                          className={`transition-colors ${
                            item.coverageStatus === "short"
                              ? "bg-red-50 hover:bg-red-100"
                              : item.coverageStatus === "partial"
                              ? "bg-amber-50 hover:bg-amber-100"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                            {item.sku}
                          </td>
                          <td className="px-4 py-3 font-medium">{item.productName}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatNumber(item.qtyOnHand)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.safetyStockGap !== null ? (
                              <span className={`text-xs font-semibold ${
                                item.safetyStockGap < 0 ? "text-red-600" : "text-emerald-600"
                              }`}>
                                {item.safetyStockGap < 0 ? "" : "+"}{formatNumber(item.safetyStockGap)}
                                <span className="text-gray-400 font-normal ml-1">
                                  (SS: {formatNumber(item.safetyStock!)})
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{"\u2014"}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {item.daysOfSupply !== null ? (
                              <span className={item.daysOfSupply <= 7 ? "text-red-600 font-semibold" : ""}>
                                {item.daysOfSupply}d
                              </span>
                            ) : "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-600 tabular-nums">
                            {item.demandCurrentMonth !== null ? (
                              <>
                                {formatNumber(item.demandCurrentMonth)}
                                {item.demandNextMonth !== null && (
                                  <span className="text-gray-300"> / {formatNumber(item.demandNextMonth)}</span>
                                )}
                                {item.demandMonth3 !== null && (
                                  <span className="text-gray-300"> / {formatNumber(item.demandMonth3)}</span>
                                )}
                              </>
                            ) : "\u2014"}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {formatNumber(item.openPOQty)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.buyRecommendation ? (
                              <Badge variant="info">
                                buy {item.recommendedQty ? formatNumber(item.recommendedQty) : ""}
                              </Badge>
                            ) : (
                              <Badge
                                variant={
                                  item.coverageStatus === "short" ? "destructive" :
                                  item.coverageStatus === "partial" ? "warning" : "success"
                                }
                              >
                                {item.coverageStatus}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <VibeCodingPanel
        open={showCustomize}
        onClose={() => setShowCustomize(false)}
        appName="Demand & Fulfillment"
        template="DEMAND_FULFILLMENT"
        instanceId={instanceId}
      />
    </div>
  );
}
