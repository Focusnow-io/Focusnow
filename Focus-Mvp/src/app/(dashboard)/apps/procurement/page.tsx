"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Settings, Truck, DollarSign, AlertTriangle,
  Globe, Users, ClipboardList, Shield, Star,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { formatCurrency, formatDate } from "@/lib/utils";
import { VibeCodingPanel } from "@/components/apps/VibeCodingPanel";

interface OpenOrder {
  id: string;
  poNumber: string;
  supplier: string;
  status: string;
  orderDate: string;
  expectedDate: string | null;
  totalAmount: number;
  lineCount: number;
  daysUntilDue: number | null;
  isOverdue: boolean;
}

interface SupplierScore {
  id: string;
  code: string;
  name: string;
  country: string | null;
  leadTimeDays: number | null;
  leadTimeCategory: string | null;
  totalOrders: number;
  onTimeDelivery: number | null;
  qualityRating: number | null;
  avgOrderValue: number;
  totalSpend: number;
  riskLevel: "low" | "medium" | "high" | null;
  certifications: string | null;
}

interface KPIs {
  openPOValue: number;
  atRiskCount: number;
  avgOnTime: number | null;
  activeSuppliers: number;
  totalPOs: number;
  singleSourceCount: number;
  totalTrackedProducts: number;
}

interface Pipeline {
  DRAFT: number;
  SENT: number;
  CONFIRMED: number;
  PARTIAL: number;
  RECEIVED: number;
  CANCELLED: number;
}

interface SpendEntry { name: string; spend: number; pct: number }
interface SourceRisk { singleSource: number; multiSource: number; total: number }

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "#9ca3af",
  SENT: "#3b82f6",
  CONFIRMED: "#10b981",
  PARTIAL: "#f59e0b",
  RECEIVED: "#059669",
  CANCELLED: "#ef4444",
};

