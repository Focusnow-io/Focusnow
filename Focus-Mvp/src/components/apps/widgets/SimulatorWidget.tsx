"use client";

import { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import type { WidgetConfig, SimulatorParameter } from "./types";
import { useAppState } from "./AppStateProvider";

function ParameterControl({
  param,
  value,
  onChange,
}: {
  param: SimulatorParameter;
  value: number | string;
  onChange: (key: string, value: number | string) => void;
}) {
  if (param.type === "slider") {
    const numValue = typeof value === "number" ? value : Number(value) || 0;
    const min = param.min ?? 0;
    const max = param.max ?? 10000;
    const step = param.step ?? 1;

    return (
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-foreground">{param.label}</label>
          <span className="text-sm font-semibold text-foreground tabular-nums">
            {numValue.toLocaleString()}{param.unit ? ` ${param.unit}` : ""}
          </span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={numValue}
          onChange={(e) => onChange(param.key, Number(e.target.value))}
          className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-600"
        />
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">{min.toLocaleString()}{param.unit ? ` ${param.unit}` : ""}</span>
          <span className="text-xs text-muted-foreground">{max.toLocaleString()}{param.unit ? ` ${param.unit}` : ""}</span>
        </div>
      </div>
    );
  }

  if (param.type === "number") {
    const numValue = typeof value === "number" ? value : Number(value) || 0;
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{param.label}</label>
        <div className="relative">
          <input
            type="number"
            value={numValue}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            onChange={(e) => onChange(param.key, Number(e.target.value))}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-muted focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
          />
          {param.unit && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {param.unit}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (param.type === "select") {
    return (
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">{param.label}</label>
        <select
          value={String(value)}
          onChange={(e) => onChange(param.key, e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-muted focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400"
        >
          <option value="">Select...</option>
          {(param.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

export function SimulatorWidget({ widget }: { widget: WidgetConfig }) {
  const { setSimParams } = useAppState();
  const config = widget.simulatorConfig;
  const parameters = config?.parameters ?? [];

  // Initialize values from defaults
  const [values, setValues] = useState<Record<string, number | string>>(() => {
    const init: Record<string, number | string> = {};
    for (const p of parameters) {
      if (p.defaultValue !== undefined) {
        init[p.key] = p.defaultValue;
      } else if (p.type === "slider" || p.type === "number") {
        init[p.key] = p.min ?? 0;
      } else {
        init[p.key] = "";
      }
    }
    return init;
  });

  // Emit sim params on mount and on change
  const emitParams = useCallback((newValues: Record<string, number | string>) => {
    setSimParams(widget.id, newValues as Record<string, unknown>);
  }, [setSimParams, widget.id]);

  useEffect(() => {
    emitParams(values);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((key: string, value: number | string) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      emitParams(next);
      return next;
    });
  }, [emitParams]);

  if (!config || parameters.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No simulator parameters configured.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-purple-500" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {widget.title}
        </p>
      </div>

      {/* Parameters */}
      <div className="px-5 py-4 space-y-5">
        {parameters.map((param) => (
          <ParameterControl
            key={param.key}
            param={param}
            value={values[param.key] ?? 0}
            onChange={handleChange}
          />
        ))}
      </div>
    </div>
  );
}
