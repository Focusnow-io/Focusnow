import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const orgId = ctx.org.id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    products, inventory, suppliers, purchaseOrders, salesOrders, workOrders,
    lots, customers, locations, boms, forecasts, stockOuts, overduePOs,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.purchaseOrder.count({ where: { orgId } }),
    prisma.salesOrder.count({ where: { orgId } }),
    prisma.workOrder.count({ where: { organizationId: orgId } }),
    prisma.lot.count({ where: { orgId } }),
    prisma.customer.count({ where: { orgId } }),
    prisma.location.count({ where: { organizationId: orgId } }),
    prisma.bOMHeader.count({ where: { orgId } }),
    prisma.demandForecast.count({ where: { orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId, quantity: 0 } }),
    prisma.purchaseOrder.count({
      where: {
        orgId,
        expectedDate: { lt: today },
        status: { notIn: ["RECEIVED", "CANCELLED"] },
      },
    }),
  ]);

  return NextResponse.json({
    products,
    inventory,
    suppliers,
    purchaseOrders,
    salesOrders,
    workOrders,
    lots,
    customers,
    locations,
    boms,
    forecasts,
    stockOuts,
    overduePOs,
  });
}
