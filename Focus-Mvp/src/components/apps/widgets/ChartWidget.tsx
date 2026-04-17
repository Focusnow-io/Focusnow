"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";
import type { WidgetConfig } from "./types";
import { useAppState } from "./AppStateProvider";

const PALETTE = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#84cc16","#ec4899","#6366f1"];

type ChartRow = { label: string; value: number };

function fmtAxis(v: number, format?: string): string {
  const abs = Math.abs(v);
  const prefix = format === "currency" ? "$" : "";
  if (abs >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${(v / 1_000).toFixed(0)}K`;
  return `${prefix}${v}`;
}

function fmtTooltip(v: number, format?: string): string {
  if (format === "currency")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  return new Intl.NumberFormat("en-US").format(v);
}

function Skeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="h-3 w-28 bg-gray-100 rounded animate-pulse mb-4" />
      <div className="h-44 bg-gray-50 rounded-lg animate-pulse" />
    </div>
  );
}

export function ChartWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const [rows, setRows] = useState<ChartRow[]>([]);
  const [loading, setLoading] = useState(true);
  const fmt = widget.display?.format;
  const listenTo = widget.interactions?.listenTo ?? [];
  const clickTarget = widget.interactions?.onClick;

  // External filters from filter_bar
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
    const labelField = widget.display?.labelField ?? "label";
    const valueField = widget.display?.valueField ?? "value";

    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: mergedQuery }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) {
          setRows(
            (d.data as Record<string, unknown>[]).map((r) => ({
              label: String(r[labelField] ?? ""),
              value: Number(r[valueField] ?? 0),
            }))
          );
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mergedQuery, widget.display?.labelField, widget.display?.valueField, appState.state.refreshKey]);

  // Handle bar/pie click → emit selection
  const handleClick = useCallback((data: ChartRow) => {
    if (!clickTarget) return;
    appState.setSelection(widget.id, clickTarget.filterField, data.label);
  }, [clickTarget, appState, widget.id]);

  if (loading) return <Skeleton />;

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center justify-center min-h-[9rem] gap-2">
        <p className="text-xs font-semibold uppercase text-gray-400">{widget.title}</p>
        <p className="text-sm text-gray-400">No data available</p>
      </div>
    );
  }

  const tooltipFmt = (v: unknown) => fmtTooltip(Number(v ?? 0), fmt);
  const isClickable = !!clickTarget;
  const cursorStyle = isClickable ? "pointer" : "default";
  const colorMap = widget.display?.colorMap ?? {};
  const getColor = (label: string, idx: number) => colorMap[label] ?? PALETTE[idx % PALETTE.length];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase text-gray-500 mb-1">{widget.title}</p>
      {widget.display?.description && <p className="text-xs text-gray-400 mb-3">{widget.display.description}</p>}

      {widget.type === "bar_chart" && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtAxis(v, fmt)} width={50} />
            <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Bar
              dataKey="value"
              radius={[4, 4, 0, 0]}
              cursor={cursorStyle}
              onClick={isClickable ? (_: unknown, idx: number) => handleClick(rows[idx]) : undefined}
            >
              {rows.map((row, i) => <Cell key={i} fill={getColor(row.label, i)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {widget.type === "pie_chart" && (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="45%"
              outerRadius={75}
              labelLine={false}
              cursor={cursorStyle}
              onClick={isClickable ? (_: unknown, idx: number) => handleClick(rows[idx]) : undefined}
            >
              {rows.map((row, i) => <Cell key={i} fill={getColor(row.label, i)} />)}
            </Pie>
            <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {widget.type === "line_chart" && (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} tickFormatter={(v) => fmtAxis(v, fmt)} width={50} />
            <Tooltip formatter={tooltipFmt} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
            <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2.5} dot={{ r: 3, fill: PALETTE[0] }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
