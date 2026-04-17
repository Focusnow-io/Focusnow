import { prisma } from "@/lib/prisma";
import type { DataQuery, DataFilter } from "@/components/apps/widgets/types";

type Op = DataFilter["op"];

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export function toWhereClause(filters: DataFilter[] | undefined): Record<string, unknown> {
  if (!filters?.length) return {};
  const where: Record<string, unknown> = {};

  for (const f of filters) {
    const parts = f.field.split(".");
    const condition = toCondition(f.op, f.value);

    if (parts.length === 1) {
      where[f.field] = condition;
    } else {
      let cursor = where;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cursor[parts[i]]) cursor[parts[i]] = {};
        cursor = cursor[parts[i]] as Record<string, unknown>;
      }
      cursor[parts[parts.length - 1]] = condition;
    }
  }
  return where;
}

function toCondition(op: Op, value: unknown): unknown {
  switch (op) {
    case "eq": return value;
    case "ne": return { not: value };
    case "lt": return { lt: value };
    case "lte": return { lte: value };
    case "gt": return { gt: value };
    case "gte": return { gte: value };
    case "contains": return { contains: value, mode: "insensitive" };
    default: return value;
  }
}

// ---------------------------------------------------------------------------
// Filter compatibility — strip relation filters not valid for a given entity
// ---------------------------------------------------------------------------

/** Maps each entity to the set of valid relation prefixes for dot-notation filters */
const ENTITY_RELATIONS: Record<string, Set<string>> = {
  products: new Set(),
  inventory: new Set(["product", "location"]),
  orders: new Set(["supplier"]),
  suppliers: new Set(),
  purchase_orders: new Set(["supplier"]),
  sales_orders: new Set(["customer"]),
  work_orders: new Set(["product"]),
  lots: new Set(["product"]),
  customers: new Set(),
  locations: new Set(),
  bom: new Set(["product"]),
  forecasts: new Set(["product"]),
};

/**
 * Returns only the filters whose fields are compatible with the given entity.
 * Dot-notation filters like "product.sku" are only kept if the entity has
 * that relation. Non-dot fields (e.g. "status") always pass through.
 */
export function filterCompatibleFilters(entity: string, filters: DataFilter[] | undefined): DataFilter[] {
  if (!filters?.length) return [];
  const validRelations = ENTITY_RELATIONS[entity];
  if (!validRelations) return filters; // unknown entity → pass all through

  return filters.filter((f) => {
    const dotIdx = f.field.indexOf(".");
    if (dotIdx === -1) return true; // scalar field, always ok
    const relation = f.field.slice(0, dotIdx);
    return validRelations.has(relation);
  });
}

// Entities that use orgId instead of organizationId
const ORG_ID_ENTITIES = new Set([
  "purchase_orders", "sales_orders", "lots", "customers", "bom", "forecasts",
]);

export function buildOrgWhere(entity: string, orgId: string): Record<string, unknown> {
  return ORG_ID_ENTITIES.has(entity) ? { orgId } : { organizationId: orgId };
}

// ---------------------------------------------------------------------------
// Time bucketing helpers
// ---------------------------------------------------------------------------

function bucketDate(d: Date, bucket: "day" | "week" | "month" | "quarter"): string {
  const y = d.getFullYear();
  const m = d.getMonth();
  switch (bucket) {
    case "day":
      return d.toISOString().slice(0, 10);
    case "week": {
      const day = new Date(d);
      const dayOfWeek = day.getDay() || 7;
      day.setDate(day.getDate() - dayOfWeek + 1);
      return day.toISOString().slice(0, 10);
    }
    case "month":
      return `${y}-${String(m + 1).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.floor(m / 3) + 1}`;
  }
}

