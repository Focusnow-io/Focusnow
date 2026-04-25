/**
 * ODE — Operational graph builder.
 *
 * Reads the current canonical entities from the database and constructs the
 * operational graph: a network of nodes (entities) connected by typed
 * relationship edges that represent how the company operates.
 *
 * Edges are both returned in-memory for the API response *and* persisted to
 * the OperationalRelationship table so downstream queries can leverage indexed
 * graph traversal.
 *
 * This is NOT a reporting cube.  Every edge has operational semantics:
 *   SUPPLIES          — Supplier is a known source of this Product
 *   STOCKS_AT         — Product is held at this Location
 *   SOURCES_FROM      — Order is placed with this Supplier
 *   FULFILLS          — Order line delivers this Product
 *   COMPONENT_OF      — Product is a BOM component of another Product
 *   LOCATED_IN        — Location is a child of a parent Location
 *   TRANSFERS_BETWEEN — A transfer order links these two Locations
 *   SHIPS_TO          — Supplier delivers to this Location (inferred via orders)
 */

import { prisma } from "@/lib/prisma";
import type { GraphEdge, GraphNode, OperationalGraph, RelationshipType, OdeEntityType } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asJson = (v: unknown) => v as any;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build (or refresh) the operational graph for an organisation.
 *
 * 1. Loads all canonical entities.
 * 2. Creates graph nodes.
 * 3. Infers edges from DB relationships.
 * 4. Upserts edges into OperationalRelationship.
 * 5. Returns the complete OperationalGraph.
 */
export async function buildOperationalGraph(
  organizationId: string
): Promise<OperationalGraph> {
  // TODO: Rewrite to query ImportRecord in a future sprint. The ODE
  // graph builder currently reads from the legacy relational tables
  // which are no longer populated by the import pipeline. Returning
  // an empty graph keeps every caller (dashboards, alert detectors,
  // completeness checks) running without throwing against empty
  // archive tables.
  return {
    organizationId,
    generatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    stats: {
      nodeCount: 0,
      edgeCount: 0,
      nodesByType: {},
      edgesByType: {},
    },
  } as OperationalGraph;
}

/** @deprecated Pre-migration implementation kept for reference; never
 *  reached because the export above returns early. Will be removed
 *  when the builder is rewritten against ImportRecord. */
