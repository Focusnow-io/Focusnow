/**
 * completeness-detector.ts
 *
 * Recalculates a ModelCompletenessReport per org after any import.
 * Reports entity counts, coverage %, quality gate results, and which
 * AI capabilities are unlocked based on both quantity thresholds and
 * field-population quality gates.
 */

import { prisma } from "@/lib/prisma";
import type { CapabilityReport, CompletenessReport, QualityGateResult } from "./types";

// ─── Entity count helpers ─────────────────────────────────────────────────────
// Different models use either organizationId or orgId for tenant scoping.

async function countEntities(organizationId: string): Promise<Record<string, number>> {
  const [
    product, supplier, location, inventoryItem,
    workOrder, routing, equipment, customer,
    bomHeader, bomLine, demandForecast, qcInspection,
    supplierItem, routingOperation, purchaseOrder, salesOrder,
  ] = await prisma.$transaction([
    prisma.product.count({ where: { organizationId } }),
    prisma.supplier.count({ where: { organizationId } }),
    prisma.location.count({ where: { organizationId } }),
    prisma.inventoryItem.count({ where: { organizationId } }),
    prisma.workOrder.count({ where: { organizationId } }),
    prisma.routing.count({ where: { organizationId } }),
    prisma.equipment.count({ where: { orgId: organizationId } }),
    prisma.customer.count({ where: { orgId: organizationId } }),
    prisma.bOMHeader.count({ where: { orgId: organizationId } }),
    prisma.bOMLine.count({ where: { bomHeader: { orgId: organizationId } } }),
    prisma.demandForecast.count({ where: { orgId: organizationId } }),
    prisma.qCInspection.count({ where: { orgId: organizationId } }),
    prisma.supplierItem.count({ where: { orgId: organizationId } }),
    prisma.routingOperation.count({ where: { routing: { organizationId } } }),
    prisma.purchaseOrder.count({ where: { orgId: organizationId } }),
    prisma.sOLine.count({ where: { salesOrder: { orgId: organizationId } } }),
  ]);

  return {
    Product: product,
    Supplier: supplier,
    Location: location,
    InventoryItem: inventoryItem,
    WorkOrder: workOrder,
    Routing: routing,
    Equipment: equipment,
    Customer: customer,
    BOMHeader: bomHeader,
    BOMLine: bomLine,
    DemandForecast: demandForecast,
    QCInspection: qcInspection,
    SupplierItem: supplierItem,
    RoutingOperation: routingOperation,
    PurchaseOrder: purchaseOrder,
    SOLine: salesOrder,
  };
}

// ─── Quality gate evaluation ──────────────────────────────────────────────────

interface GateDef {
  entity: string;
  field: string;
  minCoverage: number;
}

/**
 * Count total and populated records for a quality gate.
 * Handles both organizationId and orgId scoping, plus nested relations.
 */
async function evaluateGate(
  organizationId: string,
  gate: GateDef,
  counts: Record<string, number>,
): Promise<QualityGateResult> {
  const total = counts[gate.entity] ?? 0;
  if (total === 0) {
    return { entity: gate.entity, field: gate.field, coverage: 0, required: gate.minCoverage, passed: false };
  }

  // Build the "not null" filter for the field
  const notNull = { [gate.field]: { not: null } };

  let populated = 0;

  try {
    if (gate.entity === "InventoryItem") {
      populated = await prisma.inventoryItem.count({
        where: { organizationId, ...notNull },
      });
    } else if (gate.entity === "Product") {
      populated = await prisma.product.count({
        where: { organizationId, ...notNull },
      });
    } else if (gate.entity === "SupplierItem") {
      populated = await prisma.supplierItem.count({
        where: { orgId: organizationId, ...notNull },
      });
    } else if (gate.entity === "BOMLine") {
      populated = await prisma.bOMLine.count({
        where: { bomHeader: { orgId: organizationId }, ...notNull },
      });
    } else if (gate.entity === "RoutingOperation") {
      populated = await prisma.routingOperation.count({
        where: { routing: { organizationId }, ...notNull },
      });
    } else if (gate.entity === "QCInspection") {
      populated = await prisma.qCInspection.count({
        where: { orgId: organizationId, ...notNull },
      });
    }
  } catch {
    // Field may not exist on model — treat as 0 populated
    populated = 0;
  }

  const coverage = total > 0 ? populated / total : 0;
  return {
    entity: gate.entity,
    field: gate.field,
    coverage,
    required: gate.minCoverage,
    passed: coverage >= gate.minCoverage,
  };
}

// ─── Capability definitions ───────────────────────────────────────────────────

interface CapabilityDef {
  label: string;
  minCounts: Record<string, number>;
  qualityGateDefs: GateDef[];
}

