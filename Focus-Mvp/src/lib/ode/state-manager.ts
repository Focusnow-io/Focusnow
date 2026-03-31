/**
 * ODE — Operational state manager.
 *
 * The state manager tracks the *current* operational state of the organisation
 * and emits OperationalEvent records whenever canonical entities change.
 *
 * This is the heartbeat of the ODE: every upsert from every connector flows
 * through here so the event log is always up to date.
 *
 * The state manager does NOT aggregate historical data (that is BI territory).
 * It answers: "What is the state of the operation *right now*, and what
 * changed since the last sync?"
 */

import { prisma } from "@/lib/prisma";
import type { OdeEntityType, OperationalAlert, OperationalState } from "./types";

// Prisma v7 requires InputJsonValue-compatible objects, not Record<string, unknown>.
// This helper casts safely — all values coming from normaliser are already JSON-safe.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asJson = (v: unknown) => v as any;

// ---------------------------------------------------------------------------
// Event emission
// ---------------------------------------------------------------------------

interface EmitEventInput {
  organizationId: string;
  entityType: OdeEntityType;
  entityId: string;
  eventType: string;
  previousState: Record<string, unknown> | null;
  currentState: Record<string, unknown>;
  connectorId?: string;
  source?: string;
}

export async function emitOperationalEvent(
  input: EmitEventInput
): Promise<void> {
  await prisma.operationalEvent.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      eventType: input.eventType,
      previousState: input.previousState ? asJson(input.previousState) : undefined,
      currentState: asJson(input.currentState),
      connectorId: input.connectorId ?? null,
      source: input.source ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Upsert helpers — each normalised entity goes through these so that:
//   1. The canonical record is written to the DB.
//   2. An OperationalEvent is emitted capturing the before/after delta.
// ---------------------------------------------------------------------------

export async function upsertProduct(
  organizationId: string,
  fields: Record<string, unknown>,
  opts: { connectorId?: string; source?: string } = {}
) {
  const { sku, name, description, category, unit, unitCost, externalId, metadata } =
    fields as Record<string, unknown>;

  const existing = await prisma.product.findUnique({
    where: { organizationId_sku: { organizationId, sku: String(sku) } },
  });

  const result = await prisma.product.upsert({
    where: { organizationId_sku: { organizationId, sku: String(sku) } },
    create: {
      organizationId,
      sku: String(sku),
      name: String(name),
      description: description ? String(description) : null,
      category: category ? String(category) : null,
      unit: unit ? String(unit) : null,
      unitCost: unitCost != null ? Number(unitCost) : null,
      externalId: externalId ? String(externalId) : null,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
    update: {
      name: String(name),
      description: description ? String(description) : undefined,
      category: category ? String(category) : undefined,
      unit: unit ? String(unit) : undefined,
      unitCost: unitCost != null ? Number(unitCost) : undefined,
      externalId: externalId ? String(externalId) : undefined,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
  });

  await emitOperationalEvent({
    organizationId,
    entityType: "PRODUCT",
    entityId: result.id,
    eventType: existing ? "product.updated" : "product.created",
    previousState: existing
      ? { sku: existing.sku, name: existing.name, category: existing.category, unitCost: existing.unitCost?.toString() ?? null }
      : null,
    currentState: { sku: result.sku, name: result.name, category: result.category, unitCost: result.unitCost?.toString() ?? null },
    ...opts,
  });

  return result;
}

export async function upsertSupplier(
  organizationId: string,
  fields: Record<string, unknown>,
  opts: { connectorId?: string; source?: string } = {}
) {
  const { code, name, email, phone, country, leadTimeDays, paymentTerms, externalId, metadata } =
    fields as Record<string, unknown>;

  const existing = await prisma.supplier.findUnique({
    where: { organizationId_code: { organizationId, code: String(code) } },
  });

  const result = await prisma.supplier.upsert({
    where: { organizationId_code: { organizationId, code: String(code) } },
    create: {
      organizationId,
      code: String(code),
      name: String(name),
      email: email ? String(email) : null,
      phone: phone ? String(phone) : null,
      country: country ? String(country) : null,
      leadTimeDays: leadTimeDays ? Number(leadTimeDays) : null,
      paymentTerms: paymentTerms ? String(paymentTerms) : null,
      externalId: externalId ? String(externalId) : null,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
    update: {
      name: String(name),
      email: email ? String(email) : undefined,
      phone: phone ? String(phone) : undefined,
      country: country ? String(country) : undefined,
      leadTimeDays: leadTimeDays ? Number(leadTimeDays) : undefined,
      paymentTerms: paymentTerms ? String(paymentTerms) : undefined,
      externalId: externalId ? String(externalId) : undefined,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
  });

  await emitOperationalEvent({
    organizationId,
    entityType: "SUPPLIER",
    entityId: result.id,
    eventType: existing ? "supplier.updated" : "supplier.created",
    previousState: existing ? { code: existing.code, name: existing.name, leadTimeDays: existing.leadTimeDays } : null,
    currentState: { code: result.code, name: result.name, leadTimeDays: result.leadTimeDays },
    ...opts,
  });

  return result;
}

export async function upsertInventoryItem(
  organizationId: string,
  fields: Record<string, unknown>,
  opts: { connectorId?: string; source?: string } = {}
) {
  const { sku, locationCode, quantity, reservedQty, reorderPoint, reorderQty } =
    fields as Record<string, unknown>;

  // Auto-create product stub so inventory upserts are never silently dropped.
  const product = await prisma.product.upsert({
    where: { organizationId_sku: { organizationId, sku: String(sku) } },
    create: { organizationId, sku: String(sku), name: String(sku) },
    update: {},
    select: { id: true },
  });

  let location = null;
  if (locationCode) {
    location = await prisma.location.findUnique({
      where: { organizationId_code: { organizationId, code: String(locationCode) } },
    });
  }

  const locationId = location?.id ?? null;

  const existing = await prisma.inventoryItem.findUnique({
    where: {
      organizationId_productId_locationId: {
        organizationId,
        productId: product.id,
        locationId: locationId ?? "",
      },
    },
  });

  const result = await prisma.inventoryItem.upsert({
    where: {
      organizationId_productId_locationId: {
        organizationId,
        productId: product.id,
        locationId: locationId ?? "",
      },
    },
    create: {
      organizationId,
      productId: product.id,
      locationId,
      quantity: quantity != null ? Number(quantity) : 0,
      reservedQty: reservedQty != null ? Number(reservedQty) : 0,
      reorderPoint: reorderPoint != null ? Number(reorderPoint) : null,
      reorderQty: reorderQty != null ? Number(reorderQty) : null,
    },
    update: {
      quantity: quantity != null ? Number(quantity) : 0,
      reservedQty: reservedQty != null ? Number(reservedQty) : 0,
      reorderPoint: reorderPoint != null ? Number(reorderPoint) : undefined,
      reorderQty: reorderQty != null ? Number(reorderQty) : undefined,
    },
  });

  await emitOperationalEvent({
    organizationId,
    entityType: "INVENTORY_ITEM",
    entityId: result.id,
    eventType: existing ? "inventory.quantity_changed" : "inventory.created",
    previousState: existing
      ? { sku: String(sku), locationCode: locationCode ?? null, quantity: existing.quantity.toString(), reservedQty: existing.reservedQty.toString() }
      : null,
    currentState: { sku: String(sku), locationCode: locationCode ?? null, quantity: result.quantity.toString(), reservedQty: result.reservedQty.toString() },
    ...opts,
  });

  return result;
}

export async function upsertOrder(
  organizationId: string,
  fields: Record<string, unknown>,
  opts: { connectorId?: string; source?: string } = {}
) {
  const { orderNumber, type, supplierCode, status, orderDate, expectedDate, totalAmount, currency, externalId, metadata } =
    fields as Record<string, unknown>;

  let supplier = null;
  if (supplierCode) {
    supplier = await prisma.supplier.findUnique({
      where: { organizationId_code: { organizationId, code: String(supplierCode) } },
    });
  }

  const existing = await prisma.order.findUnique({
    where: { organizationId_orderNumber: { organizationId, orderNumber: String(orderNumber) } },
  });

  const orderType = (type as "PURCHASE" | "SALES" | "TRANSFER") ?? "PURCHASE";
  const orderStatus = (status as "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED") ?? "PENDING";

  const result = await prisma.order.upsert({
    where: { organizationId_orderNumber: { organizationId, orderNumber: String(orderNumber) } },
    create: {
      organizationId,
      orderNumber: String(orderNumber),
      type: orderType,
      supplierId: supplier?.id ?? null,
      status: orderStatus,
      orderDate: orderDate ? new Date(String(orderDate)) : null,
      expectedDate: expectedDate ? new Date(String(expectedDate)) : null,
      totalAmount: totalAmount != null ? Number(totalAmount) : null,
      currency: currency ? String(currency) : null,
      externalId: externalId ? String(externalId) : null,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
    update: {
      type: orderType,
      supplierId: supplier?.id ?? undefined,
      status: orderStatus,
      orderDate: orderDate ? new Date(String(orderDate)) : undefined,
      expectedDate: expectedDate ? new Date(String(expectedDate)) : undefined,
      totalAmount: totalAmount != null ? Number(totalAmount) : undefined,
      currency: currency ? String(currency) : undefined,
      externalId: externalId ? String(externalId) : undefined,
      metadata: metadata != null ? asJson(metadata) : undefined,
    },
  });

  await emitOperationalEvent({
    organizationId,
    entityType: "ORDER",
    entityId: result.id,
    eventType: existing ? "order.updated" : "order.created",
    previousState: existing ? { orderNumber: existing.orderNumber, status: existing.status, type: existing.type } : null,
    currentState: { orderNumber: result.orderNumber, status: result.status, type: result.type },
    ...opts,
  });

  return result;
}

// ---------------------------------------------------------------------------
// State snapshot
// ---------------------------------------------------------------------------

export async function getOperationalState(
  organizationId: string
): Promise<OperationalState> {
  const [
    activeProducts,
    activeSuppliers,
    activeLocations,
    openOrders,
    inventoryItems,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId, active: true } }),
    prisma.supplier.count({ where: { organizationId, active: true } }),
    prisma.location.count({ where: { organizationId, active: true } }),
    prisma.order.count({
      where: { organizationId, status: { in: ["PENDING", "CONFIRMED", "IN_TRANSIT"] } },
    }),
    prisma.inventoryItem.findMany({
      where: { organizationId },
      include: { product: true },
    }),
  ]);

  const alerts: OperationalAlert[] = [];
  let lowStockItems = 0;

  for (const item of inventoryItems) {
    const available = Number(item.quantity) - Number(item.reservedQty);

    if (item.reorderPoint !== null && available <= Number(item.reorderPoint)) {
      lowStockItems++;
      const severity =
        available <= 0
          ? "CRITICAL"
          : available <= Number(item.reorderPoint) * 0.5
          ? "HIGH"
          : "MEDIUM";

      alerts.push({
        entityType: "INVENTORY_ITEM",
        entityId: item.id,
        entityLabel: item.product.name,
        severity,
        message:
          available <= 0
            ? `${item.product.name} is OUT OF STOCK (available: ${available})`
            : `${item.product.name} is below reorder point (available: ${available}, reorder at: ${item.reorderPoint})`,
      });
    }
  }

  const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    organizationId,
    snapshotAt: new Date().toISOString(),
    summary: {
      activeProducts,
      activeSuppliers,
      activeLocations,
      openOrders,
      lowStockItems,
      pendingRelationships: 0,
    },
    alerts,
  };
}