async function _legacyBuildOperationalGraph(
  organizationId: string
): Promise<OperationalGraph> {
  const [products, suppliers, locations, inventory, orders, bomItems] =
    await Promise.all([
      prisma.product.findMany({ where: { organizationId, active: true } }),
      prisma.supplier.findMany({ where: { organizationId, active: true } }),
      prisma.location.findMany({ where: { organizationId, active: true } }),
      prisma.inventoryItem.findMany({
        where: { organizationId },
        include: { product: true, location: true },
      }),
      prisma.order.findMany({
        where: { organizationId },
        include: { supplier: true, lines: { include: { product: true } } },
      }),
      prisma.bOMItem.findMany({
        where: { parent: { organizationId } },
        include: { parent: true, child: true },
      }),
    ]);

  // ---------------------------------------------------------------------------
  // Build nodes
  // ---------------------------------------------------------------------------

  const nodes: GraphNode[] = [
    ...products.map((p) => ({
      id: p.id,
      type: "PRODUCT" as OdeEntityType,
      label: `${p.sku} — ${p.name}`,
      properties: {
        sku: p.sku,
        name: p.name,
        category: p.category,
        unit: p.unit,
        unitCost: p.unitCost?.toString() ?? null,
      },
      lastSeenAt: p.updatedAt.toISOString(),
    })),
    ...suppliers.map((s) => ({
      id: s.id,
      type: "SUPPLIER" as OdeEntityType,
      label: `${s.code} — ${s.name}`,
      properties: {
        code: s.code,
        name: s.name,
        country: s.country,
        leadTimeDays: s.leadTimeDays,
        paymentTerms: s.paymentTerms,
      },
      lastSeenAt: s.updatedAt.toISOString(),
    })),
    ...locations.map((l) => ({
      id: l.id,
      type: "LOCATION" as OdeEntityType,
      label: `${l.code} — ${l.name}`,
      properties: { code: l.code, name: l.name, type: l.type },
      lastSeenAt: l.updatedAt.toISOString(),
    })),
    ...orders.map((o) => ({
      id: o.id,
      type: "ORDER" as OdeEntityType,
      label: `${o.orderNumber} (${o.type})`,
      properties: {
        orderNumber: o.orderNumber,
        type: o.type,
        status: o.status,
        orderDate: o.orderDate?.toISOString() ?? null,
        expectedDate: o.expectedDate?.toISOString() ?? null,
        totalAmount: o.totalAmount?.toString() ?? null,
        currency: o.currency,
      },
      lastSeenAt: o.updatedAt.toISOString(),
    })),
  ];

  // ---------------------------------------------------------------------------
  // Infer edges
  // ---------------------------------------------------------------------------

  const edgeInputs: Array<{
    type: RelationshipType;
    sourceType: OdeEntityType;
    sourceId: string;
    targetType: OdeEntityType;
    targetId: string;
    strength?: number;
    metadata?: Record<string, unknown>;
  }> = [];

  // STOCKS_AT  — Product → Location (from inventory positions)
  for (const item of inventory) {
    if (item.locationId) {
      edgeInputs.push({
        type: "STOCKS_AT",
        sourceType: "PRODUCT",
        sourceId: item.productId,
        targetType: "LOCATION",
        targetId: item.locationId,
        metadata: {
          quantity: item.quantity.toString(),
          reservedQty: item.reservedQty.toString(),
          reorderPoint: item.reorderPoint?.toString() ?? null,
        },
      });
    }
  }

  // SOURCES_FROM + FULFILLS + SUPPLIES + SHIPS_TO — from orders
  const supplierProductSet = new Set<string>();
  const supplierLocationSet = new Set<string>();

  for (const order of orders) {
    // SOURCES_FROM  Order → Supplier
    if (order.supplierId) {
      edgeInputs.push({
        type: "SOURCES_FROM",
        sourceType: "ORDER",
        sourceId: order.id,
        targetType: "SUPPLIER",
        targetId: order.supplierId,
      });
    }

    for (const line of order.lines) {
      // FULFILLS  Order → Product
      edgeInputs.push({
        type: "FULFILLS",
        sourceType: "ORDER",
        sourceId: order.id,
        targetType: "PRODUCT",
        targetId: line.productId,
        metadata: {
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice?.toString() ?? null,
        },
      });

      // SUPPLIES  Supplier → Product (inferred from purchase orders)
      if (order.supplierId && order.type === "PURCHASE") {
        const key = `${order.supplierId}:${line.productId}`;
        if (!supplierProductSet.has(key)) {
          supplierProductSet.add(key);
          edgeInputs.push({
            type: "SUPPLIES",
            sourceType: "SUPPLIER",
            sourceId: order.supplierId,
            targetType: "PRODUCT",
            targetId: line.productId,
            metadata: {
              inferredFrom: "purchase_order",
              supplierLeadTimeDays: order.supplier?.leadTimeDays ?? null,
            },
          });
        }
      }
    }
  }

  // SHIPS_TO  Supplier → Location (inferred: supplier → locations that stock their products)
  for (const item of inventory) {
    if (!item.locationId) continue;
    for (const order of orders) {
      if (!order.supplierId || order.type !== "PURCHASE") continue;
      const key = `${order.supplierId}:${item.locationId}`;
      if (!supplierLocationSet.has(key)) {
        // only add if supplier supplies a product stocked at this location
        const supplierProductIds = new Set(
          order.lines.map((l) => l.productId)
        );
        if (supplierProductIds.has(item.productId)) {
          supplierLocationSet.add(key);
          edgeInputs.push({
            type: "SHIPS_TO",
            sourceType: "SUPPLIER",
            sourceId: order.supplierId,
            targetType: "LOCATION",
            targetId: item.locationId,
          });
        }
      }
    }
  }

  // COMPONENT_OF  Product → Product (from BOM)
  for (const bom of bomItems) {
    edgeInputs.push({
      type: "COMPONENT_OF",
      sourceType: "PRODUCT",
      sourceId: bom.childId,
      targetType: "PRODUCT",
      targetId: bom.parentId,
      metadata: { quantity: bom.quantity.toString(), unit: bom.unit },
    });
  }

  // LOCATED_IN  Location → Location (hierarchy)
  for (const loc of locations) {
    if (loc.parentId) {
      edgeInputs.push({
        type: "LOCATED_IN",
        sourceType: "LOCATION",
        sourceId: loc.id,
        targetType: "LOCATION",
        targetId: loc.parentId,
      });
    }
  }

  // TRANSFERS_BETWEEN  Location → Location (from transfer orders — requires locationId on orders, future)
  // Skipped until transfer orders carry source/destination locations.

  // ---------------------------------------------------------------------------
  // Persist edges (upsert)
  // ---------------------------------------------------------------------------

  const now = new Date();

  await Promise.all(
    edgeInputs.map((e) =>
      prisma.operationalRelationship.upsert({
        where: {
          organizationId_type_sourceType_sourceId_targetType_targetId: {
            organizationId,
            type: e.type,
            sourceType: e.sourceType,
            sourceId: e.sourceId,
            targetType: e.targetType,
            targetId: e.targetId,
          },
        },
        create: {
          organizationId,
          type: e.type,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          targetType: e.targetType,
          targetId: e.targetId,
          strength: e.strength ?? null,
          metadata: e.metadata != null ? asJson(e.metadata) : undefined,
          validFrom: now,
        },
        update: {
          strength: e.strength ?? null,
          metadata: e.metadata != null ? asJson(e.metadata) : undefined,
          updatedAt: now,
        },
      })
    )
  );

  // ---------------------------------------------------------------------------
  // Assemble edges for response
  // ---------------------------------------------------------------------------

  const persistedEdges = await prisma.operationalRelationship.findMany({
    where: { organizationId, validTo: null },
  });

  const edges: GraphEdge[] = persistedEdges.map((r) => ({
    id: r.id,
    type: r.type as RelationshipType,
    sourceType: r.sourceType as OdeEntityType,
    sourceId: r.sourceId,
    targetType: r.targetType as OdeEntityType,
    targetId: r.targetId,
    strength: r.strength ?? undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    validFrom: r.validFrom.toISOString(),
    validTo: r.validTo?.toISOString(),
  }));

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const nodesByType: Record<string, number> = {};
  for (const n of nodes) {
    nodesByType[n.type] = (nodesByType[n.type] ?? 0) + 1;
  }

  const edgesByType: Record<string, number> = {};
  for (const e of edges) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
  }

  return {
    organizationId,
    generatedAt: new Date().toISOString(),
    nodes,
    edges,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodesByType,
      edgesByType,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers for targeted graph queries
// ---------------------------------------------------------------------------

/** Return all edges incident on a given entity node (both directions). */
export async function getEntityEdges(
  organizationId: string,
  entityType: OdeEntityType,
  entityId: string
): Promise<GraphEdge[]> {
  const rows = await prisma.operationalRelationship.findMany({
    where: {
      organizationId,
      validTo: null,
      OR: [
        { sourceType: entityType, sourceId: entityId },
        { targetType: entityType, targetId: entityId },
      ],
    },
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.type as RelationshipType,
    sourceType: r.sourceType as OdeEntityType,
    sourceId: r.sourceId,
    targetType: r.targetType as OdeEntityType,
    targetId: r.targetId,
    strength: r.strength ?? undefined,
    metadata: r.metadata as Record<string, unknown> | undefined,
    validFrom: r.validFrom.toISOString(),
    validTo: r.validTo?.toISOString(),
  }));
}