const CAPABILITIES: Record<string, CapabilityDef> = {
  demand_forecasting: {
    label: "Demand Forecasting",
    minCounts: { Product: 1, InventoryItem: 1, DemandForecast: 1 },
    qualityGateDefs: [
      { entity: "InventoryItem", field: "reorderPoint", minCoverage: 0.5 },
      { entity: "InventoryItem", field: "demandPerDay",  minCoverage: 0.3 },
    ],
  },
  procurement_optimization: {
    label: "Procurement Optimization",
    minCounts: { Product: 1, Supplier: 1, InventoryItem: 1 },
    qualityGateDefs: [
      { entity: "SupplierItem", field: "contractUnitCost", minCoverage: 0.5 },
      { entity: "Product",      field: "leadTimeDays",     minCoverage: 0.5 },
    ],
  },
  bom_analysis: {
    label: "BOM Analysis",
    minCounts: { Product: 1, BOMHeader: 1, BOMLine: 1 },
    qualityGateDefs: [
      { entity: "BOMLine", field: "qty", minCoverage: 1.0 },
      { entity: "BOMLine", field: "uom", minCoverage: 0.8 },
    ],
  },
  production_scheduling: {
    label: "Production Scheduling",
    minCounts: { WorkOrder: 1, Routing: 1, Equipment: 1 },
    qualityGateDefs: [
      { entity: "RoutingOperation", field: "runMinsPerUnit", minCoverage: 0.7 },
    ],
  },
  inventory_replenishment: {
    label: "Inventory Replenishment",
    minCounts: { Product: 10, InventoryItem: 10 },
    qualityGateDefs: [
      { entity: "InventoryItem", field: "reorderPoint", minCoverage: 0.5 },
      { entity: "Product",       field: "leadTimeDays", minCoverage: 0.5 },
    ],
  },
  supplier_analysis: {
    label: "Supplier Analysis",
    minCounts: { Supplier: 1, SupplierItem: 1 },
    qualityGateDefs: [
      { entity: "SupplierItem", field: "contractUnitCost", minCoverage: 0.5 },
      { entity: "SupplierItem", field: "leadTimeDays",     minCoverage: 0.5 },
    ],
  },
  quality_control: {
    label: "Quality Control",
    minCounts: { Product: 1, QCInspection: 1 },
    qualityGateDefs: [
      { entity: "QCInspection", field: "inspectedAt", minCoverage: 1.0 },
    ],
  },
};

// ─── Main export ──────────────────────────────────────────────────────────────

export async function calculateCompleteness(
  organizationId: string,
): Promise<CompletenessReport> {
  const entityCounts = await countEntities(organizationId);

  const capabilities: Record<string, CapabilityReport> = {};
  const capabilityScores: number[] = [];

  for (const [key, def] of Object.entries(CAPABILITIES)) {
    // Check minCounts
    const missingCounts: string[] = [];
    for (const [entity, min] of Object.entries(def.minCounts)) {
      if ((entityCounts[entity] ?? 0) < min) {
        missingCounts.push(`${entity} (need ≥${min}, have ${entityCounts[entity] ?? 0})`);
      }
    }

    // Evaluate quality gates
    const qualityGates: QualityGateResult[] = await Promise.all(
      def.qualityGateDefs.map((g) => evaluateGate(organizationId, g, entityCounts)),
    );

    const countsPassed = missingCounts.length === 0;
    const gatesPassed = qualityGates.every((g) => g.passed);
    const unlocked = countsPassed && gatesPassed;

    // Coverage: percentage of requirements satisfied (counts + gates combined)
    const totalChecks = Object.keys(def.minCounts).length + qualityGates.length;
    const passedChecks =
      (Object.keys(def.minCounts).length - missingCounts.length) +
      qualityGates.filter((g) => g.passed).length;
    const coverage = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;

    capabilities[key] = {
      label: def.label,
      unlocked,
      coverage,
      missingCounts,
      qualityGates,
    };

    capabilityScores.push(coverage);
  }

  const overallScore =
    capabilityScores.length > 0
      ? capabilityScores.reduce((a, b) => a + b, 0) / capabilityScores.length
      : 0;

  // Upsert the single-row-per-org report
  await prisma.modelCompletenessReport.upsert({
    where: { organizationId },
    create: {
      organizationId,
      entityCounts: entityCounts as object,
      capabilities: capabilities as object,
      overallScore,
    },
    update: {
      generatedAt: new Date(),
      entityCounts: entityCounts as object,
      capabilities: capabilities as object,
      overallScore,
    },
  });

  return {
    organizationId,
    generatedAt: new Date(),
    entityCounts,
    capabilities,
    overallScore,
  };
}
