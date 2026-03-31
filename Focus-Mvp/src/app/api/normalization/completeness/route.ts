import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

interface CapabilityMissing {
  entity: string;
  count: number;
  description: string;
}

interface Capability {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  coverage: number;
  missing: CapabilityMissing[];
  failedGates: string[];
}

function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const orgId = ctx.org.id;

  const [
    productCount,
    supplierCount,
    inventoryCount,
    orderCount,
    workOrderCount,
    inventoryWithReorderPoint,
    productsWithCost,
    inventoryUnmanaged,
    ordersWithSupplier,
    bomProductGroups,
    bomHeaderCount,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.order.count({ where: { organizationId: orgId } }),
    prisma.workOrder.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({
      where: { organizationId: orgId, reorderPoint: { not: null } },
    }),
    prisma.product.count({
      where: {
        organizationId: orgId,
        OR: [{ unitCost: { not: null } }, { unitPrice: { not: null } }],
      },
    }),
    prisma.inventoryItem.count({
      where: {
        organizationId: orgId,
        quantity: { gt: 0 },
        reorderPoint: null,
      },
    }),
    prisma.order.count({
      where: { organizationId: orgId, supplierId: { not: null } },
    }),
    prisma.bOMHeader.groupBy({
      by: ["productId"],
      where: { orgId: orgId },
    }),
    prisma.bOMHeader.count({ where: { orgId: orgId } }),
  ]);

  const productsWithBOM = bomProductGroups.length;

  // ── Capability 1: Smart Reorder Alerts ──────────────────────────────────
  const reorderCoverage = pct(inventoryWithReorderPoint, inventoryCount);
  const reorderUnlocked = productCount > 0 && inventoryCount > 0;
  const reorderMissing: CapabilityMissing[] = [];
  const reorderGates: string[] = [];
  if (productCount === 0)
    reorderMissing.push({ entity: "products", count: 0, description: "No products imported" });
  if (inventoryCount === 0)
    reorderMissing.push({ entity: "inventory items", count: 0, description: "No inventory records imported" });
  if (reorderUnlocked && reorderCoverage < 50)
    reorderGates.push("Less than 50% of inventory items have reorder points set");

  // ── Capability 2: Demand Forecasting ────────────────────────────────────
  const forecastCoverage = pct(ordersWithSupplier, orderCount);
  const forecastUnlocked = productCount > 10 && orderCount > 10;
  const forecastMissing: CapabilityMissing[] = [];
  if (productCount <= 10)
    forecastMissing.push({
      entity: "products",
      count: Math.max(0, 10 - productCount),
      description: `Need at least 10 products (have ${productCount})`,
    });
  if (orderCount <= 10)
    forecastMissing.push({
      entity: "orders",
      count: Math.max(0, 10 - orderCount),
      description: `Need at least 10 orders (have ${orderCount})`,
    });

  // ── Capability 3: Supplier Performance ──────────────────────────────────
  const supplierCoverage = pct(ordersWithSupplier, orderCount);
  const supplierUnlocked = supplierCount > 0 && orderCount >= 5;
  const supplierMissing: CapabilityMissing[] = [];
  if (supplierCount === 0)
    supplierMissing.push({ entity: "suppliers", count: 0, description: "No suppliers imported" });
  if (orderCount < 5)
    supplierMissing.push({
      entity: "orders",
      count: Math.max(0, 5 - orderCount),
      description: `Need at least 5 orders (have ${orderCount})`,
    });

  // ── Capability 4: Supply Chain Visibility ────────────────────────────────
  const visCoverage = Math.round(
    (pct(productsWithCost, productCount) +
      pct(ordersWithSupplier, orderCount) +
      pct(inventoryWithReorderPoint, inventoryCount)) /
      3
  );
  const visUnlocked = productCount > 0 && supplierCount > 0 && inventoryCount > 0;
  const visMissing: CapabilityMissing[] = [];
  if (productCount === 0)
    visMissing.push({ entity: "products", count: 0, description: "No products imported" });
  if (supplierCount === 0)
    visMissing.push({ entity: "suppliers", count: 0, description: "No suppliers imported" });
  if (inventoryCount === 0)
    visMissing.push({ entity: "inventory items", count: 0, description: "No inventory imported" });

  // ── Capability 5: Stock Optimization ────────────────────────────────────
  const stockCoverage = pct(productsWithCost, productCount);
  const costRatio = productCount > 0 ? productsWithCost / productCount : 0;
  const stockUnlocked = productCount > 0 && inventoryCount > 0 && costRatio >= 0.5;
  const stockMissing: CapabilityMissing[] = [];
  const stockGates: string[] = [];
  if (productCount === 0)
    stockMissing.push({ entity: "products", count: 0, description: "No products imported" });
  if (inventoryCount === 0)
    stockMissing.push({ entity: "inventory items", count: 0, description: "No inventory imported" });
  if (productCount > 0 && inventoryCount > 0 && stockCoverage < 50)
    stockGates.push("Less than 50% of products have unit costs defined");

  // ── Capability 6: Production Planning ───────────────────────────────────
  const prodCoverage = pct(productsWithBOM, productCount);
  const prodUnlocked = workOrderCount > 0 || bomHeaderCount > 0;
  const prodMissing: CapabilityMissing[] = [];
  if (!prodUnlocked)
    prodMissing.push({
      entity: "work orders or BOMs",
      count: 0,
      description: "Import work orders or bill of materials to enable production planning",
    });

  // ── Capability 7: AI Data Assistant ─────────────────────────────────────
  const entityTypes = [productCount, supplierCount, inventoryCount, orderCount];
  const populatedTypes = entityTypes.filter((c) => c > 0).length;
  const aiCoverage = pct(populatedTypes, 4);
  const aiUnlocked = populatedTypes > 0;
  const aiMissing: CapabilityMissing[] = [];
  if (productCount === 0)
    aiMissing.push({ entity: "products", count: 0, description: "Import products" });
  if (supplierCount === 0)
    aiMissing.push({ entity: "suppliers", count: 0, description: "Import suppliers" });
  if (inventoryCount === 0)
    aiMissing.push({ entity: "inventory items", count: 0, description: "Import inventory" });
  if (orderCount === 0)
    aiMissing.push({ entity: "orders", count: 0, description: "Import orders" });

  const capabilities: Capability[] = [
    {
      id: "reorder-alerts",
      name: "Smart Reorder Alerts",
      description: "Automatically flag items that need restocking before they run out",
      unlocked: reorderUnlocked,
      coverage: reorderCoverage,
      missing: reorderMissing,
      failedGates: reorderGates,
    },
    {
      id: "demand-forecasting",
      name: "Demand Forecasting",
      description: "Predict future demand based on order history and product data",
      unlocked: forecastUnlocked,
      coverage: forecastCoverage,
      missing: forecastMissing,
      failedGates: [],
    },
    {
      id: "supplier-performance",
      name: "Supplier Performance",
      description: "Score and rank suppliers by delivery reliability and order history",
      unlocked: supplierUnlocked,
      coverage: supplierCoverage,
      missing: supplierMissing,
      failedGates: [],
    },
    {
      id: "supply-chain-visibility",
      name: "Supply Chain Visibility",
      description: "Full traceability from supplier to inventory to order",
      unlocked: visUnlocked,
      coverage: visCoverage,
      missing: visMissing,
      failedGates: [],
    },
    {
      id: "stock-optimization",
      name: "Stock Optimization",
      description: "Optimize stock levels using cost data and demand signals",
      unlocked: stockUnlocked,
      coverage: stockCoverage,
      missing: stockMissing,
      failedGates: stockGates,
    },
    {
      id: "production-planning",
      name: "Production Planning",
      description: "Generate and schedule work orders from BOMs and demand",
      unlocked: prodUnlocked,
      coverage: prodCoverage,
      missing: prodMissing,
      failedGates: [],
    },
    {
      id: "ai-data-assistant",
      name: "AI Data Assistant",
      description: "Ask questions about your operational data in plain English",
      unlocked: aiUnlocked,
      coverage: aiCoverage,
      missing: aiMissing,
      failedGates: [],
    },
  ];

  const overallScore = Math.round(
    capabilities.reduce((sum, c) => sum + c.coverage, 0) / capabilities.length
  );

  return NextResponse.json({
    overallScore,
    unlockedCount: capabilities.filter((c) => c.unlocked).length,
    totalCount: capabilities.length,
    consistencyIssues: inventoryUnmanaged,
    capabilities,
  });
}
