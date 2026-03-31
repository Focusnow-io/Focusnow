"use client";

import { useEffect, useMemo, useState } from "react";
import type { WidgetConfig } from "./types";
import { useAppState } from "./AppStateProvider";

const COLOR_MAP: Record<string, { bar: string; bg: string; text: string }> = {
  blue:   { bar: "bg-blue-500",   bg: "bg-blue-100",   text: "text-blue-700" },
  green:  { bar: "bg-emerald-500", bg: "bg-emerald-100", text: "text-emerald-700" },
  red:    { bar: "bg-red-500",    bg: "bg-red-100",    text: "text-red-700" },
  amber:  { bar: "bg-amber-500",  bg: "bg-amber-100",  text: "text-amber-700" },
  purple: { bar: "bg-purple-500", bg: "bg-purple-100", text: "text-purple-700" },
};

function fmt(v: number, format?: string): string {
  if (format === "currency") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (format === "percentage") return `${v.toFixed(1)}%`;
  return new Intl.NumberFormat("en-US").format(v);
}

export function ProgressBarWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
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
      .then((d) => {
        const raw = d.data as { value?: number } | null;
        if (raw && typeof raw === "object" && "value" in raw) setValue(Number(raw.value));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [mergedQuery, appState.state.refreshKey]);

  const target = widget.display?.targetValue ?? 100;
  const pct = value !== null ? Math.min(Math.round((value / target) * 100), 100) : 0;
  const color = COLOR_MAP[widget.display?.color ?? "blue"] ?? COLOR_MAP.blue;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{widget.title}</p>
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-20 bg-gray-100 rounded-md animate-pulse" />
          <div className="h-2.5 w-full bg-gray-100 rounded-full animate-pulse" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums text-gray-900">
              {value !== null ? fmt(value, widget.display?.format) : "—"}
            </p>
            {target !== 100 && (
              <p className="text-xs text-gray-400">/ {fmt(target, widget.display?.format)}</p>
            )}
          </div>
          <div className={`w-full h-2.5 rounded-full ${color.bg}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${color.bar}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {widget.display?.description && (
            <p className="text-xs text-gray-400">{widget.display.description}</p>
          )}
        </>
      )}
    </div>
  );
}
