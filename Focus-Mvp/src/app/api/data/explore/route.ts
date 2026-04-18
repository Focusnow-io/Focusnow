export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

type Col = { key: string; label: string };
type Row = Record<string, string | number | null>;

// Serialise Prisma values to primitives safe for JSON
const s = (v: unknown): string | number | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().split("T")[0];
  // Prisma Decimal objects are typeof "object" but should render as numbers
  if (typeof v === "object" && v !== null && "toNumber" in v && typeof (v as Record<string, unknown>).toNumber === "function")
    return (v as { toNumber(): number }).toNumber();
  if (typeof v === "object") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
};

async function queryEntity(
  entity: string,
  orgId: string,
  page: number,
  q: string
): Promise<{ columns: Col[]; rows: Row[]; total: number }> {
  const skip = (page - 1) * PAGE_SIZE;
  const ci = { mode: "insensitive" as const };

  // ── Legacy entities (organizationId) ──────────────────────────────────

  if (entity === "Product") {
    const where = {
      organizationId: orgId,
      deletedAt: null,
      ...(q && { OR: [{ sku: { contains: q, ...ci } }, { name: { contains: q, ...ci } }, { productFamily: { contains: q, ...ci } }, { productLine: { contains: q, ...ci } }] }),
    };
    const sel = { sku: true, name: true, type: true, makeBuy: true, uom: true, unitCost: true, listPrice: true, leadTimeDays: true, productFamily: true, abcClass: true, productLine: true, shelfLifeDays: true, drawingNumber: true, regulatoryClass: true, active: true } as const;
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { sku: "asc" } }),
    ]);
    return {
      columns: [
        { key: "sku", label: "SKU" }, { key: "name", label: "Name" },
        { key: "type", label: "Type" }, { key: "makeBuy", label: "Make/Buy" },
        { key: "uom", label: "UOM" }, { key: "unitCost", label: "Unit Cost" },
        { key: "listPrice", label: "List Price" }, { key: "leadTimeDays", label: "Lead Time (days)" },
        { key: "productFamily", label: "Family" }, { key: "abcClass", label: "ABC Class" },
        { key: "productLine", label: "Product Line" }, { key: "shelfLifeDays", label: "Shelf Life (days)" },
        { key: "drawingNumber", label: "Drawing #" }, { key: "regulatoryClass", label: "Reg. Class" },
        { key: "active", label: "Active" },
      ],
      rows: rows.map(r => ({ sku: r.sku, name: r.name, type: s(r.type), makeBuy: s(r.makeBuy), uom: r.uom || null, unitCost: s(r.unitCost), listPrice: s(r.listPrice), leadTimeDays: s(r.leadTimeDays), productFamily: s(r.productFamily), abcClass: s(r.abcClass), productLine: s(r.productLine), shelfLifeDays: s(r.shelfLifeDays), drawingNumber: s(r.drawingNumber), regulatoryClass: s(r.regulatoryClass), active: r.active ? "Yes" : "No" })),
      total,
    };
  }

  if (entity === "Supplier") {
    const where = {
      organizationId: orgId,
      ...(q && { OR: [{ code: { contains: q, ...ci } }, { name: { contains: q, ...ci } }, { country: { contains: q, ...ci } }] }),
    };
    const sel = { code: true, name: true, email: true, phone: true, country: true, city: true, leadTimeDays: true, paymentTerms: true, currency: true, status: true, qualityRating: true, onTimePct: true, certifications: true } as const;
    const [total, rows] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { code: "asc" } }),
    ]);
    return {
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
        { key: "country", label: "Country" }, { key: "city", label: "City" },
        { key: "leadTimeDays", label: "Lead Time (days)" }, { key: "paymentTerms", label: "Payment Terms" },
        { key: "currency", label: "Currency" }, { key: "status", label: "Status" },
        { key: "qualityRating", label: "Quality Rating" }, { key: "onTimePct", label: "On-Time %" },
        { key: "certifications", label: "Certifications" },
      ],
      rows: rows.map(r => ({ code: r.code, name: r.name, email: s(r.email), phone: s(r.phone), country: s(r.country), city: s(r.city), leadTimeDays: s(r.leadTimeDays), paymentTerms: s(r.paymentTerms), currency: s(r.currency), status: s(r.status), qualityRating: s(r.qualityRating), onTimePct: s(r.onTimePct), certifications: s(r.certifications) })),
      total,
    };
  }

  if (entity === "InventoryItem") {
    const where = {
      organizationId: orgId,
      ...(q && { product: { sku: { contains: q, ...ci } } }),
    };
    const [total, items] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          quantity: true, reorderPoint: true, uom: true,
          unitCost: true, totalValue: true,
          reservedQty: true, reorderQty: true,
          qtyOnHold: true, qtyOnHandTotal: true, qtyOpenPO: true, qtyOnHandPlusPO: true,
          daysOfSupply: true, leadTimeDays: true,
          demandCurrentMonth: true, demandNextMonth: true, demandMonth3: true, demandPerDay: true,
          outflow7d: true, outflow30d: true, outflow60d: true, outflow92d: true,
          moq: true, orderMultiple: true,
          lastReceiptDate: true, buyRecommendation: true, recommendedQty: true,
          lotId: true,
          attributes: true,
          product: { select: { sku: true } }, location: { select: { name: true, code: true } },
        },
        orderBy: { product: { sku: "asc" } },
      }),
    ]);
    return {
      columns: [
        { key: "sku", label: "SKU" }, { key: "location", label: "Location" },
        { key: "quantity", label: "Quantity" }, { key: "reorderPoint", label: "Reorder Point" },
        { key: "unitCost", label: "Unit Cost" }, { key: "totalValue", label: "Total Value" },
        { key: "uom", label: "UOM" },
        { key: "reservedQty", label: "Reserved Qty" }, { key: "reorderQty", label: "Reorder Qty" },
        { key: "qtyOnHold", label: "On Hold Qty" }, { key: "qtyOnHandTotal", label: "Total On-Hand" },
        { key: "qtyOpenPO", label: "Open PO Qty" }, { key: "qtyOnHandPlusPO", label: "On-Hand + PO" },
        { key: "daysOfSupply", label: "Days of Supply" }, { key: "leadTimeDays", label: "Lead Time (days)" },
        { key: "demandCurrentMonth", label: "Current Month Demand" }, { key: "demandNextMonth", label: "Next Month Demand" },
        { key: "demandMonth3", label: "Month 3 Demand" }, { key: "demandPerDay", label: "Daily Demand" },
        { key: "outflow7d", label: "Outflow 7d" }, { key: "outflow30d", label: "Outflow 30d" },
        { key: "outflow60d", label: "Outflow 60d" }, { key: "outflow92d", label: "Outflow 92d" },
        { key: "moq", label: "MOQ" }, { key: "orderMultiple", label: "Order Multiple" },
        { key: "lastReceiptDate", label: "Last Receipt" }, { key: "buyRecommendation", label: "Buy Rec." },
        { key: "recommendedQty", label: "Recommended Qty" }, { key: "lotId", label: "Lot ID" },
      ],
      rows: items.map(r => ({
        sku: r.product.sku,
        location: s(r.location?.name ?? r.location?.code ?? (r.attributes as Record<string, unknown> | null)?.locationCode as string | undefined),
        quantity: s(r.quantity), reorderPoint: s(r.reorderPoint),
        unitCost: s(r.unitCost), totalValue: s(r.totalValue),
        uom: r.uom || null,
        reservedQty: s(r.reservedQty), reorderQty: s(r.reorderQty),
        qtyOnHold: s(r.qtyOnHold), qtyOnHandTotal: s(r.qtyOnHandTotal),
        qtyOpenPO: s(r.qtyOpenPO), qtyOnHandPlusPO: s(r.qtyOnHandPlusPO),
        daysOfSupply: s(r.daysOfSupply), leadTimeDays: s(r.leadTimeDays),
        demandCurrentMonth: s(r.demandCurrentMonth), demandNextMonth: s(r.demandNextMonth),
        demandMonth3: s(r.demandMonth3), demandPerDay: s(r.demandPerDay),
        outflow7d: s(r.outflow7d), outflow30d: s(r.outflow30d),
        outflow60d: s(r.outflow60d), outflow92d: s(r.outflow92d),
        moq: s(r.moq), orderMultiple: s(r.orderMultiple),
        lastReceiptDate: s(r.lastReceiptDate),
        buyRecommendation: r.buyRecommendation === null ? null : r.buyRecommendation ? "Yes" : "No",
        recommendedQty: s(r.recommendedQty), lotId: r.lotId ?? null,
      })),
      total,
    };
  }

  if (entity === "Order") {
    const where = {
      organizationId: orgId,
      ...(q && { orderNumber: { contains: q, ...ci } }),
    };
    const sel = { orderNumber: true, type: true, status: true, totalAmount: true, currency: true, orderDate: true, expectedDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { createdAt: "desc" } }),
    ]);
    return {
      columns: [
        { key: "orderNumber", label: "Order #" }, { key: "type", label: "Type" },
        { key: "status", label: "Status" }, { key: "totalAmount", label: "Total" },
        { key: "currency", label: "Currency" }, { key: "orderDate", label: "Order Date" },
        { key: "expectedDate", label: "Expected Date" },
      ],
      rows: rows.map(r => ({ orderNumber: r.orderNumber, type: s(r.type), status: s(r.status), totalAmount: s(r.totalAmount), currency: s(r.currency), orderDate: s(r.orderDate), expectedDate: s(r.expectedDate) })),
      total,
    };
  }

  if (entity === "BOM") {
    const where = {
      parent: { organizationId: orgId },
      ...(q && {
        OR: [
          { parent: { sku: { contains: q, ...ci } } },
          { child: { sku: { contains: q, ...ci } } },
        ],
      }),
    };
    const [total, items] = await Promise.all([
      prisma.bOMItem.count({ where }),
      prisma.bOMItem.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          quantity: true, unit: true, scrapFactor: true,
          parent: { select: { sku: true, name: true } },
          child: { select: { sku: true, name: true } },
        },
        orderBy: [{ parent: { sku: "asc" } }, { child: { sku: "asc" } }],
      }),
    ]);
    return {
      columns: [
        { key: "parentSku", label: "Parent SKU" }, { key: "parentName", label: "Parent Name" },
        { key: "componentSku", label: "Component SKU" }, { key: "componentName", label: "Component Name" },
        { key: "qty", label: "Qty" }, { key: "unit", label: "Unit" },
        { key: "scrapFactor", label: "Scrap %" },
      ],
      rows: items.map(r => ({
        parentSku: r.parent.sku, parentName: r.parent.name,
        componentSku: r.child.sku, componentName: r.child.name,
        qty: s(r.quantity), unit: s(r.unit), scrapFactor: s(r.scrapFactor),
      })),
      total,
    };
  }

  if (entity === "ForecastEntry") {
    const where = {
      organizationId: orgId,
      ...(q && { OR: [{ sku: { contains: q, ...ci } }, { channel: { contains: q, ...ci } }] }),
    };
    const sel = { sku: true, period: true, forecastQty: true, channel: true, version: true, forecastUnit: true } as const;
    const [total, rows] = await Promise.all([
      prisma.forecastEntry.count({ where }),
      prisma.forecastEntry.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: [{ sku: "asc" }, { period: "asc" }] }),
    ]);
    return {
      columns: [
        { key: "sku", label: "SKU" }, { key: "period", label: "Period" },
        { key: "forecastQty", label: "Forecast Qty" }, { key: "channel", label: "Channel" },
        { key: "version", label: "Version" }, { key: "forecastUnit", label: "Unit" },
      ],
      rows: rows.map(r => ({ sku: r.sku, period: r.period, forecastQty: s(r.forecastQty), channel: s(r.channel), version: s(r.version), forecastUnit: s(r.forecastUnit) })),
      total,
    };
  }

  if (entity === "MpsEntry") {
    const where = {
      organizationId: orgId,
      ...(q && { sku: { contains: q, ...ci } }),
    };
    const sel = { sku: true, period: true, plannedQty: true, confirmedQty: true, workCenter: true } as const;
    const [total, rows] = await Promise.all([
      prisma.mpsEntry.count({ where }),
      prisma.mpsEntry.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: [{ sku: "asc" }, { period: "asc" }] }),
    ]);
    return {
      columns: [
        { key: "sku", label: "SKU" }, { key: "period", label: "Period" },
        { key: "plannedQty", label: "Planned Qty" }, { key: "confirmedQty", label: "Confirmed Qty" },
        { key: "workCenter", label: "Work Center" },
      ],
      rows: rows.map(r => ({ sku: r.sku, period: r.period, plannedQty: s(r.plannedQty), confirmedQty: s(r.confirmedQty), workCenter: s(r.workCenter) })),
      total,
    };
  }

  if (entity === "WorkOrder") {
    const where = {
      organizationId: orgId,
      ...(q && { OR: [{ orderNumber: { contains: q, ...ci } }, { sku: { contains: q, ...ci } }] }),
    };
    const sel = { orderNumber: true, sku: true, status: true, plannedQty: true, actualQty: true, workCenter: true, scheduledDate: true, dueDate: true, routingId: true, productionLine: true, yieldPct: true, lotNumber: true } as const;
    const [total, rows] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { dueDate: "asc" } }),
    ]);
    return {
      columns: [
        { key: "orderNumber", label: "WO #" }, { key: "sku", label: "SKU" },
        { key: "status", label: "Status" }, { key: "plannedQty", label: "Planned Qty" },
        { key: "actualQty", label: "Actual Qty" }, { key: "workCenter", label: "Work Center" },
        { key: "productionLine", label: "Production Line" }, { key: "yieldPct", label: "Yield %" },
        { key: "lotNumber", label: "Lot #" },
        { key: "scheduledDate", label: "Scheduled" }, { key: "dueDate", label: "Due Date" },
      ],
      rows: rows.map(r => ({ orderNumber: r.orderNumber, sku: r.sku, status: r.status, plannedQty: s(r.plannedQty), actualQty: s(r.actualQty), workCenter: s(r.workCenter), productionLine: s(r.productionLine), yieldPct: s(r.yieldPct), lotNumber: s(r.lotNumber), scheduledDate: s(r.scheduledDate), dueDate: s(r.dueDate) })),
      total,
    };
  }

  if (entity === "Routing") {
    const where = {
      organizationId: orgId,
      ...(q && { sku: { contains: q, ...ci } }),
    };
    const sel = { sku: true, operationNo: true, workCenter: true, description: true, setupTimeMins: true, runTimeMins: true, status: true, effectiveFrom: true, effectiveTo: true, approvedBy: true } as const;
    const [total, rows] = await Promise.all([
      prisma.routing.count({ where }),
      prisma.routing.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: [{ sku: "asc" }, { operationNo: "asc" }] }),
    ]);
    return {
      columns: [
        { key: "sku", label: "SKU" }, { key: "operationNo", label: "Op #" },
        { key: "workCenter", label: "Work Center" }, { key: "description", label: "Description" },
        { key: "setupTimeMins", label: "Setup (min)" }, { key: "runTimeMins", label: "Run (min/unit)" },
        { key: "status", label: "Status" }, { key: "effectiveFrom", label: "Effective From" },
        { key: "effectiveTo", label: "Effective To" }, { key: "approvedBy", label: "Approved By" },
      ],
      rows: rows.map(r => ({ sku: r.sku, operationNo: r.operationNo, workCenter: r.workCenter, description: s(r.description), setupTimeMins: s(r.setupTimeMins), runTimeMins: s(r.runTimeMins), status: s(r.status), effectiveFrom: s(r.effectiveFrom), effectiveTo: s(r.effectiveTo), approvedBy: s(r.approvedBy) })),
      total,
    };
  }

  if (entity === "WorkCenter") {
    const where = {
      organizationId: orgId,
      ...(q && { OR: [{ code: { contains: q, ...ci } }, { name: { contains: q, ...ci } }] }),
    };
    const sel = { code: true, name: true, availableHoursPerWeek: true, efficiency: true, costRatePerHour: true, calendar: true, department: true, capacityHrsDay: true, oeeTargetPct: true, notes: true } as const;
    const [total, rows] = await Promise.all([
      prisma.workCenter.count({ where }),
      prisma.workCenter.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { code: "asc" } }),
    ]);
    return {
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "department", label: "Department" }, { key: "availableHoursPerWeek", label: "Hrs/Week" },
        { key: "capacityHrsDay", label: "Hrs/Day" }, { key: "efficiency", label: "Efficiency %" },
        { key: "oeeTargetPct", label: "OEE Target %" }, { key: "costRatePerHour", label: "Cost Rate/hr" },
        { key: "calendar", label: "Calendar" }, { key: "notes", label: "Notes" },
      ],
      rows: rows.map(r => ({ code: r.code, name: r.name, department: s(r.department), availableHoursPerWeek: s(r.availableHoursPerWeek), capacityHrsDay: s(r.capacityHrsDay), efficiency: s(r.efficiency), oeeTargetPct: s(r.oeeTargetPct), costRatePerHour: s(r.costRatePerHour), calendar: s(r.calendar), notes: s(r.notes) })),
      total,
    };
  }

  // ── Manufacturing canonical entities (orgId field) ─────────────────────

  if (entity === "Customer") {
    const where = {
      orgId,
      ...(q && { OR: [{ code: { contains: q, ...ci } }, { name: { contains: q, ...ci } }] }),
    };
    const sel = { code: true, name: true, contactName: true, email: true, phone: true, country: true, city: true, currency: true, creditLimit: true, type: true, vatNumber: true, status: true, sinceDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { code: "asc" } }),
    ]);
    return {
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "type", label: "Type" }, { key: "contactName", label: "Contact" },
        { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
        { key: "country", label: "Country" }, { key: "city", label: "City" },
        { key: "currency", label: "Currency" }, { key: "creditLimit", label: "Credit Limit" },
        { key: "vatNumber", label: "VAT #" }, { key: "status", label: "Status" },
        { key: "sinceDate", label: "Since" },
      ],
      rows: rows.map(r => ({ code: r.code, name: r.name, type: s(r.type), contactName: s(r.contactName), email: s(r.email), phone: s(r.phone), country: s(r.country), city: s(r.city), currency: s(r.currency), creditLimit: s(r.creditLimit), vatNumber: s(r.vatNumber), status: s(r.status), sinceDate: s(r.sinceDate) })),
      total,
    };
  }

  if (entity === "PurchaseOrder") {
    const where = {
      orgId,
      ...(q && { OR: [{ poNumber: { contains: q, ...ci } }, { supplier: { code: { contains: q, ...ci } } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          poNumber: true, status: true, currency: true, totalAmount: true, expectedDate: true,
          orderDate: true, poType: true, buyerId: true,
          supplier: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      columns: [
        { key: "poNumber", label: "PO #" }, { key: "supplier", label: "Supplier" },
        { key: "status", label: "Status" }, { key: "poType", label: "PO Type" },
        { key: "currency", label: "Currency" }, { key: "totalAmount", label: "Total" },
        { key: "orderDate", label: "Order Date" }, { key: "expectedDate", label: "Expected Date" },
        { key: "buyerId", label: "Buyer" },
      ],
      rows: items.map(r => ({ poNumber: r.poNumber, supplier: `${r.supplier.code} – ${r.supplier.name}`, status: r.status, poType: s(r.poType), currency: r.currency, totalAmount: s(r.totalAmount), orderDate: s(r.orderDate), expectedDate: s(r.expectedDate), buyerId: s(r.buyerId) })),
      total,
    };
  }

  if (entity === "POLine") {
    const where = {
      purchaseOrder: { orgId },
      ...(q && { product: { sku: { contains: q, ...ci } } }),
    };
    const [total, items] = await Promise.all([
      prisma.pOLine.count({ where }),
      prisma.pOLine.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          lineNumber: true, qtyOrdered: true, qtyReceived: true, qtyOpen: true, unitCost: true, uom: true, confirmedETA: true, lineValue: true, status: true, notes: true,
          purchaseOrder: { select: { poNumber: true } },
          product: { select: { sku: true, name: true } },
        },
        orderBy: [{ purchaseOrder: { poNumber: "asc" } }, { lineNumber: "asc" }],
      }),
    ]);
    return {
      columns: [
        { key: "poNumber", label: "PO #" }, { key: "line", label: "Line" },
        { key: "sku", label: "SKU" }, { key: "productName", label: "Product" },
        { key: "qtyOrdered", label: "Qty Ordered" }, { key: "qtyReceived", label: "Qty Received" },
        { key: "qtyOpen", label: "Qty Open" },
        { key: "unitCost", label: "Unit Cost" }, { key: "lineValue", label: "Line Value" },
        { key: "uom", label: "UOM" }, { key: "status", label: "Status" },
        { key: "confirmedETA", label: "Confirmed ETA" }, { key: "notes", label: "Notes" },
      ],
      rows: items.map(r => ({ poNumber: r.purchaseOrder.poNumber, line: r.lineNumber, sku: r.product.sku, productName: r.product.name, qtyOrdered: s(r.qtyOrdered), qtyReceived: s(r.qtyReceived), qtyOpen: r.qtyOpen !== null ? s(r.qtyOpen) : null, unitCost: s(r.unitCost), lineValue: s(r.lineValue), uom: r.uom, status: s(r.status), confirmedETA: r.confirmedETA?.toISOString().slice(0, 10) ?? null, notes: s(r.notes) })),
      total,
    };
  }

  if (entity === "SalesOrder") {
    const where = {
      orgId,
      ...(q && { OR: [{ soNumber: { contains: q, ...ci } }, { customer: { code: { contains: q, ...ci } } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.salesOrder.count({ where }),
      prisma.salesOrder.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          soNumber: true, status: true, currency: true, totalAmount: true, requestedDate: true,
          orderDate: true, paymentTerms: true, incoterms: true, customerPoRef: true,
          customer: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      columns: [
        { key: "soNumber", label: "SO #" }, { key: "customer", label: "Customer" },
        { key: "status", label: "Status" }, { key: "currency", label: "Currency" },
        { key: "totalAmount", label: "Total" }, { key: "orderDate", label: "Order Date" },
        { key: "requestedDate", label: "Requested Date" }, { key: "paymentTerms", label: "Payment Terms" },
        { key: "incoterms", label: "Incoterms" }, { key: "customerPoRef", label: "Customer PO Ref" },
      ],
      rows: items.map(r => ({ soNumber: r.soNumber, customer: `${r.customer.code} – ${r.customer.name}`, status: r.status, currency: r.currency, totalAmount: s(r.totalAmount), orderDate: s(r.orderDate), requestedDate: s(r.requestedDate), paymentTerms: s(r.paymentTerms), incoterms: s(r.incoterms), customerPoRef: s(r.customerPoRef) })),
      total,
    };
  }

  if (entity === "BOMHeader") {
    const where = {
      orgId,
      ...(q && { product: { sku: { contains: q, ...ci } } }),
    };
    const [total, items] = await Promise.all([
      prisma.bOMHeader.count({ where }),
      prisma.bOMHeader.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          version: true, isActive: true, effectiveFrom: true, effectiveTo: true, yieldPct: true,
          status: true, totalComponents: true, totalBomCost: true, applicableStandard: true,
          product: { select: { sku: true, name: true } }, lines: { select: { id: true } },
        },
        orderBy: [{ product: { sku: "asc" } }, { version: "asc" }],
      }),
    ]);
    return {
      columns: [
        { key: "productSku", label: "Product SKU" }, { key: "productName", label: "Product" },
        { key: "version", label: "Version" }, { key: "status", label: "Status" },
        { key: "isActive", label: "Active" },
        { key: "effectiveFrom", label: "Effective From" }, { key: "effectiveTo", label: "Effective To" },
        { key: "yieldPct", label: "Yield %" }, { key: "totalComponents", label: "Components" },
        { key: "totalBomCost", label: "BOM Cost" }, { key: "applicableStandard", label: "Standard" },
        { key: "lines", label: "# Lines" },
      ],
      rows: items.map(r => ({ productSku: r.product.sku, productName: r.product.name, version: r.version, status: s(r.status), isActive: r.isActive ? "Yes" : "No", effectiveFrom: s(r.effectiveFrom), effectiveTo: s(r.effectiveTo), yieldPct: s(r.yieldPct), totalComponents: s(r.totalComponents), totalBomCost: s(r.totalBomCost), applicableStandard: s(r.applicableStandard), lines: r.lines.length })),
      total,
    };
  }

  if (entity === "Equipment") {
    const where = {
      orgId,
      ...(q && { OR: [{ code: { contains: q, ...ci } }, { name: { contains: q, ...ci } }] }),
    };
    const sel = { code: true, name: true, type: true, status: true, serialNumber: true, manufacturer: true, nextMaintenanceAt: true, installationDate: true, maintenanceIntervalDays: true, calibrationDue: true, notes: true } as const;
    const [total, rows] = await Promise.all([
      prisma.equipment.count({ where }),
      prisma.equipment.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { code: "asc" } }),
    ]);
    return {
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "type", label: "Type" }, { key: "status", label: "Status" },
        { key: "serialNumber", label: "Serial #" }, { key: "manufacturer", label: "Manufacturer" },
        { key: "installationDate", label: "Installed" }, { key: "maintenanceIntervalDays", label: "Maint. Interval (days)" },
        { key: "nextMaintenanceAt", label: "Next Maintenance" }, { key: "calibrationDue", label: "Calibration Due" },
        { key: "notes", label: "Notes" },
      ],
      rows: rows.map(r => ({ code: r.code, name: r.name, type: s(r.type), status: r.status, serialNumber: s(r.serialNumber), manufacturer: s(r.manufacturer), installationDate: s(r.installationDate), maintenanceIntervalDays: s(r.maintenanceIntervalDays), nextMaintenanceAt: s(r.nextMaintenanceAt), calibrationDue: s(r.calibrationDue), notes: s(r.notes) })),
      total,
    };
  }

  // ── Master Data: Location ──────────────────────────────────────────────

  if (entity === "Location") {
    const where = {
      organizationId: orgId,
      ...(q && { OR: [{ code: { contains: q, ...ci } }, { name: { contains: q, ...ci } }] }),
    };
    const sel = { code: true, name: true, type: true, city: true, countryCode: true, notes: true, active: true } as const;
    const [total, rows] = await Promise.all([
      prisma.location.count({ where }),
      prisma.location.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { code: "asc" } }),
    ]);
    return {
      columns: [
        { key: "code", label: "Code" }, { key: "name", label: "Name" },
        { key: "type", label: "Type" }, { key: "city", label: "City" },
        { key: "countryCode", label: "Country" }, { key: "notes", label: "Notes" },
        { key: "active", label: "Active" },
      ],
      rows: rows.map(r => ({ code: r.code, name: r.name, type: s(r.type), city: s(r.city), countryCode: s(r.countryCode), notes: s(r.notes), active: r.active ? "Yes" : "No" })),
      total,
    };
  }

  // ── Finance ────────────────────────────────────────────────────────────

  if (entity === "ExchangeRate") {
    const where = {
      ...(q && { OR: [{ fromCurrency: { contains: q, ...ci } }, { toCurrency: { contains: q, ...ci } }] }),
    };
    const sel = { fromCurrency: true, toCurrency: true, rateDate: true, rate: true, rateType: true, source: true } as const;
    const [total, rows] = await Promise.all([
      prisma.exchangeRate.count({ where }),
      prisma.exchangeRate.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { rateDate: "desc" } }),
    ]);
    return {
      columns: [
        { key: "fromCurrency", label: "From" }, { key: "toCurrency", label: "To" },
        { key: "rateDate", label: "Date" }, { key: "rate", label: "Rate" },
        { key: "rateType", label: "Type" }, { key: "source", label: "Source" },
      ],
      rows: rows.map(r => ({ fromCurrency: r.fromCurrency, toCurrency: r.toCurrency, rateDate: s(r.rateDate), rate: s(r.rate), rateType: r.rateType, source: s(r.source) })),
      total,
    };
  }

  if (entity === "PriceList") {
    const where = {
      ...(q && { OR: [{ priceListId: { contains: q, ...ci } }, { name: { contains: q, ...ci } }] }),
    };
    const sel = { priceListId: true, name: true, type: true, currency: true, validFrom: true, validTo: true, status: true } as const;
    const [total, rows] = await Promise.all([
      prisma.priceList.count({ where }),
      prisma.priceList.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { name: "asc" } }),
    ]);
    return {
      columns: [
        { key: "priceListId", label: "ID" }, { key: "name", label: "Name" },
        { key: "type", label: "Type" }, { key: "currency", label: "Currency" },
        { key: "validFrom", label: "Valid From" }, { key: "validTo", label: "Valid To" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map(r => ({ priceListId: r.priceListId, name: r.name, type: r.type, currency: r.currency, validFrom: s(r.validFrom), validTo: s(r.validTo), status: r.status })),
      total,
    };
  }

  if (entity === "PriceListLine") {
    const where = {
      ...(q && { OR: [{ sku: { contains: q, ...ci } }, { priceListId: { contains: q, ...ci } }] }),
    };
    const sel = { priceListId: true, sku: true, minQty: true, unitPrice: true, discountPct: true, validFrom: true, validTo: true } as const;
    const [total, rows] = await Promise.all([
      prisma.priceListLine.count({ where }),
      prisma.priceListLine.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { priceListId: "asc" } }),
    ]);
    return {
      columns: [
        { key: "priceListId", label: "Price List" }, { key: "sku", label: "SKU" },
        { key: "minQty", label: "Min Qty" }, { key: "unitPrice", label: "Unit Price" },
        { key: "discountPct", label: "Discount %" }, { key: "validFrom", label: "Valid From" },
        { key: "validTo", label: "Valid To" },
      ],
      rows: rows.map(r => ({ priceListId: r.priceListId, sku: r.sku, minQty: s(r.minQty), unitPrice: s(r.unitPrice), discountPct: s(r.discountPct), validFrom: s(r.validFrom), validTo: s(r.validTo) })),
      total,
    };
  }

  if (entity === "CustomerPriceList") {
    const where = {
      ...(q && { OR: [{ customerId: { contains: q, ...ci } }, { priceListId: { contains: q, ...ci } }] }),
    };
    const sel = { customerId: true, priceListId: true, validFrom: true, validTo: true, priority: true } as const;
    const [total, rows] = await Promise.all([
      prisma.customerPriceList.count({ where }),
      prisma.customerPriceList.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { validFrom: "desc" } }),
    ]);
    return {
      columns: [
        { key: "customerId", label: "Customer" }, { key: "priceListId", label: "Price List" },
        { key: "validFrom", label: "Valid From" }, { key: "validTo", label: "Valid To" },
        { key: "priority", label: "Priority" },
      ],
      rows: rows.map(r => ({ customerId: r.customerId, priceListId: r.priceListId, validFrom: s(r.validFrom), validTo: s(r.validTo), priority: r.priority })),
      total,
    };
  }

  // ── Engineering ────────────────────────────────────────────────────────

  if (entity === "BOMLine") {
    const where = {
      bomHeader: { orgId },
      ...(q && { component: { sku: { contains: q, ...ci } } }),
    };
    const [total, items] = await Promise.all([
      prisma.bOMLine.count({ where }),
      prisma.bOMLine.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          qty: true, uom: true, wasteFactorPct: true, isPhantom: true,
          section: true, extendedCost: true, makeBuy: true, isCritical: true,
          bomHeader: { select: { product: { select: { sku: true } }, version: true } },
          component: { select: { sku: true, name: true } },
        },
        orderBy: { sequence: "asc" },
      }),
    ]);
    return {
      columns: [
        { key: "parentSku", label: "Parent SKU" }, { key: "version", label: "BOM Ver" },
        { key: "componentSku", label: "Component SKU" }, { key: "componentName", label: "Component" },
        { key: "qty", label: "Qty" }, { key: "uom", label: "UOM" },
        { key: "wasteFactorPct", label: "Waste %" }, { key: "section", label: "Section" },
        { key: "extendedCost", label: "Extended Cost" }, { key: "makeBuy", label: "Make/Buy" },
        { key: "isCritical", label: "Critical" }, { key: "isPhantom", label: "Phantom" },
      ],
      rows: items.map(r => ({ parentSku: r.bomHeader.product.sku, version: r.bomHeader.version, componentSku: r.component.sku, componentName: r.component.name, qty: s(r.qty), uom: r.uom, wasteFactorPct: s(r.wasteFactorPct), section: s(r.section), extendedCost: s(r.extendedCost), makeBuy: s(r.makeBuy), isCritical: r.isCritical ? "Yes" : "No", isPhantom: r.isPhantom ? "Yes" : "No" })),
      total,
    };
  }

  if (entity === "RoutingOperation") {
    const where = {
      routing: { organizationId: orgId },
      ...(q && { OR: [{ name: { contains: q, ...ci } }, { workCenter: { contains: q, ...ci } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.routingOperation.count({ where }),
      prisma.routingOperation.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          sequence: true, name: true, workCenter: true, setupMins: true, runMinsPerUnit: true, yieldPct: true,
          requiredSkill: true, certOperatorRequired: true,
          routing: { select: { sku: true } },
        },
        orderBy: [{ routing: { sku: "asc" } }, { sequence: "asc" }],
      }),
    ]);
    return {
      columns: [
        { key: "sku", label: "Product SKU" }, { key: "sequence", label: "Seq" },
        { key: "name", label: "Operation" }, { key: "workCenter", label: "Work Center" },
        { key: "setupMins", label: "Setup (min)" }, { key: "runMinsPerUnit", label: "Run (min/unit)" },
        { key: "yieldPct", label: "Yield %" }, { key: "requiredSkill", label: "Required Skill" },
        { key: "certOperatorRequired", label: "Cert. Required" },
      ],
      rows: items.map(r => ({ sku: r.routing.sku, sequence: r.sequence, name: r.name, workCenter: s(r.workCenter), setupMins: s(r.setupMins), runMinsPerUnit: s(r.runMinsPerUnit), yieldPct: s(r.yieldPct), requiredSkill: s(r.requiredSkill), certOperatorRequired: r.certOperatorRequired ? "Yes" : "No" })),
      total,
    };
  }

  if (entity === "ShiftCalendar") {
    const where = {
      ...(q && { workCentreId: { contains: q, ...ci } }),
    };
    const sel = { date: true, workCentreId: true, shift: true, startTime: true, endTime: true, availableHrs: true, status: true } as const;
    const [total, rows] = await Promise.all([
      prisma.shiftCalendar.count({ where }),
      prisma.shiftCalendar.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { date: "desc" } }),
    ]);
    return {
      columns: [
        { key: "date", label: "Date" }, { key: "workCentreId", label: "Work Centre" },
        { key: "shift", label: "Shift" }, { key: "startTime", label: "Start" },
        { key: "endTime", label: "End" }, { key: "availableHrs", label: "Avail Hrs" },
        { key: "status", label: "Status" },
      ],
      rows: rows.map(r => ({ date: s(r.date), workCentreId: r.workCentreId, shift: r.shift, startTime: s(r.startTime), endTime: s(r.endTime), availableHrs: s(r.availableHrs), status: r.status })),
      total,
    };
  }

  if (entity === "MaintenanceLog") {
    const where = {
      equipment: { orgId },
      ...(q && { description: { contains: q, ...ci } }),
    };
    const [total, items] = await Promise.all([
      prisma.maintenanceLog.count({ where }),
      prisma.maintenanceLog.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          type: true, description: true, performedBy: true, performedAt: true, durationMins: true, cost: true,
          result: true, partsUsed: true, notes: true,
          equipment: { select: { code: true, name: true } },
        },
        orderBy: { performedAt: "desc" },
      }),
    ]);
    return {
      columns: [
        { key: "equipmentCode", label: "Equipment" }, { key: "type", label: "Type" },
        { key: "description", label: "Description" }, { key: "performedBy", label: "Performed By" },
        { key: "performedAt", label: "Date" }, { key: "durationMins", label: "Duration (min)" },
        { key: "cost", label: "Cost" }, { key: "result", label: "Result" },
        { key: "partsUsed", label: "Parts Used" }, { key: "notes", label: "Notes" },
      ],
      rows: items.map(r => ({ equipmentCode: `${r.equipment.code} – ${r.equipment.name}`, type: r.type, description: r.description, performedBy: s(r.performedBy), performedAt: s(r.performedAt), durationMins: s(r.durationMins), cost: s(r.cost), result: s(r.result), partsUsed: s(r.partsUsed), notes: s(r.notes) })),
      total,
    };
  }

  // ── Inventory ──────────────────────────────────────────────────────────

  if (entity === "Lot") {
    const where = {
      orgId,
      ...(q && { OR: [{ lotNumber: { contains: q, ...ci } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.lot.count({ where }),
      prisma.lot.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          lotNumber: true, expiryDate: true, manufacturedDate: true,
          lotType: true, originType: true, status: true, qtyCreated: true, qtyOnHand: true,
          product: { select: { sku: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      columns: [
        { key: "lotNumber", label: "Lot #" }, { key: "sku", label: "SKU" },
        { key: "productName", label: "Product" }, { key: "lotType", label: "Lot Type" },
        { key: "originType", label: "Origin" }, { key: "status", label: "Status" },
        { key: "qtyCreated", label: "Qty Created" }, { key: "qtyOnHand", label: "Qty On Hand" },
        { key: "expiryDate", label: "Expiry" }, { key: "manufacturedDate", label: "Manufactured" },
      ],
      rows: items.map(r => ({ lotNumber: r.lotNumber, sku: r.product.sku, productName: r.product.name, lotType: s(r.lotType), originType: s(r.originType), status: s(r.status), qtyCreated: s(r.qtyCreated), qtyOnHand: s(r.qtyOnHand), expiryDate: s(r.expiryDate), manufacturedDate: s(r.manufacturedDate) })),
      total,
    };
  }

  if (entity === "SerialNumber") {
    const where = {
      ...(q && { OR: [{ serialNumber: { contains: q, ...ci } }, { sku: { contains: q, ...ci } }] }),
    };
    const sel = { serialNumber: true, sku: true, lotNumber: true, status: true, locationId: true, productionDate: true, shipDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.serialNumber.count({ where }),
      prisma.serialNumber.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { serialNumber: "asc" } }),
    ]);
    return {
      columns: [
        { key: "serialNumber", label: "Serial #" }, { key: "sku", label: "SKU" },
        { key: "lotNumber", label: "Lot #" }, { key: "status", label: "Status" },
        { key: "locationId", label: "Location" }, { key: "productionDate", label: "Production Date" },
        { key: "shipDate", label: "Ship Date" },
      ],
      rows: rows.map(r => ({ serialNumber: r.serialNumber, sku: r.sku, lotNumber: s(r.lotNumber), status: r.status, locationId: s(r.locationId), productionDate: s(r.productionDate), shipDate: s(r.shipDate) })),
      total,
    };
  }

  if (entity === "StockMovement") {
    const where = {
      orgId,
      ...(q && { productId: { contains: q, ...ci } }),
    };
    const [total, items] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where, skip, take: PAGE_SIZE, orderBy: { occurredAt: "desc" },
        select: { productId: true, locationId: true, type: true, qty: true, uom: true, refType: true, refId: true, occurredAt: true },
      }),
    ]);
    // Resolve product/location IDs to readable names
    const productIds = [...new Set(items.map(i => i.productId))];
    const locationIds = [...new Set(items.map(i => i.locationId))];
    const [products, locations] = await Promise.all([
      productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true } }) : [],
      locationIds.length ? prisma.location.findMany({ where: { id: { in: locationIds } }, select: { id: true, code: true } }) : [],
    ]);
    const pMap = new Map(products.map(p => [p.id, p.sku]));
    const lMap = new Map(locations.map(l => [l.id, l.code]));
    return {
      columns: [
        { key: "product", label: "Product" }, { key: "location", label: "Location" },
        { key: "type", label: "Type" }, { key: "qty", label: "Qty" }, { key: "uom", label: "UOM" },
        { key: "refType", label: "Ref Type" }, { key: "refId", label: "Ref ID" },
        { key: "occurredAt", label: "Date" },
      ],
      rows: items.map(r => ({ product: pMap.get(r.productId) ?? r.productId, location: lMap.get(r.locationId) ?? r.locationId, type: r.type, qty: s(r.qty), uom: s(r.uom), refType: s(r.refType), refId: s(r.refId), occurredAt: s(r.occurredAt) })),
      total,
    };
  }

  // ── Procurement ────────────────────────────────────────────────────────

  if (entity === "SupplierItem") {
    const where = {
      orgId,
      ...(q && { OR: [{ product: { sku: { contains: q, ...ci } } }, { supplier: { code: { contains: q, ...ci } } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.supplierItem.count({ where }),
      prisma.supplierItem.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          supplierPartNumber: true, status: true, leadTimeDays: true, contractUnitCost: true, currency: true,
          supplier: { select: { code: true, name: true } },
          product: { select: { sku: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return {
      columns: [
        { key: "supplierCode", label: "Supplier" }, { key: "sku", label: "SKU" },
        { key: "productName", label: "Product" }, { key: "supplierPartNumber", label: "Supplier Part #" },
        { key: "status", label: "Status" }, { key: "leadTimeDays", label: "Lead Time" },
        { key: "contractUnitCost", label: "Contract Cost" }, { key: "currency", label: "Currency" },
      ],
      rows: items.map(r => ({ supplierCode: `${r.supplier.code} – ${r.supplier.name}`, sku: r.product.sku, productName: r.product.name, supplierPartNumber: s(r.supplierPartNumber), status: r.status, leadTimeDays: s(r.leadTimeDays), contractUnitCost: s(r.contractUnitCost), currency: s(r.currency) })),
      total,
    };
  }

  // ── Production ─────────────────────────────────────────────────────────

  if (entity === "WorkOrderOperation") {
    const where = {
      workOrder: { organizationId: orgId },
      ...(q && { OR: [{ name: { contains: q, ...ci } }, { workCenter: { contains: q, ...ci } }] }),
    };
    const [total, items] = await Promise.all([
      prisma.workOrderOperation.count({ where }),
      prisma.workOrderOperation.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          sequence: true, name: true, workCenter: true, status: true, plannedMins: true, actualMins: true,
          workOrder: { select: { orderNumber: true } },
        },
        orderBy: [{ workOrder: { orderNumber: "asc" } }, { sequence: "asc" }],
      }),
    ]);
    return {
      columns: [
        { key: "woNumber", label: "WO #" }, { key: "sequence", label: "Seq" },
        { key: "name", label: "Operation" }, { key: "workCenter", label: "Work Center" },
        { key: "status", label: "Status" }, { key: "plannedMins", label: "Planned (min)" },
        { key: "actualMins", label: "Actual (min)" },
      ],
      rows: items.map(r => ({ woNumber: r.workOrder.orderNumber, sequence: r.sequence, name: r.name, workCenter: s(r.workCenter), status: r.status, plannedMins: s(r.plannedMins), actualMins: s(r.actualMins) })),
      total,
    };
  }

  // ── Sales & Fulfilment ─────────────────────────────────────────────────

  if (entity === "SalesOrderLine") {
    const where = {
      salesOrder: { orgId },
      ...(q && { product: { sku: { contains: q, ...ci } } }),
    };
    const [total, items] = await Promise.all([
      prisma.sOLine.count({ where }),
      prisma.sOLine.findMany({
        where, skip, take: PAGE_SIZE,
        select: {
          lineNumber: true, qtyOrdered: true, qtyShipped: true, unitPrice: true, uom: true,
          qtyOpen: true, lineValue: true, status: true, confirmedDate: true,
          salesOrder: { select: { soNumber: true } },
          product: { select: { sku: true, name: true } },
        },
        orderBy: [{ salesOrder: { soNumber: "asc" } }, { lineNumber: "asc" }],
      }),
    ]);
    return {
      columns: [
        { key: "soNumber", label: "SO #" }, { key: "line", label: "Line" },
        { key: "sku", label: "SKU" }, { key: "productName", label: "Product" },
        { key: "qtyOrdered", label: "Qty Ordered" }, { key: "qtyShipped", label: "Qty Shipped" },
        { key: "qtyOpen", label: "Qty Open" }, { key: "unitPrice", label: "Unit Price" },
        { key: "lineValue", label: "Line Value" }, { key: "uom", label: "UOM" },
        { key: "status", label: "Status" }, { key: "confirmedDate", label: "Confirmed Date" },
      ],
      rows: items.map(r => ({ soNumber: r.salesOrder.soNumber, line: r.lineNumber, sku: r.product.sku, productName: r.product.name, qtyOrdered: s(r.qtyOrdered), qtyShipped: s(r.qtyShipped), qtyOpen: s(r.qtyOpen), unitPrice: s(r.unitPrice), lineValue: s(r.lineValue), uom: r.uom, status: s(r.status), confirmedDate: s(r.confirmedDate) })),
      total,
    };
  }

  if (entity === "Shipment") {
    const where = {
      ...(q && { OR: [{ shipmentId: { contains: q, ...ci } }, { carrier: { contains: q, ...ci } }, { customerId: { contains: q, ...ci } }] }),
    };
    const sel = { shipmentId: true, customerId: true, status: true, carrier: true, trackingNumber: true, shipDate: true, totalQty: true, totalValue: true } as const;
    const [total, rows] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { shipDate: "desc" } }),
    ]);
    return {
      columns: [
        { key: "shipmentId", label: "Shipment ID" }, { key: "customerId", label: "Customer" },
        { key: "status", label: "Status" }, { key: "carrier", label: "Carrier" },
        { key: "trackingNumber", label: "Tracking #" }, { key: "shipDate", label: "Ship Date" },
        { key: "totalQty", label: "Total Qty" }, { key: "totalValue", label: "Total Value" },
      ],
      rows: rows.map(r => ({ shipmentId: r.shipmentId, customerId: r.customerId, status: r.status, carrier: s(r.carrier), trackingNumber: s(r.trackingNumber), shipDate: s(r.shipDate), totalQty: s(r.totalQty), totalValue: s(r.totalValue) })),
      total,
    };
  }

  if (entity === "ShipmentLine") {
    const where = {
      ...(q && { OR: [{ shipmentId: { contains: q, ...ci } }, { sku: { contains: q, ...ci } }] }),
    };
    const sel = { shipmentId: true, lineNumber: true, sku: true, qtyShipped: true, lotNumber: true, serialNumbers: true } as const;
    const [total, rows] = await Promise.all([
      prisma.shipmentLine.count({ where }),
      prisma.shipmentLine.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: [{ shipmentId: "asc" }, { lineNumber: "asc" }] }),
    ]);
    return {
      columns: [
        { key: "shipmentId", label: "Shipment" }, { key: "lineNumber", label: "Line" },
        { key: "sku", label: "SKU" }, { key: "qtyShipped", label: "Qty Shipped" },
        { key: "lotNumber", label: "Lot #" }, { key: "serialNumbers", label: "Serials" },
      ],
      rows: rows.map(r => ({ shipmentId: r.shipmentId, lineNumber: r.lineNumber, sku: r.sku, qtyShipped: s(r.qtyShipped), lotNumber: s(r.lotNumber), serialNumbers: s(r.serialNumbers) })),
      total,
    };
  }

  if (entity === "Invoice") {
    const where = {
      ...(q && { OR: [{ invoiceId: { contains: q, ...ci } }, { customerId: { contains: q, ...ci } }] }),
    };
    const sel = { invoiceId: true, customerId: true, status: true, currency: true, totalAmount: true, invoiceDate: true, dueDate: true, paymentDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { invoiceDate: "desc" } }),
    ]);
    return {
      columns: [
        { key: "invoiceId", label: "Invoice #" }, { key: "customerId", label: "Customer" },
        { key: "status", label: "Status" }, { key: "currency", label: "Currency" },
        { key: "totalAmount", label: "Total" }, { key: "invoiceDate", label: "Invoice Date" },
        { key: "dueDate", label: "Due Date" }, { key: "paymentDate", label: "Paid" },
      ],
      rows: rows.map(r => ({ invoiceId: r.invoiceId, customerId: r.customerId, status: r.status, currency: s(r.currency), totalAmount: s(r.totalAmount), invoiceDate: s(r.invoiceDate), dueDate: s(r.dueDate), paymentDate: s(r.paymentDate) })),
      total,
    };
  }

  if (entity === "ReturnRma") {
    const where = {
      ...(q && { OR: [{ rmaId: { contains: q, ...ci } }, { sku: { contains: q, ...ci } }, { customerId: { contains: q, ...ci } }] }),
    };
    const sel = { rmaId: true, customerId: true, sku: true, qty: true, reasonCode: true, disposition: true, status: true, returnDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.returnRma.count({ where }),
      prisma.returnRma.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { returnDate: "desc" } }),
    ]);
    return {
      columns: [
        { key: "rmaId", label: "RMA #" }, { key: "customerId", label: "Customer" },
        { key: "sku", label: "SKU" }, { key: "qty", label: "Qty" },
        { key: "reasonCode", label: "Reason" }, { key: "disposition", label: "Disposition" },
        { key: "status", label: "Status" }, { key: "returnDate", label: "Return Date" },
      ],
      rows: rows.map(r => ({ rmaId: r.rmaId, customerId: r.customerId, sku: r.sku, qty: s(r.qty), reasonCode: s(r.reasonCode), disposition: s(r.disposition), status: r.status, returnDate: s(r.returnDate) })),
      total,
    };
  }

  // ── Quality ────────────────────────────────────────────────────────────

  if (entity === "QcInspection") {
    const where = {
      orgId,
      ...(q && { inspectedBy: { contains: q, ...ci } }),
    };
    const [total, items] = await Promise.all([
      prisma.qCInspection.count({ where }),
      prisma.qCInspection.findMany({
        where, skip, take: PAGE_SIZE, orderBy: { inspectedAt: "desc" },
        select: { productId: true, type: true, status: true, inspectedBy: true, inspectedAt: true, qtyInspected: true, qtyPassed: true, qtyFailed: true, yieldPct: true, disposition: true },
      }),
    ]);
    // Resolve productId to SKU
    const productIds = [...new Set(items.filter(i => i.productId).map(i => i.productId!))];
    const prods = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, sku: true } }) : [];
    const pMap = new Map(prods.map(p => [p.id, p.sku]));
    return {
      columns: [
        { key: "product", label: "Product" }, { key: "type", label: "Type" },
        { key: "status", label: "Status" }, { key: "qtyInspected", label: "Qty Inspected" },
        { key: "qtyPassed", label: "Qty Passed" }, { key: "qtyFailed", label: "Qty Failed" },
        { key: "yieldPct", label: "Yield %" }, { key: "disposition", label: "Disposition" },
        { key: "inspectedBy", label: "Inspector" }, { key: "inspectedAt", label: "Date" },
      ],
      rows: items.map(r => ({ product: r.productId ? (pMap.get(r.productId) ?? r.productId) : null, type: r.type, status: r.status, qtyInspected: s(r.qtyInspected), qtyPassed: s(r.qtyPassed), qtyFailed: s(r.qtyFailed), yieldPct: s(r.yieldPct), disposition: s(r.disposition), inspectedBy: s(r.inspectedBy), inspectedAt: s(r.inspectedAt) })),
      total,
    };
  }

  if (entity === "Ncr") {
    const where = {
      ...(q && { OR: [{ ncrId: { contains: q, ...ci } }, { description: { contains: q, ...ci } }] }),
    };
    const sel = { ncrId: true, type: true, sku: true, severity: true, status: true, dateRaised: true, dueDate: true, description: true } as const;
    const [total, rows] = await Promise.all([
      prisma.ncr.count({ where }),
      prisma.ncr.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { dateRaised: "desc" } }),
    ]);
    return {
      columns: [
        { key: "ncrId", label: "NCR #" }, { key: "type", label: "Type" },
        { key: "sku", label: "SKU" }, { key: "severity", label: "Severity" },
        { key: "status", label: "Status" }, { key: "dateRaised", label: "Date Raised" },
        { key: "dueDate", label: "Due Date" }, { key: "description", label: "Description" },
      ],
      rows: rows.map(r => ({ ncrId: r.ncrId, type: r.type, sku: s(r.sku), severity: s(r.severity), status: r.status, dateRaised: s(r.dateRaised), dueDate: s(r.dueDate), description: r.description })),
      total,
    };
  }

  if (entity === "Capa") {
    const where = {
      ...(q && { OR: [{ capaId: { contains: q, ...ci } }, { title: { contains: q, ...ci } }] }),
    };
    const sel = { capaId: true, type: true, title: true, status: true, priority: true, dateOpened: true, targetCloseDate: true } as const;
    const [total, rows] = await Promise.all([
      prisma.capa.count({ where }),
      prisma.capa.findMany({ where, select: sel, skip, take: PAGE_SIZE, orderBy: { dateOpened: "desc" } }),
    ]);
    return {
      columns: [
        { key: "capaId", label: "CAPA #" }, { key: "type", label: "Type" },
        { key: "title", label: "Title" }, { key: "status", label: "Status" },
        { key: "priority", label: "Priority" }, { key: "dateOpened", label: "Opened" },
        { key: "targetCloseDate", label: "Target Close" },
      ],
      rows: rows.map(r => ({ capaId: r.capaId, type: r.type, title: r.title, status: r.status, priority: s(r.priority), dateOpened: s(r.dateOpened), targetCloseDate: s(r.targetCloseDate) })),
      total,
    };
  }

  return { columns: [], rows: [], total: 0 };
}

