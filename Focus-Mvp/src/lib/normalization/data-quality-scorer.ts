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
  /** Subset of any of the three lists above that are NOT NULL in the Prisma
   *  schema. Listed explicitly because Prisma 7+ rejects `{ not: null }` on
   *  non-nullable columns AND logs the rejection at level=error regardless
   *  of JS try/catch, which floods the import terminal. Fields named here
   *  short-circuit to 100% populated without a DB roundtrip. */
  knownNonNullable?: string[];
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
    // Schema: `sku String`, `name String` — both NOT NULL, so the count
    // with `{ not: null }` is rejected by Prisma 7 and logged as
    // prisma:error. Short-circuit to 100% populated.
    knownNonNullable: ["name", "sku"],
    model: "product",
    orgField: "organizationId",
  },
  Supplier: {
    requiredFields: ["name"],
    optionalFields: ["code", "email", "country", "leadTimeDays"],
    fkFields: [],
    // Schema: `code String`, `name String` — both NOT NULL. `code` is
    // declared optional here because some customers may import suppliers
    // without a stable code, but the schema column itself is non-nullable
    // (Prisma stubs default to "" on auto-create).
    knownNonNullable: ["name", "code"],
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
    // quantity and productId are non-nullable in the schema — Prisma 7.4.2 rejects
    // { not: null } on non-nullable fields, and they always score 100% anyway.
    requiredFields: [],
    optionalFields: ["reorderPoint", "demandPerDay", "reorderQty"],
    fkFields: ["locationId"], // locationId is nullable — meaningful FK resolution metric
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
    // supplierId is non-nullable in the schema — listed in knownNonNullable
    // so the scorer short-circuits to 100% instead of issuing a count that
    // Prisma 7 logs as prisma:error on every import.
    requiredFields: [],
    optionalFields: ["currency", "notes"],
    fkFields: ["supplierId"],
    knownNonNullable: ["supplierId"],
    model: "purchaseOrder",
    orgField: "orgId",
  },
  SalesOrder: {
    // customerId is non-nullable in the schema.
    requiredFields: [],
    optionalFields: ["currency", "notes"],
    fkFields: ["customerId"],
    knownNonNullable: ["customerId"],
    model: "salesOrder",
    orgField: "orgId",
  },
  BOMHeader: {
    // productId is non-nullable in the schema.
    requiredFields: [],
    optionalFields: ["description"],
    fkFields: ["productId"],
    knownNonNullable: ["productId"],
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

  const total = await model.count({ where }) as number;

  // Prisma 7+ rejects `{ not: null }` on non-nullable schema fields AND
  // logs the rejection at level=error regardless of whether JS catches it —
  // which is why every import was spamming `prisma:error Argument 'not'
  // must not be null`. Short-circuit via the config's knownNonNullable
  // allowlist so we never issue a doomed count; a non-nullable column is
  // always fully populated by definition. The try/catch stays as a second
  // line of defence for any fkField we forgot to flag.
  const knownNonNullable = new Set(config.knownNonNullable ?? []);
  const safeCount = async (field: string): Promise<number> => {
    if (knownNonNullable.has(field)) return total;
    try {
      return await model.count({ where: { ...where, [field]: { not: null } } }) as number;
    } catch {
      return total; // surprise non-nullable field → always 100% populated
    }
  };

  const [requiredScores, optionalScores, fkScores] = await Promise.all([
    Promise.all(config.requiredFields.map(safeCount)),
    Promise.all(config.optionalFields.map(safeCount)),
    Promise.all(config.fkFields.map(safeCount)),
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
