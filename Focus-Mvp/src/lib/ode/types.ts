/**
 * ODE — Core types for the Operational Data Environment.
 *
 * The ODE is a real-time operational model of the company. Every piece of
 * ingested data is normalised into the canonical operational schema and wired
 * into the operational graph.  The graph is NOT a BI warehouse; it represents
 * the *current* operational state of the organisation — who supplies what, what
 * stock is where, which orders are in flight, how the network is connected.
 */

// ---------------------------------------------------------------------------
// Entity node types
// ---------------------------------------------------------------------------

export type OdeEntityType =
  | "PRODUCT"
  | "SUPPLIER"
  | "LOCATION"
  | "INVENTORY_ITEM"
  | "ORDER"
  | "ORDER_LINE";

// ---------------------------------------------------------------------------
// Relationship edge types
// ---------------------------------------------------------------------------

export type RelationshipType =
  | "SUPPLIES"          // Supplier → Product
  | "STOCKS_AT"         // Product  → Location
  | "SOURCES_FROM"      // Order    → Supplier
  | "FULFILLS"          // Order    → Product
  | "COMPONENT_OF"      // Product  → Product (BOM)
  | "LOCATED_IN"        // Location → Location (hierarchy)
  | "TRANSFERS_BETWEEN" // Location → Location (transfer orders)
  | "SHIPS_TO";         // Supplier → Location

// ---------------------------------------------------------------------------
// Canonical operational schema field definitions
// ---------------------------------------------------------------------------

export interface CanonicalField {
  field: string;
  label: string;
  type: "string" | "number" | "date" | "boolean";
  required: boolean;
  /** Aliases used for auto-mapping from source headers */
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Graph primitives
// ---------------------------------------------------------------------------

export interface GraphNode {
  id: string;
  type: OdeEntityType;
  label: string;
  /** Current operational properties of this node */
  properties: Record<string, unknown>;
  /** ISO timestamp of the last observed state change */
  lastSeenAt: string;
}

export interface GraphEdge {
  id: string;
  type: RelationshipType;
  sourceType: OdeEntityType;
  sourceId: string;
  targetType: OdeEntityType;
  targetId: string;
  /** Optional weight / confidence score (0–1) */
  strength?: number;
  /** Supplementary edge properties */
  metadata?: Record<string, unknown>;
  validFrom: string;
  validTo?: string;
}

export interface OperationalGraph {
  organizationId: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    nodesByType: Record<string, number>;
    edgesByType: Record<string, number>;
  };
}

// ---------------------------------------------------------------------------
// Operational state snapshot
// ---------------------------------------------------------------------------

export interface OperationalState {
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

export interface OperationalAlert {
  entityType: OdeEntityType;
  entityId: string;
  entityLabel: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
}

// ---------------------------------------------------------------------------
// Connector types
// ---------------------------------------------------------------------------

export type ConnectorType =
  | "FILE_IMPORT"
  | "REST_API"
  | "WEBHOOK"
  | "DATABASE"
  | "SFTP";

export type ConnectorStatus = "ACTIVE" | "INACTIVE" | "SYNCING" | "ERROR";

export type SyncStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "PARTIAL";

/** Parsed, normalised record ready for upsert into the canonical schema */
export interface CanonicalRecord {
  entityType: OdeEntityType;
  /** The key fields used to identify/upsert this record */
  identity: Record<string, string>;
  /** Full normalised field set */
  fields: Record<string, unknown>;
  /** Raw source record before normalisation (for audit) */
  rawSource?: Record<string, unknown>;
  /** Which source/connector delivered this record */
  source: string;
}

/** Result of a single connector sync pass */
export interface SyncResult {
  status: SyncStatus;
  recordsRead: number;
  recordsUpserted: number;
  recordsFailed: number;
  errors: Array<{ row?: number; message: string }>;
  metadata?: Record<string, unknown>;
}
