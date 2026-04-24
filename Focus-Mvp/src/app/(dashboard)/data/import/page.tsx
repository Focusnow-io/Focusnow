"use client";

/**
 * Import wizard — dataset-vocabulary pipeline.
 *
 * Flow: hub → upload → [disambiguate → ] confirm → done
 *
 * Posts to /api/data/import-v2 then /api/data/sources/{id}/process-v2.
 * Writes exclusively to ImportRecord + ImportDataset.
 */

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  CheckCircle,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

// ─── Concept list ──────────────────────────────────────────────────────────

const IMPORT_CONCEPTS = [
  { id: "products" as DatasetName, label: "Products",
    description: "Your product catalogue — SKUs, specs, costs",
    examples: "Item master, SKU list, parts catalogue",
    unit: "products" },
  { id: "suppliers" as DatasetName, label: "Suppliers",
    description: "Your supplier and vendor list",
    examples: "Vendor master, supplier directory",
    unit: "suppliers" },
  { id: "customers" as DatasetName, label: "Customers",
    description: "Your customer accounts",
    examples: "Customer master, account list",
    unit: "customers" },
  { id: "locations" as DatasetName, label: "Locations",
    description: "Warehouses, stores, and sites",
    examples: "Warehouse list, store locations",
    unit: "locations" },
  { id: "inventory" as DatasetName, label: "Inventory",
    description: "Current stock levels per item and location",
    examples: "Stock on hand, inventory balance",
    unit: "records" },
  { id: "purchase_orders" as DatasetName, label: "Purchase Orders",
    description: "Orders placed with your suppliers",
    examples: "Open POs, PO headers, purchase lines",
    unit: "records" },
  { id: "sales_orders" as DatasetName, label: "Sales Orders",
    description: "Orders received from your customers",
    examples: "Open orders, sales backlog, order lines",
    unit: "records" },
  { id: "bom" as DatasetName, label: "Bill of Materials",
    description: "Product structure and component lists",
    examples: "BOM, recipe, formula, components list",
    unit: "records" },
] as const;

function getDatasetLabel(name: string): string {
  return IMPORT_CONCEPTS.find((c) => c.id === name)?.label ?? name;
}

function getDatasetUnit(name: string): string {
  return IMPORT_CONCEPTS.find((c) => c.id === name)?.unit ?? "records";
}

const IMPORT_MESSAGES = [
  "Importing your data…",
  "Matching records…",
  "Almost there…",
  "Large files can take a minute, we're on it…",
  "Validating and saving your records…",
];

// ─── Types ─────────────────────────────────────────────────────────────────

interface UploadResult {
  sourceId: string;
  dataset: DatasetName;
  headers: string[];
  suggestedMapping: Record<string, string>;
  confidence: Record<string, number>;
  sampleValues: Record<string, string[]>;
  unmappedColumns: string[];
  rowCount: number;
  detectedDataset: {
    dataset: DatasetName;
    confidence: "certain" | "high" | "medium" | "low" | "inferred";
    wasAutoDetected: boolean;
    alternatives: Array<{ dataset: DatasetName; score: number; identityFieldsMatched: number }>;
  };
  detectedDescription?: string;
}

/** Response shape from /process-v2. Every field is optional because
 *  the error-path response (try/catch in the route) collapses to just
 *  `{ error }` with HTTP 500 — the UI must tolerate missing counts
 *  without throwing when it reads `.length` / `.slice()`. */
interface ImportResult {
  imported?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: Array<{ row: number; message: string }>;
  dataset?: DatasetName;
  datasetId?: string;
  error?: string;
}

interface CoverageEntry {
  importedRows: number;
  rowCount: number;
  lastImported: string;
}

type Step = "select" | "upload" | "confirm" | "done";

// ─── Helpers ───────────────────────────────────────────────────────────────

