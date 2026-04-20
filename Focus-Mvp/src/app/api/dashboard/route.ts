export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;

  const [
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    activeRuleCount,
    draftRuleCount,
    dataSourceCount,
    appCount,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.order.count({ where: { organizationId: orgId } }),
    prisma.brainRule.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.brainRule.count({ where: { organizationId: orgId, status: "DRAFT" } }),
    prisma.dataSource.count({ where: { organizationId: orgId } }),
    prisma.appInstance.count({ where: { organizationId: orgId, active: true } }),
  ]);

  // Stock alerts
  const allInventory = await prisma.inventoryItem.findMany({
    where: { organizationId: orgId },
    select: { quantity: true, reorderPoint: true },
  });
  const alertCount = allInventory.filter(
    (i) =>
      i.reorderPoint !== null &&
      Number(i.quantity) <= Number(i.reorderPoint)
  ).length;

  return NextResponse.json({
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    activeRuleCount,
    draftRuleCount,
    dataSourceCount,
    appCount,
    alertCount,
  });
}