function applyTimeBucket<T extends Record<string, unknown>>(
  rows: T[],
  dateField: string,
  bucket: "day" | "week" | "month" | "quarter",
  aggregation: string,
  valueField?: string
): { label: string; value: number }[] {
  const map: Record<string, number[]> = {};

  for (const row of rows) {
    const raw = row[dateField];
    if (!raw) continue;
    const d = raw instanceof Date ? raw : new Date(String(raw));
    if (isNaN(d.getTime())) continue;
    const key = bucketDate(d, bucket);
    if (!map[key]) map[key] = [];

    if (valueField && row[valueField] !== undefined) {
      map[key].push(Number(row[valueField] ?? 0));
    } else {
      map[key].push(1);
    }
  }

  return Object.entries(map)
    .map(([label, nums]) => ({
      label,
      value: aggregation === "sum" || aggregation === "count"
        ? nums.reduce((a, b) => a + b, 0)
        : aggregation === "avg"
        ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length)
        : nums.reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------------------
// Computed field helpers
// ---------------------------------------------------------------------------

function computeFieldValue(
  rows: Record<string, unknown>[],
  operation: "ratio" | "percentage" | "delta",
  numerator: string,
  denominator: string
): { value: number } {
  const numSum = rows.reduce((s, r) => s + Number(r[numerator] ?? 0), 0);
  const denSum = rows.reduce((s, r) => s + Number(r[denominator] ?? 0), 0);

  switch (operation) {
    case "ratio":
      return { value: denSum === 0 ? 0 : Math.round((numSum / denSum) * 100) / 100 };
    case "percentage":
      return { value: denSum === 0 ? 0 : Math.round((numSum / denSum) * 1000) / 10 };
    case "delta":
      return { value: numSum - denSum };
  }
}

// ---------------------------------------------------------------------------
// Main query runner
// ---------------------------------------------------------------------------

export async function runQuery(orgId: string, query: DataQuery, where: Record<string, unknown>): Promise<unknown> {
  const { entity, aggregation, field, groupBy, sort, limit, timeBucket, computedField } = query;
  const take = limit ?? 100;

  // ── COMPUTED FIELDS ──────────────────────────────────────────────────────
  if (computedField) {
    const rows = await fetchRawRows(entity, where, sort, 10000);
    return computeFieldValue(
      rows,
      computedField.operation,
      computedField.numerator,
      computedField.denominator
    );
  }

  // ── TIME BUCKETING ───────────────────────────────────────────────────────
  if (timeBucket && groupBy) {
    const rows = await fetchRawRows(entity, where, sort, 10000);
    return applyTimeBucket(rows, groupBy, timeBucket, aggregation ?? "count", field);
  }

  // ── AGGREGATION (no groupBy) ─────────────────────────────────────────────
  if (aggregation && !groupBy) {
    return runAggregation(orgId, entity, aggregation, field, where);
  }

  // ── GROUP BY ─────────────────────────────────────────────────────────────
  if (groupBy) {
    return runGroupBy(orgId, query, where);
  }

  // ── LIST ─────────────────────────────────────────────────────────────────
  const orderBy = buildOrderBy(sort, { createdAt: "desc" });

  if (entity === "products") {
    type ProductRow = { id: string; sku: string; name: string; category: string | null; unitCost: unknown; unit: string | null; leadTimeDays: number | null; reorderPoint: unknown; safetyStock: unknown; type: string | null };
    const rows = (await prisma.product.findMany({ where: where as never, orderBy, take, select: { id: true, sku: true, name: true, category: true, unitCost: true, unit: true, leadTimeDays: true, reorderPoint: true, safetyStock: true, type: true } })) as unknown as ProductRow[];
    return rows.map((r) => ({ ...r, unitCost: r.unitCost ? Number(r.unitCost) : null, reorderPoint: r.reorderPoint ? Number(r.reorderPoint) : null, safetyStock: r.safetyStock ? Number(r.safetyStock) : null }));
  }

  if (entity === "inventory") {
    const COMPUTED_INV_FIELDS = new Set(["unitValue", "totalValue"]);
    const invSort = sort && !COMPUTED_INV_FIELDS.has(sort.field) ? buildOrderBy(sort, { updatedAt: "desc" }) : { updatedAt: "desc" };
    type InvRow = { id: string; quantity: unknown; reservedQty: unknown; reorderPoint: unknown; reorderQty: unknown; daysOfSupply: unknown; product: { sku: string; name: string; category: string | null; unitCost: unknown }; location: { name: string; code: string } | null };
    const rows = (await prisma.inventoryItem.findMany({ where: where as never, orderBy: invSort, take, include: { product: { select: { sku: true, name: true, category: true, unitCost: true } }, location: { select: { code: true, name: true } } } })) as unknown as InvRow[];
    const mapped = rows.map((r) => {
      const computedValue = Math.round(Number(r.quantity) * Number(r.product.unitCost ?? 0));
      return { id: r.id, quantity: Number(r.quantity), reservedQty: Number(r.reservedQty ?? 0), reorderPoint: r.reorderPoint ? Number(r.reorderPoint) : null, reorderQty: r.reorderQty ? Number(r.reorderQty) : null, daysOfSupply: r.daysOfSupply ? Number(r.daysOfSupply) : null, unitValue: computedValue, totalValue: computedValue, "product.sku": r.product.sku, "product.name": r.product.name, "product.category": r.product.category, "location.name": r.location?.name ?? null, "location.code": r.location?.code ?? null, needsReorder: r.reorderPoint != null && Number(r.quantity) <= Number(r.reorderPoint) };
    });
    if (sort && COMPUTED_INV_FIELDS.has(sort.field)) {
      mapped.sort((a, b) => sort.dir === "asc" ? a.unitValue - b.unitValue : b.unitValue - a.unitValue);
    }
    return mapped;
  }

  if (entity === "orders") {
    type OrdRow = { id: string; orderNumber: string; type: string; status: string; totalAmount: unknown; orderDate: Date | null; expectedDate: Date | null; supplier: { name: string } | null };
    const rows = (await prisma.order.findMany({ where: where as never, orderBy, take, include: { supplier: { select: { code: true, name: true } } } })) as unknown as OrdRow[];
    return rows.map((r) => ({ id: r.id, orderNumber: r.orderNumber, type: r.type, status: r.status, totalAmount: r.totalAmount ? Number(r.totalAmount) : null, orderDate: r.orderDate?.toISOString() ?? null, expectedDate: r.expectedDate?.toISOString() ?? null, "supplier.name": r.supplier?.name ?? null }));
  }

  if (entity === "suppliers") {
    return prisma.supplier.findMany({
      where: where as never, orderBy, take,
      select: { id: true, code: true, name: true, country: true, email: true, leadTimeDays: true, paymentTerms: true },
    });
  }

  if (entity === "purchase_orders") {
    type PORow = { id: string; poNumber: string; status: string; totalAmount: unknown; expectedDate: Date | null; receivedDate: Date | null; confirmedETA: Date | null; createdAt: Date; supplier: { code: string; name: string } };
    const rows = (await prisma.purchaseOrder.findMany({ where: where as never, orderBy, take, include: { supplier: { select: { code: true, name: true } } } })) as unknown as PORow[];
    return rows.map((r) => ({ id: r.id, poNumber: r.poNumber, status: r.status, totalAmount: r.totalAmount ? Number(r.totalAmount) : null, expectedDate: r.expectedDate?.toISOString() ?? null, receivedDate: r.receivedDate?.toISOString() ?? null, confirmedETA: r.confirmedETA?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), "supplier.name": r.supplier.name, "supplier.code": r.supplier.code }));
  }

  if (entity === "sales_orders") {
    type SORow = { id: string; soNumber: string; status: string; totalAmount: unknown; requestedDate: Date | null; confirmedDate: Date | null; createdAt: Date; customer: { code: string; name: string } };
    const rows = (await prisma.salesOrder.findMany({ where: where as never, orderBy, take, include: { customer: { select: { code: true, name: true } } } })) as unknown as SORow[];
    return rows.map((r) => ({ id: r.id, soNumber: r.soNumber, status: r.status, totalAmount: r.totalAmount ? Number(r.totalAmount) : null, requestedDate: r.requestedDate?.toISOString() ?? null, confirmedDate: r.confirmedDate?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), "customer.name": r.customer.name, "customer.code": r.customer.code }));
  }

  if (entity === "work_orders") {
    type WORow = { id: string; woNumber: string | null; orderNumber: string; sku: string; status: string; plannedQty: unknown; actualQty: unknown; scheduledDate: Date | null; dueDate: Date | null; priority: number | null; product: { sku: string; name: string } | null };
    const rows = (await prisma.workOrder.findMany({ where: where as never, orderBy, take, include: { product: { select: { sku: true, name: true } } } })) as unknown as WORow[];
    return rows.map((r) => ({ id: r.id, woNumber: r.woNumber ?? r.orderNumber, status: r.status, plannedQty: Number(r.plannedQty), actualQty: Number(r.actualQty ?? 0), scheduledDate: r.scheduledDate?.toISOString() ?? null, dueDate: r.dueDate?.toISOString() ?? null, priority: r.priority, "product.sku": r.product?.sku ?? r.sku, "product.name": r.product?.name ?? null }));
  }

  if (entity === "lots") {
    type LotRow = { id: string; lotNumber: string; expiryDate: Date | null; manufacturedDate: Date | null; createdAt: Date; product: { sku: string; name: string; category: string | null } };
    const rows = (await prisma.lot.findMany({ where: where as never, orderBy, take, include: { product: { select: { sku: true, name: true, category: true } } } })) as unknown as LotRow[];
    return rows.map((r) => ({ id: r.id, lotNumber: r.lotNumber, expiryDate: r.expiryDate?.toISOString() ?? null, manufacturedDate: r.manufacturedDate?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), "product.sku": r.product.sku, "product.name": r.product.name, "product.category": r.product.category }));
  }

  if (entity === "customers") {
    type CustRow = { id: string; code: string; name: string; contactName: string | null; email: string | null; country: string | null; paymentTerms: string | null; creditLimit: unknown; isActive: boolean; createdAt: Date };
    const rows = (await prisma.customer.findMany({ where: where as never, orderBy, take, select: { id: true, code: true, name: true, contactName: true, email: true, country: true, paymentTerms: true, creditLimit: true, isActive: true, createdAt: true } })) as unknown as CustRow[];
    return rows.map((r) => ({ ...r, creditLimit: r.creditLimit ? Number(r.creditLimit) : null, createdAt: r.createdAt.toISOString() }));
  }

  if (entity === "locations") {
    type LocRow = { id: string; code: string; name: string; type: string | null; active: boolean; createdAt: Date; _count: { inventory: number } };
    const rows = (await prisma.location.findMany({ where: where as never, orderBy, take, select: { id: true, code: true, name: true, type: true, active: true, createdAt: true, _count: { select: { inventory: true } } } })) as unknown as LocRow[];
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name, type: r.type, active: r.active, createdAt: r.createdAt.toISOString(), inventoryItems: r._count.inventory }));
  }

  if (entity === "bom") {
    type BomRow = { id: string; version: string; isActive: boolean; yieldPct: unknown; product: { sku: string; name: string }; _count: { lines: number }; createdAt: Date };
    const rows = (await prisma.bOMHeader.findMany({ where: where as never, orderBy, take, select: { id: true, version: true, isActive: true, yieldPct: true, createdAt: true, product: { select: { sku: true, name: true } }, _count: { select: { lines: true } } } })) as unknown as BomRow[];
    return rows.map((r) => ({ id: r.id, version: r.version, isActive: r.isActive, yieldPct: r.yieldPct ? Number(r.yieldPct) : null, componentCount: r._count.lines, "product.sku": r.product.sku, "product.name": r.product.name, createdAt: r.createdAt.toISOString() }));
  }

  if (entity === "forecasts") {
    type FcRow = { id: string; periodYear: number; periodMonth: number; type: string; qty: unknown; product: { sku: string; name: string } };
    const rows = (await prisma.demandForecast.findMany({ where: where as never, orderBy: sort ? { [sort.field]: sort.dir } : { periodYear: "desc" }, take, include: { product: { select: { sku: true, name: true } } } })) as unknown as FcRow[];
    return rows.map((r) => ({ id: r.id, period: `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`, type: r.type, qty: Number(r.qty), "product.sku": r.product.sku, "product.name": r.product.name }));
  }

  return [];
}

