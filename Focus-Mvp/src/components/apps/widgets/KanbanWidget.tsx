"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GripVertical, Loader2 } from "lucide-react";
import type { WidgetConfig } from "./types";
import { useAppState } from "./AppStateProvider";
import { useToast } from "./ToastProvider";

const COLUMN_COLORS: string[] = [
  "border-t-gray-400",
  "border-t-blue-400",
  "border-t-amber-400",
  "border-t-emerald-400",
  "border-t-purple-400",
  "border-t-red-400",
  "border-t-cyan-400",
  "border-t-pink-400",
];

function statusColor(status: string): string {
  switch (status) {
    case "COMPLETE": case "COMPLETED": case "RECEIVED": case "DELIVERED": return "bg-emerald-100 text-emerald-700";
    case "OPEN": case "ACTIVE": case "CONFIRMED": case "IN_PROGRESS": case "RELEASED": case "SHIPPED": return "bg-blue-100 text-blue-700";
    case "PARTIAL": case "IN_PRODUCTION": case "IN_TRANSIT": case "PLANNED": case "READY": return "bg-amber-100 text-amber-700";
    case "CANCELLED": case "FAILED": case "BLOCKED": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export function KanbanWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const statusField = widget.kanbanStatusField ?? "status";
  const columns = widget.kanbanColumns ?? [];
  const titleField = widget.kanbanTitleField ?? "name";
  const cardFields = widget.kanbanCardFields ?? [];

  // Fetch data
  useEffect(() => {
    setLoading(true);
    fetch("/api/apps/widget-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: widget.query }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.data)) setRows(d.data as Record<string, unknown>[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [widget.query, appState.state.refreshKey]);

  // Group rows by status column
  const grouped = useMemo(() => {
    const map = new Map<string, Record<string, unknown>[]>();
    for (const col of columns) map.set(col, []);
    for (const row of rows) {
      const status = String(row[statusField] ?? "");
      const list = map.get(status);
      if (list) list.push(row);
      else {
        // Put in first column if status doesn't match
        const first = map.get(columns[0]);
        if (first) first.push(row);
      }
    }
    return map;
  }, [rows, columns, statusField]);

  // Drag and drop handlers
  const handleDragStart = useCallback((id: string) => {
    setDragging(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, column: string) => {
    e.preventDefault();
    setDragOver(column);
  }, []);

  const handleDrop = useCallback(async (targetColumn: string) => {
    if (!dragging) return;
    setDragOver(null);
    setDragging(null);

    const row = rows.find((r) => String(r.id) === dragging);
    if (!row || String(row[statusField]) === targetColumn) return;

    setUpdating(dragging);

    try {
      const res = await fetch("/api/apps/widget-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateStatus",
          entity: widget.query.entity,
          id: dragging,
          status: targetColumn,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        toast.error(errData.error ?? "Status update failed");
        return;
      }

      // Optimistic update
      setRows((prev) =>
        prev.map((r) =>
          String(r.id) === dragging ? { ...r, [statusField]: targetColumn } : r
        )
      );
      toast.success(`Moved to ${targetColumn}`);
      appState.triggerRefresh();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setUpdating(null);
    }
  }, [dragging, rows, statusField, widget.query.entity, toast, appState]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <p className="text-xs font-semibold uppercase text-gray-500">{widget.title}</p>
        {widget.display?.description && <p className="text-xs text-gray-400 mt-0.5">{widget.display.description}</p>}
      </div>

      {loading ? (
        <div className="p-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex gap-3 p-4 overflow-x-auto min-h-[300px]">
          {columns.map((col, ci) => {
            const colRows = grouped.get(col) ?? [];
            const isDragTarget = dragOver === col;

            return (
              <div
                key={col}
                className={`flex-1 min-w-[200px] max-w-[280px] rounded-xl bg-gray-50 border-t-4 ${COLUMN_COLORS[ci % COLUMN_COLORS.length]} ${
                  isDragTarget ? "ring-2 ring-blue-300 bg-blue-50/30" : ""
                }`}
                onDragOver={(e) => handleDragOver(e, col)}
                onDragLeave={() => setDragOver(null)}
                onDrop={() => handleDrop(col)}
              >
                {/* Column header */}
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(col)}`}>
                    {col}
                  </span>
                  <span className="text-xs text-gray-400 font-medium">{colRows.length}</span>
                </div>

                {/* Cards */}
                <div className="px-2 pb-2 space-y-2 min-h-[100px]">
                  {colRows.map((row) => {
                    const rowId = String(row.id ?? "");
                    const isUpdating = updating === rowId;

                    return (
                      <div
                        key={rowId}
                        draggable={!isUpdating}
                        onDragStart={() => handleDragStart(rowId)}
                        className={`bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${
                          isUpdating ? "opacity-50" : ""
                        } ${dragging === rowId ? "opacity-30" : ""}`}
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {String(row[titleField] ?? "Untitled")}
                            </p>
                            {cardFields.map((field) => {
                              const val = row[field];
                              if (val === null || val === undefined) return null;
                              return (
                                <p key={field} className="text-xs text-gray-500 truncate mt-0.5">
                                  {String(val)}
                                </p>
                              );
                            })}
                          </div>
                          {isUpdating && <Loader2 className="w-3 h-3 animate-spin text-gray-400 shrink-0" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
