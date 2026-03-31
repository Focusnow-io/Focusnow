"use client";

import { useEffect, useMemo, useState } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { WidgetConfig } from "./types";
import { useAppState } from "./AppStateProvider";

function fmt(v: number, format?: string): string {
  if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (format === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("en-US").format(v);
}

// Simple SVG sparkline — no external charting library needed
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;

  const width = 120;
  const height = 32;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * (width - padding * 2);
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const fillPoints = [
    `${padding},${height}`,
    ...points,
    `${width - padding},${height}`,
  ].join(" ");

  return (
    <svg width={width} height={height} className="shrink-0">
      <polygon points={fillPoints} fill={color} opacity={0.1} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function StatCardWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sparkData, setSparkData] = useState<number[]>([]);
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

  // Fetch main value
  useEffect(() => {
    setLoading(true);
    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mergedQuery }),
    })
      .then((r) => r.json())
      .then((d) => {
        const raw = d.data as { value?: number } | null;
        if (raw && typeof raw === "object" && "value" in raw) setValue(Number(raw.value));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mergedQuery, appState.state.refreshKey]);

  // Fetch sparkline data
  useEffect(() => {
    if (!widget.sparkline) return;
    const { entity, dateField, valueField, aggregation, timeBucket, periods } = widget.sparkline;

    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          entity,
          aggregation,
          field: valueField,
          groupBy: dateField,
          timeBucket,
          limit: periods ?? 12,
          sort: { field: dateField, dir: "asc" },
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) {
          const values = (d.data as { value: number }[]).map((r) => Number(r.value) || 0);
          setSparkData(values);
        }
      })
      .catch(() => {});
  }, [widget.sparkline, appState.state.refreshKey]);

  // Compute trend (compare last two spark values)
  const trend = useMemo(() => {
    if (sparkData.length < 2) return null;
    const curr = sparkData[sparkData.length - 1];
    const prev = sparkData[sparkData.length - 2];
    if (prev === 0) return null;
    const pct = ((curr - prev) / prev) * 100;
    return { pct, up: pct >= 0 };
  }, [sparkData]);

  const sparkColor = trend ? (trend.up ? "#10b981" : "#ef4444") : "#6b7280";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{widget.title}</p>
          <p className="text-3xl font-bold tabular-nums text-gray-900">
            {loading ? (
              <span className="inline-block w-24 h-9 bg-gray-100 rounded-md animate-pulse" />
            ) : value !== null ? fmt(value, widget.display?.format) : "—"}
          </p>
          <div className="flex items-center gap-2">
            {trend && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${trend.up ? "text-emerald-600" : "text-red-600"}`}>
                {trend.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {Math.abs(trend.pct).toFixed(1)}%
              </span>
            )}
            {widget.display?.description && (
              <p className="text-xs text-gray-400">{widget.display.description}</p>
            )}
          </div>
        </div>

        {sparkData.length > 1 && (
          <Sparkline data={sparkData} color={sparkColor} />
        )}
      </div>
    </div>
  );
}
