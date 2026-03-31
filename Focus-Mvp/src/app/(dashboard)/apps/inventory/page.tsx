"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Settings, Package, DollarSign, Clock,
  AlertTriangle, Search, ShieldCheck, TrendingUp,
  ShoppingCart, Zap,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { VibeCodingPanel } from "@/components/apps/VibeCodingPanel";

interface InventoryItem {
  id: string;
  quantity: number;
  reorderPoint: number | null;
  daysOfSupply: number | null;
  value: number;
  alertLevel: "ok" | "low" | "critical";
  safetyStock: number | null;
  buyRecommendation: boolean;
  recommendedQty: number | null;
  demandCurrentMonth: number | null;
  demandNextMonth: number | null;
  demandMonth3: number | null;
  outflow7d: number | null;
  outflow30d: number | null;
  outflow60d: number | null;
  outflow92d: number | null;
  product: { sku: string; name: string; category: string | null; abcClass: string | null };
  location: { name: string; code: string } | null;
}

interface KPIs {
  totalValue: number;
  atRisk: number;
  avgDaysOfSupply: number | null;
  needReorder: number;
  totalSKUs: number;
  inventoryTurns: number | null;
  buyRecommendations: number;
  belowSafetyStock: number;
}

interface Counts { ok: number; low: number; critical: number }
interface CategoryEntry { category: string; value: number }
interface ABCEntry { class: string; count: number; value: number }
interface VelocityBuckets { fast: number; medium: number; slow: number; dead: number }

const HEALTH_COLORS = { critical: "#ef4444", low: "#f59e0b", ok: "#10b981" };
const ABC_COLORS: Record<string, string> = { A: "#3b82f6", B: "#8b5cf6", C: "#f59e0b", Unclassified: "#9ca3af" };
const VELOCITY_COLORS = { fast: "#10b981", medium: "#3b82f6", slow: "#f59e0b", dead: "#ef4444" };

