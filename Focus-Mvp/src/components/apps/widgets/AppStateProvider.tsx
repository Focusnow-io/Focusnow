"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { DataFilter } from "./types";

// ---------------------------------------------------------------------------
// Shared state shape
// ---------------------------------------------------------------------------

interface AppState {
  /** Filters emitted by filter_bar widgets, keyed by emitting widget ID */
  filters: Record<string, DataFilter[]>;
  /** Currently selected row (from table click or chart click), keyed by source widget ID */
  selections: Record<string, { field: string; value: unknown }>;
  /** Refresh counter — bumped after a mutation to re-fetch data */
  refreshKey: number;
  /** Simulation parameters emitted by simulator widgets, keyed by widget ID */
  simParams: Record<string, Record<string, unknown>>;
}

interface AppStateAPI {
  state: AppState;
  setFilters: (widgetId: string, filters: DataFilter[]) => void;
  setSelection: (widgetId: string, field: string, value: unknown) => void;
  clearSelection: (widgetId: string) => void;
  triggerRefresh: () => void;
  /** Get the merged filters a widget should apply (from its listenTo interactions) */
  getFiltersFor: (listenTo: string[]) => DataFilter[];
  /** Set simulation parameters for a simulator widget */
  setSimParams: (widgetId: string, params: Record<string, unknown>) => void;
  /** Get merged simulation parameters from all listened-to sources */
  getSimParamsFor: (listenTo: string[]) => Record<string, unknown>;
}

const AppStateContext = createContext<AppStateAPI | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [filters, setFiltersState] = useState<Record<string, DataFilter[]>>({});
  const [selections, setSelections] = useState<Record<string, { field: string; value: unknown }>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [simParams, setSimParamsState] = useState<Record<string, Record<string, unknown>>>({});

  const setFilters = useCallback((widgetId: string, f: DataFilter[]) => {
    setFiltersState((prev) => ({ ...prev, [widgetId]: f }));
  }, []);

  const setSelection = useCallback((widgetId: string, field: string, value: unknown) => {
    setSelections((prev) => ({ ...prev, [widgetId]: { field, value } }));
  }, []);

  const clearSelection = useCallback((widgetId: string) => {
    setSelections((prev) => {
      const next = { ...prev };
      delete next[widgetId];
      return next;
    });
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const setSimParams = useCallback((widgetId: string, params: Record<string, unknown>) => {
    setSimParamsState((prev) => {
      const next: Record<string, Record<string, unknown>> = { ...prev };
      next[widgetId] = params;
      return next;
    });
  }, []);

  const getSimParamsFor = useCallback((listenTo: string[]): Record<string, unknown> => {
    const merged: Record<string, unknown> = {};
    for (const id of listenTo) {
      if (simParams[id]) Object.assign(merged, simParams[id]);
    }
    return merged;
  }, [simParams]);

  const getFiltersFor = useCallback((listenTo: string[]): DataFilter[] => {
    const merged: DataFilter[] = [];
    for (const id of listenTo) {
      if (filters[id]) merged.push(...filters[id]);
      if (selections[id]) {
        merged.push({
          field: selections[id].field,
          op: "eq",
          value: selections[id].value,
        });
      }
    }
    return merged;
  }, [filters, selections]);

  const api = useMemo<AppStateAPI>(() => ({
    state: { filters, selections, refreshKey, simParams },
    setFilters,
    setSelection,
    clearSelection,
    triggerRefresh,
    getFiltersFor,
    setSimParams,
    getSimParamsFor,
  }), [filters, selections, refreshKey, simParams, setFilters, setSelection, clearSelection, triggerRefresh, getFiltersFor, setSimParams, getSimParamsFor]);

  return (
    <AppStateContext.Provider value={api}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppStateAPI {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside AppStateProvider");
  return ctx;
}