function plural(n: number, noun: string) {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

/** Idempotent pluralisation for dataset units. The IMPORT_CONCEPTS
 *  unit field already comes through pre-pluralised ("products",
 *  "suppliers", "records") so the standard `plural()` helper would
 *  produce "productss". This helper appends "s" only when the unit
 *  doesn't already end in one, matching the natural English form. */
function pluralise(count: number, unit: string): string {
  const suffix = unit.endsWith("s") ? "" : "s";
  return `${count.toLocaleString()} ${unit}${suffix}`;
}

function formatRelativeDate(dateStr: string): string {
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86_400_000,
  );
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

// ─── Entry ─────────────────────────────────────────────────────────────────

export default function ImportPage() {
  return (
    <Suspense>
      <ImportPageInner />
    </Suspense>
  );
}

function ImportPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [dataset, setDataset] = useState<DatasetName>("products");
  // `datasetExplicit` went away with auto-detection — every path to
  // the upload screen now seeds a dataset via the hub, so the API
  // always receives an explicit `dataset` form field.
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [processing, setProcessing] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [coverageMap, setCoverageMap] = useState<Record<string, CoverageEntry>>({});
  const [coverageVersion, setCoverageVersion] = useState(0);

  const [importMessage, setImportMessage] = useState(IMPORT_MESSAGES[0]);
  const messageIdxRef = useRef(0);

  useEffect(() => {
    fetch("/api/data/import/coverage")
      .then((r) => r.json())
      .then((d: { coverage: Record<string, CoverageEntry> }) => setCoverageMap(d.coverage ?? {}))
      .catch(() => {});
  }, [coverageVersion]);

  useEffect(() => {
    if (!processing) {
      messageIdxRef.current = 0;
      setImportMessage(IMPORT_MESSAGES[0]);
      return;
    }
    const iv = setInterval(() => {
      messageIdxRef.current = (messageIdxRef.current + 1) % IMPORT_MESSAGES.length;
      setImportMessage(IMPORT_MESSAGES[messageIdxRef.current]);
    }, 3000);
    return () => clearInterval(iv);
  }, [processing]);

  // Resume from a deep link (?resume=<sourceId>)
  useEffect(() => {
    const id = searchParams.get("resume");
    if (!id) return;
    fetch(`/api/data/sources/${id}`)
      .then((r) => r.json())
      .then((data: { dataset?: DatasetName; sourceId?: string; headers?: string[]; suggestedMapping?: Record<string, string>; rowCount?: number }) => {
        if (!data?.sourceId || !data?.dataset) return;
        setUploadResult({
          sourceId: data.sourceId,
          dataset: data.dataset,
          headers: data.headers ?? [],
          suggestedMapping: data.suggestedMapping ?? {},
          confidence: {},
          sampleValues: {},
          unmappedColumns: [],
          rowCount: data.rowCount ?? 0,
          detectedDataset: {
            dataset: data.dataset,
            confidence: "inferred",
            wasAutoDetected: false,
            alternatives: [],
          },
        });
        setDataset(data.dataset);
        setStep("confirm");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    // The concept hub is the only entry point to the upload screen, so
    // the dataset hint is always set. If somehow it isn't (e.g. a user
    // deep-links into /upload), the API will 400 and we surface that
    // error inline rather than trying to auto-detect.
    const fd = new FormData();
    fd.append("file", file);
    fd.append("dataset", dataset);
    // Replace mode is only meaningful when the dataset already has
    // records — silently coerce to merge when the target is empty so
    // we never hit /process-v2's delete-then-insert path for no reason.
    const hasExistingData = (coverageMap[dataset]?.importedRows ?? 0) > 0;
    fd.append("importMode", hasExistingData ? importMode : "merge");

    try {
      const res = await fetch("/api/data/import-v2", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error ?? "Upload failed");
        setUploading(false);
        return;
      }
      const result = data as UploadResult;
      setUploadResult(result);
      setDataset(result.dataset);
      // Always land on Confirm — the dataset is already locked in by
      // the concept card the user clicked, so there's nothing to
      // disambiguate. The Confirm screen surfaces matched fields and
      // the user can cancel + restart from the hub if the file's wrong.
      setStep("confirm");
    } catch {
      setUploadError("Network error — please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleProcess() {
    if (!uploadResult) return;
    setProcessing(true);
    try {
      const res = await fetch(
        `/api/data/sources/${uploadResult.sourceId}/process-v2`,
        { method: "POST" },
      );
      const result = await res.json();
      setImportResult(result as ImportResult);
      setStep("done");
    } catch (err) {
      console.error("[process-v2]", err);
    } finally {
      setProcessing(false);
    }
  }

  const handleReset = useCallback(() => {
    setStep("select");
    setCoverageVersion((v) => v + 1);
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
    setImportResult(null);
    setImportMode("merge");
  }, []);

  function startImport(conceptId: DatasetName, mode: "merge" | "replace") {
    setDataset(conceptId);
    setImportMode(mode);
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
    setStep("upload");
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const MILESTONES = ["Upload", "Confirm", "Done"] as const;
  const milestoneIdx = step === "done" ? 2 : step === "upload" || step === "select" ? 0 : 1;

  return (
    <div
      className={cn(
        "space-y-6 mx-auto w-full",
        step === "select" ? "max-w-5xl" : "max-w-2xl",
      )}
    >
      {step !== "select" && (
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a CSV or Excel file — we&apos;ll handle the rest.
          </p>
        </div>
      )}

      {step !== "select" && (
        <div className="flex items-center gap-2">
          {MILESTONES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors",
                  i <= milestoneIdx ? "text-slate-900" : "text-gray-400",
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-xs",
                    i <= milestoneIdx ? "bg-slate-900 text-white" : "bg-gray-200 text-gray-400",
                  )}
                >
                  {i < milestoneIdx ? <CheckCircle className="w-3 h-3" /> : i + 1}
                </div>
                {label}
              </div>
              {i < MILESTONES.length - 1 && (
                <ChevronRight className="w-4 h-4 text-gray-300" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── HUB ─────────────────────────────────────────────────────────── */}
      {step === "select" && (
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Connect your operational data</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a data type to import or update.
            </p>
          </div>

          <div className="border border-border rounded-xl bg-background overflow-hidden">
            {IMPORT_CONCEPTS.map((concept, i) => {
              const cov = coverageMap[concept.id] ?? null;
              const hasData = (cov?.importedRows ?? 0) > 0;
              const isLast = i === IMPORT_CONCEPTS.length - 1;
              return (
                <div
                  key={concept.id}
                  className={cn(
                    "flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/30 transition-colors",
                    !isLast && "border-b border-border",
                  )}
                >
                  <div className="flex items-baseline gap-3 min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground shrink-0">
                      {concept.label}
                    </p>
                    <span className="text-sm text-muted-foreground shrink-0" aria-hidden>·</span>
                    <p className="text-sm text-muted-foreground truncate">
                      {concept.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {hasData && cov && (
                      <p className="flex items-center gap-1 text-xs text-emerald-600 mr-2">
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                        <span className="whitespace-nowrap">
                          {cov.importedRows.toLocaleString()} {concept.unit}
                          <span className="text-muted-foreground">
                            {" "}· {formatRelativeDate(cov.lastImported)}
                          </span>
                        </span>
                      </p>
                    )}

                    {hasData ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startImport(concept.id, "merge")}
                          className="w-20"
                        >
                          Update
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startImport(concept.id, "replace")}
                          className="w-20 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                        >
                          Replace
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startImport(concept.id, "merge")}
                        className="w-24"
                      >
                        Import
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── UPLOAD ─────────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card>
          <CardContent className="p-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Upload your data</h2>
              <div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Uploading: <span className="font-medium text-foreground">{getDatasetLabel(dataset)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  ← Change
                </button>
              </div>
            </div>

            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center transition-all",
                uploading
                  ? "opacity-50 pointer-events-none animate-pulse"
                  : "cursor-pointer",
                file
                  ? "border-emerald-300 bg-emerald-50/40"
                  : "border-gray-200 hover:border-slate-400 hover:bg-gray-50",
              )}
              onClick={() => !uploading && fileRef.current?.click()}
            >
              {file ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {uploading
                        ? "Reading your file and detecting data types…"
                        : `${(file.size / 1024).toFixed(1)} KB · Click to change`}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">
                      Drop your file here or click to browse
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      CSV or Excel · any ERP export · any column names
                    </p>
                  </div>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setUploadError(null);
              }}
            />

            {uploadError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {uploadError}
              </div>
            )}

            <Button
              onClick={() => handleUpload()}
              disabled={!file || uploading}
              className="w-full h-11 text-sm font-semibold"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analysing your file…
                </>
              ) : (
                "Upload & analyse"
              )}
            </Button>

          </CardContent>
        </Card>
      )}

      {/* ── CONFIRM ───────────────────────────────────────────────────── */}
      {step === "confirm" && uploadResult && (() => {
        const ds = uploadResult.dataset;
        const fields = DATASETS[ds]?.fields ?? {};
        const mappedFields = Object.entries(uploadResult.suggestedMapping ?? {})
          .filter(([, src]) => Boolean(src));
        // Only show the Update/Replace selector when the target dataset
        // already has records — importing into an empty dataset has no
        // "existing data" to replace, so the choice is a no-op.
        const hasExistingData = (coverageMap[ds]?.importedRows ?? 0) > 0;
        return (
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="bg-slate-50 rounded-xl p-5 space-y-2">
                {uploadResult.detectedDataset?.wasAutoDetected ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    <CheckCircle className="w-3 h-3" />
                    Auto-detected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    📁 {getDatasetLabel(ds)}
                  </span>
                )}
                <p className="text-base font-semibold text-slate-900">
                  Ready to import {pluralise(uploadResult.rowCount, getDatasetUnit(ds))} from your file
                </p>
                {uploadResult.detectedDescription && (
                  <p className="text-xs text-gray-500">{uploadResult.detectedDescription}</p>
                )}

                <p className="text-xs text-gray-500">
                  {mappedFields.length > 0
                    ? `${mappedFields.length} field${mappedFields.length !== 1 ? "s" : ""} matched`
                    : "No fields matched"}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {mappedFields.map(([fieldKey]) => {
                    const label = (fields as Record<string, { label: string }>)[fieldKey]?.label ?? fieldKey;
                    return (
                      <span
                        key={fieldKey}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border bg-emerald-50 border-emerald-200 text-emerald-700"
                      >
                        <CheckCircle className="w-2.5 h-2.5" />
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {hasExistingData && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">Import mode</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode("merge")}
                      disabled={processing}
                      aria-pressed={importMode === "merge"}
                      className={cn(
                        "text-left rounded-xl border-2 px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        importMode === "merge"
                          ? "border-slate-900 bg-slate-50"
                          : "border-gray-200 hover:border-slate-400",
                      )}
                    >
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block w-3.5 h-3.5 rounded-full border-2",
                            importMode === "merge"
                              ? "border-slate-900 bg-slate-900 ring-2 ring-white ring-inset"
                              : "border-gray-300",
                          )}
                        />
                        Update existing
                      </p>
                      <p className="text-xs text-gray-500 mt-1 ml-5">
                        Add new records and update existing ones
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode("replace")}
                      disabled={processing}
                      aria-pressed={importMode === "replace"}
                      className={cn(
                        "text-left rounded-xl border-2 px-4 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                        importMode === "replace"
                          ? "border-amber-500 bg-amber-50/60"
                          : "border-gray-200 hover:border-amber-400",
                      )}
                    >
                      <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-block w-3.5 h-3.5 rounded-full border-2",
                            importMode === "replace"
                              ? "border-amber-600 bg-amber-600 ring-2 ring-white ring-inset"
                              : "border-gray-300",
                          )}
                        />
                        Replace all
                      </p>
                      <p className="text-xs text-gray-500 mt-1 ml-5">
                        Clear existing data and import fresh
                      </p>
                    </button>
                  </div>
                </div>
              )}

              {processing && (
                <div className="space-y-1.5">
                  <p className="text-sm text-gray-600">{importMessage}</p>
                  <Progress value={undefined} className="animate-pulse" />
                  <p className="text-[11px] text-gray-400">
                    Large files may take up to a minute. Please don&apos;t close this page.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("upload")}
                  disabled={processing}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleProcess}
                  disabled={processing}
                  className="flex-1"
                >
                  {processing ? "Importing…" : "Confirm & import"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ── DONE ──────────────────────────────────────────────────────── */}
      {step === "done" && importResult && uploadResult && (
        <Card>
          <CardContent className="p-6 space-y-5">
            <div className="text-center space-y-2 pb-2">
              {(importResult.imported ?? 0) > 0 ? (
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
              )}

              <p className="text-lg font-semibold text-gray-900">
                {(importResult.imported ?? 0) > 0
                  ? "Import complete"
                  : importResult.error
                    ? `Import failed — ${importResult.error}`
                    : "Import failed — no records were saved."}
              </p>

              {(importResult.imported ?? 0) > 0 && importResult.dataset && (
                <div className="space-y-1 text-sm text-gray-700">
                  {(importResult.created ?? 0) > 0 && (
                    <p>
                      {plural(importResult.created ?? 0, `new ${getDatasetUnit(importResult.dataset).replace(/s$/, "")}`)} added
                    </p>
                  )}
                  {(importResult.updated ?? 0) > 0 && (
                    <p>
                      {plural(importResult.updated ?? 0, getDatasetUnit(importResult.dataset).replace(/s$/, ""))} updated
                    </p>
                  )}
                  {(importResult.skipped ?? 0) > 0 && (
                    <p className="text-amber-600">
                      {plural(importResult.skipped ?? 0, "row")} skipped
                    </p>
                  )}
                </div>
              )}
            </div>

            {(importResult.errors?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                <p className="font-semibold">
                  Skipped rows ({importResult.errors?.length ?? 0})
                </p>
                {(importResult.errors?.slice(0, 5) ?? []).map((e, i) => (
                  <p key={i} className="text-amber-700">
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => router.push("/data")}
                className="flex-1"
              >
                View imported data
              </Button>
              <Button onClick={handleReset} className="flex-1">
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
