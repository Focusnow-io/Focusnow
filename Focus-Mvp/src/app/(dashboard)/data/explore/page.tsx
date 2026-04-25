"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Entity catalogue ───────────────────────────────────────────────────────────
//
// The 8 canonical concepts from the import hub, grouped for the Explorer
// sidebar. Keys line up with DATASETS names in src/lib/ingestion/datasets.ts
// and map to ImportRecord.datasetName rows. Legacy relational entity
// names (POLine, BOMHeader, Shipment, …) are no longer surfaced here;
// their rows live under the parent concept (purchase_orders, bom, etc.).

const ENTITY_GROUPS = [
  {
    label: "Master Data",
    entities: [
      { key: "products", label: "Products" },
      { key: "suppliers", label: "Suppliers" },
      { key: "customers", label: "Customers" },
      { key: "locations", label: "Locations" },
    ],
  },
  {
    label: "Inventory",
    entities: [
      { key: "inventory", label: "Inventory" },
    ],
  },
  {
    label: "Procurement",
    entities: [
      { key: "purchase_orders", label: "Purchase Orders" },
    ],
  },
  {
    label: "Sales",
    entities: [
      { key: "sales_orders", label: "Sales Orders" },
    ],
  },
  {
    label: "Engineering",
    entities: [
      { key: "bom", label: "Bill of Materials" },
    ],
  },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type Col = { key: string; label: string };
type Row = Record<string, string | number | null>;

interface TableData {
  columns: Col[];
  rows: Row[];
  total: number;
  page: number;
  pages: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Read initial values from URL once — all subsequent state lives in React,
  // and URL is synced via window.history.replaceState (no RSC server roundtrip).
  const [entity, setEntity] = useState(() => searchParams.get("entity") ?? "products");
  const [page, setPage] = useState(() => parseInt(searchParams.get("page") ?? "1", 10));
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(search, 300);

  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Sync URL without triggering RSC server requests.
  const syncUrl = useCallback((e: string, p: number, q: string) => {
    const params = new URLSearchParams({ entity: e, page: String(p) });
    if (q) params.set("q", q);
    window.history.replaceState(null, "", `/data/explore?${params}`);
  }, []);

  // Keep latest fetch params in a ref so the visibilitychange handler is never stale.
  const latestParamsRef = useRef({ entity, page, q: debouncedSearch });
  useEffect(() => {
    latestParamsRef.current = { entity, page, q: debouncedSearch };
  }, [entity, page, debouncedSearch]);

  const fetchCounts = useCallback(() => {
    fetch("/api/data/explore?counts=1", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setCounts(d.counts ?? {}))
      .catch(() => {});
  }, []);

  const fetchData = useCallback((e: string, p: number, q: string, background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const params = new URLSearchParams({ entity: e, page: String(p), ...(q && { q }) });
    fetch(`/api/data/explore?${params}`, { cache: "no-store" })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setRefreshing(false); })
      .catch(() => setRefreshing(false))
      .finally(() => setLoading(false));
  }, []);

  // Refresh counts + re-register visibilitychange listener when pathname changes.
  useEffect(() => {
    fetchCounts();
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        fetchCounts();
        fetchData(latestParamsRef.current.entity, latestParamsRef.current.page, latestParamsRef.current.q, true);
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Fetch whenever entity/page/debouncedSearch changes.
  useEffect(() => {
    fetchData(entity, page, debouncedSearch, true);
    syncUrl(entity, page, debouncedSearch);
  }, [entity, page, debouncedSearch, fetchData, syncUrl]);

  // Reset to page 1 when search changes.
  const prevSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (prevSearch.current !== debouncedSearch) {
      prevSearch.current = debouncedSearch;
      setPage(1);
    }
  }, [debouncedSearch]);

  const selectEntity = (key: string) => {
    setSearch("");
    setEntity(key);
    setPage(1);
  };

  const currentLabel =
    ENTITY_GROUPS.flatMap(g => g.entities).find(e => e.key === entity)?.label ?? entity;

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── Left sidebar: entity selector ── */}
      <aside className="w-52 shrink-0 border-r bg-gray-50 flex flex-col overflow-y-auto">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Data Explorer</p>
        </div>
        <nav className="flex-1 p-2 space-y-3">
          {ENTITY_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.entities.map(e => {
                  const count = counts[e.key];
                  const active = e.key === entity;
                  return (
                    <li key={e.key}>
                      <button
                        onClick={() => selectEntity(e.key)}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                          active
                            ? "bg-slate-900 text-white"
                            : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
                        )}
                      >
                        <span className="truncate">{e.label}</span>
                        {count !== undefined && (
                          <span
                            className={cn(
                              "text-[10px] font-medium ml-1 shrink-0",
                              active ? "text-slate-300" : "text-gray-400"
                            )}
                          >
                            {count.toLocaleString()}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Right: table area ── */}
      <div className="flex-1 flex flex-col min-w-0 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
              {currentLabel}
              {refreshing && <span className="inline-block w-3 h-3 rounded-full border-2 border-gray-300 border-t-gray-600 animate-spin" />}
            </h1>
            {data && (
              <p className="text-sm text-gray-500">
                {data.total.toLocaleString()} row{data.total !== 1 ? "s" : ""}
                {data.pages > 1 && ` · page ${data.page} of ${data.pages}`}
              </p>
            )}
          </div>
          <Button variant="outline" asChild size="sm">
            <Link href="/data/import">
              <Upload className="w-4 h-4 mr-2" />
              Import
            </Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {loading || (refreshing && !data) ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 border-2 border-dashed rounded-xl">
            <p className="text-gray-500 font-medium">
              {search ? `No ${currentLabel.toLowerCase()} found` : "No data here yet."}
            </p>
            <p className="text-sm text-gray-400 mt-1 max-w-sm">
              {search
                ? "Try a different search term"
                : "Import a CSV to populate this table. You can add more data types later."}
            </p>
            {!search && (
              <Button asChild className="mt-4" size="sm">
                <Link href="/data/import">Import data</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 bg-white border rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    {data.columns.map(col => (
                      <th
                        key={col.key}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap border-b"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      {data.columns.map((col, ci) => {
                        const val = row[col.key];
                        const isFirst = ci === 0;
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "px-3 py-2 whitespace-nowrap max-w-70 truncate",
                              isFirst
                                ? "font-mono text-xs font-medium text-slate-700"
                                : "text-gray-600"
                            )}
                            title={val !== null && val !== undefined ? String(val) : undefined}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-gray-300">—</span>
                            ) : col.key === "status" ? (
                              <Badge variant="outline" className="text-xs">
                                {val}
                              </Badge>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-500">
                  Showing {(data.page - 1) * 50 + 1}–{Math.min(data.page * 50, data.total)} of{" "}
                  {data.total.toLocaleString()}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.pages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
