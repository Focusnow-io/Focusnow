"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Upload, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Entity catalogue ───────────────────────────────────────────────────────────

const ENTITY_GROUPS = [
  {
    label: "Master Data",
    entities: [
      { key: "Product", label: "Products" },
      { key: "Supplier", label: "Suppliers" },
      { key: "Customer", label: "Customers" },
      { key: "Location", label: "Locations" },
    ],
  },
  {
    label: "Finance",
    entities: [
      { key: "ExchangeRate", label: "Exchange Rates" },
      { key: "PriceList", label: "Price Lists" },
      { key: "PriceListLine", label: "Price List Lines" },
      { key: "CustomerPriceList", label: "Customer Price Lists" },
    ],
  },
  {
    label: "Engineering",
    entities: [
      { key: "BOMHeader", label: "BOM Headers" },
      { key: "BOM", label: "Bill of Materials" },
      { key: "BOMLine", label: "BOM Lines" },
      { key: "Routing", label: "Routings" },
      { key: "RoutingOperation", label: "Routing Ops" },
      { key: "WorkCenter", label: "Work Centers" },
      { key: "ShiftCalendar", label: "Shift Calendar" },
      { key: "Equipment", label: "Equipment" },
      { key: "MaintenanceLog", label: "Maintenance Logs" },
    ],
  },
  {
    label: "Inventory",
    entities: [
      { key: "InventoryItem", label: "Inventory" },
      { key: "Lot", label: "Lots" },
      { key: "SerialNumber", label: "Serial Numbers" },
      { key: "StockMovement", label: "Stock Movements" },
    ],
  },
  {
    label: "Procurement",
    entities: [
      { key: "SupplierItem", label: "Supplier Items" },
      { key: "PurchaseOrder", label: "Purchase Orders" },
      { key: "POLine", label: "PO Lines" },
    ],
  },
  {
    label: "Planning",
    entities: [
      { key: "ForecastEntry", label: "Forecast" },
      { key: "MpsEntry", label: "MPS" },
    ],
  },
  {
    label: "Production",
    entities: [
      { key: "WorkOrder", label: "Work Orders" },
      { key: "WorkOrderOperation", label: "WO Operations" },
    ],
  },
  {
    label: "Sales & Fulfilment",
    entities: [
      { key: "SalesOrder", label: "Sales Orders" },
      { key: "SalesOrderLine", label: "SO Lines" },
      { key: "Shipment", label: "Shipments" },
      { key: "ShipmentLine", label: "Shipment Lines" },
      { key: "Invoice", label: "Invoices" },
      { key: "ReturnRma", label: "Returns / RMAs" },
      { key: "Order", label: "Orders (Legacy)" },
    ],
  },
  {
    label: "Quality",
    entities: [
      { key: "QcInspection", label: "QC Inspections" },
      { key: "Ncr", label: "NCRs" },
      { key: "Capa", label: "CAPAs" },
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const entityParam = searchParams.get("entity") ?? "BOM";
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);

  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const debouncedSearch = useDebounce(search, 300);

  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Keep latest fetch params in a ref so the visibilitychange handler is never stale.
  // The handler is set up once per pathname change but entity/page/search can change
  // via URL query params without the pathname changing — this ref bridges that gap.
  const latestParamsRef = useRef({ entity: entityParam, page: pageParam, q: debouncedSearch });
  useEffect(() => {
    latestParamsRef.current = { entity: entityParam, page: pageParam, q: debouncedSearch };
  }, [entityParam, pageParam, debouncedSearch]);

  const fetchCounts = useCallback(() => {
    fetch("/api/data/explore?counts=1", { cache: "no-store" })
      .then(r => r.json())
      .then(d => setCounts(d.counts ?? {}))
      .catch(() => {});
  }, []);

  const fetchData = useCallback((entity: string, page: number, q: string, background = false) => {
    // Background refetches (visibility/navigation triggers) keep old data visible.
    // Only show the full loading spinner on an empty initial load or entity switch.
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    const params = new URLSearchParams({
      entity,
      page: String(page),
      ...(q && { q }),
    });
    fetch(`/api/data/explore?${params}`, { cache: "no-store" })
      .then(r => {
        // Do NOT overwrite good data with an error body — if the API errors
        // (session expired, DB hiccup, etc.) keep whatever is already displayed.
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setRefreshing(false); })
      .catch(() => setRefreshing(false))
      .finally(() => setLoading(false));
  }, []);

  // Refetch both counts and table data whenever the tab regains visibility
  // OR when navigating back to this page within the SPA (pathname change).
  // This ensures data is fresh after a delete/import on another page.
  // On mount / SPA navigation back to this page: silently refresh in background
  // so existing data stays visible and doesn't flash empty.
  useEffect(() => {
    fetchCounts();
    fetchData(latestParamsRef.current.entity, latestParamsRef.current.page, latestParamsRef.current.q, /* background */ true);
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        fetchCounts();
        fetchData(latestParamsRef.current.entity, latestParamsRef.current.page, latestParamsRef.current.q, /* background */ true);
      }
    };
    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // When entity / page / search changes, refresh data. Always background so existing
  // data stays visible during the fetch — avoids blank flashes from React Strict Mode
  // double-mounting in development, and keeps the table stable during pagination/search.
  useEffect(() => {
    fetchData(entityParam, pageParam, debouncedSearch, /* background */ true);
  }, [entityParam, pageParam, debouncedSearch, fetchData]);

  // Reset to page 1 when search changes
  const prevSearch = useRef(debouncedSearch);
  useEffect(() => {
    if (prevSearch.current !== debouncedSearch) {
      prevSearch.current = debouncedSearch;
      navigate(entityParam, 1, debouncedSearch);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const navigate = useCallback(
    (entity: string, page: number, q: string) => {
      const p = new URLSearchParams({ entity, page: String(page) });
      if (q) p.set("q", q);
      router.push(`/data/explore?${p}`);
    },
    [router]
  );

  const selectEntity = (key: string) => {
    setSearch("");
    navigate(key, 1, "");
  };

  const currentLabel =
    ENTITY_GROUPS.flatMap(g => g.entities).find(e => e.key === entityParam)?.label ?? entityParam;

  return (
    <div className="flex gap-0 h-full min-h-0">
      {/* ── Left sidebar: entity selector ── */}
      <aside className="w-52 shrink-0 border-r border-border bg-muted flex flex-col overflow-y-auto">
        <div className="p-3 border-b">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Explorer</p>
        </div>
        <nav className="flex-1 p-2 space-y-3">
          {ENTITY_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.entities.map(e => {
                  const count = counts[e.key];
                  const active = e.key === entityParam;
                  return (
                    <li key={e.key}>
                      <button
                        onClick={() => selectEntity(e.key)}
                        className={cn(
                          "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                          active
                            ? "bg-slate-900 text-white"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <span className="truncate">{e.label}</span>
                        {count !== undefined && (
                          <span
                            className={cn(
                              "text-[10px] font-medium ml-1 shrink-0",
                              active ? "text-muted-foreground/50" : "text-muted-foreground"
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
            <h1 className="text-xl font-bold text-foreground">{currentLabel}</h1>
            {data && (
              <p className="text-sm text-muted-foreground">
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
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        {loading || (refreshing && !data) ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-16 border-2 border-dashed rounded-xl">
            <p className="text-muted-foreground font-medium">
              {search ? `No ${currentLabel.toLowerCase()} found` : "No data here yet."}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
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
            <div className="flex-1 min-h-0 bg-card border border-border rounded-xl overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    {data.columns.map(col => (
                      <th
                        key={col.key}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap border-b border-border"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted transition-colors">
                      {data.columns.map((col, ci) => {
                        const val = row[col.key];
                        const isFirst = ci === 0;
                        return (
                          <td
                            key={col.key}
                            className={cn(
                              "px-3 py-2 whitespace-nowrap max-w-[280px] truncate",
                              isFirst
                                ? "font-mono text-xs font-medium text-foreground"
                                : "text-muted-foreground"
                            )}
                            title={val !== null && val !== undefined ? String(val) : undefined}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-muted-foreground/50">—</span>
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
                <p className="text-xs text-muted-foreground">
                  Showing {(data.page - 1) * 50 + 1}–{Math.min(data.page * 50, data.total)} of{" "}
                  {data.total.toLocaleString()}
                </p>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => navigate(entityParam, data.page - 1, debouncedSearch)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={data.page >= data.pages}
                    onClick={() => navigate(entityParam, data.page + 1, debouncedSearch)}
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