export default function InventoryCommandCenterPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [counts, setCounts] = useState<Counts>({ ok: 0, low: 0, critical: 0 });
  const [categories, setCategories] = useState<CategoryEntry[]>([]);
  const [abcBreakdown, setAbcBreakdown] = useState<ABCEntry[]>([]);
  const [velocityBuckets, setVelocityBuckets] = useState<VelocityBuckets | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "low" | "critical" | "buy">("all");
  const [search, setSearch] = useState("");
  const [showCustomize, setShowCustomize] = useState(false);

  useEffect(() => {
    fetch("/api/apps/inventory")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items ?? []);
        setKpis(d.kpis ?? null);
        setCounts(d.counts ?? { ok: 0, low: 0, critical: 0 });
        setCategories(d.categoryBreakdown ?? []);
        setAbcBreakdown(d.abcBreakdown ?? []);
        setVelocityBuckets(d.velocityBuckets ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = items.filter((i) => {
    if (filter === "buy" && !i.buyRecommendation) return false;
    if (filter === "low" && i.alertLevel !== "low") return false;
    if (filter === "critical" && i.alertLevel !== "critical") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        i.product.sku.toLowerCase().includes(q) ||
        i.product.name.toLowerCase().includes(q) ||
        (i.product.category?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  const pieData = [
    { name: "Critical", value: counts.critical, color: HEALTH_COLORS.critical },
    { name: "Low", value: counts.low, color: HEALTH_COLORS.low },
    { name: "Healthy", value: counts.ok, color: HEALTH_COLORS.ok },
  ].filter((d) => d.value > 0);

  const hasABC = abcBreakdown.length > 0 && abcBreakdown.some((a) => a.class !== "Unclassified");
  const hasVelocity = velocityBuckets && (velocityBuckets.fast + velocityBuckets.medium + velocityBuckets.slow + velocityBuckets.dead) > 0;

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/apps" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Inventory Command Center</h1>
            <p className="text-sm text-gray-500">Stock health, velocity analysis, and replenishment intelligence</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCustomize(true)}>
          <Settings className="w-4 h-4 mr-2" />
          Customize
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed rounded-xl">
          <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
          <p className="text-gray-500 font-medium">No inventory data yet</p>
          <p className="text-sm text-gray-400 mt-1">Import inventory items to see your command center</p>
        </div>
      ) : (
        <>
          {/* KPI Cards — Row 1: Core metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Total Value</p>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(kpis?.totalValue ?? 0)}</p>
                {kpis?.inventoryTurns !== null && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    <TrendingUp className="w-3 h-3 inline mr-0.5" />
                    {kpis?.inventoryTurns}x turns/yr
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={kpis && kpis.atRisk > 0 ? "border-red-200 bg-red-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                  <p className="text-xs text-red-600 font-medium uppercase">SKUs At Risk</p>
                </div>
                <p className="text-2xl font-bold text-red-700">{kpis?.atRisk ?? 0}</p>
                <p className="text-xs text-red-500 mt-0.5">{counts.critical} critical, {counts.low} low</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs text-gray-500 font-medium uppercase">Avg Days of Supply</p>
                </div>
                <p className="text-2xl font-bold">
                  {kpis?.avgDaysOfSupply !== null ? `${kpis?.avgDaysOfSupply}d` : "\u2014"}
                </p>
                {kpis?.belowSafetyStock !== undefined && kpis.belowSafetyStock > 0 && (
                  <p className="text-xs text-amber-600 mt-0.5">
                    {kpis.belowSafetyStock} below safety stock
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className={kpis && kpis.buyRecommendations > 0 ? "border-blue-200 bg-blue-50" : kpis && kpis.needReorder > 0 ? "border-amber-200 bg-amber-50" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart className="w-3.5 h-3.5 text-blue-500" />
                  <p className="text-xs text-blue-600 font-medium uppercase">Buy Signals</p>
                </div>
                <p className="text-2xl font-bold text-blue-700">
                  {kpis?.buyRecommendations ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{kpis?.needReorder ?? 0} below reorder point</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Section */}
          <Tabs defaultValue="health" className="w-full">
            <TabsList>
              <TabsTrigger value="health">Stock Health</TabsTrigger>
              <TabsTrigger value="category">By Category</TabsTrigger>
              {hasABC && <TabsTrigger value="abc">ABC Classification</TabsTrigger>}
              {hasVelocity && <TabsTrigger value="velocity">Velocity</TabsTrigger>}
            </TabsList>

            {/* Health Distribution */}
            <TabsContent value="health" className="mt-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {pieData.length > 0 && (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold text-gray-900 mb-3">Stock Health Distribution</p>
                      <div className="flex items-center justify-center">
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={95}
                              dataKey="value"
                              paddingAngle={2}
                              stroke="none"
                            >
                              {pieData.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(v) => `${v} SKUs`} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 mt-2">
                        {pieData.map((d) => (
                          <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                            {d.name} ({d.value})
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Safety Stock Coverage Summary */}
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-3">Replenishment Summary</p>
                    <div className="space-y-4">
                      <MetricRow
                        label="Need Reorder"
                        value={kpis?.needReorder ?? 0}
                        total={kpis?.totalSKUs ?? 0}
                        color="#f59e0b"
                      />
                      <MetricRow
                        label="Below Safety Stock"
                        value={kpis?.belowSafetyStock ?? 0}
                        total={kpis?.totalSKUs ?? 0}
                        color="#ef4444"
                      />
                      <MetricRow
                        label="Buy Recommendations"
                        value={kpis?.buyRecommendations ?? 0}
                        total={kpis?.totalSKUs ?? 0}
                        color="#3b82f6"
                      />
                      {kpis?.inventoryTurns !== null && (
                        <div className="pt-3 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-600">Estimated Inventory Turns</span>
                            <span className="text-lg font-bold text-gray-900">{kpis?.inventoryTurns}x / yr</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">Based on 30-day outflow data annualized</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Category Breakdown */}
            <TabsContent value="category" className="mt-4">
              {categories.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-3">Inventory Value by Category</p>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={categories} layout="vertical" margin={{ left: 80, right: 16, top: 4, bottom: 4 }}>
                        <XAxis type="number" tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} fontSize={11} />
                        <YAxis type="category" dataKey="category" fontSize={11} width={76} tick={{ fill: "#6b7280" }} />
                        <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={18} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ABC Classification */}
            {hasABC && (
              <TabsContent value="abc" className="mt-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold text-gray-900 mb-3">ABC Classification - SKU Count</p>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={abcBreakdown} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                          <XAxis dataKey="class" fontSize={11} tick={{ fill: "#6b7280" }} />
                          <YAxis fontSize={11} allowDecimals={false} />
                          <Tooltip formatter={(v) => `${v} SKUs`} />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={50}>
                            {abcBreakdown.map((entry) => (
                              <Cell key={entry.class} fill={ABC_COLORS[entry.class] ?? "#9ca3af"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm font-semibold text-gray-900 mb-3">ABC Classification - Value</p>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={abcBreakdown} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                          <XAxis dataKey="class" fontSize={11} tick={{ fill: "#6b7280" }} />
                          <YAxis fontSize={11} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={50}>
                            {abcBreakdown.map((entry) => (
                              <Cell key={entry.class} fill={ABC_COLORS[entry.class] ?? "#9ca3af"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )}

            {/* Velocity Analysis */}
            {hasVelocity && velocityBuckets && (
              <TabsContent value="velocity" className="mt-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm font-semibold text-gray-900 mb-3">Inventory Velocity (30-Day Outflow)</p>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                      {([
                        { key: "fast" as const, label: "Fast Moving", desc: "100+ units/mo", icon: Zap },
                        { key: "medium" as const, label: "Medium", desc: "20-99 units/mo", icon: TrendingUp },
                        { key: "slow" as const, label: "Slow Moving", desc: "1-19 units/mo", icon: Clock },
                        { key: "dead" as const, label: "Dead Stock", desc: "0 units/mo", icon: AlertTriangle },
                      ]).map(({ key, label, desc, icon: Icon }) => (
                        <div
                          key={key}
                          className="rounded-lg border p-3 text-center"
                          style={{ borderColor: `${VELOCITY_COLORS[key]}40` }}
                        >
                          <Icon className="w-4 h-4 mx-auto mb-1" style={{ color: VELOCITY_COLORS[key] }} />
                          <p className="text-xl font-bold" style={{ color: VELOCITY_COLORS[key] }}>
                            {velocityBuckets[key]}
                          </p>
                          <p className="text-xs font-medium text-gray-700">{label}</p>
                          <p className="text-[10px] text-gray-400">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search SKU, product, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-1.5">
              {([
                { key: "all" as const, label: `All (${items.length})` },
                { key: "critical" as const, label: `Critical (${counts.critical})` },
                { key: "low" as const, label: `Low (${counts.low})` },
                { key: "buy" as const, label: `Buy Signal (${kpis?.buyRecommendations ?? 0})` },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(filter === key ? "all" : key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    filter === key
                      ? key === "critical"
                        ? "bg-red-50 border-red-300 text-red-700"
                        : key === "low"
                        ? "bg-amber-50 border-amber-300 text-amber-700"
                        : key === "buy"
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-gray-100 border-gray-300 text-gray-700"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-right">Qty on Hand</th>
                  <th className="px-4 py-3 text-right">Safety / Reorder</th>
                  <th className="px-4 py-3 text-right">Days of Supply</th>
                  <th className="px-4 py-3 text-right">Demand Trend</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                      No items match your filters
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        item.alertLevel === "critical"
                          ? "bg-red-50 hover:bg-red-100"
                          : item.alertLevel === "low"
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                        {item.product.sku}
                        {item.product.abcClass && (
                          <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] font-bold ${
                            item.product.abcClass === "A" ? "bg-blue-100 text-blue-700" :
                            item.product.abcClass === "B" ? "bg-purple-100 text-purple-700" :
                            "bg-amber-100 text-amber-700"
                          }`}>
                            {item.product.abcClass}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{item.product.name}</p>
                        {item.product.category && (
                          <p className="text-xs text-gray-400">{item.product.category}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.location?.name ?? "\u2014"}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${
                        item.alertLevel === "critical" ? "text-red-700" :
                        item.alertLevel === "low" ? "text-amber-700" : "text-gray-900"
                      }`}>
                        {formatNumber(item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {item.safetyStock !== null && (
                          <span className={item.quantity < item.safetyStock ? "text-red-600 font-semibold" : ""}>
                            SS: {formatNumber(item.safetyStock)}
                          </span>
                        )}
                        {item.safetyStock !== null && item.reorderPoint !== null && " / "}
                        {item.reorderPoint !== null && (
                          <span>ROP: {formatNumber(item.reorderPoint)}</span>
                        )}
                        {item.safetyStock === null && item.reorderPoint === null && "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {item.daysOfSupply !== null ? `${item.daysOfSupply}d` : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {item.demandCurrentMonth !== null ? (
                          <span className="tabular-nums">
                            {formatNumber(item.demandCurrentMonth)}
                            {item.demandNextMonth !== null && (
                              <span className="text-gray-300"> / {formatNumber(item.demandNextMonth)}</span>
                            )}
                            {item.demandMonth3 !== null && (
                              <span className="text-gray-300"> / {formatNumber(item.demandMonth3)}</span>
                            )}
                          </span>
                        ) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {item.value > 0 ? formatCurrency(item.value) : "\u2014"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.buyRecommendation ? (
                          <Badge variant="info">
                            buy {item.recommendedQty ? formatNumber(item.recommendedQty) : ""}
                          </Badge>
                        ) : (
                          <Badge
                            variant={
                              item.alertLevel === "critical" ? "destructive" :
                              item.alertLevel === "low" ? "warning" : "success"
                            }
                          >
                            {item.alertLevel}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <VibeCodingPanel
        open={showCustomize}
        onClose={() => setShowCustomize(false)}
        appName="Inventory Command Center"
        template="INVENTORY_COMMAND_CENTER"
      />
    </div>
  );
}

function MetricRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-semibold text-gray-900">{value} <span className="text-gray-400 font-normal">/ {total}</span></span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
