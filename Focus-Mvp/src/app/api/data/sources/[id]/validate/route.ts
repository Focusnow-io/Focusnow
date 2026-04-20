/**
 * Dry-run validation — scan all rows for missing required fields and type
 * errors without writing anything to the database.
 *
 * POST /api/data/sources/:id/validate
 * Returns: { valid, invalid, total, errors: [{ row, field, message }] }
 */
import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { applyMapping, CANONICAL_FIELDS, type EntityType, type MappingConfig } from "@/lib/ingestion/field-mapper";
import { loadRowsFromConfig } from "@/lib/ingestion/source-loader";

interface ValidationError {
  row: number;
  field: string;
  message: string;
}

// Spreadsheet null-like placeholders that should be treated as "no value"
// rather than a type error. These are coerced to null during processing.
const NULL_LIKE_VALUES = new Set([
  "#n/a", "n/a", "na", "#na", "#null!", "null", "none",
  "#value!", "#ref!", "#div/0!", "#name?", "#num!", "#error!",
  "-", "--", "—",
]);
function isNullLike(v: string): boolean {
  return NULL_LIKE_VALUES.has(v.trim().toLowerCase());
}

// Required fields per entity
const REQUIRED_FIELDS: Record<EntityType, string[]> = {
  Product: ["sku", "name"],
  Supplier: ["code", "name"],
  InventoryItem: ["sku", "quantity"],
  Order: ["orderNumber"],
  BOM: ["parentSku", "componentSku", "quantity"],
  ForecastEntry: ["sku", "period", "forecastQty"],
  MpsEntry: ["sku", "period", "plannedQty"],
  WorkOrder: ["orderNumber", "sku", "plannedQty"],
  Routing: ["sku", "operationNo", "workCenter"],
  WorkCenter: ["code", "name"],
  // Manufacturing canonical
  Customer: ["code", "name"],
  PurchaseOrder: ["poNumber", "supplierId"],
  POLine: ["purchaseOrderId", "sku", "qtyOrdered"],
  SalesOrder: ["soNumber", "customerId"],
  BOMHeader: ["productId", "version"],
  Equipment: ["code", "name"],
  // Additional canonical entities
  Location: ["locationId", "name"],
  Employee: ["employeeId", "name"],
  ExchangeRate: ["fromCurrency", "toCurrency", "rateDate", "rate"],
  PriceList: ["priceListId", "name"],
  PriceListLine: ["priceListId", "sku", "unitPrice"],
  CustomerPriceList: ["customerId", "priceListId", "validFrom"],
  BOMLine: ["bomId", "componentSku", "qtyPer"],
  RoutingHeader: ["routingId", "sku", "revision"],
  RoutingOperation: ["routingId", "opNumber", "operationName", "workCentreId"],
  ShiftCalendar: ["date", "workCentreId", "shift"],
  MaintenanceLog: ["logId", "equipmentId", "date", "type"],
  Lot: ["lotNumber", "sku"],
  SerialNumber: ["serialNumber", "sku"],
  StockMovement: ["movementId", "date", "sku", "qty"],
  SupplierItem: ["supplierId", "sku"],
  WorkOrderOperation: ["workOrderId", "opNumber", "operationName"],
  SalesOrderLine: ["soId", "lineNumber", "sku", "qtyOrdered"],
  Shipment: ["shipmentId", "customerId"],
  ShipmentLine: ["shipmentId", "lineNumber", "sku", "qtyShipped"],
  Invoice: ["invoiceId", "customerId", "invoiceDate", "totalAmount"],
  ReturnRma: ["rmaId", "customerId", "sku", "qty"],
  QcInspection: ["inspectionId", "type", "inspectedDate"],
  Ncr: ["ncrId", "dateRaised", "type", "description"],
  Capa: ["capaId", "type", "dateOpened", "title", "description"],
};

