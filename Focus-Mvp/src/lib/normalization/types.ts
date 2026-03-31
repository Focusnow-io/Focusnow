// Shared types for the normalization layer.

export type ResolvableEntityType = "Product" | "Supplier" | "Location" | "Customer";

export interface MatchFieldDetail {
  field: string;
  incomingVal: string;
  matchedVal: string;
  score: number;
}

export interface FkChange {
  table: string;
  field: string;
  fromId: string;
  toId: string;
  affectedCount: number;
}

export interface MergeResult {
  dryRun: boolean;
  fkChanges: FkChange[];
}

export interface ResolutionResult {
  status: "AUTO_MERGED" | "PENDING" | "NO_MATCH";
  confidence: number;
  logId: string;
  matchedId?: string;
}

export interface LinkingResult {
  pass1Linked: number;       // InventoryItem → Location
  pass1Failed: number;
  pass2Repaired: number;     // Post-merge FK repair
  pass3Created: number;      // Pending BOMLine/POLine/SupplierItem rows
  pass3Failed: number;
}

export interface QualityGateResult {
  entity: string;
  field: string;
  coverage: number;        // 0–1
  required: number;        // minCoverage threshold
  passed: boolean;
}

export interface CapabilityReport {
  label: string;
  unlocked: boolean;
  coverage: number;          // 0–100 (% of minCounts + gates satisfied)
  missingCounts: string[];   // entity types below minCount
  qualityGates: QualityGateResult[];
}

export interface CompletenessReport {
  organizationId: string;
  generatedAt: Date;
  entityCounts: Record<string, number>;
  capabilities: Record<string, CapabilityReport>;
  overallScore: number;
}

// Stored in BOMHeader.attributes to track unresolved BOM component rows
export interface PendingBOMLine {
  componentSku: string;
  qty: string;
  uom: string;
  wasteFactorPct?: string;
  isPhantom?: string;
  sequence?: string;
  notes?: string;
  parentComponentId?: string;
  componentCost?: string;
}

// Stored in PurchaseOrder.attributes for unresolved PO lines
export interface PendingPOLine {
  sku: string;
  qty: string;
  unitCost?: string;
  uom?: string;
}

// Stored in Supplier.attributes for unresolved SupplierItem rows
export interface PendingSupplierItem {
  sku: string;
  supplierPartNumber?: string;
  leadTimeDays?: string;
  moq?: string;
  contractUnitCost?: string;
}

export const PENDING_LIMIT = 500;

// ---------------------------------------------------------------------------
// Phase 2: DataQualityScore, ModelFreshness, ConsistencyReport
// ---------------------------------------------------------------------------

/** Per-entity-type data quality score (0–100), stored on DataSource.dataQualityScores */
export type DataQualityScores = Record<string, number>;

/** Mirrors the ModelFreshness Prisma model for use in API responses */
export interface FreshnessRow {
  id: string;
  organizationId: string;
  entityType: string;
  lastImportedAt: Date;
  recordCount: number;
  staleDays: number;
  isStale: boolean;
  updatedAt: Date;
}

/** One issue entry in ModelCompletenessReport.consistencyIssues */
export interface ConsistencyIssue {
  check: string;       // machine-readable check name
  entityType: string;  // primary entity type affected
  count: number;       // total number of affected records
  sampleIds: string[]; // up to 5 example IDs for inspection
}
