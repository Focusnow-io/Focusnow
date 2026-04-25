export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

/**
 * GET /api/data/explore
 *
 * Reads the new ImportRecord / ImportDataset store. The legacy per-
 * entity tables are no longer queried — Explorer surfaces the 8
 * canonical datasets from the new pipeline.
 *
 * Query params:
 *   counts=1        →  returns per-dataset record counts (plus legacy
 *                      entity keys mapped onto the matching dataset so
 *                      existing sidebar call sites keep working).
 *   entity=<key>    →  returns columns + rows + total for a dataset.
 *                      Accepts either canonical dataset keys
 *                      (products, suppliers, …) or the old entity names
 *                      (Product, Supplier, POLine, …).
 *   page=<n>        →  1-indexed page (PAGE_SIZE = 50).
 *   q=<search>      →  case-insensitive ILIKE across all string fields
 *                      declared by the dataset.
 */

const PAGE_SIZE = 50;

type Col = { key: string; label: string };
type Row = Record<string, string | number | boolean | null>;

// Legacy entity names → new dataset keys. Both the relational entity
// names the old Explorer spoke in (Product, POLine, BOMHeader…) and the
// new canonical keys (products, purchase_orders, bom…) resolve to the
// same dataset so bookmarks and sidebar deep-links keep working.
const ENTITY_TO_DATASET: Record<string, DatasetName> = {
  // New names
  products: "products",
  suppliers: "suppliers",
  customers: "customers",
  locations: "locations",
  inventory: "inventory",
  purchase_orders: "purchase_orders",
  sales_orders: "sales_orders",
  bom: "bom",
  // Legacy aliases — keep the old sidebar links alive during cutover.
  Product: "products",
  Supplier: "suppliers",
  Customer: "customers",
  Location: "locations",
  InventoryItem: "inventory",
  PurchaseOrder: "purchase_orders",
  POLine: "purchase_orders",
  SalesOrder: "sales_orders",
  SalesOrderLine: "sales_orders",
  SOLine: "sales_orders",
  BOM: "bom",
  BOMHeader: "bom",
  BOMLine: "bom",
};

async function getAllCounts(orgId: string): Promise<Record<string, number>> {
  const grouped = await prisma.importRecord.groupBy({
    by: ["datasetName"],
    where: { organizationId: orgId },
    _count: { id: true },
  });

  const byDataset: Record<string, number> = {};
  for (const row of grouped) {
    byDataset[row.datasetName] = row._count.id;
  }

  // Return both the canonical keys and the legacy entity keys pointing
  // at the same count so existing UI code that reads counts["Product"]
  // or counts["POLine"] doesn't need changes today.
  return {
    // Canonical keys
    products: byDataset.products ?? 0,
    suppliers: byDataset.suppliers ?? 0,
    customers: byDataset.customers ?? 0,
    locations: byDataset.locations ?? 0,
    inventory: byDataset.inventory ?? 0,
    purchase_orders: byDataset.purchase_orders ?? 0,
    sales_orders: byDataset.sales_orders ?? 0,
    bom: byDataset.bom ?? 0,
    // Legacy entity keys — compound pairs share one count since both
    // header and line rows live in the same dataset now.
    Product: byDataset.products ?? 0,
    Supplier: byDataset.suppliers ?? 0,
    Customer: byDataset.customers ?? 0,
    Location: byDataset.locations ?? 0,
    InventoryItem: byDataset.inventory ?? 0,
    PurchaseOrder: byDataset.purchase_orders ?? 0,
    POLine: byDataset.purchase_orders ?? 0,
    SalesOrder: byDataset.sales_orders ?? 0,
    SalesOrderLine: byDataset.sales_orders ?? 0,
    SOLine: byDataset.sales_orders ?? 0,
    BOM: byDataset.bom ?? 0,
    BOMHeader: byDataset.bom ?? 0,
    BOMLine: byDataset.bom ?? 0,
  };
}