// Numeric fields that must be parseable as a number
const NUMERIC_FIELDS: Partial<Record<EntityType, string[]>> = {
  Product: ["unitCost", "shelfLifeDays", "listPrice"],
  Supplier: ["leadTimeDays", "qualityRating", "onTimePct"],
  InventoryItem: ["quantity", "reorderPoint", "reorderQty", "unitCost", "totalValue"],
  Order: ["totalAmount"],
  BOM: ["quantity", "scrapFactor"],
  ForecastEntry: ["forecastQty"],
  MpsEntry: ["plannedQty", "confirmedQty"],
  WorkOrder: ["plannedQty", "actualQty", "yieldPct"],
  Routing: ["operationNo", "setupTimeMins", "runTimeMins"],
  WorkCenter: ["availableHoursPerWeek", "efficiency", "costRatePerHour", "capacityHrsDay", "operatorsPerShift", "shiftsPerDay", "availableDaysWeek", "oeeTargetPct", "oeeCurrentPct"],
  // Manufacturing canonical
  Customer: ["creditLimit"],
  PurchaseOrder: ["totalAmount", "totalLines"],
  POLine: ["lineNumber", "qtyOrdered", "qtyReceived", "qtyOpen", "unitCost", "lineValue"],
  SalesOrder: ["totalAmount"],
  BOMHeader: ["totalComponents", "totalBomCost"],
  Equipment: [],
  // Additional canonical entities
  Location: [],
  Employee: [],
  ExchangeRate: ["rate"],
  PriceList: [],
  PriceListLine: ["unitPrice", "minQty", "discountPct"],
  CustomerPriceList: ["priority"],
  BOMLine: ["qtyPer", "lineNumber", "componentCost", "extendedCost"],
  RoutingHeader: [],
  RoutingOperation: ["opNumber", "setupMin", "runMinPerUnit", "yieldPct", "effRunMin", "lotSize"],
  ShiftCalendar: ["availableHrs"],
  MaintenanceLog: ["durationHrs", "cost", "maintenanceIntervalDays"],
  Lot: ["currentQty"],
  SerialNumber: [],
  StockMovement: ["qty"],
  SupplierItem: ["unitCost", "leadTimeDays", "moq", "orderMultiple", "qualityRating"],
  WorkOrderOperation: ["opNumber", "plannedSetupMin", "plannedRunMin", "actualSetupMin", "actualRunMin", "qtyIn", "qtyGood", "qtyScrapped"],
  SalesOrderLine: ["lineNumber", "qtyOrdered", "unitPrice", "discount", "lineTotal", "qtyShipped"],
  Shipment: ["totalQty", "totalValue"],
  ShipmentLine: ["lineNumber", "qtyShipped"],
  Invoice: ["subtotal", "taxAmount", "totalAmount"],
  ReturnRma: ["qty"],
  QcInspection: ["sampleSize", "passQty", "failQty"],
  Ncr: ["qtyAffected"],
  Capa: [],
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const source = await prisma.dataSource.findFirst({
    where: { id, organizationId: ctx.org.id },
  });
  if (!source) return notFound();

  const config = source.mappingConfig as MappingConfig | null;

  if (!config) {
    return NextResponse.json({ error: "No mapping configured" }, { status: 400 });
  }

  const rows = await loadRowsFromConfig(config);
  const { entity, mapping } = config;
  const requiredFields = REQUIRED_FIELDS[entity] ?? [];
  const numericFields = NUMERIC_FIELDS[entity] ?? [];

  // Pre-build label lookup to avoid O(n·fields) linear scans inside the row loop
  const fieldLabelMap = Object.fromEntries(
    CANONICAL_FIELDS[entity].map((f) => [f.field, f.label])
  );

  const errors: ValidationError[] = [];
  let valid = 0;

  for (let i = 0; i < rows.length; i++) {
    const canonical = applyMapping(rows[i], mapping);
    const rowErrors: ValidationError[] = [];

    // Required field check — use == null instead of falsy guard so that
    // numeric zero values ("0" or 0 from XLSX) are not treated as missing.
    for (const field of requiredFields) {
      const val = canonical[field];
      if (val == null || String(val).trim() === "") {
        rowErrors.push({
          row: i + 1,
          field,
          message: `Missing required field: ${fieldLabelMap[field] ?? field}`,
        });
      }
    }

    // Numeric type check — skip null-like placeholders (#N/A, N/A, null, etc.)
    // that spreadsheets emit for missing values; they're coerced to null during
    // processing and don't represent a real data-quality issue.
    for (const field of numericFields) {
      const val = canonical[field];
      if (val && !isNullLike(val) && isNaN(Number(val.replace(/,/g, "")))) {
        rowErrors.push({
          row: i + 1,
          field,
          message: `"${val}" is not a valid number for ${fieldLabelMap[field] ?? field}`,
        });
      }
    }

    if (rowErrors.length === 0) {
      valid++;
    } else {
      errors.push(...rowErrors);
    }
  }

  const invalid = rows.length - valid;

  return NextResponse.json({
    total: rows.length,
    valid,
    invalid,
    // Cap errors at 50 to avoid huge payloads
    errors: errors.slice(0, 50),
    hasMore: errors.length > 50,
  });
}
