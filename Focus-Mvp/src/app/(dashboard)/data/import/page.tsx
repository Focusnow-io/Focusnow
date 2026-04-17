"use client";

/**
 * Import wizard — optimised for non-technical users.
 *
 * User-facing steps (max 3):
 *   Upload  →  [Map — only shown when confidence is low]  →  Confirm  →  Done
 *
 * Smart behaviours:
 *  • High-confidence auto-mapping: if every required field scores ≥ AUTO_MAP_THRESHOLD
 *    the mapping review screen is skipped entirely.
 *  • Template auto-apply: the first saved template for this entity type is applied
 *    silently on upload; scores are recomputed against the current file's headers.
 *  • Multi-sheet auto-select: the sheet with the most rows is chosen automatically;
 *    a "Wrong sheet?" escape hatch appears in-line on the Confirm screen.
 *  • Validation is non-blocking: it runs in the background after import and
 *    surfaces errors as a dismissible banner rather than a gate.
 *  • "Extra fields as metadata" lives behind an Advanced toggle.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileText,
  CheckCircle,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Save,
  ChevronDown,
  ChevronUp,
  X,
  Hash,
  Calendar,
  Type,
  Flag,
  Sparkles,
  Columns,
  Loader2,
} from "lucide-react";
import {
  CANONICAL_FIELDS,
  AUTO_MAP_THRESHOLD,
  suggestMappingWithConfidence,
  type EntityType,
  type MappingConfidence,
  type ColumnClassification,
} from "@/lib/ingestion/field-mapper";

// ─── Constants ────────────────────────────────────────────────────────────────

const ENTITY_LABELS: Record<EntityType, string> = {
  // Master Data
  Product: "Products / SKUs",
  Supplier: "Suppliers",
  Customer: "Customers",
  Location: "Locations / Sites",
  Employee: "Employees / Operators",
  // Finance
  ExchangeRate: "Exchange Rates",
  PriceList: "Price Lists",
  PriceListLine: "Price List Lines",
  CustomerPriceList: "Customer Price Lists",
  // Engineering
  BOMHeader: "BOM Headers",
  BOM: "Bill of Materials (BOM)",
  BOMLine: "BOM Lines",
  RoutingHeader: "Routing Headers",
  Routing: "Routings (Operations)",
  RoutingOperation: "Routing Operations",
  WorkCenter: "Work Centers (Capacity)",
  ShiftCalendar: "Shift Calendars",
  Equipment: "Equipment",
  MaintenanceLog: "Maintenance Logs",
  // Inventory
  InventoryItem: "Inventory",
  Lot: "Lots / Batches",
  SerialNumber: "Serial Numbers",
  StockMovement: "Stock Movements",
  // Procurement
  SupplierItem: "Supplier Items (AVL)",
  PurchaseOrder: "Purchase Orders",
  POLine: "PO Lines",
  // Planning
  ForecastEntry: "Demand Forecast",
  MpsEntry: "Master Production Schedule (MPS)",
  // Production
  WorkOrder: "Work Orders (Production Orders)",
  WorkOrderOperation: "Work Order Operations",
  // Sales & Fulfilment
  SalesOrder: "Sales Orders",
  SalesOrderLine: "Sales Order Lines",
  Shipment: "Shipments / Deliveries",
  ShipmentLine: "Shipment Lines",
  Invoice: "Invoices",
  ReturnRma: "Returns / RMAs",
  Order: "Orders (Legacy)",
  // Quality
  QcInspection: "QC Inspections",
  Ncr: "Non-Conformance Reports (NCR)",
  Capa: "CAPAs (Corrective Actions)",
};

// Plain-English nouns used in the summary sentence
const ENTITY_NOUN: Record<EntityType, string> = {
  // Master Data
  Product: "product",
  Supplier: "supplier",
  Customer: "customer",
  Location: "location",
  Employee: "employee",
  // Finance
  ExchangeRate: "exchange rate",
  PriceList: "price list",
  PriceListLine: "price list line",
  CustomerPriceList: "customer price list",
  // Engineering
  BOMHeader: "BOM header",
  BOM: "BOM line",
  BOMLine: "BOM line",
  RoutingHeader: "routing header",
  Routing: "routing operation",
  RoutingOperation: "routing operation",
  WorkCenter: "work center",
  ShiftCalendar: "shift calendar",
  Equipment: "equipment",
  MaintenanceLog: "maintenance log",
  // Inventory
  InventoryItem: "inventory record",
  Lot: "lot",
  SerialNumber: "serial number",
  StockMovement: "stock movement",
  // Procurement
  SupplierItem: "supplier item",
  PurchaseOrder: "purchase order",
  POLine: "PO line",
  // Planning
  ForecastEntry: "forecast entry",
  MpsEntry: "MPS entry",
  // Production
  WorkOrder: "work order",
  WorkOrderOperation: "work order operation",
  // Sales & Fulfilment
  SalesOrder: "sales order",
  SalesOrderLine: "sales order line",
  Shipment: "shipment",
  ShipmentLine: "shipment line",
  Invoice: "invoice",
  ReturnRma: "return",
  Order: "order",
  // Quality
  QcInspection: "QC inspection",
  Ncr: "NCR",
  Capa: "CAPA",
};

const ENTITY_OPTIONS = Object.entries(ENTITY_LABELS) as [EntityType, string][];

// ─── Supply chain stages ──────────────────────────────────────────────────────

interface ChainEntity {
  type: EntityType;
}

interface ChainStage {
  id: string;
  label: string;
  description: string;
  entities: ChainEntity[];
}

const SUPPLY_CHAIN_STAGES: ChainStage[] = [
  {
    id: "master-data",
    label: "Master Data",
    description: "Core reference entities shared across all modules",
    entities: [
      { type: "Product" },
      { type: "Supplier" },
      { type: "Customer" },
      { type: "Location" },
      { type: "Employee" },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    description: "Exchange rates, price lists, and commercial terms",
    entities: [
      { type: "ExchangeRate" },
      { type: "PriceList" },
      { type: "PriceListLine" },
      { type: "CustomerPriceList" },
    ],
  },
  {
    id: "engineering",
    label: "Engineering",
    description: "BOMs, routings, work centres, and equipment",
    entities: [
      { type: "BOMHeader" },
      { type: "BOM" },
      { type: "BOMLine" },
      { type: "RoutingHeader" },
      { type: "Routing" },
      { type: "RoutingOperation" },
      { type: "WorkCenter" },
      { type: "ShiftCalendar" },
      { type: "Equipment" },
      { type: "MaintenanceLog" },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock levels, lots, serials, and movements",
    entities: [
      { type: "InventoryItem" },
      { type: "Lot" },
      { type: "SerialNumber" },
      { type: "StockMovement" },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    description: "Supplier items, purchase orders, and receiving",
    entities: [
      { type: "SupplierItem" },
      { type: "PurchaseOrder" },
      { type: "POLine" },
    ],
  },
  {
    id: "planning",
    label: "Planning",
    description: "Demand forecasts and master production schedules",
    entities: [
      { type: "ForecastEntry" },
      { type: "MpsEntry" },
    ],
  },
  {
    id: "production",
    label: "Production",
    description: "Work orders and shop floor operations",
    entities: [
      { type: "WorkOrder" },
      { type: "WorkOrderOperation" },
    ],
  },
  {
    id: "sales",
    label: "Sales & Fulfilment",
    description: "Sales orders, shipments, invoices, and returns",
    entities: [
      { type: "SalesOrder" },
      { type: "SalesOrderLine" },
      { type: "Shipment" },
      { type: "ShipmentLine" },
      { type: "Invoice" },
      { type: "ReturnRma" },
      { type: "Order" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    description: "Inspections, non-conformances, and corrective actions",
    entities: [
      { type: "QcInspection" },
      { type: "Ncr" },
      { type: "Capa" },
    ],
  },
];

// ─── Essentials (top-10 entities to upload first) ────────────────────────────

interface EssentialEntity {
  type: EntityType;
  category: string;
  blurb: string;
}

const ESSENTIAL_ENTITIES: EssentialEntity[] = [
  { type: "Product", category: "Master Data", blurb: "" },
  { type: "Supplier", category: "Master Data", blurb: "" },
  { type: "InventoryItem", category: "Inventory", blurb: "" },
  { type: "PurchaseOrder", category: "Procurement", blurb: "Open POs" },
  { type: "POLine", category: "Procurement", blurb: "Line items per PO" },
  { type: "SupplierItem", category: "Procurement", blurb: "Who supplies what" },
  { type: "Location", category: "Master Data", blurb: "Warehouses & sites" },
  { type: "StockMovement", category: "Inventory", blurb: "Consumption history" },
  { type: "ForecastEntry", category: "Planning", blurb: "Future demand signal" },
  { type: "PriceListLine", category: "Finance", blurb: "Unit costs per supplier" },
];

const ESSENTIAL_TYPES = new Set<EntityType>(ESSENTIAL_ENTITIES.map((e) => e.type));

const ENTITY_CATEGORY: Record<EntityType, string> = (() => {
  const map = {} as Record<EntityType, string>;
  for (const stage of SUPPLY_CHAIN_STAGES) {
    for (const e of stage.entities) map[e.type] = stage.label;
  }
  return map;
})();

const ENTITY_UNIT: Record<EntityType, string> = {
  Product: "items",
  Supplier: "suppliers",
  Customer: "customers",
  Location: "locations",
  Employee: "employees",
  ExchangeRate: "rates",
  PriceList: "price lists",
  PriceListLine: "lines",
  CustomerPriceList: "price lists",
  BOMHeader: "BOMs",
  BOM: "lines",
  BOMLine: "lines",
  RoutingHeader: "routings",
  Routing: "operations",
  RoutingOperation: "operations",
  WorkCenter: "work centers",
  ShiftCalendar: "calendars",
  Equipment: "items",
  MaintenanceLog: "logs",
  InventoryItem: "records",
  Lot: "lots",
  SerialNumber: "serials",
  StockMovement: "movements",
  SupplierItem: "items",
  PurchaseOrder: "POs",
  POLine: "lines",
  ForecastEntry: "entries",
  MpsEntry: "entries",
  WorkOrder: "orders",
  WorkOrderOperation: "operations",
  SalesOrder: "orders",
  SalesOrderLine: "lines",
  Shipment: "shipments",
  ShipmentLine: "lines",
  Invoice: "invoices",
  ReturnRma: "returns",
  Order: "orders",
  QcInspection: "inspections",
  Ncr: "NCRs",
  Capa: "CAPAs",
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** All wizard steps. "select" is the supply chain hub shown before upload. */
type Step = "select" | "upload" | "entity-split" | "map" | "confirm" | "done";

