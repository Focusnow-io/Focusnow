import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/brain/rules/preview
 * Live data preview — shows match count and sample records for a rule condition.
 */
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { entity, condition } = body;

  if (!entity || !condition?.field || !condition?.operator) {
    return badRequest("entity and condition (field, operator, value) required");
  }

  const orgId = ctx.org.id;
  const { field, operator, value } = condition;

  // Map operator to Prisma filter
  const prismaOp: Record<string, string> = {
    lt: "lt",
    lte: "lte",
    gt: "gt",
    gte: "gte",
    eq: "equals",
    neq: "not",
  };

  const op = prismaOp[operator];
  if (!op) {
    return badRequest(`Unsupported operator: ${operator}`);
  }

  // Coerce value to number if possible
  const coerced = value === "" || value === null || value === undefined
    ? 0
    : isNaN(Number(value))
      ? value
      : Number(value);

  // Build Prisma where clause
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
