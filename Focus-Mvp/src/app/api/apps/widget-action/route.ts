import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Widget Action API — handles create, update, updateStatus, delete
// ---------------------------------------------------------------------------

interface ActionPayload {
  action: "create" | "update" | "updateStatus" | "delete";
  entity: string;
  /** Record ID — required for update/updateStatus/delete */
  id?: string;
  /** Data payload — required for create/update */
  data?: Record<string, unknown>;
  /** Status value — shorthand for updateStatus */
  status?: string;
}

// Entities using orgId vs organizationId
const ORG_ID_ENTITIES = new Set([
  "purchase_orders", "sales_orders", "lots", "customers", "bom", "forecasts",
]);

function orgField(entity: string): string {
  return ORG_ID_ENTITIES.has(entity) ? "orgId" : "organizationId";
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null) as ActionPayload | null;
  if (!body?.action || !body?.entity) return badRequest("action and entity required");

  const orgId = ctx.org.id;
  const { action, entity, id, data, status } = body;

  try {
    switch (action) {
      case "create":
        return handleCreate(entity, orgId, data ?? {});
      case "update":
        if (!id) return badRequest("id required for update");
        return handleUpdate(entity, orgId, id, data ?? {});
      case "updateStatus":
        if (!id || !status) return badRequest("id and status required for updateStatus");
        return handleUpdateStatus(entity, orgId, id, status);
      case "delete":
        if (!id) return badRequest("id required for delete");
        return handleDelete(entity, orgId, id);
      default:
        return badRequest(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error("[widget-action]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

async function handleCreate(entity: string, orgId: string, data: Record<string, unknown>) {
  const orgData = { [orgField(entity)]: orgId };

  // Clean and validate data — strip any id/org fields the user might send
  const cleanData = { ...data };
  delete cleanData.id;
  delete cleanData.organizationId;
  delete cleanData.orgId;

  // Convert numeric strings to numbers for Decimal fields
  for (const [key, val] of Object.entries(cleanData)) {
    if (typeof val === "string" && !isNaN(Number(val)) && val.trim() !== "") {
      const numFields = [
        "unitCost", "unitPrice", "quantity", "totalAmount", "creditLimit",
        "reorderPoint", "safetyStock", "reorderQty", "qtyOrdered", "qtyReceived",
        "plannedQty", "actualQty", "qty", "leadTimeDays",
      ];
      if (numFields.includes(key)) {
        cleanData[key] = Number(val);
      }
    }
  }

  const createMap: Record<string, () => Promise<unknown>> = {
    products: () => prisma.product.create({
      data: { ...orgData, sku: String(cleanData.sku ?? ""), name: String(cleanData.name ?? ""), ...cleanData } as never,
    }),
    suppliers: () => prisma.supplier.create({
      data: { ...orgData, code: String(cleanData.code ?? ""), name: String(cleanData.name ?? ""), ...cleanData } as never,
    }),
    customers: () => prisma.customer.create({
      data: { ...orgData, code: String(cleanData.code ?? ""), name: String(cleanData.name ?? ""), ...cleanData } as never,
    }),
    purchase_orders: () => prisma.purchaseOrder.create({
      data: { ...orgData, poNumber: String(cleanData.poNumber ?? ""), currency: String(cleanData.currency ?? "USD"), ...cleanData } as never,
    }),
    sales_orders: () => prisma.salesOrder.create({
      data: { ...orgData, soNumber: String(cleanData.soNumber ?? ""), currency: String(cleanData.currency ?? "USD"), ...cleanData } as never,
    }),
    work_orders: () => prisma.workOrder.create({
      data: { ...orgData, orderNumber: String(cleanData.orderNumber ?? ""), sku: String(cleanData.sku ?? ""), ...cleanData } as never,
    }),
    locations: () => prisma.location.create({
      data: { ...orgData, code: String(cleanData.code ?? ""), name: String(cleanData.name ?? ""), ...cleanData } as never,
    }),
  };

  const handler = createMap[entity];
  if (!handler) {
    return NextResponse.json({ error: `Create not supported for entity: ${entity}` }, { status: 400 });
  }

  const result = await handler();
  return NextResponse.json({ success: true, data: result });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

async function handleUpdate(entity: string, orgId: string, id: string, data: Record<string, unknown>) {
  // Verify ownership
  await verifyOwnership(entity, orgId, id);

  const cleanData = { ...data };
  delete cleanData.id;
  delete cleanData.organizationId;
  delete cleanData.orgId;

  // Strip nested/dotted field keys (e.g. "product.sku", "location.name") — not valid for Prisma update
  for (const key of Object.keys(cleanData)) {
    if (key.includes(".")) delete cleanData[key];
  }

  // Strip computed/read-only fields
  const readOnlyFields = ["createdAt", "updatedAt", "unitValue", "needsReorder"];
  for (const key of readOnlyFields) delete cleanData[key];

  // Convert numeric strings to numbers for Decimal fields
  const numFields = [
    "unitCost", "unitPrice", "quantity", "totalAmount", "creditLimit",
    "reorderPoint", "safetyStock", "reorderQty", "qtyOrdered", "qtyReceived",
    "plannedQty", "actualQty", "qty", "leadTimeDays", "reservedQty",
    "daysOfSupply",
  ];
  for (const [key, val] of Object.entries(cleanData)) {
    if (typeof val === "string" && numFields.includes(key)) {
      const num = Number(val);
      if (!isNaN(num)) cleanData[key] = num;
    }
  }

  if (Object.keys(cleanData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updateMap: Record<string, () => Promise<unknown>> = {
    products: () => prisma.product.update({ where: { id }, data: cleanData as never }),
    suppliers: () => prisma.supplier.update({ where: { id }, data: cleanData as never }),
    customers: () => prisma.customer.update({ where: { id }, data: cleanData as never }),
    purchase_orders: () => prisma.purchaseOrder.update({ where: { id }, data: cleanData as never }),
    sales_orders: () => prisma.salesOrder.update({ where: { id }, data: cleanData as never }),
    work_orders: () => prisma.workOrder.update({ where: { id }, data: cleanData as never }),
    locations: () => prisma.location.update({ where: { id }, data: cleanData as never }),
    orders: () => prisma.order.update({ where: { id }, data: cleanData as never }),
    inventory: () => prisma.inventoryItem.update({ where: { id }, data: cleanData as never }),
  };

  const handler = updateMap[entity];
  if (!handler) {
    return NextResponse.json({ error: `Update not supported for entity: ${entity}` }, { status: 400 });
  }

  const result = await handler();
  return NextResponse.json({ success: true, data: result });
}

// ---------------------------------------------------------------------------
// Update Status (convenience shorthand)
// ---------------------------------------------------------------------------

async function handleUpdateStatus(entity: string, orgId: string, id: string, status: string) {
  return handleUpdate(entity, orgId, id, { status });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

async function handleDelete(entity: string, orgId: string, id: string) {
  await verifyOwnership(entity, orgId, id);

  const deleteMap: Record<string, () => Promise<unknown>> = {
    products: () => prisma.product.delete({ where: { id } }),
    suppliers: () => prisma.supplier.delete({ where: { id } }),
    customers: () => prisma.customer.delete({ where: { id } }),
    purchase_orders: () => prisma.purchaseOrder.delete({ where: { id } }),
    sales_orders: () => prisma.salesOrder.delete({ where: { id } }),
    work_orders: () => prisma.workOrder.delete({ where: { id } }),
    locations: () => prisma.location.delete({ where: { id } }),
    orders: () => prisma.order.delete({ where: { id } }),
  };

  const handler = deleteMap[entity];
  if (!handler) {
    return NextResponse.json({ error: `Delete not supported for entity: ${entity}` }, { status: 400 });
  }

  await handler();
  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// Verify the record belongs to this org (authorization check)
// ---------------------------------------------------------------------------

async function verifyOwnership(entity: string, orgId: string, id: string) {
  const field = orgField(entity);

  // Map entity to prisma model for findFirst
  const verifyMap: Record<string, () => Promise<unknown>> = {
    products: () => prisma.product.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
    suppliers: () => prisma.supplier.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
    customers: () => prisma.customer.findFirst({ where: { id, orgId }, select: { id: true } }),
    purchase_orders: () => prisma.purchaseOrder.findFirst({ where: { id, orgId }, select: { id: true } }),
    sales_orders: () => prisma.salesOrder.findFirst({ where: { id, orgId }, select: { id: true } }),
    work_orders: () => prisma.workOrder.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
    locations: () => prisma.location.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
    orders: () => prisma.order.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
    inventory: () => prisma.inventoryItem.findFirst({ where: { id, organizationId: orgId }, select: { id: true } }),
  };

  const handler = verifyMap[entity];
  if (!handler) throw new Error(`Cannot verify ownership for entity: ${entity}`);

  const record = await handler();
  if (!record) throw new Error(`Record not found or access denied (entity=${entity}, id=${id}, org=${field})`);
}
