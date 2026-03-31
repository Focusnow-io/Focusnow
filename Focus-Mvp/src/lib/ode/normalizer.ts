/**
 * ODE — Data normaliser.
 *
 * Receives raw records from any connector and returns clean, typed
 * CanonicalRecord objects ready for upsert into the Prisma models.
 * All normalisation is lossless: unmapped or unknown fields land in
 * `metadata` so nothing is silently discarded.
 */

import type { OdeEntityType, CanonicalRecord } from "./types";
import { applyCanonicalMapping, validateCanonical } from "./canonical-schema";

// ---------------------------------------------------------------------------
// Type coercions
// ---------------------------------------------------------------------------

function toDecimalOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? null : n;
}

function toIntOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}

function toDateOrNull(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function toOrderType(value: unknown): "PURCHASE" | "SALES" | "TRANSFER" {
  const v = String(value ?? "").toUpperCase().trim();
  if (v === "SALES" || v === "SALE" || v === "SO") return "SALES";
  if (v === "TRANSFER" || v === "TRF" || v === "TO") return "TRANSFER";
  return "PURCHASE";
}

function toOrderStatus(
  value: unknown
): "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED" {
  const v = String(value ?? "").toUpperCase().replace(/[\s_-]/g, "");
  if (v === "CONFIRMED" || v === "APPROVED" || v === "OPEN") return "CONFIRMED";
  if (v === "INTRANSIT" || v === "SHIPPED" || v === "DISPATCHED") return "IN_TRANSIT";
  if (v === "RECEIVED" || v === "CLOSED" || v === "DONE" || v === "COMPLETE") return "RECEIVED";
  if (v === "CANCELLED" || v === "CANCELED" || v === "VOID") return "CANCELLED";
  return "PENDING";
}

// ---------------------------------------------------------------------------
// Entity-specific normalisers
// ---------------------------------------------------------------------------

export function normaliseProduct(
  raw: Record<string, unknown>
): Omit<CanonicalRecord, "entityType" | "source"> & { entityType: "PRODUCT" } {
  const { sku, name, description, category, unit, unitCost, externalId, ...rest } = raw as Record<string, unknown>;

  return {
    entityType: "PRODUCT",
    identity: { sku: String(sku ?? "").trim() },
    fields: {
      sku: String(sku ?? "").trim(),
      name: String(name ?? "").trim(),
      description: description ? String(description).trim() : null,
      category: category ? String(category).trim() : null,
      unit: unit ? String(unit).trim() : null,
      unitCost: toDecimalOrNull(unitCost),
      externalId: externalId ? String(externalId).trim() : null,
      metadata: Object.keys(rest).length > 0 ? rest : null,
    },
    rawSource: raw,
  };
}

export function normaliseSupplier(
  raw: Record<string, unknown>
): Omit<CanonicalRecord, "entityType" | "source"> & { entityType: "SUPPLIER" } {
  const { code, name, email, phone, country, leadTimeDays, paymentTerms, externalId, ...rest } = raw as Record<string, unknown>;

  return {
    entityType: "SUPPLIER",
    identity: { code: String(code ?? "").trim() },
    fields: {
      code: String(code ?? "").trim(),
      name: String(name ?? "").trim(),
      email: email ? String(email).trim().toLowerCase() : null,
      phone: phone ? String(phone).trim() : null,
      country: country ? String(country).trim().toUpperCase() : null,
      leadTimeDays: toIntOrNull(leadTimeDays),
      paymentTerms: paymentTerms ? String(paymentTerms).trim() : null,
      externalId: externalId ? String(externalId).trim() : null,
      metadata: Object.keys(rest).length > 0 ? rest : null,
    },
    rawSource: raw,
  };
}

export function normaliseLocation(
  raw: Record<string, unknown>
): Omit<CanonicalRecord, "entityType" | "source"> & { entityType: "LOCATION" } {
  const { code, name, type, parentCode, externalId, ...rest } = raw as Record<string, unknown>;

  return {
    entityType: "LOCATION",
    identity: { code: String(code ?? "").trim() },
    fields: {
      code: String(code ?? "").trim(),
      name: String(name ?? "").trim(),
      type: type ? String(type).trim() : null,
      parentCode: parentCode ? String(parentCode).trim() : null,
      externalId: externalId ? String(externalId).trim() : null,
      metadata: Object.keys(rest).length > 0 ? rest : null,
    },
    rawSource: raw,
  };
}

export function normaliseInventoryItem(
  raw: Record<string, unknown>
): Omit<CanonicalRecord, "entityType" | "source"> & { entityType: "INVENTORY_ITEM" } {
  const { sku, quantity, locationCode, reservedQty, reorderPoint, reorderQty, ...rest } = raw as Record<string, unknown>;

  return {
    entityType: "INVENTORY_ITEM",
    identity: {
      sku: String(sku ?? "").trim(),
      locationCode: locationCode ? String(locationCode).trim() : "__DEFAULT__",
    },
    fields: {
      sku: String(sku ?? "").trim(),
      locationCode: locationCode ? String(locationCode).trim() : null,
      quantity: toDecimalOrNull(quantity) ?? 0,
      reservedQty: toDecimalOrNull(reservedQty) ?? 0,
      reorderPoint: toDecimalOrNull(reorderPoint),
      reorderQty: toDecimalOrNull(reorderQty),
      metadata: Object.keys(rest).length > 0 ? rest : null,
    },
    rawSource: raw,
  };
}

export function normaliseOrder(
  raw: Record<string, unknown>
): Omit<CanonicalRecord, "entityType" | "source"> & { entityType: "ORDER" } {
  const { orderNumber, type, supplierCode, status, orderDate, expectedDate, totalAmount, currency, externalId, ...rest } =
    raw as Record<string, unknown>;

  return {
    entityType: "ORDER",
    identity: { orderNumber: String(orderNumber ?? "").trim() },
    fields: {
      orderNumber: String(orderNumber ?? "").trim(),
      type: toOrderType(type),
      supplierCode: supplierCode ? String(supplierCode).trim() : null,
      status: toOrderStatus(status),
      orderDate: toDateOrNull(orderDate),
      expectedDate: toDateOrNull(expectedDate),
      totalAmount: toDecimalOrNull(totalAmount),
      currency: currency ? String(currency).trim().toUpperCase() : null,
      externalId: externalId ? String(externalId).trim() : null,
      metadata: Object.keys(rest).length > 0 ? rest : null,
    },
    rawSource: raw,
  };
}

// ---------------------------------------------------------------------------
// Dispatch by entity type
// ---------------------------------------------------------------------------

type EntityNormaliserMap = {
  PRODUCT: typeof normaliseProduct;
  SUPPLIER: typeof normaliseSupplier;
  LOCATION: typeof normaliseLocation;
  INVENTORY_ITEM: typeof normaliseInventoryItem;
  ORDER: typeof normaliseOrder;
};

const ENTITY_NORMALISERS: Partial<EntityNormaliserMap> = {
  PRODUCT: normaliseProduct,
  SUPPLIER: normaliseSupplier,
  LOCATION: normaliseLocation,
  INVENTORY_ITEM: normaliseInventoryItem,
  ORDER: normaliseOrder,
};

/**
 * Normalise a raw row into a CanonicalRecord, applying source field mapping
 * (header → canonical) then entity-specific type coercions.
 *
 * @param row         Raw source row (all string values from CSV/API)
 * @param entityType  Target canonical entity type
 * @param mapping     Map of { canonicalField → sourceHeader }
 * @param source      Human-readable connector/source label
 */
export function normaliseRow(
  row: Record<string, string>,
  entityType: OdeEntityType,
  mapping: Record<string, string>,
  source: string
): { record: CanonicalRecord | null; errors: string[] } {
  // Step 1 — apply field mapping
  const { canonical, metadata } = applyCanonicalMapping(row, mapping);
  const merged = { ...canonical, ...(Object.keys(metadata).length ? { ...metadata } : {}) };

  // Step 2 — validate required fields
  const validationErrors = validateCanonical(canonical, entityType);
  if (validationErrors.length > 0) {
    return { record: null, errors: validationErrors };
  }

  // Step 3 — entity-specific normalisation
  const normaliser = ENTITY_NORMALISERS[entityType as keyof EntityNormaliserMap];
  if (!normaliser) {
    return { record: null, errors: [`No normaliser for entity type: ${entityType}`] };
  }

  const partial = (normaliser as (r: Record<string, unknown>) => Omit<CanonicalRecord, "source">)(merged);

  return {
    record: { ...partial, source } as CanonicalRecord,
    errors: [],
  };
}
