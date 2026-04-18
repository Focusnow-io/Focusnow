"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Loader2, Search, Trash2 } from "lucide-react";
import type { WidgetConfig, DataFilter, RowAction } from "./types";
import { useAppState } from "./AppStateProvider";
import { useToast } from "./ToastProvider";
import { useConfirm } from "./ConfirmModal";
import { DetailPanel } from "./DetailPanel";

const PAGE_SIZE = 15;

function fmtCell(v: unknown, format?: string): string {
  if (v === null || v === undefined) return "—";
  if (format === "currency" && typeof v === "number")
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
  if (format === "number" && typeof v === "number") return new Intl.NumberFormat("en-US").format(v);
  if (format === "date" && typeof v === "string") return new Date(v).toLocaleDateString();
  return String(v);
}

function statusBadge(v: string): string {
  switch (v) {
    case "COMPLETE": case "COMPLETED": case "RECEIVED": case "DELIVERED": return "bg-emerald-100 text-emerald-700";
    case "OPEN": case "ACTIVE": case "CONFIRMED": case "IN_PROGRESS": case "RELEASED": case "SHIPPED": return "bg-blue-100 text-blue-700";
    case "PARTIAL": case "IN_PRODUCTION": case "IN_TRANSIT": case "PLANNED": case "READY": return "bg-amber-100 text-amber-700";
    case "CANCELLED": case "FAILED": case "BLOCKED": return "bg-red-100 text-red-700";
    case "DRAFT": case "PENDING": case "SENT": case "SUBMITTED": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

const STATUS_VALS = new Set([
  "COMPLETE","COMPLETED","OPEN","PARTIAL","CANCELLED","DRAFT","PURCHASE","SALES","TRANSFER",
  "PENDING","CONFIRMED","IN_TRANSIT","RECEIVED","DELIVERED","SHIPPED","IN_PROGRESS","RELEASED",
  "PLANNED","IN_PRODUCTION","READY","SENT","SUBMITTED","ACTIVE","FAILED","BLOCKED",
  "APPROVED","PREFERRED","CLOSED",
]);

const ACTION_COLORS: Record<string, string> = {
  blue:  "text-blue-600 hover:bg-blue-50 border-blue-200",
  green: "text-emerald-600 hover:bg-emerald-50 border-emerald-200",
  red:   "text-red-600 hover:bg-red-50 border-red-200",
  amber: "text-amber-600 hover:bg-amber-50 border-amber-200",
  gray:  "text-muted-foreground hover:bg-muted border-border",
};

function shouldShowAction(action: RowAction, row: Record<string, unknown>): boolean {
  if (!action.showWhen) return true;
  const { field, op, value } = action.showWhen;
  const rowVal = row[field];
  switch (op) {
    case "eq": return rowVal === value;
    case "ne": return rowVal !== value;
    case "contains": return typeof rowVal === "string" && rowVal.includes(String(value));
    default: return true;
  }
}

export function TableWidget({ widget }: { widget: WidgetConfig }) {
  const appState = useAppState();
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  // Enhanced features state
  const [searchTerm, setSearchTerm] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const columns = widget.display?.columns ?? [];
  const actions = widget.actions ?? [];
  const hasActions = actions.length > 0;
  const listenTo = widget.interactions?.listenTo ?? [];
  const clickTarget = widget.interactions?.onClick;
  const enableSearch = widget.tableSearch !== false;
  const enableBulkSelect = widget.bulkActions === true;

  // Get dynamic filters from AppState
  const externalFilters = useMemo(() => {
    if (!listenTo.length) return [];
    return appState.getFiltersFor(listenTo);
  }, [listenTo, appState]);

  // Merge query filters with external filters
  const mergedQuery = useMemo(() => {
    if (!externalFilters.length) return widget.query;
    const existing = widget.query.filters ?? [];
    return { ...widget.query, filters: [...existing, ...externalFilters] };
  }, [widget.query, externalFilters]);

  // Fetch data
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

  // Reset page when search/sort changes
  useEffect(() => { setPage(0); }, [searchTerm, sortCol, sortDir]);

  // Client-side search
  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => {
        const v = row[col.key];
        return v !== null && v !== undefined && String(v).toLowerCase().includes(term);
      })
    );
  }, [rows, searchTerm, columns]);

  // Client-side sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Sort toggle
  const toggleSort = useCallback((key: string) => {
    if (sortCol === key) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(key);
      setSortDir("asc");
    }
  }, [sortCol]);

  // Bulk select
  const toggleSelectAll = useCallback(() => {
    if (selected.size === paged.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(paged.map((r) => String(r.id ?? "")).filter(Boolean)));
    }
  }, [paged, selected.size]);

  const toggleSelectRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Bulk delete
  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const confirmed = await confirm({
      title: "Delete Records",
      message: `Delete ${selected.size} selected record${selected.size > 1 ? "s" : ""}? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!confirmed) return;

    setActionLoading("bulk-delete");
    try {
      for (const id of selected) {
        await fetch("/api/apps/widget-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", entity: widget.query.entity, id }),
        });
      }
      toast.success(`Deleted ${selected.size} record${selected.size > 1 ? "s" : ""}`);
      setSelected(new Set());
      appState.triggerRefresh();
    } catch {
      toast.error("Bulk delete failed");
    } finally {
      setActionLoading(null);
    }
  }, [selected, confirm, widget.query.entity, toast, appState]);

  // Handle action button click
  const handleAction = useCallback(async (action: RowAction, row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    if (!id) return;

    if (action.confirm) {
      const confirmed = await confirm({
        title: action.type === "delete" ? "Delete Record" : `${action.label}`,
        message: `Are you sure you want to ${action.label.toLowerCase()} this record?`,
        confirmLabel: action.label,
        variant: action.type === "delete" ? "danger" : "warning",
      });
      if (!confirmed) return;
    }

    setActionLoading(`${id}-${action.label}`);

    try {
      const payload: Record<string, unknown> = {
        entity: widget.query.entity,
        id,
      };

      if (action.type === "updateStatus") {
        payload.action = "updateStatus";
        payload.status = action.targetStatus;
      } else if (action.type === "delete") {
        payload.action = "delete";
      }

      const res = await fetch("/api/apps/widget-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        toast.error(errData.error ?? "Action failed");
        return;
      }

      toast.success(`${action.label} completed successfully`);
      appState.triggerRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActionLoading(null);
    }
  }, [widget.query.entity, appState, toast, confirm]);

  // Row click: either open detail panel, or emit selection
  const handleRowClick = useCallback((row: Record<string, unknown>) => {
    if (widget.detailPanel && row.id) {
      setDetailRecordId(String(row.id));
      return;
    }
    if (!clickTarget) return;
    const value = row[clickTarget.filterField];
    if (value !== undefined) {
      appState.setSelection(widget.id, clickTarget.filterField, value);
    }
  }, [widget.detailPanel, clickTarget, appState, widget.id]);

  const isClickable = !!clickTarget || !!widget.detailPanel;

  return (
    <>
    {detailRecordId && (
      <DetailPanel
        widget={widget}
        recordId={detailRecordId}
        onClose={() => setDetailRecordId(null)}
      />
    )}
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{widget.title}</p>
          {widget.display?.description && <p className="text-xs text-muted-foreground mt-0.5">{widget.display.description}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {enableBulkSelect && selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              disabled={!!actionLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3 h-3" />
              Delete ({selected.size})
            </button>
          )}
          {enableSearch && !loading && rows.length > 5 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search..."
                className="pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-muted focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-44"
              />
            </div>
          )}
          {!loading && <span className="text-xs text-muted-foreground">{sorted.length} rows</span>}
        </div>
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="h-8 bg-muted rounded animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          {searchTerm ? "No matching records" : "No data"}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  {enableBulkSelect && (
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === paged.length && paged.length > 0}
                        onChange={toggleSelectAll}
                        className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {sortCol === col.key ? (
                          sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronUp className="w-3 h-3 opacity-0 group-hover:opacity-30" />
                        )}
                      </span>
                    </th>
                  ))}
                  {hasActions && (
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase whitespace-nowrap">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map((row, ri) => {
                  const rowId = String(row.id ?? ri);
                  const isSelected = selected.has(rowId);
                  return (
                    <tr
                      key={ri}
                      className={`hover:bg-muted/60 transition-colors ${isClickable ? "cursor-pointer" : ""} ${isSelected ? "bg-blue-50/40" : ""}`}
                      onClick={isClickable ? () => handleRowClick(row) : undefined}
                    >
                      {enableBulkSelect && (
                        <td className="px-3 py-2.5 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(rowId)}
                            className="w-3.5 h-3.5 rounded border-border text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      )}
                      {columns.map((col) => {
                        const val = row[col.key];
                        const isStatus = typeof val === "string" && STATUS_VALS.has(val);
                        return (
                          <td key={col.key} className="px-4 py-2.5 text-foreground whitespace-nowrap">
                            {isStatus ? (
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(val as string)}`}>
                                {val as string}
                              </span>
                            ) : fmtCell(val, col.format)}
                          </td>
                        );
                      })}
                      {hasActions && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {actions.filter((a) => shouldShowAction(a, row)).map((action) => {
                              const colorClass = ACTION_COLORS[action.color ?? "gray"] ?? ACTION_COLORS.gray;
                              const isLoading = actionLoading === `${row.id}-${action.label}`;
                              return (
                                <button
                                  key={action.label}
                                  onClick={(e) => { e.stopPropagation(); handleAction(action, row); }}
                                  disabled={!!actionLoading}
                                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${colorClass}`}
                                >
                                  {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                  {action.label}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground px-2">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
