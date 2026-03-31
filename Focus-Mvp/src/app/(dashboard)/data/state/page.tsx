"use client";

import { useEffect, useState, useCallback } from "react";
import { Activity, RefreshCw, AlertTriangle, CheckCircle, Package, Truck, Warehouse, ShoppingCart } from "lucide-react";

interface OperationalAlert {
  entityType: string;
  entityId: string;
  entityLabel: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
}

interface OperationalState {
  organizationId: string;
  snapshotAt: string;
  summary: {
    activeProducts: number;
    activeSuppliers: number;
    activeLocations: number;
    openOrders: number;
    lowStockItems: number;
    pendingRelationships: number;
  };
  alerts: OperationalAlert[];
}

const SEVERITY_STYLES = {
  CRITICAL: "bg-red-50 border-red-300 text-red-800",
  HIGH:     "bg-orange-50 border-orange-300 text-orange-800",
  MEDIUM:   "bg-yellow-50 border-yellow-200 text-yellow-800",
  LOW:      "bg-blue-50 border-blue-200 text-blue-800",
};

const SEVERITY_DOT = {
  CRITICAL: "bg-red-500",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-yellow-500",
  LOW:      "bg-blue-400",
};

export default function LiveStatePage() {
  const [state, setState] = useState<OperationalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ode/state");
      if (!res.ok) throw new Error(await res.text());
      setState(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchState(); }, [fetchState]);

  const snapshotAt = state?.snapshotAt
    ? new Date(state.snapshotAt).toLocaleTimeString()
    : null;

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-500" />
            Live Operational State
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Current operational snapshot
            {snapshotAt && <> · as of {snapshotAt}</>}
          </p>
        </div>
        <button
          onClick={fetchState}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Summary cards */}
      {state && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <SummaryCard icon={Package} label="Products" value={state.summary.activeProducts} color="blue" />
          <SummaryCard icon={Truck} label="Suppliers" value={state.summary.activeSuppliers} color="purple" />
          <SummaryCard icon={Warehouse} label="Locations" value={state.summary.activeLocations} color="green" />
          <SummaryCard icon={ShoppingCart} label="Open Orders" value={state.summary.openOrders} color="yellow" />
          <SummaryCard
            icon={AlertTriangle}
            label="Low Stock"
            value={state.summary.lowStockItems}
            color={state.summary.lowStockItems > 0 ? "red" : "green"}
          />
        </div>
      )}

      {/* Alerts */}
      {state && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Operational Alerts
            <span className="ml-auto text-xs font-normal text-gray-400">
              {state.alerts.length} alert{state.alerts.length !== 1 ? "s" : ""}
            </span>
          </h2>

          {state.alerts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <CheckCircle className="w-4 h-4" />
              All operational metrics are within normal thresholds.
            </div>
          ) : (
            <div className="space-y-2">
              {state.alerts.map((alert) => (
                <div
                  key={alert.entityId}
                  className={`flex items-start gap-3 border rounded-lg px-4 py-3 text-sm ${SEVERITY_STYLES[alert.severity]}`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[alert.severity]}`} />
                  <div>
                    <span className="font-semibold">{alert.entityLabel}</span>
                    <span className="ml-2 text-xs uppercase font-bold opacity-60">{alert.severity}</span>
                    <p className="mt-0.5 opacity-90">{alert.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const COLOR_MAP = {
  blue:   "bg-blue-50 text-blue-700 border-blue-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
  green:  "bg-green-50 text-green-700 border-green-200",
  yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
  red:    "bg-red-50 text-red-700 border-red-200",
} as const;

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: keyof typeof COLOR_MAP;
}) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-2 ${COLOR_MAP[color]}`}>
      <Icon className="w-5 h-5 opacity-70" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs font-medium opacity-70">{label}</div>
    </div>
  );
}