// ---------------------------------------------------------------------------
// Sort helper — converts dot-notation "product.category" → { product: { category: "asc" } }
// ---------------------------------------------------------------------------

function buildOrderBy(sort: DataQuery["sort"], fallback: Record<string, unknown>): Record<string, unknown> {
  if (!sort) return fallback;
  const parts = sort.field.split(".");
  if (parts.length === 1) return { [sort.field]: sort.dir };
  // Build nested: ["product","category"] → { product: { category: dir } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let nested: any = sort.dir;
  for (let i = parts.length - 1; i >= 0; i--) {
    nested = { [parts[i]]: nested };
  }
  return nested;
}

// ---------------------------------------------------------------------------
// Raw row fetcher (for time bucketing + computed fields)
// ---------------------------------------------------------------------------

export async function fetchRawRows(
  entity: string,
  where: Record<string, unknown>,
  sort: DataQuery["sort"],
  take: number
): Promise<Record<string, unknown>[]> {
  const orderBy = buildOrderBy(sort, { createdAt: "desc" });

  const entityMap: Record<string, () => Promise<Record<string, unknown>[]>> = {
    purchase_orders: async () => {
      const rows = await prisma.purchaseOrder.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount ?? 0) })) as unknown as Record<string, unknown>[];
    },
    sales_orders: async () => {
      const rows = await prisma.salesOrder.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount ?? 0) })) as unknown as Record<string, unknown>[];
    },
    work_orders: async () => {
      const rows = await prisma.workOrder.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, plannedQty: Number(r.plannedQty), actualQty: Number(r.actualQty ?? 0) })) as unknown as Record<string, unknown>[];
    },
    orders: async () => {
      const rows = await prisma.order.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, totalAmount: Number(r.totalAmount ?? 0) })) as unknown as Record<string, unknown>[];
    },
    products: async () => {
      const rows = await prisma.product.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, unitCost: Number(r.unitCost ?? 0) })) as unknown as Record<string, unknown>[];
    },
    inventory: async () => {
      const COMPUTED_INV_FIELDS = new Set(["unitValue", "totalValue"]);
      const invOrderBy = sort && !COMPUTED_INV_FIELDS.has(sort.field) ? buildOrderBy(sort, { updatedAt: "desc" }) : { updatedAt: "desc" };
      const rows = await prisma.inventoryItem.findMany({ where: where as never, orderBy: invOrderBy, take, include: { product: { select: { unitCost: true } } } });
      const mapped = rows.map((r) => ({ ...r, quantity: Number(r.quantity), unitCost: Number(r.product.unitCost ?? 0), unitValue: Math.round(Number(r.quantity) * Number(r.product.unitCost ?? 0)) })) as unknown as Record<string, unknown>[];
      if (sort && COMPUTED_INV_FIELDS.has(sort.field)) {
        (mapped as { unitValue: number }[]).sort((a, b) => sort.dir === "asc" ? a.unitValue - b.unitValue : b.unitValue - a.unitValue);
      }
      return mapped;
    },
    lots: async () => {
      const rows = await prisma.lot.findMany({ where: where as never, orderBy, take });
      return rows as unknown as Record<string, unknown>[];
    },
    forecasts: async () => {
      const rows = await prisma.demandForecast.findMany({ where: where as never, orderBy: sort ? orderBy : { periodYear: "desc" }, take });
      return rows.map((r) => ({ ...r, qty: Number(r.qty), period: `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}` })) as unknown as Record<string, unknown>[];
    },
    customers: async () => {
      const rows = await prisma.customer.findMany({ where: where as never, orderBy, take });
      return rows.map((r) => ({ ...r, creditLimit: Number(r.creditLimit ?? 0) })) as unknown as Record<string, unknown>[];
    },
    locations: async () => {
      const rows = await prisma.location.findMany({ where: where as never, orderBy, take });
      return rows as unknown as Record<string, unknown>[];
    },
    bom: async () => {
      const rows = await prisma.bOMHeader.findMany({ where: where as never, orderBy, take, include: { lines: true } });
      return rows.map((r) => ({ ...r, yieldPct: Number(r.yieldPct ?? 0), lineCount: r.lines.length })) as unknown as Record<string, unknown>[];
    },
    suppliers: async () => {
      const rows = await prisma.supplier.findMany({ where: where as never, orderBy, take });
      return rows as unknown as Record<string, unknown>[];
    },
  };

  const fetcher = entityMap[entity];
  if (!fetcher) return [];
  return fetcher();
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

