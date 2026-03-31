import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  ShieldCheck, AlertTriangle, Clock,
  DollarSign, ShoppingCart, Truck,
} from "lucide-react";
import type { OperationalKPIs } from "../_lib/types";

interface ZoneOperationalKPIsProps {
  kpis: OperationalKPIs;
}

export function ZoneOperationalKPIs({ kpis }: ZoneOperationalKPIsProps) {
  const healthColor =
    kpis.inventoryHealthPct >= 80
      ? "text-emerald-700"
      : kpis.inventoryHealthPct >= 60
      ? "text-amber-700"
      : "text-red-700";

  const healthBg =
    kpis.inventoryHealthPct >= 80
      ? "bg-emerald-50 border-emerald-200"
      : kpis.inventoryHealthPct >= 60
      ? "bg-amber-50 border-amber-200"
      : "bg-red-50 border-red-200";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {/* Inventory Health */}
      <Link href="/apps/inventory">
        <Card className={`p-4 transition-all hover:shadow-md cursor-pointer ${healthBg}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Inventory Health
            </span>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${healthColor}`}>
            {kpis.inventoryHealthPct}%
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kpis.skusAtRisk > 0
              ? `${kpis.skusAtRisk} of ${kpis.totalSKUs} SKUs at risk`
              : `All ${kpis.totalSKUs} SKUs healthy`}
          </p>
        </Card>
      </Link>

      {/* Days of Supply */}
      <Link href="/apps/inventory">
        <Card className="p-4 transition-all hover:shadow-md cursor-pointer">
          <div className="flex items-center gap-2 mb-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Avg Days of Supply
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {kpis.avgDaysOfSupply !== null ? `${kpis.avgDaysOfSupply}d` : "\u2014"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kpis.buyRecommendations > 0
              ? `${kpis.buyRecommendations} buy recommendations`
              : "No buy signals"}
          </p>
        </Card>
      </Link>

      {/* Overdue POs */}
      <Link href="/apps/procurement">
        <Card className={`p-4 transition-all hover:shadow-md cursor-pointer ${kpis.overduePOs > 0 ? "bg-red-50 border-red-200" : ""}`}>
          <div className="flex items-center gap-2 mb-1.5">
            {kpis.overduePOs > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            ) : (
              <Truck className="w-3.5 h-3.5 text-muted-foreground" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Overdue POs
            </span>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${kpis.overduePOs > 0 ? "text-red-700" : "text-foreground"}`}>
            {kpis.overduePOs}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatCompact(kpis.openPOValue)} open PO value
          </p>
        </Card>
      </Link>

      {/* Total Inventory Value */}
      <Link href="/apps/inventory">
        <Card className="p-4 transition-all hover:shadow-md cursor-pointer">
          <div className="flex items-center gap-2 mb-1.5">
            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Inventory Value
            </span>
          </div>
          <p className="text-2xl font-bold tabular-nums text-foreground">
            {formatCompact(kpis.totalInventoryValue)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Across {kpis.totalSKUs} SKUs
          </p>
        </Card>
      </Link>
    </div>
  );
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}
