"use client";

import { useCallback, useEffect, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import type { WidgetConfig, DataFilter, FilterOption } from "./types";
import { useAppState } from "./AppStateProvider";

// Fetch distinct values for a "select" filter option
async function fetchOptions(opt: FilterOption): Promise<string[]> {
  if (opt.type !== "select" || !opt.entity) return [];
  try {
    const res = await fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          entity: opt.entity,
          aggregation: "count",
          groupBy: opt.optionsField ?? opt.field,
          limit: 50,
        },
      }),
    });
    const data = await res.json();
    if (Array.isArray(data.data)) {
      return (data.data as { label: string }[]).map((r) => r.label).filter(Boolean).sort();
    }
  } catch {
    // ignore
  }
  return [];
}

export function FilterBarWidget({ widget }: { widget: WidgetConfig }) {
  const { setFilters } = useAppState();
  const options = widget.filterOptions ?? [];

  // Track current values per filter option
  const [values, setValues] = useState<Record<string, string>>({});
  // Track available options for select filters
  const [selectOptions, setSelectOptions] = useState<Record<string, string[]>>({});
  // Track search input
  const [searchInput, setSearchInput] = useState("");

  // Fetch select options on mount
  useEffect(() => {
    for (const opt of options) {
      if (opt.type === "select") {
        fetchOptions(opt).then((opts) => {
          setSelectOptions((prev) => ({ ...prev, [opt.field]: opts }));
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emit filter changes
  const emitFilters = useCallback((newValues: Record<string, string>, search: string) => {
    const filters: DataFilter[] = [];
    for (const opt of options) {
      const val = opt.type === "search" ? search : newValues[opt.field];
      if (!val) continue;
      if (opt.type === "search") {
        filters.push({ field: opt.field, op: "contains", value: val });
      } else if (opt.type === "select") {
        filters.push({ field: opt.field, op: "eq", value: val });
      } else if (opt.type === "date_range") {
        // date_range expects "YYYY-MM-DD" value, filters as gte
        filters.push({ field: opt.field, op: "gte", value: val });
      }
    }
    setFilters(widget.id, filters);
  }, [options, setFilters, widget.id]);

  function handleSelectChange(field: string, value: string) {
    const next = { ...values, [field]: value };
    if (!value) delete next[field];
    setValues(next);
    emitFilters(next, searchInput);
  }

  function handleSearchChange(field: string, value: string) {
    setSearchInput(value);
    emitFilters(values, value);
  }

  function clearAll() {
    setValues({});
    setSearchInput("");
    setFilters(widget.id, []);
  }

  const hasActive = Object.keys(values).length > 0 || searchInput.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{widget.title}</p>
        {hasActive && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {options.map((opt) => {
          if (opt.type === "search") {
            return (
              <div key={opt.field} className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={opt.label}
                  value={searchInput}
                  onChange={(e) => handleSearchChange(opt.field, e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-muted"
                />
              </div>
            );
          }

          if (opt.type === "select") {
            const opts = selectOptions[opt.field] ?? [];
            return (
              <select
                key={opt.field}
                value={values[opt.field] ?? ""}
                onChange={(e) => handleSelectChange(opt.field, e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-muted focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 min-w-[140px]"
              >
                <option value="">{opt.label}</option>
                {opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            );
          }

          if (opt.type === "date_range") {
            return (
              <input
                key={opt.field}
                type="date"
                value={values[opt.field] ?? ""}
                onChange={(e) => handleSelectChange(opt.field, e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-muted focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                title={opt.label}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