// ── Entity counts for sidebar ──────────────────────────────────────────────────

async function getAllCounts(orgId: string): Promise<Record<string, number>> {
  const [
    // Master Data
    product, supplier, customer, location,
    // Finance
    exchangeRate, priceList, priceListLine, customerPriceList,
    // Engineering
    bomHeader, bom, bomLine, routing, routingOperation, workCenter,
    shiftCalendar, equipment, maintenanceLog,
    // Inventory
    inventoryItem, lot, serialNumber, stockMovement,
    // Procurement
    supplierItem, purchaseOrder, poLine,
    // Planning
    forecast, mps,
    // Production
    workOrder, workOrderOperation,
    // Sales & Fulfilment
    salesOrder, salesOrderLine, shipment, shipmentLine, invoice, returnRma, order,
    // Quality
    qcInspection, ncr, capa,
  ] = await Promise.all([
    // Master Data
    prisma.product.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.customer.count({ where: { orgId } }),
    prisma.location.count({ where: { organizationId: orgId } }),
    // Finance
    prisma.exchangeRate.count(),
    prisma.priceList.count(),
    prisma.priceListLine.count(),
    prisma.customerPriceList.count(),
    // Engineering
    prisma.bOMHeader.count({ where: { orgId } }),
    prisma.bOMItem.count({ where: { parent: { organizationId: orgId } } }),
    prisma.bOMLine.count({ where: { bomHeader: { orgId } } }),
    prisma.routing.count({ where: { organizationId: orgId } }),
    prisma.routingOperation.count({ where: { routing: { organizationId: orgId } } }),
    prisma.workCenter.count({ where: { organizationId: orgId } }),
    prisma.shiftCalendar.count(),
    prisma.equipment.count({ where: { orgId } }),
    prisma.maintenanceLog.count({ where: { equipment: { orgId } } }),
    // Inventory
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.lot.count({ where: { orgId } }),
    prisma.serialNumber.count(),
    prisma.stockMovement.count({ where: { orgId } }),
    // Procurement
    prisma.supplierItem.count({ where: { orgId } }),
    prisma.purchaseOrder.count({ where: { orgId } }),
    prisma.pOLine.count({ where: { purchaseOrder: { orgId } } }),
    // Planning
    prisma.forecastEntry.count({ where: { organizationId: orgId } }),
    prisma.mpsEntry.count({ where: { organizationId: orgId } }),
    // Production
    prisma.workOrder.count({ where: { organizationId: orgId } }),
    prisma.workOrderOperation.count({ where: { workOrder: { organizationId: orgId } } }),
    // Sales & Fulfilment
    prisma.salesOrder.count({ where: { orgId } }),
    prisma.sOLine.count({ where: { salesOrder: { orgId } } }),
    prisma.shipment.count(),
    prisma.shipmentLine.count(),
    prisma.invoice.count(),
    prisma.returnRma.count(),
    prisma.order.count({ where: { organizationId: orgId } }),
    // Quality
    prisma.qCInspection.count({ where: { orgId } }),
    prisma.ncr.count(),
    prisma.capa.count(),
  ]);
  return {
    Product: product, Supplier: supplier, Customer: customer, Location: location,
    ExchangeRate: exchangeRate, PriceList: priceList, PriceListLine: priceListLine, CustomerPriceList: customerPriceList,
    BOMHeader: bomHeader, BOM: bom, BOMLine: bomLine, Routing: routing, RoutingOperation: routingOperation,
    WorkCenter: workCenter, ShiftCalendar: shiftCalendar, Equipment: equipment, MaintenanceLog: maintenanceLog,
    InventoryItem: inventoryItem, Lot: lot, SerialNumber: serialNumber, StockMovement: stockMovement,
    SupplierItem: supplierItem, PurchaseOrder: purchaseOrder, POLine: poLine,
    ForecastEntry: forecast, MpsEntry: mps,
    WorkOrder: workOrder, WorkOrderOperation: workOrderOperation,
    SalesOrder: salesOrder, SalesOrderLine: salesOrderLine, Shipment: shipment, ShipmentLine: shipmentLine,
    Invoice: invoice, ReturnRma: returnRma, Order: order,
    QcInspection: qcInspection, Ncr: ncr, Capa: capa,
  };
}

// ── Route handlers ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entity = searchParams.get("entity") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const q = (searchParams.get("q") ?? "").trim();
  const countsOnly = searchParams.get("counts") === "1";

  if (countsOnly) {
    const counts = await getAllCounts(ctx.org.id);
    return NextResponse.json({ counts });
  }

  if (!entity) return NextResponse.json({ error: "entity param required" }, { status: 400 });

  try {
    const { columns, rows, total } = await queryEntity(entity, ctx.org.id, page, q);

    return NextResponse.json({
      columns,
      rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  } catch (err) {
    console.error(`[explore] Error querying ${entity}:`, err);
    return NextResponse.json(
      { error: `Failed to query ${entity}`, columns: [], rows: [], total: 0, page: 1, pages: 1 },
      { status: 500 },
    );
  }
}
