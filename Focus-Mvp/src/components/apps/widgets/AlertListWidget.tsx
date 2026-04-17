"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Clock } from "lucide-react";
import type { WidgetConfig } from "./types";
import { useAppState } from "./AppStateProvider";

function fmtCell(v: unknown, format?: string): string {
  if (v === null || v === undefined) return "—";
  if (format === "currency" && typeof v === "number")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (format === "number" && typeof v === "number") return new Intl.NumberFormat("en-US").format(v);
  if (format === "date" && typeof v === "string") return new Date(v).toLocaleDateString();
  return String(v);
}

function urgencyLevel(row: Record<string, unknown>): "critical" | "warning" | "ok" {
  // Inventory-style: qty vs reorderPoint
  const qty = Number(row.quantity ?? row.qtyOnHand ?? -1);
  const rp = Number(row.reorderPoint ?? 0);
  if (qty >= 0 && rp > 0) {
    if (qty <= 0) return "critical";
    if (qty <= rp * 0.5) return "critical";
    if (qty <= rp) return "warning";
    return "ok";
  }

  // Date-based: overdue items (expectedDate/dueDate in the past)
  const dateFields = ["expectedDate", "dueDate", "requestedDate", "expiryDate"];
  for (const df of dateFields) {
    const dv = row[df];
    if (dv && typeof dv === "string") {
      const d = new Date(dv);
      if (!isNaN(d.getTime()) && d < new Date()) return "critical";
    }
  }

  // Status-based hints
  const status = String(row.status ?? "").toUpperCase();
  if (["CANCELLED", "FAILED"].includes(status)) return "critical";
  if (["DRAFT", "PENDING", "PARTIAL"].includes(status)) return "warning";

  return "ok";
}

const LEVEL_STYLES = {
  critical: { row: "border-l-2 border-l-red-400", icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />, badge: "bg-muted text-red-600 border border-red-200" },
  warning:  { row: "border-l-2 border-l-amber-300", icon: <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />, badge: "bg-muted text-amber-600 border border-amber-200" },
  ok:       { row: "border-l-2 border-l-transparent", icon: <CheckCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />, badge: "bg-muted text-muted-foreground border border-border" },
};

export function AlertListWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const columns = widget.display?.columns;
  const listenTo = widget.interactions?.listenTo ?? [];

  const externalFilters = useMemo(() => {
    if (!listenTo.length) return [];
    return appState.getFiltersFor(listenTo);
  }, [listenTo, appState]);

  const mergedQuery = useMemo(() => {
    if (!externalFilters.length) return widget.query;
    const existing = widget.query.filters ?? [];
    return { ...widget.query, filters: [...existing, ...externalFilters] };
  }, [widget.query, externalFilters]);

  useEffect(() => {
    setLoading(true);
    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mergedQuery }),
    })
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.data)) setRows(d.data as Record<string, unknown>[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [mergedQuery, appState.state.refreshKey]);

  const critCount = rows.filter((r) => urgencyLevel(r) === "critical").length;
  const warnCount = rows.filter((r) => urgencyLevel(r) === "warning").length;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">{widget.title}</p>
          {widget.display?.description && <p className="text-xs text-muted-foreground mt-0.5">{widget.display.description}</p>}
        </div>
        {!loading && rows.length > 0 && (
          <div className="flex items-center gap-2">
            {critCount > 0 && <span className="text-xs font-medium bg-muted text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{critCount} critical</span>}
            {warnCount > 0 && <span className="text-xs font-medium bg-muted text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">{warnCount} warning</span>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2,3,4].map((i) => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center">
          <CheckCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">All clear — no alerts</p>
        </div>
      ) : columns && columns.length > 0 ? (
        /* Column-based layout: renders like a colored table */
        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {rows.map((row, i) => {
            const level = urgencyLevel(row);
            const styles = LEVEL_STYLES[level];
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${styles.row}`}>
                {styles.icon}
                <div className="flex-1 min-w-0 flex items-center gap-4">
                  {columns.map((col, ci) => (
                    <span key={col.key} className={`text-sm ${ci === 0 ? "font-medium text-foreground truncate min-w-0 flex-1" : "text-muted-foreground whitespace-nowrap shrink-0"}`}>
                      {fmtCell(row[col.key], col.format)}
                    </span>
                  ))}
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
                  {level === "critical" ? "Critical" : level === "warning" ? "Warning" : "OK"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        /* Legacy layout: auto-detect name/qty/reorderPoint */
        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {rows.map((row, i) => {
            const level = urgencyLevel(row);
            const styles = LEVEL_STYLES[level];
            const name = String(row["product.name"] ?? row.name ?? row.sku ?? row.poNumber ?? row.orderNumber ?? `Item ${i + 1}`);
            const qty = row.quantity !== undefined ? `Qty: ${Number(row.quantity).toLocaleString()}` : null;
            const rp = row.reorderPoint !== undefined ? `Reorder at: ${Number(row.reorderPoint).toLocaleString()}` : null;
            const sub = [qty, rp].filter(Boolean).join(" · ");
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-3 ${styles.row}`}>
                {styles.icon}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{name}</p>
                  {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
                </div>
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
                  {level === "critical" ? "Critical" : level === "warning" ? "Warning" : "OK"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