async function queryEntity(
  entity: string,
  orgId: string,
  page: number,
  q: string,
): Promise<{ columns: Col[]; rows: Row[]; total: number }> {
  const datasetName = ENTITY_TO_DATASET[entity];
  if (!datasetName) return { columns: [], rows: [], total: 0 };

  const dataset = DATASETS[datasetName];
  const skip = (page - 1) * PAGE_SIZE;

  const fieldEntries = Object.entries(dataset.fields) as [
    string,
    { label: string; type: "string" | "number" | "boolean" | "date" },
  ][];

  const columns: Col[] = fieldEntries.map(([key, def]) => ({
    key,
    label: def.label,
  }));

  // Search across every declared string field. We use Prisma.sql tagged
  // templates so the search term is bound as a parameter — no string
  // interpolation of user input. Field names are inlined via Prisma.raw
  // after validating against the dataset's declared field list, so a
  // malicious `entity` param can never smuggle a column reference.
  let records: Array<{ id: string; data: Prisma.JsonValue; importedAt: Date }>;
  let total: number;

  if (q) {
    const stringFields = fieldEntries
      .filter(([, def]) => def.type === "string")
      .map(([key]) => key);

    if (stringFields.length === 0) {
      // Dataset has no string fields — treat as empty search result.
      return { columns, rows: [], total: 0 };
    }

    // Build `(data->>'field_a' ILIKE $1 OR data->>'field_b' ILIKE $1 …)`.
    // Field names are alphanumeric + underscore only (validated by the
    // DATASETS schema at definition time), so Prisma.raw is safe here.
    const likeFragments = stringFields.map(
      (f) => Prisma.sql`"data"->>${f} ILIKE ${`%${q}%`}`,
    );
    const searchClause = Prisma.join(likeFragments, " OR ");

    const [rowResult, countResult] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; data: Prisma.JsonValue; importedAt: Date }>>(
        Prisma.sql`
          SELECT "id", "data", "importedAt"
          FROM "ImportRecord"
          WHERE "organizationId" = ${orgId}
            AND "datasetName" = ${datasetName}
            AND (${searchClause})
          ORDER BY "importedAt" DESC
          LIMIT ${PAGE_SIZE} OFFSET ${skip}
        `,
      ),
      prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "ImportRecord"
          WHERE "organizationId" = ${orgId}
            AND "datasetName" = ${datasetName}
            AND (${searchClause})
        `,
      ),
    ]);
    records = rowResult;
    total = Number(countResult[0]?.count ?? 0);
  } else {
    const [totalResult, rowResult] = await Promise.all([
      prisma.importRecord.count({
        where: { organizationId: orgId, datasetName },
      }),
      prisma.importRecord.findMany({
        where: { organizationId: orgId, datasetName },
        select: { id: true, data: true, importedAt: true },
        skip,
        take: PAGE_SIZE,
        orderBy: { importedAt: "desc" },
      }),
    ]);
    total = totalResult;
    records = rowResult;
  }

  // Discover all extra keys present in the actual data that aren't
  // declared in the canonical schema. These come from fields that were
  // stored before the schema was updated, or from CSV columns the mapper
  // kept under their original names.
  const canonicalKeySet = new Set(fieldEntries.map(([k]) => k));
  const extraKeySet = new Set<string>();
  for (const record of records) {
    const data = (record.data as Record<string, unknown> | null) ?? {};
    for (const key of Object.keys(data)) {
      if (!canonicalKeySet.has(key) && key !== "_id") {
        extraKeySet.add(key);
      }
    }
  }
  const allColumns: Col[] = [
    ...columns,
    ...[...extraKeySet].sort().map((key) => ({ key, label: key })),
  ];

  const rows: Row[] = records.map((record) => {
    const data = (record.data as Record<string, unknown> | null) ?? {};
    const row: Row = { _id: record.id };
    // Canonical fields with proper type coercion
    for (const [key, def] of fieldEntries) {
      const val = data[key];
      if (val === null || val === undefined) {
        row[key] = null;
      } else if (def.type === "number") {
        const n = typeof val === "number" ? val : Number(val);
        row[key] = Number.isFinite(n) ? n : null;
      } else if (def.type === "boolean") {
        row[key] = typeof val === "boolean" ? val : Boolean(val);
      } else {
        row[key] = String(val);
      }
    }
    // Extra / non-canonical fields stored as raw strings
    for (const key of extraKeySet) {
      const val = data[key];
      row[key] = val === null || val === undefined ? null : String(val);
    }
    return row;
  });

  return { columns: allColumns, rows, total };
}

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = (searchParams.get("q") ?? "").trim();
  const countsOnly = searchParams.get("counts") === "1";

  if (countsOnly) {
    const counts = await getAllCounts(ctx.org.id);
    return NextResponse.json({ counts });
  }

  if (!entity) {
    return NextResponse.json({ error: "entity param required" }, { status: 400 });
  }

  try {
    const { columns, rows, total } = await queryEntity(entity, ctx.org.id, page, q);
    return NextResponse.json({
      columns,
      rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error(`[explore] Error querying ${entity}:`, err);
    return NextResponse.json(
      {
        error: `Failed to query ${entity}`,
        columns: [],
        rows: [],
        total: 0,
        page: 1,
        pages: 1,
      },
      { status: 500 },
    );
  }
}
