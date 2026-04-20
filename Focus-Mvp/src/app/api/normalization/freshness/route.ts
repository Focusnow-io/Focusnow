export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const STALE_DAYS = 7;

function freshnessStatus(
  recordCount: number,
  lastUpdated: Date | null
): "fresh" | "stale" | "never" {
  if (recordCount === 0) return "never";
  if (!lastUpdated) return "never";
  const diffMs = Date.now() - lastUpdated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= STALE_DAYS ? "fresh" : "stale";
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 100;
  return Math.round((numerator / denominator) * 100);
}

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const orgId = ctx.org.id;

  const [
    // Counts
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    locationCount,
    workOrderCount,
    dataSourceCount,
    // Latest updatedAt per entity
    latestProduct,
    latestSupplier,
    latestInventory,
    latestOrder,
    latestLocation,
    latestWorkOrder,
    latestDataSource,
    // Quality fields — products
    productsWithCategory,
    productsWithUnitCost,
    // Quality fields — suppliers
    suppliersWithEmail,
    suppliersWithCountry,
    // Quality fields — inventory
    inventoryWithReorderPoint,
    // Quality fields — orders
    ordersWithSupplier,
    // Quality fields — data sources
    completedDataSources,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.order.count({ where: { organizationId: orgId } }),
    prisma.location.count({ where: { organizationId: orgId } }),
    prisma.workOrder.count({ where: { organizationId: orgId } }),
    prisma.dataSource.count({ where: { organizationId: orgId } }),

    prisma.product.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.supplier.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.inventoryItem.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.order.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.location.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.workOrder.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),
    prisma.dataSource.findFirst({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    }),

    prisma.product.count({ where: { organizationId: orgId, category: { not: null } } }),
    prisma.product.count({
      where: {
        organizationId: orgId,
        OR: [{ unitCost: { not: null } }, { unitPrice: { not: null } }],
      },
    }),

    prisma.supplier.count({ where: { organizationId: orgId, email: { not: null } } }),
    prisma.supplier.count({ where: { organizationId: orgId, country: { not: null } } }),

    prisma.inventoryItem.count({
      where: { organizationId: orgId, reorderPoint: { not: null } },
    }),

    prisma.order.count({ where: { organizationId: orgId, supplierId: { not: null } } }),

    prisma.dataSource.count({
      where: { organizationId: orgId, status: "COMPLETED" },
    }),
  ]);

  // Products quality: name (always present) + sku (always present) + category + unitCost
  const productQualityScore = productCount === 0
    ? 100
    : pct(productCount * 2 + productsWithCategory + productsWithUnitCost, productCount * 4);

  // Suppliers quality: name (always present) + email + country
  const supplierQualityScore = supplierCount === 0
    ? 100
    : pct(supplierCount + suppliersWithEmail + suppliersWithCountry, supplierCount * 3);

  // Inventory quality: quantity (always present) + reorderPoint
  const inventoryQualityScore = inventoryCount === 0
    ? 100
    : pct(inventoryCount + inventoryWithReorderPoint, inventoryCount * 2);

  // Orders quality: % with supplier linked
  const orderQualityScore = orderCount === 0 ? 100 : pct(ordersWithSupplier, orderCount);

  const entities = [
    {
      entityType: "products",
      label: "Products",
      recordCount: productCount,
      lastUpdated: latestProduct?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(productCount, latestProduct?.updatedAt ?? null),
      dataQualityScore: productQualityScore,
    },
    {
      entityType: "suppliers",
      label: "Suppliers",
      recordCount: supplierCount,
      lastUpdated: latestSupplier?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(supplierCount, latestSupplier?.updatedAt ?? null),
      dataQualityScore: supplierQualityScore,
    },
    {
      entityType: "inventory",
      label: "Inventory Items",
      recordCount: inventoryCount,
      lastUpdated: latestInventory?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(inventoryCount, latestInventory?.updatedAt ?? null),
      dataQualityScore: inventoryQualityScore,
    },
    {
      entityType: "orders",
      label: "Orders",
      recordCount: orderCount,
      lastUpdated: latestOrder?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(orderCount, latestOrder?.updatedAt ?? null),
      dataQualityScore: orderQualityScore,
    },
    {
      entityType: "locations",
      label: "Locations",
      recordCount: locationCount,
      lastUpdated: latestLocation?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(locationCount, latestLocation?.updatedAt ?? null),
      dataQualityScore: locationCount > 0 ? 100 : 100,
    },
    {
      entityType: "workOrders",
      label: "Work Orders",
      recordCount: workOrderCount,
      lastUpdated: latestWorkOrder?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(workOrderCount, latestWorkOrder?.updatedAt ?? null),
      dataQualityScore: workOrderCount > 0 ? 100 : 100,
    },
    {
      entityType: "dataSources",
      label: "Data Sources",
      recordCount: dataSourceCount,
      lastUpdated: latestDataSource?.updatedAt.toISOString() ?? null,
      status: freshnessStatus(dataSourceCount, latestDataSource?.updatedAt ?? null),
      dataQualityScore: pct(completedDataSources, dataSourceCount),
    },
  ];

  return NextResponse.json({ entities });
}
