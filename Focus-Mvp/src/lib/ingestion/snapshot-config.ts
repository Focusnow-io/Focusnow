/**
 * Snapshot entity configuration registry.
 *
 * Defines which entity types support full-snapshot semantics — meaning
 * "the uploaded file represents the complete set of active records for
 * this entity type in this organization."
 *
 * Records in the DB that are NOT in the file will be soft-deactivated
 * (isActive = false) rather than deleted.
 */

export interface SnapshotEntityConfig {
  /** Prisma model name (lowercase, matching prisma[model]) */
  model: string;
  /** The organization FK field name on this model */
  orgField: "organizationId" | "orgId";
  /** The DB column that holds the unique key within an org */
  uniqueKeyDbField: string;
  /** Extract the unique key from a canonical data row */
  uniqueKeyExtractor: (row: Record<string, string>) => string | null;
}

export const SNAPSHOT_ENTITIES: Record<string, SnapshotEntityConfig> = {
  Product: {
    model: "product",
    orgField: "organizationId",
    uniqueKeyDbField: "sku",
    uniqueKeyExtractor: (r) => r.sku || null,
  },
  Supplier: {
    model: "supplier",
    orgField: "organizationId",
    uniqueKeyDbField: "code",
    uniqueKeyExtractor: (r) => r.code || null,
  },
  Customer: {
    model: "customer",
    orgField: "orgId",
    uniqueKeyDbField: "code",
    uniqueKeyExtractor: (r) => r.code || null,
  },
  Location: {
    model: "location",
    orgField: "organizationId",
    uniqueKeyDbField: "code",
    uniqueKeyExtractor: (r) => r.locationId || r.code || null,
  },
  WorkCenter: {
    model: "workCenter",
    orgField: "organizationId",
    uniqueKeyDbField: "code",
    uniqueKeyExtractor: (r) => r.code || null,
  },
  Equipment: {
    model: "equipment",
    orgField: "orgId",
    uniqueKeyDbField: "code",
    uniqueKeyExtractor: (r) => r.code || null,
  },
};

export function isSnapshotEntity(entity: string): boolean {
  return entity in SNAPSHOT_ENTITIES;
}