async function runAggregation(
  _orgId: string,
  entity: DataQuery["entity"],
  aggregation: string,
  field: string | undefined,
  where: Record<string, unknown>
) {
  if (aggregation === "count") {
    const countMap: Record<string, () => Promise<number>> = {
      products: () => prisma.product.count({ where: where as never }),
      inventory: () => prisma.inventoryItem.count({ where: where as never }),
      orders: () => prisma.order.count({ where: where as never }),
      suppliers: () => prisma.supplier.count({ where: where as never }),
      purchase_orders: () => prisma.purchaseOrder.count({ where: where as never }),
      sales_orders: () => prisma.salesOrder.count({ where: where as never }),
      work_orders: () => prisma.workOrder.count({ where: where as never }),
      lots: () => prisma.lot.count({ where: where as never }),
      customers: () => prisma.customer.count({ where: where as never }),
      locations: () => prisma.location.count({ where: where as never }),
      bom: () => prisma.bOMHeader.count({ where: where as never }),
      forecasts: () => prisma.demandForecast.count({ where: where as never }),
    };
    const countFn = countMap[entity];
    if (!countFn) return { value: 0 };
    const count = await countFn();
    return { value: count };
  }

  if (entity === "products" && field === "unitCost") {
    const rows = (await prisma.product.findMany({ where: where as never, select: { unitCost: true } })) as unknown as { unitCost: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.unitCost ?? 0))) };
  }
  if (entity === "inventory" && field === "quantity") {
    const rows = (await prisma.inventoryItem.findMany({ where: where as never, select: { quantity: true } })) as unknown as { quantity: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.quantity ?? 0))) };
  }
  if (entity === "inventory" && (field === "unitValue" || field === "totalValue")) {
    const rows = await prisma.inventoryItem.findMany({ where: where as never, include: { product: { select: { unitCost: true } } } });
    const values = rows.map((r) => Number(r.quantity) * Number(r.product.unitCost ?? 0));
    return { value: Math.round(agg(aggregation, values)) };
  }
  if (entity === "orders" && field === "totalAmount") {
    const rows = (await prisma.order.findMany({ where: where as never, select: { totalAmount: true } })) as unknown as { totalAmount: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.totalAmount ?? 0))) };
  }
  if (entity === "suppliers" && field === "leadTimeDays") {
    const rows = (await prisma.supplier.findMany({ where: where as never, select: { leadTimeDays: true } })) as unknown as { leadTimeDays: number | null }[];
    return { value: agg(aggregation, rows.filter((r) => r.leadTimeDays != null).map((r) => r.leadTimeDays as number)) };
  }
  if (entity === "purchase_orders" && field === "totalAmount") {
    const rows = (await prisma.purchaseOrder.findMany({ where: where as never, select: { totalAmount: true } })) as unknown as { totalAmount: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.totalAmount ?? 0))) };
  }
  if (entity === "sales_orders" && field === "totalAmount") {
    const rows = (await prisma.salesOrder.findMany({ where: where as never, select: { totalAmount: true } })) as unknown as { totalAmount: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.totalAmount ?? 0))) };
  }
  if (entity === "work_orders" && (field === "plannedQty" || field === "actualQty")) {
    const rows = (await prisma.workOrder.findMany({ where: where as never, select: { plannedQty: true, actualQty: true } })) as unknown as { plannedQty: unknown; actualQty: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number((r as Record<string, unknown>)[field] ?? 0))) };
  }
  if (entity === "customers" && field === "creditLimit") {
    const rows = (await prisma.customer.findMany({ where: where as never, select: { creditLimit: true } })) as unknown as { creditLimit: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.creditLimit ?? 0))) };
  }
  if (entity === "forecasts" && field === "qty") {
    const rows = (await prisma.demandForecast.findMany({ where: where as never, select: { qty: true } })) as unknown as { qty: unknown }[];
    return { value: agg(aggregation, rows.map((r) => Number(r.qty ?? 0))) };
  }
  return { value: 0 };
}

