/**
 * DataQualityScore — compute a 0–100 quality score per entity type after each import.
 *
 * Score formula:
 *  - Type validity (20%):    importedRows / totalRows  (rows that survived validation)
 *  - Required fields (40%):  % of DB records with all required fields populated
 *  - Optional fields (20%):  % of optional fields populated (averaged across records)
 *  - FK resolution (20%):    % of DB records with all expected FK fields non-null
 */

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Config per entity type
// ---------------------------------------------------------------------------

interface EntityQualityConfig {
  /** Fields that must be non-null for the record to be considered valid */
  requiredFields: string[];
  /** Optional enrichment fields — partial population is expected */
  optionalFields: string[];
  /** FK fields whose non-null status contributes to FK resolution score */
  fkFields: string[];
  /** Prisma model accessor key */
  model: keyof typeof prisma;
  /** org scope field name */
  orgField: "organizationId" | "orgId";
}

const ENTITY_CONFIG: Partial<Record<string, EntityQualityConfig>> = {
  Product: {
    requiredFields: ["name", "sku"],
    optionalFields: ["leadTimeDays", "unitCost", "description"],
    fkFields: [],
    model: "product",
    orgField: "organizationId",
  },
  Supplier: {
    requiredFields: ["name"],
    optionalFields: ["code", "email", "country", "leadTimeDays"],
    fkFields: [],
    model: "supplier",
    orgField: "organizationId",
  },
  Location: {
    requiredFields: ["name", "code"],
    optionalFields: ["type"],
    fkFields: [],
    model: "location",
    orgField: "organizationId",
  },
  InventoryItem: {
    requiredFields: ["quantity"],
    optionalFields: ["reorderPoint", "demandPerDay", "reorderQty"],
    fkFields: ["productId", "locationId"],
    model: "inventoryItem",
    orgField: "organizationId",
  },
  Customer: {
    requiredFields: ["name"],
    optionalFields: ["code", "email"],
    fkFields: [],
    model: "customer",
    orgField: "orgId",
  },
  PurchaseOrder: {
    // supplierId is non-nullable in the schema — Prisma 5+ rejects { not: null } on non-nullable fields
    requiredFields: [],
    optionalFields: ["currency", "notes"],
    fkFields: ["supplierId"],
    model: "purchaseOrder",
    orgField: "orgId",
  },
  SalesOrder: {
    // customerId is non-nullable in the schema
    requiredFields: [],
    optionalFields: ["currency", "notes"],
    fkFields: ["customerId"],
    model: "salesOrder",
    orgField: "orgId",
  },
  BOMHeader: {
    requiredFields: [],
    optionalFields: ["description"],
    fkFields: ["productId"],
    model: "bOMHeader",
    orgField: "orgId",
  },
  WorkOrder: {
    requiredFields: [],
    optionalFields: ["scheduledDate", "dueDate"],
    fkFields: ["productId"],
    model: "workOrder",
    orgField: "organizationId",
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Computes a 0–100 integer quality score for a given entity type.
 *
 * @param organizationId - org scope
 * @param entityType     - e.g. "Product", "Supplier", "InventoryItem"
 * @param totalRows      - rows parsed from the import file (before validation)
 * @param importedRows   - rows successfully upserted to the DB
 */
export async function computeDataQualityScore(
  organizationId: string,
  entityType: string,
  totalRows: number,
  importedRows: number,
): Promise<number> {
  console.log('[data-quality-scorer] entityType=', entityType);
  const config = ENTITY_CONFIG[entityType];

  // For unknown entity types, score is based solely on type validity
  if (!config || totalRows === 0) {
    if (totalRows === 0) return 0;
    return Math.round((importedRows / totalRows) * 100);
  }

  const where = { [config.orgField]: organizationId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const model = (prisma as any)[config.model];

  const [total, requiredScores, optionalScores, fkScores] = await Promise.all([
    model.count({ where }) as Promise<number>,
    // Required field scores — one count per field
    Promise.all(
      config.requiredFields.map((field) =>
        model.count({ where: { ...where, [field]: { not: null } } }) as Promise<number>,
      ),
    ),
    // Optional field scores — one count per field
    Promise.all(
      config.optionalFields.map((field) =>
        model.count({ where: { ...where, [field]: { not: null } } }) as Promise<number>,
      ),
    ),
    // FK resolution scores — one count per FK field
    Promise.all(
      config.fkFields.map((field) =>
        model.count({ where: { ...where, [field]: { not: null } } }) as Promise<number>,
      ),
    ),
  ]);

  // 1. Type validity — rows that passed import validation
  const typeValidityScore = totalRows > 0 ? importedRows / totalRows : 1;

  // 2. Required fields — average % of records with each required field populated
  //    Special case: For Product "name", records where name === sku are auto-created
  //    stubs (not real product imports). Suppress the name quality penalty when ALL
  //    products are stubs — the partner only uploaded inventory, not a product file.
  if (entityType === "Product" && total > 0) {
    const nameIdx = config.requiredFields.indexOf("name");
    if (nameIdx !== -1) {
      const stubs: [{ cnt: number }] = await prisma.$queryRaw`
        SELECT COUNT(*)::int as cnt FROM "Product"
        WHERE "organizationId" = ${organizationId} AND "name" = "sku"`;
      const stubCount = stubs[0].cnt;
      // If every product is a stub, treat name as fully populated (suppress warning)
      if (stubCount > 0 && stubCount >= total) {
        requiredScores[nameIdx] = total;
      }
    }
  }

  const requiredScore =
    total > 0 && config.requiredFields.length > 0
      ? requiredScores.reduce((sum, count) => sum + count / total, 0) /
        config.requiredFields.length
      : 1;

  // 3. Optional fields — average % of records with each optional field populated
  const optionalScore =
    total > 0 && config.optionalFields.length > 0
      ? optionalScores.reduce((sum, count) => sum + count / total, 0) /
        config.optionalFields.length
      : 1;

  // 4. FK resolution — average % of records with FK fields resolved (non-null)
  const fkScore =
    total > 0 && config.fkFields.length > 0
      ? fkScores.reduce((sum, count) => sum + count / total, 0) / config.fkFields.length
      : 1;

  const weighted =
    typeValidityScore * 0.2 +
    requiredScore * 0.4 +
    optionalScore * 0.2 +
    fkScore * 0.2;

  return Math.round(weighted * 100);
}