const RISK_CONFIG = {
  low: { color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  medium: { color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  high: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
};

export default function ProcurementHubPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [openOrders, setOpenOrders] = useState<OpenOrder[]>([]);
  const [scorecard, setScorecard] = useState<SupplierScore[]>([]);
  const [spendConcentration, setSpendConcentration] = useState<SpendEntry[]>([]);
  const [sourceRisk, setSourceRisk] = useState<SourceRisk | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    fetch("/api/apps/procurement")
      .then((r) => r.json())
      .then((d) => {
        setKpis(d.kpis ?? null);
        setPipeline(d.pipeline ?? null);
        setOpenOrders(d.openOrders ?? []);
        setScorecard(d.scorecard ?? []);
        setSpendConcentration(d.spendConcentration ?? []);
        setSourceRisk(d.sourceRisk ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const pipelineData = pipeline
    ? [
        { status: "Draft", count: pipeline.DRAFT, fill: STATUS_COLORS.DRAFT },
        { status: "Sent", count: pipeline.SENT, fill: STATUS_COLORS.SENT },
        { status: "Confirmed", count: pipeline.CONFIRMED, fill: STATUS_COLORS.CONFIRMED },
        { status: "Partial", count: pipeline.PARTIAL, fill: STATUS_COLORS.PARTIAL },
        { status: "Received", count: pipeline.RECEIVED, fill: STATUS_COLORS.RECEIVED },
      ].filter((d) => d.count > 0)
    : [];

  const noData = !loading && kpis?.totalPOs === 0 && scorecard.length === 0;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Procurement Hub</h1>
            <p className="text-sm text-gray-500">Supplier intelligence, spend analytics, and supply risk</p>
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
          <Truck className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No procurement data yet</p>
          <p className="text-sm text-gray-400 mt-1">Import purchase orders and suppliers to see your procurement hub</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Open PO Value</p>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(kpis?.openPOValue ?? 0)}</p>
              </CardContent>
            </Card>
            <Card className={kpis && kpis.atRiskCount > 0 ? "border-red-200 bg-red-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <p className="text-xs text-red-600 font-medium uppercase">Overdue POs</p>
                </div>
                <p className="text-2xl font-bold text-red-700">{kpis?.atRiskCount ?? 0}</p>
                <p className="text-xs text-red-500 mt-0.5">Past expected delivery date</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Avg On-Time</p>
                </div>
                <p className={`text-2xl font-bold ${
                  kpis?.avgOnTime !== null
                    ? (kpis?.avgOnTime ?? 0) >= 90 ? "text-emerald-700" : (kpis?.avgOnTime ?? 0) >= 70 ? "text-amber-700" : "text-red-700"
                    : ""
                }`}>
                  {kpis?.avgOnTime !== null ? `${kpis?.avgOnTime}%` : "\u2014"}
                </p>
              </CardContent>
            </Card>
            <Card className={kpis && kpis.singleSourceCount > 0 ? "border-amber-200 bg-amber-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs text-amber-600 font-medium uppercase">Single-Source Risk</p>
                </div>
                <p className="text-2xl font-bold text-amber-700">{kpis?.singleSourceCount ?? 0}</p>
                <p className="text-xs text-amber-500 mt-0.5">
                  of {kpis?.totalTrackedProducts ?? 0} tracked products
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* PO Pipeline */}
            {pipelineData.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">PO Pipeline</p>
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

            {/* Spend Concentration */}
            {spendConcentration.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-gray-900 mb-3">Spend Concentration (Top 5)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={spendConcentration} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                      <XAxis type="number" tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} fontSize={11} />
                      <YAxis type="category" dataKey="name" fontSize={11} width={76} tick={{ fill: "#6b7280" }} />
                      <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                      <Bar dataKey="spend" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                  {spendConcentration.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Top {spendConcentration.length} suppliers represent {
                        spendConcentration.reduce((s, e) => s + e.pct, 0)
                      }% of total spend
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Source Risk Summary */}
          {sourceRisk && sourceRisk.total > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Supply Source Risk</p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-red-50 border border-red-200">
                    <p className="text-2xl font-bold text-red-700">{sourceRisk.singleSource}</p>
                    <p className="text-xs text-red-600 font-medium">Single Source</p>
                    <p className="text-[10px] text-red-400 mt-0.5">High supply risk</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <p className="text-2xl font-bold text-emerald-700">{sourceRisk.multiSource}</p>
                    <p className="text-xs text-emerald-600 font-medium">Multi Source</p>
                    <p className="text-[10px] text-emerald-400 mt-0.5">Diversified supply</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-gray-50 border border-gray-200">
                    <p className="text-2xl font-bold text-gray-700">{sourceRisk.total}</p>
                    <p className="text-xs text-gray-600 font-medium">Total Tracked</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Products with supplier mapping</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="orders" className="w-full">
            <TabsList>
              <TabsTrigger value="orders">
                Open Orders{openOrders.length > 0 && ` (${openOrders.length})`}
              </TabsTrigger>
              <TabsTrigger value="scorecard">
                Supplier Scorecard{scorecard.length > 0 && ` (${scorecard.length})`}
              </TabsTrigger>
            </TabsList>

            {/* Open Orders Tab */}
            <TabsContent value="orders" className="mt-4">
              {openOrders.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl">
                  <ClipboardList className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">No open purchase orders</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">PO Number</th>
                        <th className="px-4 py-3 text-left">Supplier</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-4 py-3 text-left">Order Date</th>
                        <th className="px-4 py-3 text-left">Expected</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3 text-right">Lines</th>
                        <th className="px-4 py-3 text-center">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {openOrders.map((po) => (
                        <tr
                          key={po.id}
                          className={`transition-colors ${po.isOverdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-gray-50"}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                            {po.poNumber}
                          </td>
                          <td className="px-4 py-3 font-medium">{po.supplier}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant={
                                po.status === "CONFIRMED" ? "success" :
                                po.status === "SENT" ? "info" :
                                po.status === "PARTIAL" ? "warning" : "outline"
                              }
                            >
                              {po.status.toLowerCase()}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(po.orderDate)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{po.expectedDate ? formatDate(po.expectedDate) : "\u2014"}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatCurrency(po.totalAmount)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">{po.lineCount}</td>
                          <td className="px-4 py-3 text-center">
                            {po.daysUntilDue !== null ? (
                              <span className={`text-xs font-semibold ${po.isOverdue ? "text-red-600" : po.daysUntilDue <= 7 ? "text-amber-600" : "text-gray-500"}`}>
                                {po.isOverdue ? `${Math.abs(po.daysUntilDue)}d overdue` : `${po.daysUntilDue}d`}
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

            {/* Supplier Scorecard Tab */}
            <TabsContent value="scorecard" className="mt-4">
              {scorecard.length === 0 ? (
                <div className="py-12 text-center border-2 border-dashed rounded-xl">
                  <Truck className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-gray-500 font-medium">No supplier data yet</p>
                </div>
              ) : (
                <div className="bg-white border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Supplier</th>
                        <th className="px-4 py-3 text-center">Risk</th>
                        <th className="px-4 py-3 text-center">Quality</th>
                        <th className="px-4 py-3 text-left">Lead Time</th>
                        <th className="px-4 py-3 text-right">Orders</th>
                        <th className="px-4 py-3 text-left w-32">On-Time</th>
                        <th className="px-4 py-3 text-right">Total Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {scorecard.map((s) => {
                        const risk = s.riskLevel ? RISK_CONFIG[s.riskLevel] : null;
                        return (
                          <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium">{s.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <p className="text-xs text-gray-400 font-mono">{s.code}</p>
                                {s.country && (
                                  <span className="flex items-center gap-0.5 text-xs text-gray-400">
                                    <Globe className="w-3 h-3" />{s.country}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.riskLevel ? (
                                <Badge variant={
                                  s.riskLevel === "high" ? "destructive" :
                                  s.riskLevel === "medium" ? "warning" : "success"
                                }>
                                  {s.riskLevel}
                                </Badge>
                              ) : (
                                <span className="text-xs text-gray-400">{"\u2014"}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.qualityRating !== null ? (
                                <div className="flex items-center justify-center gap-0.5">
                                  <Star className={`w-3 h-3 ${
                                    s.qualityRating >= 4 ? "text-emerald-500" :
                                    s.qualityRating >= 3 ? "text-amber-500" : "text-red-500"
                                  }`} fill="currentColor" />
                                  <span className={`text-xs font-semibold ${
                                    s.qualityRating >= 4 ? "text-emerald-700" :
                                    s.qualityRating >= 3 ? "text-amber-700" : "text-red-700"
                                  }`}>
                                    {s.qualityRating.toFixed(1)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">{"\u2014"}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {s.leadTimeDays != null ? (
                                <span>
                                  {s.leadTimeDays}d
                                  {s.leadTimeCategory && (
                                    <span className="text-[10px] text-gray-400 ml-1">({s.leadTimeCategory})</span>
                                  )}
                                </span>
                              ) : "\u2014"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{s.totalOrders}</td>
                            <td className="px-4 py-3">
                              {s.onTimeDelivery !== null ? (
                                <div className="flex items-center gap-2">
                                  <Progress
                                    value={s.onTimeDelivery}
                                    className={`h-2 flex-1 ${
                                      s.onTimeDelivery >= 90
                                        ? "[&>div]:bg-emerald-500"
                                        : s.onTimeDelivery >= 70
                                        ? "[&>div]:bg-amber-500"
                                        : "[&>div]:bg-red-500"
                                    }`}
                                  />
                                  <span className={`text-xs font-semibold w-9 ${
                                    s.onTimeDelivery >= 90 ? "text-emerald-700" :
                                    s.onTimeDelivery >= 70 ? "text-amber-700" : "text-red-700"
                                  }`}>
                                    {s.onTimeDelivery}%
                                  </span>
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">No data</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900">
                              {s.totalSpend > 0 ? formatCurrency(s.totalSpend) : "\u2014"}
                            </td>
                          </tr>
                        );
                      })}
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
        appName="Procurement Hub"
        template="PROCUREMENT_HUB"
      />
    </div>
  );
}