interface CoverageEntry {
  importedRows: number;
  lastImported: string;
}

interface DetectedEntity {
  entity: string;
  confidence: "high" | "medium" | "low";
  columnsUsed: string[];
  requiredFieldsMatched: number;
}

interface UploadResult {
  sourceId: string;
  headers: string[];
  suggestedMapping: Record<string, string>;
  confidence: Record<string, MappingConfidence>;
  score: Record<string, number>;
  sampleValues: Record<string, string[]>;
  columnTypes: Record<string, string>;
  previewRows: Record<string, string>[];
  rowCount: number;
  entity: EntityType;
  columnClassification?: Record<string, ColumnClassification>;
  detectedEntities?: DetectedEntity[];
  selectedSheet: string | null;
  allSheets: string[];
  wasAutoSelected: boolean;
}

interface ValidationResult {
  total: number;
  valid: number;
  invalid: number;
  errors: { row: number; field: string; message: string }[];
  hasMore: boolean;
}

interface MappingTemplate {
  id: string;
  name: string;
  entity: string;
  mapping: Record<string, string>;
  attributeKeys: string[];
}

/**
 * Build a mapping from the column classification that was already computed
 * during upload.  The classifier already proved which CSV columns belong to
 * which entity+field — reuse that instead of re-running suggestMappingWithConfidence
 * from scratch (which may fail on non-obvious header names).
 *
 * Returns `null` when the classification doesn't cover all identity fields
 * for the requested entity, so the caller can fall back to the auto-mapper.
 */
