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

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
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

// Plain-English descriptions surfaced on the disambiguation and confirm
// screens. Only the common-case entities need copy — anything missing
// falls back to ENTITY_LABELS, which is already human-readable.
const ENTITY_DESCRIPTIONS: Partial<Record<EntityType, string>> = {
  PurchaseOrder: "Orders placed with your suppliers",
  SalesOrder: "Orders received from your customers",
  InventoryItem: "Current stock levels per item",
  Product: "Your product catalogue / SKU master",
  Supplier: "Your supplier list",
  POLine: "Individual line items on purchase orders",
  BOMLine: "Bill of materials — components per finished good",
  BOMHeader: "Bill of materials headers",
  WorkOrder: "Production orders / manufacturing jobs",
  StockMovement: "Consumption and receipt history",
  ForecastEntry: "Demand forecast data",
  Customer: "Customer list",
  Location: "Locations / warehouses",
  SupplierItem: "Supplier item catalogue (AVL)",
};

// When an import file's detector flags additional entity types alongside
// the primary one, the Confirm screen surfaces them as opt-in checkboxes.
// These descriptions explain what the auto-created rows will look like so
// the user isn't surprised that ticking "Products" on an Inventory import
// doesn't populate the catalogue with rich product data.
const ADDITIONAL_ENTITY_DESCRIPTIONS: Partial<Record<EntityType, string>> = {
  Product: "Basic product records created from SKU column",
  Supplier: "Basic supplier records created from Supplier ID column",
  Customer: "Basic customer records created from Customer ID column",
  Location: "Basic location records from Location Code column",
  BOMHeader: "BOM header records for finished goods",
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
type Step = "select" | "upload" | "entity-split" | "map" | "disambiguate" | "confirm" | "done";

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

interface UnmappedColumn {
  header: string;
  sampleValues: string[];
  columnType: string;
}

interface AiCustomField {
  sourceColumn: string;
  fieldKey: string;
  displayLabel: string;
  dataType: string;
  sampleValues: string[];
}

interface AiMappingResult {
  canonicalMappings: Record<string, string>;
  customFields: AiCustomField[];
}

/** The /api/data/import route now auto-detects the entity and emits this
 *  block so the wizard can skip entity selection entirely when the file
 *  is unambiguous. */
interface DetectedEntityResult {
  entity: EntityType;
  confidence: "certain" | "high" | "medium" | "inferred";
  wasAutoDetected: boolean;
  alternativeEntities: DetectedEntity[];
  filenameEntity?: string | null;
}

interface UploadResult {
  sourceId: string;
  headers: string[];
  suggestedMapping: Record<string, string>;
  confidence: Record<string, MappingConfidence>;
  score: Record<string, number>;
  sampleValues: Record<string, string[]>;
  columnTypes: Record<string, string>;
  unmappedColumns?: UnmappedColumn[];
  previewRows: Record<string, string>[];
  rowCount: number;
  entity: EntityType;
  columnClassification?: Record<string, ColumnClassification>;
  detectedEntities?: DetectedEntity[];
  detectedEntity?: DetectedEntityResult;
  detectedDescription?: string;
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

  // ── Core wizard state ─────────────────────────────────────────────────────
  // If a resume ID is present, skip the hub and show a loading state until data arrives
  const resumeId = searchParams.get("resume");
  // The upload screen is now the primary entry point. The legacy 30-entity
  // hub is still reachable via the "Advanced: choose data type" link at the
  // bottom of the upload screen.
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [entity, setEntity] = useState<EntityType>("Product");
  // True when the user explicitly picked an entity (hub card, re-upload
  // button, or Advanced hub override). Controls whether handleUpload sends
  // the `entity` hint to the API — without this flag we'd always pass the
  // default "Product", poisoning auto-detection.
  const [entityExplicit, setEntityExplicit] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // ── AI mapping for columns the alias matcher missed ──────────────────────
  const [aiMapping, setAiMapping] = useState(false);
  const [aiMappingResult, setAiMappingResult] = useState<AiMappingResult | null>(null);
  // Canonical fields whose source column was supplied by Claude (not by the
  // alias matcher) — drives the blue "AI-rescued" pill colour on the summary.
  const [aiRescuedFields, setAiRescuedFields] = useState<Set<string>>(new Set());
  // True when the user navigated to the map step from the summary via the
  // "Review field mapping" escape hatch. Controls the map header variant and
  // enables the "Back to summary" button.
  const [mapEscapeHatch, setMapEscapeHatch] = useState(false);

  // Secondary entity types the detector flagged in the same file. Rendered
  // as a checkbox list on the Confirm screen — the user can opt out of
  // importing the extras (e.g. reject auto-generated Products from an
  // Inventory-only import). Primary entity is always imported and isn't
  // represented here.
  const [additionalEntities, setAdditionalEntities] = useState<
    Array<{ entity: EntityType; confidence: string; checked: boolean }>
  >([]);

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

  // ── Re-upload mode ────────────────────────────────────────────────────────
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [reuploadModal, setReuploadModal] = useState<{ entity: EntityType; label: string } | null>(null);

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

  // Step indicator: always shows Upload → Confirm → Done (3 pills).
  // The Map sub-step is not a named milestone — it's just what happens before Confirm.
  const MILESTONES = ["Upload", "Confirm", "Done"] as const;
  type Milestone = typeof MILESTONES[number];
  const milestoneFor: Record<Step, Milestone> = {
    select: "Upload",
    upload: "Upload",
    "entity-split": "Confirm",
    map: "Confirm",
    disambiguate: "Confirm",
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
  /** Derive the opt-in list from whatever the detector found, excluding
   *  the primary entity (which is always imported) and any entity we don't
   *  actually have a canonical config for. Low-confidence hits are dropped
   *  so we don't spam the UI with every loose alias match. */
  function computeAdditionalEntities(
    detected: DetectedEntity[] | undefined,
    primary: EntityType,
  ): Array<{ entity: EntityType; confidence: string; checked: boolean }> {
    if (!detected) return [];
    return detected
      .filter(
        (e) =>
          (e.confidence === "high" || e.confidence === "medium") &&
          e.entity !== primary &&
          !!CANONICAL_FIELDS[e.entity as EntityType],
      )
      .map((e) => ({
        entity: e.entity as EntityType,
        confidence: e.confidence,
        checked: true,
      }));
  }

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
    // Only send the entity hint when the user explicitly picked one (hub
    // card / Advanced override / Re-upload button). Without this guard the
    // default "Product" state would always be posted and the API would
    // treat every upload as a hinted one.
    if (entityExplicit) {
      fd.append("entity", entity);
    }
    fd.append("importMode", importMode);
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
    setAiMappingResult(null);
    setAiRescuedFields(new Set());
    setMapEscapeHatch(false);

    // ── AI pass over any columns the alias matcher missed (blocking) ─────
    // Template merge may have already resolved some of the originally
    // unmapped columns, so filter by whatever is still outside activeMapping.
    // We await this BEFORE routing to confirm/map so the step decision uses
    // the final mapping (post AI rescue) instead of the alias-only mapping.
    const mappedSet = new Set(Object.values(activeMapping).filter(Boolean));
    const columnsForAi = (data.unmappedColumns ?? []).filter(
      (c) => !mappedSet.has(c.header),
    );

    let finalMapping = activeMapping;
    let finalScore = activeScore;
    let finalAttributeKeys = activeAttributeKeys;
    let rescuedFieldKeys: string[] = [];

    if (columnsForAi.length > 0) {
      setAiMapping(true);
      try {
        const aiRes = await fetch("/api/data/ai-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: data.sourceId,
            entityType: data.entity,
            unmappedColumns: columnsForAi,
          }),
        });
        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as AiMappingResult;
          setAiMappingResult(aiData);

          const canonicalKeys = Object.keys(aiData.canonicalMappings);
          if (canonicalKeys.length > 0) {
            finalMapping = { ...aiData.canonicalMappings, ...finalMapping };
            finalScore = { ...finalScore };
            for (const f of canonicalKeys) {
              if (finalScore[f] == null) finalScore[f] = 0.9;
            }
            rescuedFieldKeys = canonicalKeys;
            setMapping(finalMapping);
            setScore(finalScore);
            setAiRescuedFields(new Set(canonicalKeys));
          }
          if (aiData.customFields.length > 0) {
            finalAttributeKeys = Array.from(
              new Set([
                ...finalAttributeKeys,
                ...aiData.customFields.map((f) => f.sourceColumn),
              ]),
            );
            setAttributeKeys(finalAttributeKeys);
          }
        }
      } catch (err) {
        // Never let the AI pass block an import — surface via console only.
        console.error("[import] ai-map failed:", err);
      } finally {
        setAiMapping(false);
      }
    }

    // Persist the final mapping regardless of whether the AI pass ran, so
    // /process sees it no matter how quickly the user clicks through.
    try {
      await saveMapping(data.sourceId, data.entity, finalMapping, finalAttributeKeys);
    } catch (err) {
      console.error("[import] saveMapping failed:", err);
    }

    // Reflect the API's resolved entity in local state so every downstream
    // screen (confirm header, template picker, etc.) speaks in the same
    // terms the user just saw in the detection UI.
    setEntity(data.entity);

    // Secondary entities detected in the same file — Confirm renders them
    // as opt-in checkboxes instead of routing to a dedicated split screen.
    setAdditionalEntities(
      computeAdditionalEntities(data.detectedEntities, data.entity as EntityType),
    );

    // ── Route based on auto-detection result ─────────────────────────────
    const requiredFields =
      CANONICAL_FIELDS[data.entity as EntityType]?.filter((f) => f.required) ?? [];
    const allRequiredMapped = requiredFields.every((f) => !!finalMapping[f.field]);
    const det = data.detectedEntity;
    const detectedCount = data.detectedEntities?.length ?? 0;

    // Case A — certain/high confidence AND everything maps cleanly →
    // skip both the map and disambiguation screens and go straight to
    // the confirm summary. Multi-entity files used to route through a
    // dedicated entity-split screen here; that block is still present
    // but no longer reachable from the initial-upload flow — the new
    // additional-entities checkbox card on Confirm replaces it.
    if (det && (det.confidence === "certain" || det.confidence === "high") && allRequiredMapped) {
      setStep("confirm");
      return;
    }

    // Case C — medium confidence with real alternatives → ask the user to
    // pick between 2–3 option cards (the disambiguation screen).
    if (det && det.confidence === "medium" && detectedCount >= 2) {
      setStep("disambiguate");
      return;
    }

    // Case D fallback — low/no confidence, or required fields missing →
    // drop into the existing dropdown-driven map step so the user can
    // override assignments by hand.
    setStep(allRequiredMapped ? "confirm" : "map");
    // Mark the rescued fields (used by pill colour logic even if the state
    // update above has not settled yet).
    void rescuedFieldKeys;
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

  // ── Disambiguation: user picked an entity from the 2–4 option cards ─────
  // The mapping that came back with the upload was computed against the
  // auto-detected entity; if the user overrides it we have to re-resolve
  // the mapping for the NEW entity (different canonical fields → different
  // alias matches) before routing. Running the AI-map pass again on the
  // updated unmapped set rescues late-matching columns so the user lands
  // on Confirm instead of Map for most files.
  async function handleDisambiguate(chosenEntity: EntityType) {
    if (!uploadResult) return;

    setEntity(chosenEntity);
    setEntityExplicit(true);
    setAiMappingResult(null);
    setAiRescuedFields(new Set());
    // Recompute the opt-in list for the newly-chosen primary entity.
    setAdditionalEntities(
      computeAdditionalEntities(uploadResult.detectedEntities, chosenEntity),
    );

    // 1) Re-run the alias matcher for the chosen entity.
    const { mapping: newMapping, score: newScore } =
      suggestMappingWithConfidence(uploadResult.headers, chosenEntity);

    let finalMapping: Record<string, string> = newMapping;
    let finalScore: Record<string, number> = newScore;
    let finalAttributeKeys = attributeKeys;

    // 2) AI rescue pass: whichever headers are still unmapped for the
    //    newly-chosen entity get sent to /api/data/ai-map.
    const mappedSet = new Set(Object.values(newMapping).filter(Boolean));
    const columnsForAi = (uploadResult.unmappedColumns ?? []).filter(
      (c) => !mappedSet.has(c.header),
    );

    if (columnsForAi.length > 0) {
      setAiMapping(true);
      try {
        const aiRes = await fetch("/api/data/ai-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: uploadResult.sourceId,
            entityType: chosenEntity,
            unmappedColumns: columnsForAi,
          }),
        });
        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as AiMappingResult;
          setAiMappingResult(aiData);

          const canonicalKeys = Object.keys(aiData.canonicalMappings);
          if (canonicalKeys.length > 0) {
            finalMapping = { ...aiData.canonicalMappings, ...finalMapping };
            finalScore = { ...finalScore };
            for (const f of canonicalKeys) {
              if (finalScore[f] == null) finalScore[f] = 0.9;
            }
            setAiRescuedFields(new Set(canonicalKeys));
          }
          if (aiData.customFields.length > 0) {
            finalAttributeKeys = Array.from(
              new Set([
                ...finalAttributeKeys,
                ...aiData.customFields.map((f) => f.sourceColumn),
              ]),
            );
          }
        }
      } catch (err) {
        console.error("[import] ai-map (disambiguate) failed:", err);
      } finally {
        setAiMapping(false);
      }
    }

    setMapping(finalMapping);
    setScore(finalScore);
    setAttributeKeys(finalAttributeKeys);

    // 3) Persist for the /process route.
    try {
      await saveMapping(uploadResult.sourceId, chosenEntity, finalMapping, finalAttributeKeys);
    } catch (err) {
      console.error("[import] saveMapping (disambiguate) failed:", err);
    }

    // 4) Route by required-field coverage of the *new* entity.
    const requiredFields =
      CANONICAL_FIELDS[chosenEntity]?.filter((f) => f.required) ?? [];
    const allRequiredMapped = requiredFields.every((f) => !!finalMapping[f.field]);
    setStep(allRequiredMapped ? "confirm" : "map");
  }

  // ── Process (actual import) ───────────────────────────────────────────────
  async function handleProcess() {
    if (!uploadResult) return;

    // If the user kept any additional entities checked on the Confirm
    // screen, hand off to the sequential multi-entity importer which
    // knows how to clone the source and run each entity in its own pass.
    const hasCheckedExtras = additionalEntities.some((e) => e.checked);
    if (hasCheckedExtras) {
      await handleMultiEntityImport();
      return;
    }

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

    // Build the entities-to-import list from the Confirm-screen checkbox
    // state: the primary entity is always included; each checked
    // additional entity gets a pass of its own. Unchecked additionals
    // are skipped, so the user can opt out of auto-created Products /
    // Suppliers / etc. without losing the primary import.
    const userEntity = uploadResult.entity;
    const checkedAdditional = additionalEntities.filter((e) => e.checked);
    const significantEntities: DetectedEntity[] = [
      {
        entity: userEntity,
        confidence: "high" as const,
        columnsUsed: [],
        requiredFieldsMatched: 0,
      },
      ...checkedAdditional.map<DetectedEntity>((e) => ({
        entity: e.entity,
        confidence: (e.confidence === "high" ? "high" : "medium") as "high" | "medium",
        columnsUsed: [],
        requiredFieldsMatched: 0,
      })),
    ];

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
    // Return to the Upload screen (the new default entry point) rather
    // than the hub — the next file almost always benefits from auto
    // detection; the Advanced link is right there if the user wants to
    // pick a specific type.
    setStep("upload");
    setFreshnessVersion((v) => v + 1); // re-fetch coverage to reflect just-imported data
    setFile(null);
    setUploadResult(null);
    setUploadError(null);
    setEntityExplicit(false);
    setAdditionalEntities([]);
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
                onClick={() => {
                  if (hasData) {
                    setReuploadModal({ entity: type, label: ENTITY_LABELS[type] });
                  } else {
                    setEntity(type);
                    setEntityExplicit(true);
                    setStep("upload");
                  }
                }}
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
          <Card>
            <CardContent className="p-8 space-y-6">
              {/* Header — entity-agnostic when the user hasn't explicitly
                  picked one; shows the chosen type only on hub re-upload. */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {entityExplicit ? ENTITY_LABELS[entity] : "Upload your data"}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {entityExplicit
                    ? "Upload a CSV or Excel file — we'll map your columns automatically."
                    : "Drop any CSV or Excel file — we'll figure out what it contains."}
                </p>
              </div>

              {/* Drop zone — dims + locks clicks while the upload is
                  in flight so the user can't kick off a second upload. */}
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all ${
                  uploading
                    ? "opacity-50 pointer-events-none animate-pulse"
                    : "cursor-pointer"
                } ${
                  file ? "border-emerald-300 bg-emerald-50/40" : "border-gray-200 hover:border-slate-400 hover:bg-gray-50"
                }`}
                onClick={() => {
                  if (!uploading) fileRef.current?.click();
                }}
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
                      <p className="text-sm font-semibold text-gray-700">Drop your file here or click to browse</p>
                      <p className="text-xs text-gray-400 mt-0.5">CSV or Excel · any ERP export · any column names</p>
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

              {/* Advanced escape hatch — the old 30-entity hub is still the
                  best tool when the user already knows which type they want,
                  or when auto-detection needs overriding. */}
              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                >
                  Advanced: choose data type manually →
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* STEP: Disambiguate (medium-confidence detection)                   */}
      {/* Shown when the API returned confidence="medium" AND >=2 plausible  */}
      {/* entity types. Shows 2–4 option cards instead of a dropdown.        */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {step === "disambiguate" && uploadResult && (() => {
        const candidates = (uploadResult.detectedEntities ?? [])
          .filter((e) => CANONICAL_FIELDS[e.entity as EntityType])
          .slice(0, 4);
        return (
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="space-y-1">
                <p className="text-base font-semibold text-gray-900">
                  What does this file contain?
                </p>
                <p className="text-sm text-gray-500">
                  We found a few possibilities. Pick the one that matches your file.
                  {uploadResult.detectedEntity?.filenameEntity && (
                    <> The filename suggests <strong className="text-gray-700">{ENTITY_LABELS[uploadResult.detectedEntity.filenameEntity as EntityType] ?? uploadResult.detectedEntity.filenameEntity}</strong>.</>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {candidates.map((c) => {
                  const ent = c.entity as EntityType;
                  const label = ENTITY_LABELS[ent] ?? c.entity;
                  const desc = ENTITY_DESCRIPTIONS[ent];
                  return (
                    <button
                      key={c.entity}
                      type="button"
                      onClick={() => handleDisambiguate(ent)}
                      disabled={aiMapping}
                      className="text-left border border-gray-200 hover:border-slate-400 hover:bg-slate-50 rounded-xl p-4 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-semibold text-gray-900">{label}</p>
                      {desc && <p className="text-xs text-gray-500 mt-1">{desc}</p>}
                      <p className="text-[11px] text-gray-400 mt-2">
                        {uploadResult.rowCount.toLocaleString()} rows · {c.requiredFieldsMatched} identity field{c.requiredFieldsMatched === 1 ? "" : "s"} matched
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="pt-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep("select")}
                  className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
                >
                  Not sure? → Let me browse all types
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setUploadError(null);
                    setUploadResult(null);
                    setEntityExplicit(false);
                    setStep("upload");
                  }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  ← Start over
                </button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
          templateName={templateName}
          setTemplateName={setTemplateName}
          savingTemplate={savingTemplate}
          onSaveTemplate={handleSaveTemplate}
          allTemplates={allTemplates}
          onConfirm={handleConfirmMapping}
          aiMapping={aiMapping}
          aiMappingResult={aiMappingResult}
          isEscapeHatch={mapEscapeHatch}
          onBackToSummary={() => {
            setMapEscapeHatch(false);
            setStep("confirm");
          }}
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
              {/* Detection badge — differentiates "we figured this out for
                  you" from "you picked this type". */}
              {uploadResult.detectedEntity?.wasAutoDetected ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  <CheckCircle className="w-3 h-3" />
                  Auto-detected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                  📁 {ENTITY_LABELS[uploadResult.entity] ?? uploadResult.entity}
                </span>
              )}
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
              {uploadResult.detectedDescription && (
                <p className="text-xs text-gray-500">
                  {uploadResult.detectedDescription}
                </p>
              )}

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
                  const rescued = aiRescuedFields.has(field);
                  // Three-tier confidence: green = solid auto-match, blue =
                  // AI-rescued or fuzzy match, amber = review suggested.
                  let tone: "green" | "blue" | "amber";
                  if (rescued) tone = "blue";
                  else if (s >= 0.95) tone = "green";
                  else if (s >= 0.8) tone = "blue";
                  else tone = "amber";
                  const toneClass =
                    tone === "green"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : tone === "blue"
                      ? "bg-blue-50 border-blue-200 text-blue-700"
                      : "bg-amber-50 border-amber-200 text-amber-700";
                  return (
                    <span
                      key={field}
                      title={rescued ? "Matched by AI" : undefined}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${toneClass}`}
                    >
                      {tone === "green" ? <CheckCircle className="w-2.5 h-2.5" /> : null}
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

            {/* Secondary entities — opt-in checklist. Rendered only when
                the detector flagged something besides the primary entity
                in the same file (e.g. InventoryItem + Product). */}
            {additionalEntities.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  📦 We also found data for:
                </p>
                <div className="space-y-2">
                  {additionalEntities.map((ae, idx) => {
                    const label = ENTITY_LABELS[ae.entity] ?? ae.entity;
                    const desc = ADDITIONAL_ENTITY_DESCRIPTIONS[ae.entity];
                    return (
                      <label
                        key={ae.entity}
                        className="flex items-start gap-2.5 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={ae.checked}
                          onChange={() =>
                            setAdditionalEntities((prev) =>
                              prev.map((e, i) =>
                                i === idx ? { ...e, checked: !e.checked } : e,
                              ),
                            )
                          }
                          disabled={processing}
                          className="mt-0.5 accent-slate-900"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-800">
                            {label}
                          </span>
                          {desc && (
                            <span className="block text-xs text-slate-500">
                              {desc}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  Unchecked items won&apos;t appear in your Explorer but
                  minimal records may still be created to link your data
                  together.
                </p>
              </div>
            )}

            {/* AI-discovered extras — shows above the template panel. */}
            <AiFieldsNotice
              entity={uploadResult.entity}
              loading={aiMapping}
              result={aiMappingResult}
              loadingCount={(uploadResult.unmappedColumns ?? []).length}
            />

            {/* Escape hatch — lets a power user drop into the dropdown UI
                to inspect or override the auto-mapping. Hidden from
                non-technical users as a subtle link. */}
            <div>
              <button
                type="button"
                onClick={() => {
                  setMapEscapeHatch(true);
                  setStep("map");
                }}
                className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2"
              >
                Review field mapping →
              </button>
            </div>

            {/* Advanced section (collapsed by default on Confirm screen) */}
            <AdvancedSection
              show={showAdvanced}
              onToggle={() => setShowAdvanced((v) => !v)}
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
                              <p>{plural(counts.updated, `${noun}`)} updated</p>
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
      {/* ── Re-upload mode modal ─────────────────────────────────────────── */}
      {reuploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-gray-900">Re-upload {reuploadModal.label}</p>
                <p className="text-sm text-gray-500 mt-1">You already have data for this entity. How would you like to handle it?</p>
              </div>
              <button
                onClick={() => setReuploadModal(null)}
                className="text-gray-400 hover:text-gray-600 shrink-0 mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid gap-3">
              {/* Replace option */}
              <button
                onClick={() => {
                  setImportMode("replace");
                  setEntity(reuploadModal.entity);
                  setEntityExplicit(true);
                  setReuploadModal(null);
                  setStep("upload");
                }}
                className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-red-400 hover:bg-red-50/40 px-4 py-4 transition-colors group"
              >
                <p className="text-sm font-semibold text-gray-900 group-hover:text-red-700">Start fresh</p>
                <p className="text-xs text-gray-500 mt-0.5 group-hover:text-red-600">
                  Delete all existing {reuploadModal.label.toLowerCase()} records and import only the new file.
                </p>
              </button>

              {/* Merge option */}
              <button
                onClick={() => {
                  setImportMode("merge");
                  setEntity(reuploadModal.entity);
                  setEntityExplicit(true);
                  setReuploadModal(null);
                  setStep("upload");
                }}
                className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50/40 px-4 py-4 transition-colors group"
              >
                <p className="text-sm font-semibold text-gray-900 group-hover:text-emerald-700">Add &amp; update</p>
                <p className="text-xs text-gray-500 mt-0.5 group-hover:text-emerald-600">
                  Keep existing records — new rows are added, matching rows are updated.
                </p>
              </button>
            </div>
          </div>
        </div>
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
  templateName: string;
  setTemplateName: (v: string) => void;
  savingTemplate: boolean;
  onSaveTemplate: () => void;
  allTemplates: MappingTemplate[];
  onConfirm: () => void;
  aiMapping: boolean;
  aiMappingResult: AiMappingResult | null;
  isEscapeHatch?: boolean;
  onBackToSummary?: () => void;
}

function RegistryMapStep({
  uploadResult,
  mapping,
  appliedTemplate,
  flaggedColumns,
  onSourceColumnMapping,
  showAdvanced,
  onToggleAdvanced,
  templateName,
  setTemplateName,
  savingTemplate,
  onSaveTemplate,
  allTemplates,
  onConfirm,
  aiMapping,
  aiMappingResult,
  isEscapeHatch = false,
  onBackToSummary,
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
        {/* Header — variant changes when the user navigated here from the
            Confirm summary via "Review field mapping". */}
        {isEscapeHatch && onBackToSummary ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onBackToSummary}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to summary
            </button>
            <div>
              <p className="text-base font-semibold text-gray-900">
                Review field mapping
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                All required fields are already mapped. You can adjust
                assignments below or go back to the import summary.
              </p>
            </div>
          </div>
        ) : (
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
        )}

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

        {/* AI-discovered extras — shows above the template panel. */}
        <AiFieldsNotice
          entity={uploadResult.entity}
          loading={aiMapping}
          result={aiMappingResult}
          loadingCount={(uploadResult.unmappedColumns ?? []).length}
        />

        {/* Advanced section — template only, no duplicate mapping */}
        <AdvancedSection
          show={showAdvanced}
          onToggle={onToggleAdvanced}
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


// ─── AI-resolved extra columns notice ─────────────────────────────────────────
// Rendered automatically (no toggle) whenever the Claude pass found either a
// late-alias canonical match or a custom-field candidate. When the pass
// produced nothing actionable we show nothing — we never surface the raw
// "unmapped columns" list to the user.

interface AiFieldsNoticeProps {
  entity: EntityType;
  loading: boolean;
  result: AiMappingResult | null;
  loadingCount: number;
}

function AiFieldsNotice({ entity, loading, result, loadingCount }: AiFieldsNoticeProps) {
  if (loading) {
    return (
      <div className="text-xs text-gray-500 flex items-center gap-2">
        <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        Analysing {loadingCount} additional column{loadingCount === 1 ? "" : "s"}…
      </div>
    );
  }
  if (!result) return null;

  const canonicalEntries = Object.entries(result.canonicalMappings);
  const customFields = result.customFields;
  if (canonicalEntries.length === 0 && customFields.length === 0) return null;

  return (
    <div className="space-y-2">
      {canonicalEntries.length > 0 && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
          ✓ We also recognised {canonicalEntries.length} more column{canonicalEntries.length === 1 ? "" : "s"}:{" "}
          <span className="font-medium">
            {canonicalEntries.map(([, header]) => header).join(", ")}
          </span>
        </div>
      )}
      {customFields.length > 0 && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
          <p className="font-medium mb-1.5">
            📊 {customFields.length} custom field{customFields.length === 1 ? "" : "s"} will be added to your{" "}
            {ENTITY_LABELS[entity] ?? entity} data:
          </p>
          <ul className="space-y-0.5 ml-1">
            {customFields.map((f) => (
              <li key={f.fieldKey} className="text-slate-600">
                • {f.displayLabel} <span className="text-slate-400">({f.dataType})</span>
              </li>
            ))}
          </ul>
          <p className="text-slate-500 mt-1.5 text-[11px]">
            These fields will be available in the AI chat and data explorer.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Advanced section (shared between Map and Confirm steps) ──────────────────

interface AdvancedSectionProps {
  show: boolean;
  onToggle: () => void;
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