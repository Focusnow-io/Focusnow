"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Save, X } from "lucide-react";
import type { WidgetConfig, ColumnDef } from "./types";
import { useAppState } from "./AppStateProvider";
import { useToast } from "./ToastProvider";

interface DetailPanelProps {
  widget: WidgetConfig;
  recordId: string;
  onClose: () => void;
}

function formatValue(v: unknown, format?: string): string {
  if (v === null || v === undefined) return "—";
  if (format === "currency" && typeof v === "number")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
  if (format === "number" && typeof v === "number")
    return new Intl.NumberFormat("en-US").format(v);
  if (format === "date" && typeof v === "string")
    return new Date(v).toLocaleDateString();
  return String(v);
}

const STATUS_VALS = new Set([
  "COMPLETE","COMPLETED","OPEN","PARTIAL","CANCELLED","DRAFT","PURCHASE","SALES","TRANSFER",
  "PENDING","CONFIRMED","IN_TRANSIT","RECEIVED","DELIVERED","SHIPPED","IN_PROGRESS","RELEASED",
  "PLANNED","IN_PRODUCTION","READY","SENT","SUBMITTED","ACTIVE","FAILED","BLOCKED",
  "APPROVED","PREFERRED","CLOSED",
]);

function statusBadge(v: string): string {
  switch (v) {
    case "COMPLETE": case "COMPLETED": case "RECEIVED": case "DELIVERED": return "bg-emerald-100 text-emerald-700";
    case "OPEN": case "ACTIVE": case "CONFIRMED": case "IN_PROGRESS": case "RELEASED": case "SHIPPED": return "bg-blue-100 text-blue-700";
    case "PARTIAL": case "IN_PRODUCTION": case "IN_TRANSIT": case "PLANNED": case "READY": return "bg-amber-100 text-amber-700";
    case "CANCELLED": case "FAILED": case "BLOCKED": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export function DetailPanel({ widget, recordId, onClose }: DetailPanelProps) {
  const appState = useAppState();
  const toast = useToast();
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const columns: ColumnDef[] = widget.display?.columns ?? [];
  const editable = widget.detailEditable !== false;

  // Fetch single record
  useEffect(() => {
    setLoading(true);
    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: {
          ...widget.query,
          filters: [
            ...(widget.query.filters ?? []),
            { field: "id", op: "eq", value: recordId },
          ],
          limit: 1,
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data) && d.data.length > 0) {
          setRecord(d.data[0] as Record<string, unknown>);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [widget.query, recordId]);

  // Only non-nested columns are editable (e.g. "name" but not "product.name")
  const editableColumns = columns.filter((c) => !c.key.includes("."));

  const startEditing = useCallback(() => {
    if (!record) return;
    const vals: Record<string, string> = {};
    for (const col of editableColumns) {
      const v = record[col.key];
      vals[col.key] = v !== null && v !== undefined ? String(v) : "";
    }
    setEditValues(vals);
    setEditing(true);
  }, [record, editableColumns]);

  const handleSave = useCallback(async () => {
    if (!record) return;
    setSaving(true);

    try {
      // Build data with type coercion — only editable (non-nested) columns
      const data: Record<string, unknown> = {};
      for (const col of editableColumns) {
        const val = editValues[col.key];
        if (val === undefined) continue;
        if (col.format === "number" || col.format === "currency") {
          const num = Number(val);
          if (!isNaN(num)) data[col.key] = num;
          else data[col.key] = val;
        } else {
          data[col.key] = val;
        }
      }

      const res = await fetch("/api/apps/widget-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          entity: widget.query.entity,
          id: recordId,
          data,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        toast.error(errData.error ?? "Update failed");
        return;
      }

      toast.success("Record updated");
      setEditing(false);
      // Refresh the record
      setRecord((prev) => (prev ? { ...prev, ...data } : prev));
      appState.triggerRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }, [record, editableColumns, editValues, widget.query.entity, recordId, toast, appState]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-out panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{widget.title}</h2>
          <div className="flex items-center gap-2">
            {editable && !editing && record && (
              <button
                onClick={startEditing}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            {editing && (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  <div className="h-8 bg-gray-50 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ) : !record ? (
            <div className="text-center text-sm text-gray-400 py-10">Record not found</div>
          ) : (
            <div className="space-y-4">
              {columns.map((col) => {
                const val = record[col.key];
                const isStatus = typeof val === "string" && STATUS_VALS.has(val);
                const isNested = col.key.includes(".");
                const isEditable = editing && !isNested;

                return (
                  <div key={col.key}>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      {col.label}
                      {isNested && editing && <span className="text-gray-300 ml-1 normal-case">(read-only)</span>}
                    </label>
                    {isEditable ? (
                      <input
                        type={col.format === "number" || col.format === "currency" ? "number" : "text"}
                        value={editValues[col.key] ?? ""}
                        onChange={(e) => setEditValues((prev) => ({ ...prev, [col.key]: e.target.value }))}
                        step={col.format === "number" || col.format === "currency" ? "any" : undefined}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                      />
                    ) : isStatus ? (
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusBadge(val as string)}`}>
                        {val as string}
                      </span>
                    ) : (
                      <p className="text-sm text-gray-900 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                        {formatValue(val, col.format)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