function buildMappingFromClassification(
  classification: Record<string, ColumnClassification> | undefined,
  entityType: EntityType,
): Record<string, string> | null {
  if (!classification) return null;
  const mapping: Record<string, string> = {};
  for (const [col, c] of Object.entries(classification)) {
    if ((c.type === "entity_match" || c.type === "sparse" || c.type === "calculated") && c.entity === entityType && c.canonicalField) {
      mapping[c.canonicalField] = col;
    }
  }
  // Only trust this mapping if all identity fields are covered
  const fields = CANONICAL_FIELDS[entityType] ?? [];
  const identityFields = fields.filter(
    (f) => "identity" in f && (f as { identity?: boolean }).identity,
  );
  if (identityFields.length > 0 && !identityFields.every((f) => mapping[(f as { field: string }).field])) {
    return null;
  }
  return Object.keys(mapping).length > 0 ? mapping : null;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function ColTypeBadge({ type }: { type: string | undefined }) {
  if (type === "numeric")
    return <Hash className="w-3 h-3 text-sky-400 shrink-0" />;
  if (type === "date")
    return <Calendar className="w-3 h-3 text-violet-400 shrink-0" />;
  return <Type className="w-3 h-3 text-gray-300 shrink-0" />;
}

function plural(n: number, noun: string) {
  return `${n.toLocaleString()} ${noun}${n === 1 ? "" : "s"}`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Core wizard state ─────────────────────────────────────────────────────
  // If a resume ID is present, skip the hub and show a loading state until data arrives
  const resumeId = searchParams.get("resume");
  const [step, setStep] = useState<Step>(resumeId ? "upload" : "select");
  const [file, setFile] = useState<File | null>(null);
  const [entity, setEntity] = useState<EntityType>("Product");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // ── Mapping state ─────────────────────────────────────────────────────────
  // Active mapping and scores — may differ from suggestedMapping if a template
  // was applied or the user manually changed things in the map step.
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [score, setScore] = useState<Record<string, number>>({});
  const [attributeKeys, setAttributeKeys] = useState<string[]>([]);

  // ── Template state ────────────────────────────────────────────────────────
  const [appliedTemplate, setAppliedTemplate] = useState<MappingTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [allTemplates, setAllTemplates] = useState<MappingTemplate[]>([]);

  // ── Registry mapping UI state ─────────────────────────────────────────────
  // Columns the user has explicitly flagged as missing from the registry.
  const [flaggedColumns, setFlaggedColumns] = useState<string[]>([]);
  // ── Sheet escape hatch ────────────────────────────────────────────────────
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  // ── UI toggles ────────────────────────────────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAllFiles, setShowAllFiles] = useState(false);

  // ── Snapshot preview state ───────────────────────────────────────────────
  const [snapshotPreview, setSnapshotPreview] = useState<{
    snapshotApplicable: boolean;
    entity?: string;
    activeInDb?: number;
    inFile?: number;
    toDeactivate?: number;
    toCreate?: number;
    toUpdate?: number;
    deactivationSample?: string[];
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // ── Undo snapshot state ─────────────────────────────────────────────────
  const [undoing, setUndoing] = useState(false);
  const [undoComplete, setUndoComplete] = useState(false);

  // ── Import + validation state ─────────────────────────────────────────────
  const [processing, setProcessing] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: string[];
    delta?: Record<string, { created: number; updated: number; deactivated?: number }>;
    notes?: string[];
  } | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [dismissedErrorBanner, setDismissedErrorBanner] = useState(false);

  // ── Multi-entity sequential import state ───────────────────────────────────
  const [multiEntityProgress, setMultiEntityProgress] = useState<string | null>(null);
  const [aggregatedDelta, setAggregatedDelta] = useState<Record<string, { created: number; updated: number; deactivated?: number }>>({});

  // ── Multi-pass state ──────────────────────────────────────────────────────
  const [parentSourceId, setParentSourceId] = useState<string | null>(null);
  const [addingPass, setAddingPass] = useState(false);

  // ── Supply chain hub: coverage data (all 16 entity types via DataSource) ──
  const [coverageMap, setCoverageMap] = useState<Record<string, CoverageEntry>>({});
  const [freshnessLoading, setFreshnessLoading] = useState(true);
  const [freshnessVersion, setFreshnessVersion] = useState(0);

  useEffect(() => {
    setFreshnessLoading(true);
    fetch("/api/data/import/coverage")
      .then((r) => r.json())
      .then((data: { coverage: Record<string, CoverageEntry> }) => setCoverageMap(data.coverage))
      .catch(() => {/* non-critical — coverage display degrades gracefully */})
      .finally(() => setFreshnessLoading(false));
  }, [freshnessVersion]);

  // ── Resume a previously started import ───────────────────────────────────
  useEffect(() => {
    const resumeId = searchParams.get("resume");
    if (!resumeId) return;

    fetch(`/api/data/sources/${resumeId}`)
      .then((r) => r.json())
      .then((data: UploadResult & { attributeKeys?: string[] }) => {
        setUploadResult(data);
        setMapping(data.suggestedMapping ?? {});
        setScore(data.score ?? {});
        setAttributeKeys(data.attributeKeys ?? []);
        setStep("map");
      })
      .catch(() => {
        // If the source can't be loaded, stay on select screen
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const fields = uploadResult
    ? CANONICAL_FIELDS[uploadResult.entity]
    : CANONICAL_FIELDS[entity];

  const mappedFields = fields.filter((f) => mapping[f.field]);
  const mappedSourceCols = new Set(Object.values(mapping).filter(Boolean));
  const unmappedSourceCols = uploadResult
    ? uploadResult.headers.filter((h) => !mappedSourceCols.has(h))
    : [];

  // Step indicator: always shows Upload → Confirm → Done (3 pills).
  // The Map sub-step is not a named milestone — it's just what happens before Confirm.
  const MILESTONES = ["Upload", "Confirm", "Done"] as const;
  type Milestone = typeof MILESTONES[number];
  const milestoneFor: Record<Step, Milestone> = {
    select: "Upload",
    upload: "Upload",
    "entity-split": "Confirm",
    map: "Confirm",
    confirm: "Confirm",
    done: "Done",
  };
  const currentMilestone = milestoneFor[step];
  const milestoneIndex = MILESTONES.indexOf(currentMilestone);

  // ── Utility: merge a saved template onto the current mapping ──────────────
  /**
   * For each [canonical → sourceCol] in the template, if sourceCol exists
   * in the current file headers the mapping is accepted at score 1.0.
   * Columns that no longer exist fall back to the auto-suggested value.
   */
  function mergeTemplate(
    template: MappingTemplate,
    baseMapping: Record<string, string>,
    baseScore: Record<string, number>,
    headers: string[]
  ): { mapping: Record<string, string>; score: Record<string, number>; attributeKeys: string[] } {
    const m = { ...baseMapping };
    const s = { ...baseScore };
    for (const [canonical, sourceCol] of Object.entries(template.mapping)) {
      if (headers.includes(sourceCol)) {
        m[canonical] = sourceCol;
        s[canonical] = 1.0;
      }
    }
    return { mapping: m, score: s, attributeKeys: template.attributeKeys ?? [] };
  }

  // ── Upload handler ────────────────────────────────────────────────────────
  async function handleUpload(overrideSheet?: string) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("entity", entity);
    if (overrideSheet) fd.append("sheet", overrideSheet);

    let data: UploadResult;
    try {
      const res = await fetch("/api/data/import", { method: "POST", body: fd });
      data = await res.json();
      if (!res.ok) {
        setUploadError((data as unknown as { error: string }).error ?? "Upload failed");
        setUploading(false);
        return;
      }
    } catch {
      setUploadError("Network error — please try again.");
      setUploading(false);
      return;
    }

    setUploading(false);
    setUploadResult(data);
    setShowSheetPicker(false);

    // ── Auto-apply the first template that matches this entity ─────────────
    let activeMapping = data.suggestedMapping;
    let activeScore = data.score;
    let activeAttributeKeys: string[] = [];
    let matched: MappingTemplate | null = null;

    try {
      const tRes = await fetch(`/api/data/mapping-templates?entity=${data.entity}`);
      if (tRes.ok) {
        const tData = await tRes.json();
        const templates: MappingTemplate[] = tData.templates ?? [];
        setAllTemplates(templates);
        if (templates.length > 0) {
          // First match wins — no picker needed
          const merged = mergeTemplate(
            templates[0],
            activeMapping,
            activeScore,
            data.headers
          );
          activeMapping = merged.mapping;
          activeScore = merged.score;
          activeAttributeKeys = merged.attributeKeys;
          matched = templates[0];
        }
      }
    } catch {
      // Templates are non-critical; continue without them
    }

    setMapping(activeMapping);
    setScore(activeScore);
    setAttributeKeys(activeAttributeKeys);
    setAppliedTemplate(matched);

    // ── Route to the right step ────────────────────────────────────────────
    // If the file contains 2+ entities at high/medium confidence AND each
    // entity's required fields can be auto-mapped, show entity-split.
    const significantEntities = (data.detectedEntities ?? [])
      .filter((e) => e.confidence === "high" || e.confidence === "medium")
      .filter((e) => {
        const fields = CANONICAL_FIELDS[e.entity as EntityType];
        if (!fields) return false;
        const { mapping: testMapping } = suggestMappingWithConfidence(
          data.headers, e.entity as EntityType
        );
        return fields.filter((f) => f.required).every((f) => !!testMapping[f.field]);
      });
    if (significantEntities.length >= 2) {
      setStep("entity-split");
    } else {
      // Single entity — go straight to mapping as before.
      setStep("map");
    }
  }

  // ── Save mapping (fire-and-forget or awaited) ─────────────────────────────
  function saveMapping(
    sourceId: string,
    ent: EntityType,
    m: Record<string, string>,
    attrKeys: string[]
  ): Promise<void> {
    return fetch(`/api/data/sources/${sourceId}/map`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping: m, entity: ent, attributeKeys: attrKeys }),
    }).then(() => {});
  }

  // ── Confirm mapping (from the Map step) ───────────────────────────────────
  async function handleConfirmMapping() {
    if (!uploadResult) return;
    await saveMapping(uploadResult.sourceId, uploadResult.entity, mapping, attributeKeys);
    setStep("confirm");

    // Fetch snapshot preview in background (non-blocking)
    setLoadingPreview(true);
    setSnapshotPreview(null);
    try {
      const res = await fetch(`/api/data/sources/${uploadResult.sourceId}/preview-snapshot`, { method: "POST" });
      if (res.ok) {
        const preview = await res.json();
        if (preview.snapshotApplicable) setSnapshotPreview(preview);
      }
    } catch {
      // Non-critical — preview is informational
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Process (actual import) ───────────────────────────────────────────────
  async function handleProcess() {
    if (!uploadResult) return;
    setProcessing(true);
    setDismissedErrorBanner(false);

    // Ensure the very latest mapping+attributeKeys are persisted before we
    // process — handles the edge case where the user edited things in Advanced.
    await saveMapping(uploadResult.sourceId, uploadResult.entity, mapping, attributeKeys);

    const res = await fetch(
      `/api/data/sources/${uploadResult.sourceId}/process`,
      { method: "POST" }
    );
    const result = await res.json();
    setImportResult(result);
    setParentSourceId(uploadResult.sourceId);
    setProcessing(false);
    setStep("done");

    // Run validation in the background — surface as a dismissible banner
    runValidationInBackground(uploadResult.sourceId);
  }

  async function runValidationInBackground(sourceId: string) {
    try {
      const res = await fetch(`/api/data/sources/${sourceId}/validate`, {
        method: "POST",
      });
      if (res.ok) setValidationResult(await res.json());
    } catch {
      // Non-critical — don't surface network errors for background task
    }
  }

  // ── Template save (Advanced section) ─────────────────────────────────────
  async function handleSaveTemplate() {
    if (!uploadResult || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/data/mapping-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          entity: uploadResult.entity,
          mapping,
          attributeKeys,
        }),
      });
      if (res.ok) setTemplateName("");
    } finally {
      setSavingTemplate(false);
    }
  }

  // ── Multi-pass: map a second entity from the same file ───────────────────
  async function handleAddPass(newEntity: EntityType) {
    if (!parentSourceId) return;
    setAddingPass(true);
    setEntity(newEntity);
    try {
      const res = await fetch(`/api/data/sources/${parentSourceId}/clone-pass`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity: newEntity }),
      });
      if (!res.ok) return;
      const data: UploadResult = await res.json();
      // Use the cloned source's result as the new upload result and route it
      setUploadResult(data);
      setMapping(data.suggestedMapping);
      setScore(data.score ?? {});
      setAttributeKeys([]);
      setImportResult(null);
      setValidationResult(null);
      setAppliedTemplate(null);
      setDismissedErrorBanner(false);

      // Always show the Map step — auto-mapping is a suggestion, not a final answer.
      setStep("map");
    } finally {
      setAddingPass(false);
    }
  }

  // ── Sequential multi-entity import (entity-split confirm) ─────────────
  async function handleMultiEntityImport() {
    if (!uploadResult) return;
    setProcessing(true);
    setDismissedErrorBanner(false);

    const significantEntities = (uploadResult.detectedEntities ?? []).filter(
      (e) => e.confidence === "high" || e.confidence === "medium"
    );

    // Ensure the user's explicitly selected entity is always imported, even if
    // the auto-detector didn't flag it at high/medium confidence.
    const userEntity = uploadResult.entity;
    if (!significantEntities.some((e) => e.entity === userEntity)) {
      significantEntities.push({ entity: userEntity, confidence: "medium" as const, columnsUsed: [], requiredFieldsMatched: 0 });
    }

    // Import order: Product first (join anchor), then Supplier, then everything else
    const ORDER: string[] = ["Product", "Supplier", "InventoryItem", "BOM"];
    const sorted = [...significantEntities].sort((a, b) => {
      const ai = ORDER.indexOf(a.entity);
      const bi = ORDER.indexOf(b.entity);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const delta: Record<string, { created: number; updated: number; deactivated?: number }> = {};
    let totalImported = 0;
    const allErrors: string[] = [];
    const allNotes: string[] = [];
    let currentSourceId = uploadResult.sourceId;
    // Track which source imported the most rows so we validate the right entity
    let bestSourceId = currentSourceId;
    let bestImported = 0;
    // Track the source for the user's explicitly selected entity for validation
    let userEntitySourceId = currentSourceId;

    for (let i = 0; i < sorted.length; i++) {
      const ent = sorted[i];
      const entityType = ent.entity as EntityType;
      const isUserEntity = entityType === userEntity;
      const noun = ENTITY_NOUN[entityType] ?? ent.entity.toLowerCase();
      setMultiEntityProgress(`Importing ${noun}s… (${i + 1} of ${sorted.length})`);

      if (i === 0) {
        // First entity uses the original upload source.
        // For the user's selected entity, preserve the mapping from state
        // (which includes the initial auto-suggestion and any user edits).
        // For other entities, generate a fresh mapping for THEIR canonical fields.
        const passMapping = isUserEntity
          ? mapping
          : buildMappingFromClassification(uploadResult.columnClassification, entityType)
            ?? suggestMappingWithConfidence(uploadResult.headers, entityType).mapping;

        // Skip non-user entities whose required fields can't be auto-mapped —
        // they'd fail 100% of rows and just pollute the error list.
        if (!isUserEntity) {
          const entityFields = CANONICAL_FIELDS[entityType] ?? [];
          const missingRequired = entityFields.filter(
            (f) => f.required && !passMapping[f.field]
          );
          if (missingRequired.length > 0) continue;
        }

        const passAttrKeys = isUserEntity ? attributeKeys : [];
        await saveMapping(currentSourceId, entityType, passMapping, passAttrKeys);
        const res = await fetch(`/api/data/sources/${currentSourceId}/process`, { method: "POST" });
        const result = await res.json();
        const passImported = result.imported ?? 0;
        totalImported += passImported;
        if (passImported > bestImported) { bestImported = passImported; bestSourceId = currentSourceId; }
        if (isUserEntity) userEntitySourceId = currentSourceId;
        allErrors.push(...(result.errors ?? []));
        if (result.delta) {
          for (const [k, v] of Object.entries(result.delta) as [string, { created: number; updated: number; deactivated?: number }][]) {
            delta[k] = {
              created: (delta[k]?.created ?? 0) + v.created,
              updated: (delta[k]?.updated ?? 0) + v.updated,
              deactivated: (delta[k]?.deactivated ?? 0) + (v.deactivated ?? 0) || undefined,
            };
          }
        }
        setParentSourceId(currentSourceId);
      } else {
        // Subsequent entities use clone-pass.
        const cloneRes = await fetch(`/api/data/sources/${currentSourceId}/clone-pass`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity: entityType }),
        });
        if (!cloneRes.ok) continue;
        const cloneData: UploadResult = await cloneRes.json();
        // For the user's entity, use the mapping from state (preserves manual edits).
        // For other entities, use the clone-pass's fresh auto-mapping.
        const passMapping = isUserEntity
          ? mapping
          : buildMappingFromClassification(uploadResult.columnClassification, entityType)
            ?? cloneData.suggestedMapping;

        // Skip non-user entities whose ACTUAL mapping is missing identity fields —
        // identity fields are the minimum to prove the entity exists. Non-identity
        // required fields can be defaulted during processing.
        if (!isUserEntity) {
          const entityFields = CANONICAL_FIELDS[entityType] ?? [];
          const missingIdentity = entityFields.filter(
            (f: { identity?: boolean; field: string }) => f.identity && !passMapping[f.field]
          );
          if (missingIdentity.length > 0) continue;
        }

        const passAttrKeys = isUserEntity ? attributeKeys : [];
        await saveMapping(cloneData.sourceId, entityType, passMapping, passAttrKeys);
        const res = await fetch(`/api/data/sources/${cloneData.sourceId}/process`, { method: "POST" });
        const result = await res.json();
        const passImported = result.imported ?? 0;
        totalImported += passImported;
        if (passImported > bestImported) { bestImported = passImported; bestSourceId = cloneData.sourceId; }
        if (isUserEntity) userEntitySourceId = cloneData.sourceId;
        allErrors.push(...(result.errors ?? []));
        if (result.notes) allNotes.push(...(result.notes as string[]));
        if (result.delta) {
          for (const [k, v] of Object.entries(result.delta) as [string, { created: number; updated: number; deactivated?: number }][]) {
            delta[k] = {
              created: (delta[k]?.created ?? 0) + v.created,
              updated: (delta[k]?.updated ?? 0) + v.updated,
              deactivated: (delta[k]?.deactivated ?? 0) + (v.deactivated ?? 0) || undefined,
            };
          }
        }
      }
    }

    setAggregatedDelta(delta);
    setImportResult({ imported: totalImported, errors: allErrors.slice(0, 10), delta, notes: allNotes.length > 0 ? allNotes : undefined });
    setMultiEntityProgress(null);
    setProcessing(false);
    setStep("done");

    // Validate the user's selected entity source (falls back to best-imported source)
    runValidationInBackground(userEntitySourceId || bestSourceId);
  }

  // ── Undo snapshot deactivation ─────────────────────────────────────────
  async function handleUndoSnapshot() {
    if (!parentSourceId) return;
    setUndoing(true);
    try {
      const res = await fetch(`/api/data/sources/${parentSourceId}/undo-snapshot`, { method: "POST" });
      if (res.ok) {
        setUndoComplete(true);
      }
    } catch {
      // Surface error via existing error banner mechanism
    } finally {
      setUndoing(false);
    }
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setStep("select");
    setFreshnessVersion((v) => v + 1); // re-fetch coverage to reflect just-imported data
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
    setMapping({});
    setScore({});
    setAttributeKeys([]);
    setAppliedTemplate(null);
    setImportResult(null);
    setValidationResult(null);
    setParentSourceId(null);
    setShowAdvanced(false);
    setShowSheetPicker(false);
    setDismissedErrorBanner(false);
    setFlaggedColumns([]);
    setMultiEntityProgress(null);
    setAggregatedDelta({});
    setSnapshotPreview(null);
    setLoadingPreview(false);
    setUndoing(false);
    setUndoComplete(false);
  }, []);

  // ── Inline helpers ────────────────────────────────────────────────────────
  function toggleAttributeKey(col: string) {
    setAttributeKeys((prev) =>
      prev.includes(col) ? prev.filter((k) => k !== col) : [...prev, col]
    );
  }

  /**
   * Handle the source-column-centric mapping dropdown in the new map UI.
   * value = canonicalKey, "__ignore__", or "__flag__"
   */
  function handleSourceColumnMapping(sourceCol: string, value: string) {
    if (value === "__flag__") {
      handleFlagColumn(sourceCol);
      return;
    }

    // Remove flagged status if user re-maps a previously flagged column
    setFlaggedColumns((prev) => prev.filter((c) => c !== sourceCol));

    setMapping((prev) => {
      const next = { ...prev };
      // Clear any canonical field that was previously mapped to this source column
      for (const [canonical, source] of Object.entries(next)) {
        if (source === sourceCol) delete next[canonical];
      }
      // Set new canonical → source mapping
      if (value !== "__ignore__" && value !== "__none__") {
        next[value] = sourceCol;
      }
      return next;
    });

    setScore((prev) => {
      if (value !== "__ignore__" && value !== "__none__" && value !== "__flag__") {
        return { ...prev, [value]: 1.0 };
      }
      return prev;
    });

    // Reset acknowledgement if user changes the mapping
  }

  /** Flag a source column as missing from the registry and POST to the API. */
  async function handleFlagColumn(sourceCol: string) {
    setFlaggedColumns((prev) =>
      prev.includes(sourceCol) ? prev : [...prev, sourceCol]
    );
    // Clear any canonical mapping for this column
    setMapping((prev) => {
      const next = { ...prev };
      for (const [canonical, source] of Object.entries(next)) {
        if (source === sourceCol) delete next[canonical];
      }
      return next;
    });

    if (!uploadResult) return;
    const samples = uploadResult.sampleValues?.[sourceCol]?.slice(0, 5) ?? [];
    try {
      await fetch("/api/data/flagged-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: uploadResult.entity,
          columnName: sourceCol,
          sampleValues: samples,
        }),
      });
    } catch {
      // Non-critical — flag still recorded locally in UI state
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={cn("space-y-6 mx-auto w-full", step === "select" ? "max-w-5xl" : step === "map" ? "max-w-4xl" : step === "entity-split" ? "max-w-3xl" : "max-w-2xl")}>
      {step !== "select" && (
        <div>
          <h1 className="text-xl font-bold text-gray-900">Import Data</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a CSV or Excel file — we&apos;ll handle the rest.
          </p>
        </div>
      )}

      {/* ── Step indicator — hidden on supply chain hub ─────────────────── */}
      {step !== "select" && (
        <div className="flex items-center gap-2">
          {MILESTONES.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
                  i <= milestoneIndex ? "text-slate-900" : "text-gray-400"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs transition-colors ${
                    i < milestoneIndex
                      ? "bg-slate-900 text-white"
                      : i === milestoneIndex
                      ? "bg-slate-900 text-white"
                      : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {i < milestoneIndex ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    i + 1
                  )}
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

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Select (supply chain hub)                                    */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "select" && (() => {
        const renderCard = (type: EntityType, blurb: string, category: string, isEssential: boolean) => {
          const entry = coverageMap[type];
          const hasData = (entry?.importedRows ?? 0) > 0;
          const unit = ENTITY_UNIT[type] ?? "records";
          const meta = hasData
            ? `${entry!.importedRows.toLocaleString()} ${unit} · ${category}`
            : `${blurb || category}${blurb ? ` · ${category}` : ""}`;
          return (
            <div
              key={type}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border px-5 py-4 transition-shadow",
                hasData
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-gray-200 bg-white hover:shadow-sm"
              )}
            >
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={cn(
                    "mt-1.5 w-2.5 h-2.5 rounded-full shrink-0",
                    hasData ? "bg-emerald-500" : "bg-gray-300"
                  )}
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {ENTITY_LABELS[type]}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{meta}</p>
                </div>
              </div>
              <button
                onClick={() => { setEntity(type); setStep("upload"); }}
                className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                {hasData ? "Re-upload" : "Upload"}
              </button>
            </div>
          );
        };

        const uploadedEssentials = ESSENTIAL_ENTITIES.filter(
          (e) => (coverageMap[e.type]?.importedRows ?? 0) > 0
        ).length;
        const pct = Math.round((uploadedEssentials / ESSENTIAL_ENTITIES.length) * 100);

        const additionalEntities = (Object.keys(ENTITY_LABELS) as EntityType[])
          .filter((t) => !ESSENTIAL_TYPES.has(t));

        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Connect your operational data</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload the files Focus needs to answer inventory and procurement questions. Start with the essentials.
              </p>
            </div>

            {/* Progress */}
            <div className="space-y-2">
              <p className="text-sm text-gray-700">
                {uploadedEssentials} of {ESSENTIAL_ENTITIES.length} essential files uploaded
              </p>
              <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Essentials */}
            <div className="space-y-3">
              <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                Essential — upload these first
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ESSENTIAL_ENTITIES.map((e) => renderCard(e.type, e.blurb, e.category, true))}
              </div>
            </div>

            {/* Hint banner */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100">
              <Sparkles className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-900">
                You can start asking questions after uploading{" "}
                <span className="font-semibold">Products, Suppliers, Inventory, and Purchase Orders</span>.
                The rest will improve answer depth.
              </p>
            </div>

            {/* Additional data */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <p className="text-xs text-gray-400">Additional data — add when ready</p>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                onClick={() => setShowAllFiles((v) => !v)}
                className="w-full text-sm font-medium text-gray-700 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
              >
                {showAllFiles ? "Hide" : "Show"} {additionalEntities.length} more files
                {showAllFiles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showAllFiles && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {additionalEntities.map((t) =>
                    renderCard(t, "", ENTITY_CATEGORY[t] ?? "", false)
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Upload                                                       */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "upload" && resumeId && !uploadResult && (
        <div className="flex items-center justify-center py-24 text-gray-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Loading import…
        </div>
      )}

      {step === "upload" && !(resumeId && !uploadResult) && (
        <div className="space-y-4">
          {/* Back button — outside the card */}
          <button
            onClick={() => { setFile(null); setUploadError(null); setStep("select"); }}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg px-3 py-2 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Import
          </button>

          <Card>
            <CardContent className="p-8 space-y-6">
              {/* Header */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{ENTITY_LABELS[entity]}</h2>
                <p className="text-sm text-gray-500 mt-0.5">Upload a CSV or Excel file — we'll map your columns automatically.</p>
              </div>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  file ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 hover:border-slate-400 hover:bg-gray-50"
                }`}
                onClick={() => fileRef.current?.click()}
              >
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                      <Upload className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Click to select your file</p>
                      <p className="text-xs text-gray-400 mt-0.5">CSV or .xlsx · Max 50 MB</p>
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
                {uploading ? "Analysing your file…" : "Upload & auto-detect fields"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Entity-split (multi-entity detected)                         */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "entity-split" && uploadResult && (() => {
        const significantEntities = (uploadResult.detectedEntities ?? [])
          .filter((e) => e.confidence === "high" || e.confidence === "medium")
          .filter((e) => {
            // Only show entities whose required fields can actually be auto-mapped.
            // This prevents showing e.g. BOM when the file has parentSku/componentSku
            // columns but no BOM quantity column — it would fail 100% of rows.
            const fields = CANONICAL_FIELDS[e.entity as EntityType];
            if (!fields) return false;
            const { mapping: testMapping } = suggestMappingWithConfidence(
              uploadResult.headers, e.entity as EntityType
            );
            return fields
              .filter((f) => f.required)
              .every((f) => !!testMapping[f.field]);
          });
        const classification = uploadResult.columnClassification ?? {};
        const calculatedCols = Object.entries(classification).filter(
          ([, c]) => c.type === "calculated" && c.logicParamKey
        );
        const unclassifiedCols = Object.entries(classification).filter(
          ([, c]) => c.type === "unclassified"
        );

        return (
          <Card>
            <CardContent className="p-6 space-y-5">
              {/* Header */}
              <div>
                <p className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Columns className="w-5 h-5 text-slate-500" />
                  We detected multiple data types in your file
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Your file contains {significantEntities.length} entity types.
                  We&apos;ll import them in the right order automatically.
                </p>
              </div>

              {/* Entity cards */}
              <div className="grid gap-3">
                {significantEntities.map((ent, i) => {
                  const label = ENTITY_LABELS[ent.entity as EntityType] ?? ent.entity;
                  return (
                    <div
                      key={ent.entity}
                      className="rounded-lg border border-gray-200 bg-white p-4 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {i + 1}
                          </div>
                          <span className="text-sm font-semibold text-gray-900">{label}</span>
                        </div>
                        <span className={cn(
                          "text-[10px] font-medium px-2 py-0.5 rounded-full",
                          ent.confidence === "high"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        )}>
                          {ent.confidence} confidence
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {ent.columnsUsed.length} column{ent.columnsUsed.length !== 1 ? "s" : ""} matched
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {ent.columnsUsed.map((col) => (
                          <span
                            key={col}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-50 border border-slate-200 text-slate-600"
                          >
                            {col}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Business logic captured */}
              {calculatedCols.length > 0 && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    <p className="text-sm font-semibold text-blue-900">Business logic captured</p>
                  </div>
                  <p className="text-xs text-blue-700">
                    Focus will recalculate these from your live data. We&apos;ve captured the parameters your team uses.
                  </p>
                  <div className="space-y-1">
                    {calculatedCols.map(([col, c]) => (
                      <div key={col} className="flex items-center gap-2 text-xs text-blue-800">
                        <span className="font-medium">{c.logicParamKey}</span>
                        <span className="text-blue-500">=</span>
                        <span className="text-blue-600">
                          {c.logicParamValue
                            ? `${c.logicParamValue.days} ${c.logicParamValue.unit}`
                            : "detected"}
                        </span>
                        <span className="text-blue-400 text-[10px]">({col})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unclassified columns */}
              {unclassifiedCols.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">
                    Unclassified columns
                  </p>
                  <p className="text-xs text-gray-400">
                    These columns weren&apos;t matched to any entity. They&apos;ll be skipped unless you assign them manually later.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {unclassifiedCols.map(([col]) => (
                      <span
                        key={col}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-white border border-gray-200 text-gray-500"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress indicator (shown during sequential import) */}
              {processing && multiEntityProgress && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                  {multiEntityProgress}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep("map")}
                  disabled={processing}
                  className="flex-1"
                >
                  Review mapping manually
                </Button>
                <Button
                  onClick={handleMultiEntityImport}
                  disabled={processing}
                  className="flex-1"
                >
                  {processing ? "Importing…" : "Confirm and import"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Map (registry-based two-panel mapping UI)                    */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "map" && uploadResult && (
        <RegistryMapStep
          uploadResult={uploadResult}
          mapping={mapping}
          appliedTemplate={appliedTemplate}
          flaggedColumns={flaggedColumns}
          onSourceColumnMapping={handleSourceColumnMapping}
          showAdvanced={showAdvanced}
          onToggleAdvanced={() => setShowAdvanced((v) => !v)}
          setMapping={setMapping}
          setScore={setScore}
          unmappedSourceCols={unmappedSourceCols}
          attributeKeys={attributeKeys}
          onToggleAttributeKey={toggleAttributeKey}
          templateName={templateName}
          setTemplateName={setTemplateName}
          savingTemplate={savingTemplate}
          onSaveTemplate={handleSaveTemplate}
          allTemplates={allTemplates}
          onConfirm={handleConfirmMapping}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Confirm                                                      */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "confirm" && uploadResult && (
        <Card>
          <CardContent className="p-6 space-y-5">
            {/* Plain-language summary */}
            <div className="bg-slate-50 rounded-xl p-5 space-y-2">
              <p className="text-base font-semibold text-slate-900">
                Ready to import{" "}
                {plural(
                  uploadResult.rowCount,
                  ENTITY_NOUN[uploadResult.entity]
                )}{" "}
                from{" "}
                <span className="text-slate-600">
                  {uploadResult.sourceId
                    ? uploadResult.selectedSheet
                      ? `${uploadResult.selectedSheet}`
                      : "your file"
                    : "your file"}
                </span>
              </p>

              {/* Mapped-fields pill list */}
              <p className="text-xs text-gray-500">
                {mappedFields.length > 0
                  ? `${mappedFields.length} field${mappedFields.length !== 1 ? "s" : ""} matched`
                  : "No fields matched"}{" "}
                {attributeKeys.length > 0 &&
                  `· ${attributeKeys.length} extra column${attributeKeys.length !== 1 ? "s" : ""} saved as attributes`}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {mappedFields.map(({ field, label }) => {
                  const s = score[field] ?? 0;
                  return (
                    <span
                      key={field}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                        s >= 1.0
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : s >= AUTO_MAP_THRESHOLD
                          ? "bg-blue-50 border-blue-200 text-blue-700"
                          : "bg-amber-50 border-amber-200 text-amber-700"
                      }`}
                    >
                      {s >= 1.0 ? (
                        <CheckCircle className="w-2.5 h-2.5" />
                      ) : null}
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Snapshot deactivation warning */}
            {loadingPreview && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking impact on existing data…
              </div>
            )}
            {snapshotPreview && (snapshotPreview.toDeactivate ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <p className="text-sm font-semibold text-amber-800">
                    {plural(snapshotPreview.toDeactivate!, ENTITY_NOUN[uploadResult.entity])}{" "}
                    in your current data will be deactivated
                  </p>
                </div>
                <p className="text-xs text-amber-700">
                  These records exist in your database but are not in this file.
                  They will be marked inactive (not deleted). You can undo this within 24 hours.
                </p>
                {snapshotPreview.deactivationSample && snapshotPreview.deactivationSample.length > 0 && (
                  <p className="text-xs text-amber-600">
                    Examples: {snapshotPreview.deactivationSample.join(", ")}
                  </p>
                )}
              </div>
            )}

            {/* Template auto-applied notice */}
            {appliedTemplate && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-emerald-500" />
                We applied your saved mapping for{" "}
                <strong className="text-gray-700">
                  {ENTITY_LABELS[uploadResult.entity]}
                </strong>
                . Review below.
              </p>
            )}

            {/* Sheet info + escape hatch */}
            {uploadResult.wasAutoSelected && uploadResult.allSheets.length > 1 && (
              <div className="text-xs text-gray-500 space-y-2">
                <div className="flex items-center gap-2">
                  <span>
                    Using sheet:{" "}
                    <strong className="text-gray-700">
                      {uploadResult.selectedSheet}
                    </strong>
                  </span>
                  <button
                    className="text-slate-600 underline underline-offset-2 hover:text-slate-900"
                    onClick={() => setShowSheetPicker((v) => !v)}
                  >
                    Wrong sheet?
                  </button>
                </div>

                {showSheetPicker && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {uploadResult.allSheets
                      .filter((s) => s !== uploadResult.selectedSheet)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => handleUpload(s)}
                          disabled={uploading}
                          className="rounded border border-gray-200 bg-white px-3 py-1 text-xs hover:border-slate-400 hover:text-slate-900 transition-colors"
                        >
                          {uploading ? "…" : s}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}

            {/* Advanced section (collapsed by default on Confirm screen) */}
            <AdvancedSection
              show={showAdvanced}
              onToggle={() => setShowAdvanced((v) => !v)}
              uploadResult={uploadResult}
              mapping={mapping}
              setMapping={setMapping}
              setScore={setScore}
              unmappedSourceCols={unmappedSourceCols}
              attributeKeys={attributeKeys}
              onToggleAttributeKey={toggleAttributeKey}
              templateName={templateName}
              setTemplateName={setTemplateName}
              savingTemplate={savingTemplate}
              onSaveTemplate={handleSaveTemplate}
              allTemplates={allTemplates}
              appliedTemplate={appliedTemplate}
            />

            {processing && (
              <div className="space-y-1.5">
                <p className="text-sm text-gray-600">Importing…</p>
                <Progress value={undefined} className="animate-pulse" />
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
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Done                                                         */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "done" && importResult && uploadResult && (
        <Card>
          <CardContent className="p-6 space-y-5">
            {/* Hero summary with delta breakdown */}
            <div className="text-center space-y-2 pb-2">
              {importResult.imported > 0 ? (
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
              )}

              {importResult.delta && Object.keys(importResult.delta).some((k) => k !== "LogicParam") ? (
                <>
                  <p className="text-lg font-semibold text-gray-900">Import complete</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    {Object.entries(importResult.delta)
                      .filter(([k]) => k !== "LogicParam")
                      .map(([entityKey, counts]) => {
                        const noun = ENTITY_NOUN[entityKey as EntityType] ?? entityKey.toLowerCase();
                        return (
                          <div key={entityKey} className="space-y-0.5">
                            {counts.created > 0 && (
                              <p>{plural(counts.created, `new ${noun}`)} added</p>
                            )}
                            {counts.updated > 0 && (
                              <p>{plural(counts.updated, `${noun}`)} {counts.created > 0 ? "merged (duplicate rows)" : "updated"}</p>
                            )}
                            {(counts as { deactivated?: number }).deactivated != null && (counts as { deactivated?: number }).deactivated! > 0 && (
                              <p className="text-amber-600">
                                {plural((counts as { deactivated?: number }).deactivated!, noun)} deactivated (not in file)
                              </p>
                            )}
                          </div>
                        );
                      })}
                    {importResult.delta.LogicParam && (importResult.delta.LogicParam.created + importResult.delta.LogicParam.updated) > 0 && (
                      <p className="text-blue-600">
                        {plural(
                          importResult.delta.LogicParam.created + importResult.delta.LogicParam.updated,
                          "business parameter"
                        )} captured
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-gray-900">
                    {importResult.imported > 0
                      ? `Done! ${plural(importResult.imported, ENTITY_NOUN[uploadResult.entity])} imported.`
                      : "Import failed — no records were saved."}
                  </p>
                  {importResult.imported === 0 && importResult.errors.length === 0 && (
                    <p className="text-sm text-gray-500">
                      All rows were skipped. Check that your column mapping is correct and try again.
                    </p>
                  )}
                </>
              )}

              {importResult.errors.length > 0 && (
                <p className="text-sm text-gray-500">
                  {importResult.imported > 0
                    ? `${plural(importResult.errors.length, "row")} couldn\u2019t be saved and were skipped.`
                    : "See the details below for what went wrong."}
                </p>
              )}
            </div>

            {/* Snapshot undo banner */}
            {importResult.delta &&
              Object.values(importResult.delta).some(
                (c) => (c as { deactivated?: number }).deactivated != null && (c as { deactivated?: number }).deactivated! > 0
              ) &&
              !undoComplete && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-blue-700">
                    Wrong file? You can undo deactivations within 24 hours.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleUndoSnapshot}
                    disabled={undoing}
                    className="shrink-0"
                  >
                    {undoing ? "Undoing…" : "Undo deactivations"}
                  </Button>
                </div>
              )}
            {undoComplete && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
                <CheckCircle className="w-3.5 h-3.5 inline mr-1.5" />
                Deactivations have been reversed. All records are active again.
              </div>
            )}

            {/* Import notes banner — informational messages (e.g. defaulted values) */}
            {importResult.notes && importResult.notes.length > 0 && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 space-y-1">
                <p className="font-semibold">Import notes</p>
                {importResult.notes.map((note, i) => (
                  <p key={i} className="text-blue-700">{note}</p>
                ))}
              </div>
            )}

            {/* Process-level error banner */}
            {!dismissedErrorBanner && importResult.errors.length > 0 && (() => {
              // Deduplicate errors — show each unique message once with a count
              const counts = new Map<string, number>();
              for (const e of importResult.errors) {
                counts.set(e, (counts.get(e) ?? 0) + 1);
              }
              const unique = Array.from(counts.entries());
              return (
                <div className="relative rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1.5">
                  <button
                    className="absolute top-2 right-2 text-amber-400 hover:text-amber-700"
                    onClick={() => setDismissedErrorBanner(true)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <p className="font-semibold pr-4">
                    Skipped rows ({importResult.errors.length}
                    {importResult.errors.length >= 5 ? "+" : ""})
                  </p>
                  {unique.slice(0, 5).map(([msg, count], i) => (
                    <p key={i} className="text-amber-700 leading-relaxed">
                      {count > 1 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-200 text-amber-800 text-[10px] font-bold mr-1.5">
                          {count >= 5 ? `${count}+` : count}x
                        </span>
                      )}
                      {msg}
                    </p>
                  ))}
                </div>
              );
            })()}

            {/* Background validation banner (shown once validate finishes) */}
            {!dismissedErrorBanner &&
              validationResult &&
              validationResult.invalid > 0 && (
                <div className="relative rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                  <button
                    className="absolute top-2 right-2 text-red-300 hover:text-red-600"
                    onClick={() => setDismissedErrorBanner(true)}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <p className="font-semibold pr-4">
                    {plural(validationResult.invalid, "data quality issue")} found
                  </p>
                  {validationResult.errors.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-red-700">
                      Row {e.row}: {e.message}
                    </p>
                  ))}
                  {validationResult.hasMore && (
                    <p className="text-red-500">
                      …and {validationResult.errors.length - 3} more
                    </p>
                  )}
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

// ─── Registry Map Step ────────────────────────────────────────────────────────

interface RegistryMapStepProps {
  uploadResult: UploadResult;
  mapping: Record<string, string>;
  appliedTemplate: MappingTemplate | null;
  flaggedColumns: string[];
  onSourceColumnMapping: (sourceCol: string, value: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setScore: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  unmappedSourceCols: string[];
  attributeKeys: string[];
  onToggleAttributeKey: (col: string) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  savingTemplate: boolean;
  onSaveTemplate: () => void;
  allTemplates: MappingTemplate[];
  onConfirm: () => void;
}

function RegistryMapStep({
  uploadResult,
  mapping,
  appliedTemplate,
  flaggedColumns,
  onSourceColumnMapping,
  showAdvanced,
  onToggleAdvanced,
  setMapping,
  setScore,
  unmappedSourceCols,
  attributeKeys,
  onToggleAttributeKey,
  templateName,
  setTemplateName,
  savingTemplate,
  onSaveTemplate,
  allTemplates,
  onConfirm,
}: RegistryMapStepProps) {
  // Use CANONICAL_FIELDS as the single source of truth for dropdown options
  const entityFields = CANONICAL_FIELDS[uploadResult.entity] ?? [];
  const requiredFieldKeys = new Set(
    entityFields.filter((f) => f.required).map((f) => f.field)
  );

  // Invert the mapping: source column → canonical field key
  const invertedMapping: Record<string, string> = {};
  for (const [canonical, source] of Object.entries(mapping)) {
    if (source) invertedMapping[source] = canonical;
  }

  // Required fields that have no mapping
  const unmappedRequired = entityFields.filter(
    (f) => f.required && !mapping[f.field]
  );
  const canProceed = unmappedRequired.length === 0;

  // Sort headers: mapped first (sorted by confidence), then unmapped, then flagged
  const sortedHeaders = [...uploadResult.headers].sort((a, b) => {
    const aFlagged = flaggedColumns.includes(a);
    const bFlagged = flaggedColumns.includes(b);
    const aMapped = !!invertedMapping[a];
    const bMapped = !!invertedMapping[b];
    if (aFlagged !== bFlagged) return aFlagged ? 1 : -1;
    if (aMapped !== bMapped) return aMapped ? -1 : 1;
    return 0;
  });

  // Count mapped
  const mappedCount = uploadResult.headers.filter((h) => !!invertedMapping[h]).length;

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        {/* Header */}
        <div>
          <p className="text-base font-semibold text-gray-900">
            Map your columns
          </p>
          <p className="text-sm text-gray-500 mt-0.5">
            Match each column from your file to a{" "}
            <strong className="text-gray-700">{ENTITY_LABELS[uploadResult.entity]}</strong>{" "}
            field. {uploadResult.rowCount.toLocaleString()} rows detected.
          </p>
        </div>

        {appliedTemplate && (
          <div className="flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Saved mapping &ldquo;{appliedTemplate.name}&rdquo; applied. Review below.
          </div>
        )}

        {/* Summary bar */}
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
            <CheckCircle className="w-3.5 h-3.5" />
            {mappedCount} of {uploadResult.headers.length} columns mapped
          </span>
          {unmappedRequired.length > 0 && (
            <span className="inline-flex items-center gap-1 text-red-500 font-medium">
              <AlertCircle className="w-3.5 h-3.5" />
              {unmappedRequired.length} required {unmappedRequired.length === 1 ? "field" : "fields"} missing
            </span>
          )}
        </div>

        {/* Column mapping table */}
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_28px_200px] gap-2 items-center px-3 py-2 bg-gray-50 border-b text-[10px] font-semibold uppercase tracking-wide">
            <span className="text-gray-500">Your file column</span>
            <span />
            <span className="text-gray-500">System field</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {sortedHeaders.map((sourceCol) => {
              const mappedField = invertedMapping[sourceCol];
              const isFlagged = flaggedColumns.includes(sourceCol);
              const isMapped = !!mappedField && !isFlagged;
              const samples = uploadResult.sampleValues?.[sourceCol]?.slice(0, 3) ?? [];
              const colType = uploadResult.columnTypes?.[sourceCol];

              // Confidence info
              const conf = mappedField ? uploadResult.confidence?.[mappedField] : undefined;
              const sc = mappedField ? uploadResult.score?.[mappedField] : undefined;

              return (
                <div
                  key={sourceCol}
                  className={cn(
                    "grid grid-cols-[1fr_28px_200px] gap-2 items-center px-3 py-2.5",
                    isFlagged
                      ? "bg-amber-50/50"
                      : isMapped
                      ? "bg-emerald-50/30"
                      : "bg-white"
                  )}
                >
                  {/* Left: user's column */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <ColTypeBadge type={colType} />
                      <span className="text-sm font-medium text-gray-800 truncate">
                        {sourceCol}
                      </span>
                      {isMapped && (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      )}
                      {isFlagged && (
                        <Flag className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      )}
                    </div>
                    {samples.length > 0 && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate pl-5" title={samples.join(" · ")}>
                        {samples.join(" · ")}
                      </p>
                    )}
                    {isMapped && conf && conf !== "none" && sc !== undefined && (
                      <p className="text-[10px] text-blue-500 mt-0.5 pl-5">
                        Auto-matched ({Math.round(sc * 100)}% confidence)
                      </p>
                    )}
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />

                  {/* Right: system field dropdown */}
                  <Select
                    value={isFlagged ? "__flag__" : (mappedField ?? "__none__")}
                    onValueChange={(v) => onSourceColumnMapping(sourceCol, v)}
                  >
                    <SelectTrigger className={cn(
                      "h-8 text-xs",
                      isFlagged ? "border-amber-300 text-amber-700" : ""
                    )}>
                      <SelectValue placeholder="— skip —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— skip —</SelectItem>

                      {/* Required fields */}
                      {entityFields.filter((f) => f.required).length > 0 && (
                        <SelectGroup>
                          <SelectLabel className="text-[10px] text-red-500 uppercase tracking-wide">
                            Required
                          </SelectLabel>
                          {entityFields.filter((f) => f.required).map((f) => (
                            <SelectItem key={f.field} value={f.field}>
                              <span className="flex items-center gap-1.5">
                                <span>{f.label}</span>
                                {mapping[f.field] && mapping[f.field] !== sourceCol && (
                                  <span className="text-[10px] text-gray-400">(in use)</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}

                      {/* Optional fields */}
                      {entityFields.filter((f) => !f.required).length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel className="text-[10px] text-gray-400 uppercase tracking-wide">
                              Optional
                            </SelectLabel>
                            {entityFields.filter((f) => !f.required).map((f) => (
                              <SelectItem key={f.field} value={f.field}>
                                <span className="flex items-center gap-1.5">
                                  <span>{f.label}</span>
                                  {mapping[f.field] && mapping[f.field] !== sourceCol && (
                                    <span className="text-[10px] text-gray-400">(in use)</span>
                                  )}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}

                      <SelectSeparator />
                      <SelectItem value="__flag__">
                        <span className="flex items-center gap-1.5 text-amber-600">
                          <Flag className="w-3 h-3" />
                          Flag as missing
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Required fields still needed */}
        {unmappedRequired.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-2">
            <p className="text-sm text-red-700 font-medium flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Required fields not yet mapped:
            </p>
            <ul className="text-xs text-red-600 list-disc list-inside pl-0.5">
              {unmappedRequired.map((f) => (
                <li key={f.field}>{f.label}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Advanced section — metadata + template only, no duplicate mapping */}
        <AdvancedSection
          show={showAdvanced}
          onToggle={onToggleAdvanced}
          uploadResult={uploadResult}
          mapping={mapping}
          setMapping={setMapping}
          setScore={setScore}
          unmappedSourceCols={unmappedSourceCols}
          attributeKeys={attributeKeys}
          onToggleAttributeKey={onToggleAttributeKey}
          templateName={templateName}
          setTemplateName={setTemplateName}
          savingTemplate={savingTemplate}
          onSaveTemplate={onSaveTemplate}
          allTemplates={allTemplates}
          appliedTemplate={appliedTemplate}
        />

        <Button
          onClick={onConfirm}
          disabled={!canProceed}
          className="w-full"
        >
          Looks good — continue
        </Button>
      </CardContent>
    </Card>
  );
}


// ─── Advanced section (shared between Map and Confirm steps) ──────────────────

interface AdvancedSectionProps {
  show: boolean;
  onToggle: () => void;
  uploadResult: UploadResult;
  mapping: Record<string, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setScore: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  unmappedSourceCols: string[];
  attributeKeys: string[];
  onToggleAttributeKey: (col: string) => void;
  templateName: string;
  setTemplateName: (v: string) => void;
  savingTemplate: boolean;
  onSaveTemplate: () => void;
  allTemplates: MappingTemplate[];
  appliedTemplate: MappingTemplate | null;
}

function AdvancedSection({
  show,
  onToggle,
  uploadResult,
  mapping,
  setMapping,
  setScore,
  unmappedSourceCols,
  attributeKeys,
  onToggleAttributeKey,
  templateName,
  setTemplateName,
  savingTemplate,
  onSaveTemplate,
  allTemplates,
  appliedTemplate,
}: AdvancedSectionProps) {
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
      >
        Advanced options
        {show ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </button>

      {show && (
        <div className="border-t border-gray-100 px-3 py-3 space-y-4 bg-gray-50/50">
          {/* Extra fields → attributes */}
          {unmappedSourceCols.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
                Save extra columns as metadata
              </p>
              <p className="text-[11px] text-gray-400 mb-2">
                Checked columns are stored in{" "}
                <code className="bg-white border rounded px-1">attributes</code>{" "}
                — queryable later, no schema change needed.
              </p>
              <div className="divide-y divide-gray-100 rounded border border-gray-200 bg-white">
                {unmappedSourceCols.map((col) => {
                  const samples =
                    uploadResult.sampleValues?.[col]
                      ?.slice(0, 2)
                      .join(", ") ?? "";
                  return (
                    <label
                      key={col}
                      className="flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={attributeKeys.includes(col)}
                        onChange={() => onToggleAttributeKey(col)}
                        className="accent-slate-900"
                      />
                      <ColTypeBadge
                        type={uploadResult.columnTypes?.[col]}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-700">
                          {col}
                        </span>
                        {samples && (
                          <span className="text-[11px] text-gray-400 ml-1.5">
                            {samples}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Template save */}
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1.5">
              Save as template
            </p>
            {appliedTemplate && (
              <p className="text-[11px] text-blue-600 mb-1.5">
                Template &ldquo;{appliedTemplate.name}&rdquo; was applied.
                Save under a new name to create a variant.
              </p>
            )}
            {allTemplates.length > 0 && (
              <p className="text-[11px] text-gray-400 mb-1.5">
                Existing:{" "}
                {allTemplates.map((t) => t.name).join(", ")}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Template name…"
                className="flex-1 h-8 text-xs rounded border border-gray-200 bg-white px-2 outline-none focus:border-slate-400"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                disabled={!templateName.trim() || savingTemplate}
                onClick={onSaveTemplate}
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}