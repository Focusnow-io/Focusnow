export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/brain/entities
 * Returns entity names with record counts for the current org.
 * Used to generate data-aware example prompts.
 */
export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const orgId = ctx.org.id;

  const [inventory, products, suppliers, orders] = await Promise.all([
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.order.count({ where: { organizationId: orgId } }),
  ]);

  return NextResponse.json({
    entities: [
      { name: "InventoryItem", count: inventory },
      { name: "Product", count: products },
      { name: "Supplier", count: suppliers },
      { name: "Order", count: orders },
    ].filter((e) => e.count > 0),
  });
}