function agg(type: string, nums: number[]): number {
  if (!nums.length) return 0;
  if (type === "sum") return nums.reduce((a, b) => a + b, 0);
  if (type === "avg") return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
  if (type === "min") return Math.min(...nums);
  if (type === "max") return Math.max(...nums);
  return nums.length;
}

// ---------------------------------------------------------------------------
// Group By
// ---------------------------------------------------------------------------

async function runGroupBy(_orgId: string, query: DataQuery, where: Record<string, unknown>) {
  const { entity, groupBy, aggregation = "count", field, limit } = query;
  const take = limit ?? 20;

  if (entity === "products" && groupBy === "category") {
    type ProdGB = { category: string | null; _count: { id: number }; _sum: { unitCost: unknown } | null };
    const rows = (await prisma.product.groupBy({ by: ["category"], where: where as never, _count: { id: true }, _sum: { unitCost: true } })) as unknown as ProdGB[];
    return rows.map((r) => ({ label: r.category ?? "Uncategorized", value: aggregation === "sum" && field === "unitCost" ? Number(r._sum?.unitCost ?? 0) : r._count.id })).sort((a, b) => b.value - a.value).slice(0, take);
  }

  if (entity === "products" && groupBy === "type") {
    type ProdGB = { type: string | null; _count: { id: number } };
    const rows = (await prisma.product.groupBy({ by: ["type"], where: where as never, _count: { id: true } })) as unknown as ProdGB[];
    return rows.map((r) => ({ label: r.type ?? "Untyped", value: r._count.id })).sort((a, b) => b.value - a.value).slice(0, take);
  }

  if (entity === "inventory" && groupBy === "product.category") {
    const rows = await prisma.inventoryItem.findMany({ where: where as never, include: { product: { select: { category: true, unitCost: true } } } });
    const useValue = field === "unitValue" || field === "totalValue";
    return toGrouped(
      rows,
      (r: (typeof rows)[0]) => r.product.category ?? "Uncategorized",
      (r: (typeof rows)[0]) => useValue ? Number(r.quantity) * Number(r.product.unitCost ?? 0) : Number(r.quantity)
    ).slice(0, take);
  }

  if (entity === "inventory" && groupBy === "location.name") {
    const rows = await prisma.inventoryItem.findMany({ where: where as never, include: { location: { select: { name: true } }, product: { select: { unitCost: true } } } });
    const useValue = field === "unitValue" || field === "totalValue";
    return toGrouped(
      rows,
      (r: (typeof rows)[0]) => r.location?.name ?? "No Location",
      (r: (typeof rows)[0]) => useValue ? Number(r.quantity) * Number(r.product.unitCost ?? 0) : Number(r.quantity)
    ).slice(0, take);
  }

  if (entity === "orders" && groupBy === "status") {
    type GBRow = { status: string; _count: { id: number }; _sum: { totalAmount: unknown } | null };
    const rows = (await prisma.order.groupBy({ by: ["status"], where: where as never, _count: { id: true }, _sum: { totalAmount: true } })) as unknown as GBRow[];
    return rows.map((r) => ({ label: r.status, value: aggregation === "sum" ? Number(r._sum?.totalAmount ?? 0) : r._count.id })).sort((a, b) => b.value - a.value);
  }

  if (entity === "orders" && groupBy === "type") {
    type GBRow = { type: string; _count: { id: number }; _sum: { totalAmount: unknown } | null };
    const rows = (await prisma.order.groupBy({ by: ["type"], where: where as never, _count: { id: true }, _sum: { totalAmount: true } })) as unknown as GBRow[];
    return rows.map((r) => ({ label: r.type, value: aggregation === "sum" ? Number(r._sum?.totalAmount ?? 0) : r._count.id })).sort((a, b) => b.value - a.value);
  }

  if (entity === "orders" && groupBy === "supplier.name") {
    type OrdSup = { totalAmount: unknown; supplier: { name: string } | null };
    const rows = (await prisma.order.findMany({ where: where as never, include: { supplier: { select: { name: true } } } })) as unknown as OrdSup[];
    return toGrouped(rows, (r) => r.supplier?.name ?? "Unknown", (r) => aggregation === "sum" ? Number(r.totalAmount ?? 0) : 1).slice(0, take);
  }

  if (entity === "purchase_orders" && groupBy === "status") {
    type GBRow = { status: string; _count: { id: number }; _sum: { totalAmount: unknown } | null };
    const rows = (await prisma.purchaseOrder.groupBy({ by: ["status"], where: where as never, _count: { id: true }, _sum: { totalAmount: true } })) as unknown as GBRow[];
    return rows.map((r) => ({ label: r.status, value: aggregation === "sum" ? Number(r._sum?.totalAmount ?? 0) : r._count.id })).sort((a, b) => b.value - a.value);
  }

  if (entity === "purchase_orders" && groupBy === "supplier.name") {
    type POSup = { totalAmount: unknown; supplier: { name: string } };
    const rows = (await prisma.purchaseOrder.findMany({ where: where as never, include: { supplier: { select: { name: true } } } })) as unknown as POSup[];
    return toGrouped(rows, (r) => r.supplier.name, (r) => aggregation === "sum" ? Number(r.totalAmount ?? 0) : 1).slice(0, take);
  }

  if (entity === "sales_orders" && groupBy === "status") {
    type GBRow = { status: string; _count: { id: number }; _sum: { totalAmount: unknown } | null };
    const rows = (await prisma.salesOrder.groupBy({ by: ["status"], where: where as never, _count: { id: true }, _sum: { totalAmount: true } })) as unknown as GBRow[];
    return rows.map((r) => ({ label: r.status, value: aggregation === "sum" ? Number(r._sum?.totalAmount ?? 0) : r._count.id })).sort((a, b) => b.value - a.value);
  }

  if (entity === "sales_orders" && groupBy === "customer.name") {
    type SOCust = { totalAmount: unknown; customer: { name: string } };
    const rows = (await prisma.salesOrder.findMany({ where: where as never, include: { customer: { select: { name: true } } } })) as unknown as SOCust[];
    return toGrouped(rows, (r) => r.customer.name, (r) => aggregation === "sum" ? Number(r.totalAmount ?? 0) : 1).slice(0, take);
  }

  if (entity === "work_orders" && groupBy === "status") {
    type GBRow = { status: string; _count: { id: number }; _sum: { plannedQty: unknown; actualQty: unknown } | null };
    const rows = (await prisma.workOrder.groupBy({ by: ["status"], where: where as never, _count: { id: true }, _sum: { plannedQty: true, actualQty: true } })) as unknown as GBRow[];
    return rows.map((r) => ({
      label: r.status,
      value: aggregation === "sum" && field === "plannedQty" ? Number(r._sum?.plannedQty ?? 0) : aggregation === "sum" && field === "actualQty" ? Number(r._sum?.actualQty ?? 0) : r._count.id,
    })).sort((a, b) => b.value - a.value);
  }

  if (entity === "lots" && groupBy === "product.category") {
    const rows = await prisma.lot.findMany({ where: where as never, include: { product: { select: { category: true } } } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.product.category ?? "Uncategorized", () => 1).slice(0, take);
  }

  if (entity === "customers" && groupBy === "country") {
    const rows = await prisma.customer.findMany({ where: where as never, select: { country: true, creditLimit: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.country ?? "Unknown", (r: (typeof rows)[0]) => aggregation === "sum" && field === "creditLimit" ? Number(r.creditLimit ?? 0) : 1).slice(0, take);
  }

  if (entity === "customers" && groupBy === "paymentTerms") {
    const rows = await prisma.customer.findMany({ where: where as never, select: { paymentTerms: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.paymentTerms ?? "Not Set", () => 1).slice(0, take);
  }

  if (entity === "locations" && groupBy === "type") {
    const rows = await prisma.location.findMany({ where: where as never, select: { type: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.type ?? "Unknown", () => 1).slice(0, take);
  }

  if (entity === "forecasts" && groupBy === "period") {
    const rows = await prisma.demandForecast.findMany({ where: where as never, select: { periodYear: true, periodMonth: true, qty: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => `${r.periodYear}-${String(r.periodMonth).padStart(2, "0")}`, (r: (typeof rows)[0]) => Number(r.qty)).sort((a, b) => a.label.localeCompare(b.label)).slice(0, take);
  }

  if (entity === "forecasts" && groupBy === "type") {
    const rows = await prisma.demandForecast.findMany({ where: where as never, select: { type: true, qty: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.type, (r: (typeof rows)[0]) => aggregation === "sum" ? Number(r.qty) : 1).slice(0, take);
  }

  if (entity === "suppliers" && groupBy === "country") {
    const rows = await prisma.supplier.findMany({ where: where as never, select: { country: true } });
    return toGrouped(rows, (r: (typeof rows)[0]) => r.country ?? "Unknown", () => 1).slice(0, take);
  }

  // ── Generic fallback — works for any entity + any top-level field ────────
  const rawRows = await fetchRawRows(entity, where, query.sort, 10000);
  if (rawRows.length > 0) {
    return toGrouped(
      rawRows,
      (r) => {
        const parts = groupBy!.split(".");
        let val: unknown = r;
        for (const p of parts) {
          if (val && typeof val === "object") val = (val as Record<string, unknown>)[p];
          else { val = undefined; break; }
        }
        return val != null ? String(val) : "Unknown";
      },
      (r) => {
        if (aggregation === "count") return 1;
        if (field) {
          const v = Number(r[field] ?? 0);
          return isNaN(v) ? 0 : v;
        }
        return 1;
      },
    ).slice(0, take);
  }

  return [];
}

function toGrouped<T>(
  rows: T[],
  keyFn: (r: T) => string,
  valFn: (r: T) => number
): { label: string; value: number }[] {
  const map: Record<string, number> = {};
  for (const r of rows) {
    const k = keyFn(r);
    map[k] = (map[k] ?? 0) + valFn(r);
  }
  return Object.entries(map).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
