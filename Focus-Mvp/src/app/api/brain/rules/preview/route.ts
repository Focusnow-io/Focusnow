import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/brain/rules/preview
 * Live data preview — shows match count and sample records for a rule condition.
 */

// Safe field name whitelist per entity — prevents SQL injection on field references
const FIELD_WHITELIST: Record<string, Set<string>> = {
  InventoryItem: new Set([
    "quantity", "reorderPoint", "reorderQty", "reservedQty", "safetyStock",
    "daysOfSupply", "moq", "orderMultiple", "leadTimeDays", "unitCost", "totalValue",
    "demandCurrentMonth", "demandNextMonth", "demandPerDay",
  ]),
  Product: new Set([
    "unitCost", "leadTimeDays", "reorderPoint", "safetyStock", "listPrice", "unitPrice", "moq",
  ]),
  Supplier: new Set(["leadTimeDays", "qualityRating", "onTimePct"]),
  Order: new Set(["totalAmount"]),
};

// DB table names (Prisma model → PostgreSQL table name)
const TABLE_NAME: Record<string, string> = {
  InventoryItem: "InventoryItem",
  Product: "Product",
  Supplier: "Supplier",
  Order: "Order",
};

// Prisma operator map
const PRISMA_OP: Record<string, string> = {
  lt: "lt", lte: "lte", gt: "gt", gte: "gte", eq: "equals", neq: "not",
};

// SQL operator map (for cross-column comparisons via $queryRaw)
const SQL_OP: Record<string, string> = {
  lt: "<", lte: "<=", gt: ">", gte: ">=", eq: "=", neq: "!=",
};

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { entity, condition } = body;

  if (!entity || !condition?.field || !condition?.operator) {
    return badRequest("entity and condition (field, operator, value) required");
  }

  const orgId = ctx.org.id;
  const { field, operator, value } = condition as { field: string; operator: string; value: unknown };

  if (!PRISMA_OP[operator]) {
    return badRequest(`Unsupported operator: ${operator}`);
  }

  // Detect if value is a cross-column field reference (non-numeric string)
  const isFieldRef =
    typeof value === "string" &&
    value !== "" &&
    isNaN(Number(value));

  if (isFieldRef) {
    // Validate both field names against the whitelist to prevent SQL injection
    const allowedFields = FIELD_WHITELIST[entity];
    const tableName = TABLE_NAME[entity];
    const sqlOp = SQL_OP[operator];

    if (!allowedFields || !tableName || !sqlOp) {
      return badRequest(`Unsupported entity: ${entity}`);
    }
    if (!allowedFields.has(field)) {
      return badRequest(`Field "${field}" is not allowed for ${entity}`);
    }
    if (!allowedFields.has(value as string)) {
      return badRequest(`Field reference "${value}" is not allowed for ${entity}`);
    }

    try {
      // Use raw SQL for cross-column comparisons — identifiers are whitelisted above
      const matchCountRows = await prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`SELECT COUNT(*)::bigint as count FROM ${Prisma.raw(`"${tableName}"`)}
          WHERE "organizationId" = ${orgId}
          AND ${Prisma.raw(`"${field}"`)} ${Prisma.raw(sqlOp)} ${Prisma.raw(`"${value as string}"`)}`
      );
      const totalCountRows = await prisma.$queryRaw<[{ count: bigint }]>(
        Prisma.sql`SELECT COUNT(*)::bigint as count FROM ${Prisma.raw(`"${tableName}"`)}
          WHERE "organizationId" = ${orgId}`
      );

      // Fetch samples (limited select to keep response small)
      const samples = await prisma.$queryRaw<Record<string, unknown>[]>(
        Prisma.sql`SELECT id, ${Prisma.raw(`"${field}"`)} as matched_field, ${Prisma.raw(`"${value as string}"`)} as ref_field
          FROM ${Prisma.raw(`"${tableName}"`)}
          WHERE "organizationId" = ${orgId}
          AND ${Prisma.raw(`"${field}"`)} ${Prisma.raw(sqlOp)} ${Prisma.raw(`"${value as string}"`)}
          LIMIT 5`
      );

      return NextResponse.json({
        matchCount: Number(matchCountRows[0]?.count ?? 0),
        totalCount: Number(totalCountRows[0]?.count ?? 0),
        samples,
      });
    } catch (err) {
      console.error("[preview] Cross-column query error:", err);
      const message = err instanceof Error ? err.message : "Query failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Literal value comparison — coerce to number if possible
  const coerced =
    value === "" || value === null || value === undefined
      ? 0
      : isNaN(Number(value))
        ? value
        : Number(value);

  const op = PRISMA_OP[operator];
  const filterClause =
    op === "not"
      ? { [field]: { not: coerced } }
      : { [field]: { [op]: coerced } };

  const baseWhere = { organizationId: orgId };
  const where = { ...baseWhere, ...filterClause };

  try {
    let matchCount = 0;
    let totalCount = 0;
    let samples: Record<string, unknown>[] = [];

    if (entity === "InventoryItem") {
      [matchCount, totalCount, samples] = await Promise.all([
        prisma.inventoryItem.count({ where }),
        prisma.inventoryItem.count({ where: baseWhere }),
        prisma.inventoryItem.findMany({
          where,
          select: {
            id: true,
            quantity: true,
            reorderPoint: true,
            reorderQty: true,
            reservedQty: true,
            unitCost: true,
            totalValue: true,
            daysOfSupply: true,
            leadTimeDays: true,
            qtyOnHold: true,
            qtyOnHandTotal: true,
            qtyOpenPO: true,
            qtyOnHandPlusPO: true,
            demandCurrentMonth: true,
            demandNextMonth: true,
            demandMonth3: true,
            demandPerDay: true,
            outflow7d: true,
            outflow30d: true,
            outflow60d: true,
            outflow92d: true,
            moq: true,
            orderMultiple: true,
            buyRecommendation: true,
            recommendedQty: true,
            uom: true,
            lastReceiptDate: true,
            product: { select: { sku: true, name: true } },
            location: { select: { name: true } },
          },
          take: 5,
        }),
      ]);
    } else if (entity === "Product") {
      [matchCount, totalCount, samples] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.count({ where: baseWhere }),
        prisma.product.findMany({
          where,
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
            unitCost: true,
            leadTimeDays: true,
            reorderPoint: true,
          },
          take: 5,
        }),
      ]);
    } else if (entity === "Supplier") {
      [matchCount, totalCount, samples] = await Promise.all([
        prisma.supplier.count({ where }),
        prisma.supplier.count({ where: baseWhere }),
        prisma.supplier.findMany({
          where,
          select: {
            id: true,
            code: true,
            name: true,
            leadTimeDays: true,
            qualityRating: true,
            onTimePct: true,
            status: true,
            country: true,
            city: true,
            paymentTerms: true,
            certifications: true,
            active: true,
          },
          take: 5,
        }),
      ]);
    } else if (entity === "Order") {
      [matchCount, totalCount, samples] = await Promise.all([
        prisma.order.count({ where }),
        prisma.order.count({ where: baseWhere }),
        prisma.order.findMany({
          where,
          select: {
            id: true,
            orderNumber: true,
            type: true,
            status: true,
            totalAmount: true,
            expectedDate: true,
            supplier: { select: { name: true } },
          },
          take: 5,
        }),
      ]);
    } else {
      return badRequest(`Unsupported entity: ${entity}`);
    }

    return NextResponse.json({ matchCount, totalCount, samples });
  } catch (err) {
    console.error("[preview] Query error:", err);
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
