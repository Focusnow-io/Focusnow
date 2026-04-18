import { getRegistryForEntity } from "./column-registry";

// Lazy import for the canonical column registry — optional dependency that may
// not be present during the initial migration window. When available, alias
// lookups use REGISTRY_BY_ALIAS for O(1) matching across all 37 entities.
let _registryByAlias: Record<string, { canonicalName: string; entityName: string }> = {};
let _registryByAliasLoaded = false;
function getRegistryByAlias(): Record<string, { canonicalName: string; entityName: string }> {
  if (!_registryByAliasLoaded) {
    _registryByAliasLoaded = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./column-registry");
      _registryByAlias = mod.REGISTRY_BY_ALIAS ?? {};
    } catch {
      _registryByAlias = {};
    }
  }
  return _registryByAlias;
}

// Canonical field definitions for each entity type
export const CANONICAL_FIELDS = {
  Product: [
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "name", label: "Product Name", required: true },
    { field: "description", label: "Description", required: false },
    { field: "category", label: "Category", required: false },
    { field: "unit", label: "Unit of Measure", required: false },
    { field: "unitCost", label: "Unit Cost", required: false },
    { field: "externalId", label: "External ID", required: false },
    // Manufacturing canonical fields
    { field: "type", label: "Product Type", required: false },
    { field: "uom", label: "UOM (Canonical)", required: false },
    { field: "unitPrice", label: "Unit Price", required: false },
    { field: "leadTimeDays", label: "Lead Time (Days)", required: false },
    { field: "safetyStock", label: "Safety Stock", required: false },
    { field: "reorderPoint", label: "Reorder Point", required: false },
    { field: "makeBuy", label: "Make / Buy", required: false },
    // v3 canonical additions
    { field: "productFamily", label: "Product Family", required: false },
    { field: "shelfLifeDays", label: "Shelf Life (Days)", required: false },
    { field: "drawingNumber", label: "Drawing Number", required: false },
    { field: "drawingRevision", label: "Drawing Revision", required: false },
    { field: "abcClass", label: "ABC Class", required: false },
    { field: "productLine", label: "Product Line", required: false },
    { field: "regulatoryClass", label: "Regulatory Class", required: false },
    { field: "listPrice", label: "List Price", required: false },
  ],
  Supplier: [
    { field: "code", label: "Supplier Code", required: true, identity: true },
    { field: "name", label: "Supplier Name", required: true },
    { field: "email", label: "Email", required: false },
    { field: "phone", label: "Phone", required: false },
    { field: "country", label: "Country", required: false },
    { field: "leadTimeDays", label: "Lead Time (Days)", required: false },
    { field: "paymentTerms", label: "Payment Terms", required: false },
    // v3 canonical additions
    { field: "city", label: "City", required: false },
    { field: "leadTimeCategory", label: "Lead Time Category", required: false },
    { field: "qualityRating", label: "Quality Rating", required: false },
    { field: "onTimePct", label: "On-Time Delivery %", required: false },
    { field: "certifications", label: "Certifications", required: false },
    { field: "status", label: "Status", required: false },
    { field: "approvedSince", label: "Approved Since", required: false },
  ],
  InventoryItem: [
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "quantity", label: "Quantity on Hand", required: true },
    { field: "locationCode", label: "Location Code", required: false },
    { field: "reorderPoint", label: "Reorder Point", required: true },
    { field: "safetyStock", label: "Safety Stock", required: false },
    { field: "reorderQty", label: "Reorder Quantity", required: false },
    { field: "uom", label: "Unit of Measure", required: false },
    { field: "unitCost", label: "Unit Cost", required: false },
    { field: "totalValue", label: "Total Value", required: false },
    // v2 fields
    { field: "qtyOnHold", label: "On Hold / QC Quantity", required: false },
    { field: "qtyOnHandTotal", label: "Total On-Hand", required: false },
    { field: "qtyOpenPO", label: "Open PO Quantity", required: false },
    { field: "qtyOnHandPlusPO", label: "On-Hand + Firmed POs", required: false },
    { field: "demandCurrentMonth", label: "Current Month Demand", required: false },
    { field: "demandNextMonth", label: "Next Month Demand", required: false },
    { field: "demandMonth3", label: "Next 2 Month Demand", required: false },
    { field: "demandPerDay", label: "Demand Per Day", required: false },
    { field: "daysOfSupply", label: "Days of Supply", required: false },
    { field: "lastReceiptDate", label: "Last Receipt Date", required: false },
    { field: "buyRecommendation", label: "Buy Recommendation", required: false },
    { field: "recommendedQty", label: "Recommended Quantity", required: false },
    { field: "moq", label: "Minimum Order Quantity", required: false },
    { field: "orderMultiple", label: "Order Multiple", required: false },
    { field: "leadTimeDays", label: "Lead Time (Days)", required: false },
  ],
  Order: [
    { field: "orderNumber", label: "Order Number", required: true, identity: true },
    { field: "type", label: "Order Type (PURCHASE/SALES)", required: false },
    { field: "supplierCode", label: "Supplier Code", required: false },
    { field: "status", label: "Status", required: false },
    { field: "orderDate", label: "Order Date", required: false },
    { field: "expectedDate", label: "Expected Date", required: false },
    { field: "totalAmount", label: "Total Amount", required: false },
  ],
  BOM: [
    { field: "parentSku", label: "Parent / Finished Good SKU", required: true, identity: true },
    { field: "componentSku", label: "Component / Raw Material SKU", required: true, identity: true },
    { field: "quantity", label: "Quantity Per", required: true },
    { field: "unit", label: "Unit of Measure", required: false },
    { field: "scrapFactor", label: "Scrap Factor (%)", required: false },
    { field: "parentName", label: "Parent Product Name", required: false },
    { field: "componentName", label: "Component Product Name", required: false },
  ],
  ForecastEntry: [
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "period", label: "Period / Date", required: true, identity: true },
    { field: "forecastQty", label: "Forecast Quantity", required: true },
    { field: "channel", label: "Sales Channel", required: false },
    { field: "version", label: "Forecast Version / Scenario", required: false },
    { field: "forecastUnit", label: "Unit of Measure", required: false },
  ],
  MpsEntry: [
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "period", label: "Period / Date", required: true, identity: true },
    { field: "plannedQty", label: "Planned Quantity", required: true },
    { field: "confirmedQty", label: "Confirmed Quantity", required: false },
    { field: "workCenter", label: "Work Center / Line", required: false },
  ],
  WorkOrder: [
    { field: "orderNumber", label: "Work Order Number", required: true, identity: true },
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "plannedQty", label: "Planned Quantity", required: true },
    { field: "workCenter", label: "Work Center / Line", required: false },
    { field: "scheduledDate", label: "Scheduled Start Date", required: false },
    { field: "dueDate", label: "Due Date", required: false },
    { field: "status", label: "Status", required: false },
    { field: "actualQty", label: "Actual Quantity Completed", required: false },
    { field: "unit", label: "Unit of Measure", required: false },
    // Manufacturing canonical aliases
    { field: "woNumber", label: "WO Number (Canonical)", required: false },
    { field: "qtyPlanned", label: "Planned Qty (Canonical)", required: false },
    // v3 canonical additions
    { field: "routingId", label: "Routing ID", required: false },
    { field: "productionLine", label: "Production Line", required: false },
    { field: "yieldPct", label: "Yield %", required: false },
    { field: "lotNumber", label: "Lot / Batch Number", required: false },
    { field: "operatorLeadId", label: "Operator Lead ID", required: false },
  ],
  Routing: [
    { field: "sku", label: "SKU / Product Code", required: true, identity: true },
    { field: "operationNo", label: "Operation Number", required: true, identity: true },
    { field: "workCenter", label: "Work Center / Line", required: true },
    { field: "description", label: "Operation Description", required: false },
    { field: "setupTimeMins", label: "Setup Time (mins)", required: false },
    { field: "runTimeMins", label: "Run Time per Unit (mins)", required: false },
    { field: "runTimeUnit", label: "Run Time Unit", required: false },
    // v3 canonical additions
    { field: "status", label: "Status", required: false },
    { field: "effectiveFrom", label: "Effective From", required: false },
    { field: "effectiveTo", label: "Effective To", required: false },
    { field: "approvedBy", label: "Approved By", required: false },
    { field: "approvalDate", label: "Approval Date", required: false },
  ],
  WorkCenter: [
    { field: "code", label: "Work Center Code", required: true, identity: true },
    { field: "name", label: "Work Center Name", required: true },
    { field: "description", label: "Description", required: false },
    { field: "availableHoursPerWeek", label: "Available Hours / Week", required: false },
    { field: "efficiency", label: "Efficiency (%)", required: false },
    { field: "costRatePerHour", label: "Cost Rate per Hour", required: false },
    { field: "calendar", label: "Shift / Calendar Code", required: false },
    // v3 canonical additions
    { field: "department", label: "Department", required: false },
    { field: "capacityHrsDay", label: "Capacity Hours / Day", required: false },
    { field: "operatorsPerShift", label: "Operators per Shift", required: false },
    { field: "shiftsPerDay", label: "Shifts per Day", required: false },
    { field: "availableDaysWeek", label: "Available Days / Week", required: false },
    { field: "oeeTargetPct", label: "OEE Target %", required: false },
    { field: "oeeCurrentPct", label: "OEE Current %", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  // ── Manufacturing canonical entities ──────────────────────
  Customer: [
    { field: "code", label: "Customer Code", required: true, identity: true },
    { field: "name", label: "Customer Name", required: true },
    { field: "contactName", label: "Contact Name", required: false },
    { field: "email", label: "Email", required: false },
    { field: "phone", label: "Phone", required: false },
    { field: "country", label: "Country", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "paymentTerms", label: "Payment Terms", required: false },
    { field: "creditLimit", label: "Credit Limit", required: false },
    // v3 canonical additions
    { field: "type", label: "Customer Type", required: false },
    { field: "city", label: "City", required: false },
    { field: "vatNumber", label: "VAT Number", required: false },
    { field: "accountManagerId", label: "Account Manager ID", required: false },
    { field: "status", label: "Status", required: false },
    { field: "sinceDate", label: "Customer Since Date", required: false },
  ],
  PurchaseOrder: [
    { field: "poNumber", label: "PO Number", required: true, identity: true },
    { field: "supplierId", label: "Supplier ID / Code", required: true },
    { field: "status", label: "Status", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "totalAmount", label: "Total Amount", required: false },
    { field: "expectedDate", label: "Expected Date", required: false },
    { field: "notes", label: "Notes", required: false },
    // v3 canonical additions
    { field: "orderDate", label: "Order Date", required: false },
    { field: "totalLines", label: "Total Lines", required: false },
    { field: "buyerId", label: "Buyer ID", required: false },
    { field: "approvedBy", label: "Approved By", required: false },
    { field: "poType", label: "PO Type", required: false },
  ],
  POLine: [
    { field: "purchaseOrderId", label: "PO Number / ID", required: true, identity: true },
    { field: "lineNumber", label: "Line Number", required: false },
    { field: "sku", label: "Item Code / SKU", required: true, identity: true },
    { field: "itemName", label: "Item Name / Description", required: false },
    { field: "qtyOrdered", label: "Qty Ordered", required: true },
    { field: "unitCost", label: "Unit Cost / Price", required: false },
    { field: "qtyReceived", label: "Qty Received", required: false },
    { field: "qtyOpen", label: "Open / Outstanding Qty", required: false },
    { field: "uom", label: "Unit of Measure", required: false },
    { field: "lineValue", label: "Line Value / Total", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "expectedDate", label: "Expected / Delivery Date", required: false },
    { field: "confirmedETA", label: "Confirmed ETA", required: false },
    { field: "orderDate", label: "Order Date", required: false },
    { field: "status", label: "Line Status", required: false },
    { field: "supplierId", label: "Supplier ID / Code", required: false },
    { field: "supplierName", label: "Supplier Name", required: false },
    { field: "buyer", label: "Buyer / Purchaser", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  SalesOrder: [
    { field: "soNumber", label: "SO Number", required: true, identity: true },
    { field: "customerId", label: "Customer ID / Code", required: true },
    { field: "status", label: "Status", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "totalAmount", label: "Total Amount", required: false },
    { field: "requestedDate", label: "Requested Date", required: false },
    { field: "shippingAddress", label: "Shipping Address", required: false },
    { field: "notes", label: "Notes", required: false },
    // v3 canonical additions
    { field: "orderDate", label: "Order Date", required: false },
    { field: "actualShipDate", label: "Actual Ship Date", required: false },
    { field: "paymentTerms", label: "Payment Terms", required: false },
    { field: "salesRepId", label: "Sales Rep ID", required: false },
    { field: "incoterms", label: "Incoterms", required: false },
    { field: "shipToLocationId", label: "Ship-To Location ID", required: false },
    { field: "customerPoRef", label: "Customer PO Reference", required: false },
  ],
  BOMHeader: [
    { field: "productId", label: "Product ID / SKU", required: true, identity: true },
    { field: "version", label: "BOM Version / Revision", required: true },
    { field: "isActive", label: "Is Active", required: false },
    { field: "effectiveFrom", label: "Effective From", required: false },
    { field: "effectiveTo", label: "Effective To", required: false },
    { field: "yieldPct", label: "Yield %", required: false },
    { field: "notes", label: "Notes", required: false },
    // v3 canonical additions
    { field: "status", label: "BOM Status", required: false },
    { field: "totalComponents", label: "Total Components", required: false },
    { field: "totalBomCost", label: "Total BOM Cost", required: false },
    { field: "applicableStandard", label: "Applicable Standard", required: false },
    { field: "createdBy", label: "Created By", required: false },
    { field: "approvedBy", label: "Approved By", required: false },
    { field: "approvalDate", label: "Approval Date", required: false },
  ],
  Equipment: [
    { field: "code", label: "Equipment Code / Asset Tag", required: true, identity: true },
    { field: "name", label: "Equipment Name", required: true },
    { field: "status", label: "Status", required: false },
    { field: "type", label: "Equipment Type", required: false },
    { field: "serialNumber", label: "Serial Number", required: false },
    { field: "manufacturer", label: "Manufacturer", required: false },
    { field: "purchasedAt", label: "Purchase Date", required: false },
    { field: "warrantyExpiry", label: "Warranty Expiry", required: false },
    // v3 canonical additions
    { field: "installationDate", label: "Installation Date", required: false },
    { field: "maintenanceIntervalDays", label: "Maintenance Interval (Days)", required: false },
    { field: "lastPmDate", label: "Last PM Date", required: false },
    { field: "calibrationDue", label: "Calibration Due", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  // ── Additional canonical entities ──────────────────────────
  Location: [
    { field: "locationId", label: "Location ID", required: true, identity: true },
    { field: "name", label: "Name", required: true },
    { field: "type", label: "Type", required: false },
    { field: "city", label: "City", required: false },
    { field: "countryCode", label: "Country Code", required: false },
    { field: "isActive", label: "Is Active", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  Employee: [
    { field: "employeeId", label: "Employee ID", required: true, identity: true },
    { field: "name", label: "Name", required: true },
    { field: "department", label: "Department", required: false },
    { field: "role", label: "Role", required: false },
    { field: "workCentreId", label: "Work Centre ID", required: false },
    { field: "competencyLevel", label: "Competency Level", required: false },
    { field: "skills", label: "Skills", required: false },
    { field: "startDate", label: "Start Date", required: false },
    { field: "status", label: "Status", required: false },
  ],
  ExchangeRate: [
    { field: "fromCurrency", label: "From Currency", required: true, identity: true },
    { field: "toCurrency", label: "To Currency", required: true, identity: true },
    { field: "rateDate", label: "Rate Date", required: true, identity: true },
    { field: "rate", label: "Rate", required: true },
    { field: "rateType", label: "Rate Type", required: false },
    { field: "source", label: "Source", required: false },
  ],
  PriceList: [
    { field: "priceListId", label: "Price List ID", required: true, identity: true },
    { field: "name", label: "Name", required: true },
    { field: "type", label: "Type", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "validFrom", label: "Valid From", required: false },
    { field: "validTo", label: "Valid To", required: false },
    { field: "status", label: "Status", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  PriceListLine: [
    { field: "priceListId", label: "Price List ID", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "unitPrice", label: "Unit Price", required: true },
    { field: "minQty", label: "Min Qty", required: false },
    { field: "discountPct", label: "Discount %", required: false },
    { field: "validFrom", label: "Valid From", required: false },
    { field: "validTo", label: "Valid To", required: false },
  ],
  CustomerPriceList: [
    { field: "customerId", label: "Customer ID", required: true, identity: true },
    { field: "priceListId", label: "Price List ID", required: true, identity: true },
    { field: "validFrom", label: "Valid From", required: true },
    { field: "validTo", label: "Valid To", required: false },
    { field: "priority", label: "Priority", required: false },
  ],
  BOMLine: [
    { field: "bomId", label: "BOM ID", required: true, identity: true },
    { field: "componentSku", label: "Component SKU", required: true, identity: true },
    { field: "qtyPer", label: "Qty Per", required: true },
    { field: "lineNumber", label: "Line Number", required: false },
    { field: "section", label: "Section", required: false },
    { field: "uom", label: "UOM", required: false },
    { field: "componentCost", label: "Component Cost", required: false },
    { field: "extendedCost", label: "Extended Cost", required: false },
    { field: "makeBuy", label: "Make / Buy", required: false },
    { field: "isCritical", label: "Is Critical", required: false },
    { field: "approvedSubSku", label: "Approved Sub SKU", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  RoutingHeader: [
    { field: "routingId", label: "Routing ID", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "revision", label: "Revision", required: true },
    { field: "status", label: "Status", required: false },
    { field: "effectiveFrom", label: "Effective From", required: false },
    { field: "effectiveTo", label: "Effective To", required: false },
    { field: "approvedBy", label: "Approved By", required: false },
    { field: "approvalDate", label: "Approval Date", required: false },
  ],
  RoutingOperation: [
    { field: "routingId", label: "Routing ID", required: true, identity: true },
    { field: "opNumber", label: "Operation Number", required: true, identity: true },
    { field: "operationName", label: "Operation Name", required: true },
    { field: "workCentreId", label: "Work Centre ID", required: true },
    { field: "productionLine", label: "Production Line", required: false },
    { field: "setupMin", label: "Setup Minutes", required: false },
    { field: "runMinPerUnit", label: "Run Min Per Unit", required: false },
    { field: "yieldPct", label: "Yield %", required: false },
    { field: "effRunMin", label: "Effective Run Min", required: false },
    { field: "lotSize", label: "Lot Size", required: false },
    { field: "inspectionRequired", label: "Inspection Required", required: false },
    { field: "requiredSkill", label: "Required Skill", required: false },
    { field: "certOperatorRequired", label: "Cert Operator Required", required: false },
  ],
  ShiftCalendar: [
    { field: "date", label: "Date", required: true, identity: true },
    { field: "workCentreId", label: "Work Centre ID", required: true, identity: true },
    { field: "shift", label: "Shift", required: true },
    { field: "startTime", label: "Start Time", required: false },
    { field: "endTime", label: "End Time", required: false },
    { field: "availableHrs", label: "Available Hours", required: false },
    { field: "status", label: "Status", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  MaintenanceLog: [
    { field: "logId", label: "Log ID", required: true, identity: true },
    { field: "equipmentId", label: "Equipment ID", required: true },
    { field: "date", label: "Date", required: true },
    { field: "type", label: "Type", required: true },
    { field: "performedBy", label: "Performed By", required: false },
    { field: "performedByExternal", label: "Performed By (External)", required: false },
    { field: "durationHrs", label: "Duration (Hours)", required: false },
    { field: "partsUsed", label: "Parts Used", required: false },
    { field: "cost", label: "Cost", required: false },
    { field: "result", label: "Result", required: false },
    { field: "nextDue", label: "Next Due", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  Lot: [
    { field: "lotNumber", label: "Lot Number", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "lotType", label: "Lot Type", required: false },
    { field: "originType", label: "Origin Type", required: false },
    { field: "supplierBatch", label: "Supplier Batch", required: false },
    { field: "supplierId", label: "Supplier ID", required: false },
    { field: "receivedDate", label: "Received Date", required: false },
    { field: "mfgDate", label: "Manufacturing Date", required: false },
    { field: "expiryDate", label: "Expiry Date", required: false },
    { field: "currentQty", label: "Current Qty", required: false },
    { field: "locationId", label: "Location ID", required: false },
    { field: "qcStatus", label: "QC Status", required: false },
    { field: "qcInspectionId", label: "QC Inspection ID", required: false },
    { field: "holdReason", label: "Hold Reason", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  SerialNumber: [
    { field: "serialNumber", label: "Serial Number", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "lotNumber", label: "Lot Number", required: false },
    { field: "workOrderId", label: "Work Order ID", required: false },
    { field: "productionDate", label: "Production Date", required: false },
    { field: "soId", label: "Sales Order ID", required: false },
    { field: "customerId", label: "Customer ID", required: false },
    { field: "shipDate", label: "Ship Date", required: false },
    { field: "status", label: "Status", required: false },
    { field: "locationId", label: "Location ID", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  StockMovement: [
    { field: "movementId", label: "Movement ID", required: true, identity: true },
    { field: "date", label: "Date", required: true },
    { field: "sku", label: "SKU", required: true },
    { field: "fromLocationId", label: "From Location ID", required: false },
    { field: "toLocationId", label: "To Location ID", required: false },
    { field: "qty", label: "Qty", required: true },
    { field: "uom", label: "UOM", required: false },
    { field: "refType", label: "Reference Type", required: false },
    { field: "refId", label: "Reference ID", required: false },
    { field: "lotNumber", label: "Lot Number", required: false },
    { field: "serialNumber", label: "Serial Number", required: false },
    { field: "reason", label: "Reason", required: false },
    { field: "createdBy", label: "Created By", required: false },
  ],
  SupplierItem: [
    { field: "supplierId", label: "Supplier ID", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "supplierPartNumber", label: "Supplier Part Number", required: false },
    { field: "unitCost", label: "Unit Cost", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "leadTimeDays", label: "Lead Time (Days)", required: false },
    { field: "moq", label: "MOQ", required: false },
    { field: "orderMultiple", label: "Order Multiple", required: false },
    { field: "status", label: "Status", required: false },
    { field: "validFrom", label: "Valid From", required: false },
    { field: "validTo", label: "Valid To", required: false },
    { field: "countryOfOrigin", label: "Country of Origin", required: false },
    { field: "qualityRating", label: "Quality Rating", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  WorkOrderOperation: [
    { field: "woOpId", label: "WO Operation ID", required: false },
    { field: "workOrderId", label: "Work Order ID", required: true, identity: true },
    { field: "opNumber", label: "Operation Number", required: true, identity: true },
    { field: "routingOpId", label: "Routing Operation ID", required: false },
    { field: "operationName", label: "Operation Name", required: true },
    { field: "workCentreId", label: "Work Centre ID", required: false },
    { field: "productionLine", label: "Production Line", required: false },
    { field: "equipmentId", label: "Equipment ID", required: false },
    { field: "operatorId", label: "Operator ID", required: false },
    { field: "plannedSetupMin", label: "Planned Setup Min", required: false },
    { field: "plannedRunMin", label: "Planned Run Min", required: false },
    { field: "actualSetupMin", label: "Actual Setup Min", required: false },
    { field: "actualRunMin", label: "Actual Run Min", required: false },
    { field: "qtyIn", label: "Qty In", required: false },
    { field: "qtyGood", label: "Qty Good", required: false },
    { field: "qtyScrapped", label: "Qty Scrapped", required: false },
    { field: "scrapReason", label: "Scrap Reason", required: false },
    { field: "startTime", label: "Start Time", required: false },
    { field: "endTime", label: "End Time", required: false },
    { field: "status", label: "Status", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  SalesOrderLine: [
    { field: "soId", label: "Sales Order ID", required: true, identity: true },
    { field: "lineNumber", label: "Line Number", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "qtyOrdered", label: "Qty Ordered", required: true },
    { field: "unitPrice", label: "Unit Price", required: false },
    { field: "discount", label: "Discount", required: false },
    { field: "lineTotal", label: "Line Total", required: false },
    { field: "requestedDate", label: "Requested Date", required: false },
    { field: "promisedDate", label: "Promised Date", required: false },
    { field: "qtyShipped", label: "Qty Shipped", required: false },
    { field: "status", label: "Status", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  Shipment: [
    { field: "shipmentId", label: "Shipment ID", required: true, identity: true },
    { field: "soId", label: "Sales Order ID", required: false },
    { field: "customerId", label: "Customer ID", required: true },
    { field: "shipDate", label: "Ship Date", required: false },
    { field: "carrier", label: "Carrier", required: false },
    { field: "trackingNumber", label: "Tracking Number", required: false },
    { field: "incoterms", label: "Incoterms", required: false },
    { field: "shipFromLocationId", label: "Ship From Location ID", required: false },
    { field: "shipToCity", label: "Ship To City", required: false },
    { field: "shipToCountry", label: "Ship To Country", required: false },
    { field: "status", label: "Status", required: false },
    { field: "totalQty", label: "Total Qty", required: false },
    { field: "totalValue", label: "Total Value", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  ShipmentLine: [
    { field: "shipmentId", label: "Shipment ID", required: true, identity: true },
    { field: "lineNumber", label: "Line Number", required: true, identity: true },
    { field: "sku", label: "SKU", required: true, identity: true },
    { field: "qtyShipped", label: "Qty Shipped", required: true },
    { field: "soId", label: "Sales Order ID", required: false },
    { field: "lotNumber", label: "Lot Number", required: false },
    { field: "serialNumbers", label: "Serial Numbers", required: false },
  ],
  Invoice: [
    { field: "invoiceId", label: "Invoice ID", required: true, identity: true },
    { field: "soId", label: "Sales Order ID", required: false },
    { field: "customerId", label: "Customer ID", required: true },
    { field: "invoiceDate", label: "Invoice Date", required: true },
    { field: "dueDate", label: "Due Date", required: false },
    { field: "currency", label: "Currency", required: false },
    { field: "subtotal", label: "Subtotal", required: false },
    { field: "taxAmount", label: "Tax Amount", required: false },
    { field: "totalAmount", label: "Total Amount", required: true },
    { field: "status", label: "Status", required: false },
    { field: "paymentDate", label: "Payment Date", required: false },
    { field: "paymentRef", label: "Payment Reference", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  ReturnRma: [
    { field: "rmaId", label: "RMA ID", required: true, identity: true },
    { field: "soId", label: "Sales Order ID", required: false },
    { field: "customerId", label: "Customer ID", required: true },
    { field: "returnDate", label: "Return Date", required: false },
    { field: "sku", label: "SKU", required: true },
    { field: "serialNumber", label: "Serial Number", required: false },
    { field: "qty", label: "Qty", required: true },
    { field: "reasonCode", label: "Reason Code", required: false },
    { field: "description", label: "Description", required: false },
    { field: "disposition", label: "Disposition", required: false },
    { field: "creditNoteRef", label: "Credit Note Reference", required: false },
    { field: "resolutionDate", label: "Resolution Date", required: false },
    { field: "status", label: "Status", required: false },
  ],
  QcInspection: [
    { field: "inspectionId", label: "Inspection ID", required: true, identity: true },
    { field: "type", label: "Type", required: true },
    { field: "sku", label: "SKU", required: false },
    { field: "lotNumber", label: "Lot Number", required: false },
    { field: "serialNumber", label: "Serial Number", required: false },
    { field: "workOrderId", label: "Work Order ID", required: false },
    { field: "woOpId", label: "WO Operation ID", required: false },
    { field: "inspectedBy", label: "Inspected By", required: false },
    { field: "inspectedDate", label: "Inspected Date", required: true },
    { field: "sampleSize", label: "Sample Size", required: false },
    { field: "passQty", label: "Pass Qty", required: false },
    { field: "failQty", label: "Fail Qty", required: false },
    { field: "overallResult", label: "Overall Result", required: false },
    { field: "dispositionIfFail", label: "Disposition If Fail", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
  Ncr: [
    { field: "ncrId", label: "NCR ID", required: true, identity: true },
    { field: "dateRaised", label: "Date Raised", required: true },
    { field: "type", label: "Type", required: true },
    { field: "sku", label: "SKU", required: false },
    { field: "lotNumber", label: "Lot Number", required: false },
    { field: "inspectionId", label: "Inspection ID", required: false },
    { field: "qtyAffected", label: "Qty Affected", required: false },
    { field: "description", label: "Description", required: true },
    { field: "rootCause", label: "Root Cause", required: false },
    { field: "disposition", label: "Disposition", required: false },
    { field: "correctiveAction", label: "Corrective Action", required: false },
    { field: "responsibleId", label: "Responsible ID", required: false },
    { field: "dueDate", label: "Due Date", required: false },
    { field: "closedDate", label: "Closed Date", required: false },
    { field: "status", label: "Status", required: false },
    { field: "severity", label: "Severity", required: false },
  ],
  Capa: [
    { field: "capaId", label: "CAPA ID", required: true, identity: true },
    { field: "type", label: "Type", required: true },
    { field: "source", label: "Source", required: false },
    { field: "sourceReference", label: "Source Reference", required: false },
    { field: "dateOpened", label: "Date Opened", required: true },
    { field: "title", label: "Title", required: true },
    { field: "description", label: "Description", required: true },
    { field: "rootCauseCategory", label: "Root Cause Category", required: false },
    { field: "rootCauseDetail", label: "Root Cause Detail", required: false },
    { field: "actionPlan", label: "Action Plan", required: false },
    { field: "actionOwnerId", label: "Action Owner ID", required: false },
    { field: "targetCloseDate", label: "Target Close Date", required: false },
    { field: "actualCloseDate", label: "Actual Close Date", required: false },
    { field: "verificationMethod", label: "Verification Method", required: false },
    { field: "verificationDate", label: "Verification Date", required: false },
    { field: "verificationResult", label: "Verification Result", required: false },
    { field: "effectivenessCheckDue", label: "Effectiveness Check Due", required: false },
    { field: "effectivenessResult", label: "Effectiveness Result", required: false },
    { field: "status", label: "Status", required: false },
    { field: "priority", label: "Priority", required: false },
    { field: "notes", label: "Notes", required: false },
  ],
} as const;

export type EntityType = keyof typeof CANONICAL_FIELDS;

/** Fields that form the entity's unique identity — used for multi-entity detection. */
export function getIdentityFields(entity: EntityType): string[] {
  return (CANONICAL_FIELDS[entity] as readonly Record<string, unknown>[])
    .filter((f) => f.identity === true)
    .map((f) => f.field as string);
}

/** Required fields that are NOT identity — candidates for defaulting when missing. */
export function getRequiredNonIdentityFields(entity: EntityType): string[] {
  return (CANONICAL_FIELDS[entity] as readonly Record<string, unknown>[])
    .filter((f) => f.required === true && f.identity !== true)
    .map((f) => f.field as string);
}

/**
 * Confidence level for a field mapping.
 * - "exact"  — normalised header === normalised field name (score 1.0)
 * - "alias"  — header is in our curated alias list           (score 0.9)
 * - "fuzzy"  — bigram similarity ≥ AUTO_MAP_THRESHOLD        (score = similarity)
 * - "none"   — no usable match found                         (score = best similarity found, may be 0)
 */
export type MappingConfidence = "exact" | "alias" | "fuzzy" | "none";

// Column type inference for UI badges
export type ColumnType = "numeric" | "date" | "text";

/**
 * Minimum score for a field mapping to be considered "high confidence".
 * Mappings at or above this threshold are applied silently without showing
 * the mapping review screen. Tune here if you need stricter / more lenient
 * auto-mapping behaviour.
 */
export const AUTO_MAP_THRESHOLD = 0.8;

/**
 * Shape of the JSON stored in DataSource.mappingConfig.
 * Shared across the import, process, validate, and clone-pass routes so
 * they all agree on the same structure without redeclaring it locally.
 */
export interface MappingConfig {
  entity: EntityType;
  mapping: Record<string, string>;
  attributeKeys?: string[];
  selectedSheet?: string | null;
  rawData?: Record<string, string>[];
  rawFileBase64?: string;
  rawFileType?: "csv" | "xlsx";
  confidence?: Record<string, MappingConfidence>;
  score?: Record<string, number>;
  columnClassification?: Record<string, ColumnClassification>;
  importMode?: "replace" | "merge";
}

export interface MappingWithConfidence {
  mapping: Record<string, string>;
  confidence: Record<string, MappingConfidence>;
  /** Numeric confidence per canonical field, 0.0–1.0 */
  score: Record<string, number>;
}

// ─── String similarity ────────────────────────────────────────────────────────

/** Strip everything except lowercase letters and digits. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Bigram Dice coefficient between two already-normalised strings.
 * Returns 1.0 for identical strings, 0.0 for completely disjoint ones.
 * Covers real-world variations like "product_name" vs "productname" vs "ProductNm".
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };

  const ba = bigrams(a);
  const bb = bigrams(b);
  let shared = 0;
  for (const bg of ba) if (bb.has(bg)) shared++;
  return (2 * shared) / (ba.size + bb.size);
}


// ─── Alias table ──────────────────────────────────────────────────────────────

const FIELD_ALIASES: Record<string, string[]> = {
  // ── Product ──────────────────────────────────────────────────────────
  sku: [
    "sku", "productcode", "product_code", "itemcode", "item_code",
    "partno", "partnumber", "part_number", "partcode", "articleno",
    "articlenumber", "article", "code", "id", "productid", "product_id",
    "itemid", "item_id", "stockcode", "stock_code", "ref", "reference",
    "itemno", "item_no", "itemnumber", "item_number", "item",
    "material", "materialnumber", "material_number", "materialcode", "material_code",
    "partid", "part_id", "part", "catalogno", "catalog_no",
    "matcode", "mat_code", "matnr", "skucode", "sku_code",
  ],
  name: [
    "name", "productname", "product_name", "itemname", "item_name",
    "title", "producttitle", "product_title", "label", "description",
    "productdescription", "itemdescription", "shortdescription",
  ],
  description: [
    "description", "desc", "details", "longdescription", "long_description",
    "notes", "remarks", "comment", "comments", "productdesc", "itemdesc",
    "productdetails", "specifications", "specs",
  ],
  category: [
    "category", "cat", "type", "producttype", "product_type", "itemtype",
    "group", "productgroup", "product_group", "family", "class",
    "productcategory", "item_category", "department",
  ],
  unit: [
    "unit", "uom", "unitofmeasure", "unit_of_measure", "measureunit",
    "measure", "packunit", "packsize", "sellunit", "baseunit",
  ],
  unitCost: [
    "unitcost", "unit_cost", "cost", "price", "unitprice", "unit_price",
    "listprice", "list_price", "buyprice", "buy_price", "purchaseprice",
    "purchase_price", "standardcost", "standard_cost", "costprice",
    "cost_price", "wholesaleprice",
  ],
  externalId: [
    "externalid", "external_id", "extid", "ext_id", "foreignid",
    "foreignkey", "foreign_key", "ref", "reference", "thirdpartyid",
    "sourceid", "legacyid",
  ],

  // ── Supplier ─────────────────────────────────────────────────────────
  code: [
    "code", "suppliercode", "supplier_code", "vendorcode", "vendor_code",
    "vendorid", "vendor_id", "supplierid", "supplier_id", "partnercode",
    "partner_code", "creditorcode",
  ],
  // "name" already covered above
  email: [
    "email", "emailaddress", "email_address", "mail", "contactemail",
    "contact_email", "e_mail", "emailid",
  ],
  phone: [
    "phone", "phonenumber", "phone_number", "tel", "telephone", "mobile",
    "cellphone", "contactphone", "contact_phone", "fax", "phoneno",
  ],
  country: [
    "country", "countrycode", "country_code", "nation", "countryoforigin",
    "origin", "location", "region",
  ],
  leadTimeDays: [
    "leadtimedays", "lead_time_days", "leadtime", "lead_time",
    "deliverydays", "delivery_days", "daystodeliver", "days_to_deliver",
    "supplytime", "replenishmentdays",
  ],
  paymentTerms: [
    "paymentterms", "payment_terms", "terms", "payterms", "pay_terms",
    "creditterms", "credit_terms", "netdays", "paymentconditions",
  ],

  // ── InventoryItem ─────────────────────────────────────────────────────
  quantity: [
    "quantity", "qty", "qtyonhand", "qty_on_hand", "quantityonhand",
    "quantity_on_hand", "stock", "onhand", "on_hand", "balance",
    "available", "availablestock", "currentstock", "current_stock",
    "stocklevel", "stock_level", "stockqty", "inventoryqty",
  ],
  locationCode: [
    "locationcode", "location_code", "location", "warehouse",
    "warehousecode", "warehouse_code", "bin", "bincode", "bin_code",
    "site", "sitecode", "storecode", "store_code",
  ],
  reorderPoint: [
    "reorderpoint", "reorder_point", "reorderlevel", "reorder_level",
    "minstock", "min_stock", "minimumstock", "minimum_stock", "rop",
    "safetystock", "safety_stock",
  ],
  reorderQty: [
    "reorderqty", "reorder_qty", "reorderquantity", "reorder_quantity",
    "reorderamount", "orderqty", "eoq", "economicorderqty", "minorderqty",
    "moq",
  ],

  // ── BOM ───────────────────────────────────────────────────────────────
  parentSku: [
    "parentsku", "parent_sku", "parentcode", "parent_code", "finishedgood",
    "finished_good", "fg", "fgsku", "fgcode", "assembly", "assemblysku",
    "bomparent", "parentproduct", "parent_product", "toplevelsk",
  ],
  componentSku: [
    "componentsku", "component_sku", "componentcode", "component_code",
    "childsku", "child_sku", "rawmaterial", "raw_material", "rm", "rmsku",
    "ingredient", "subcomponent", "bomchild", "childproduct", "materialcode",
    "material", "partsku", "part_sku",
  ],
  parentName: [
    "parentname", "parent_name", "finishedgoodname", "finished_good_name",
    "assemblyname", "assembly_name", "parentproductname", "fgname",
  ],
  componentName: [
    "componentname", "component_name", "childname", "child_name",
    "rawmaterialname", "raw_material_name", "materialname", "material_name",
    "partname", "part_name", "ingredientname",
  ],
  scrapFactor: [
    "scrapfactor", "scrap_factor", "scrap", "scrappct", "scrap_pct",
    "waste", "wastepct", "waste_pct", "scrapratio", "yieldloss", "yield_loss",
    "scraprate", "scrap_rate",
  ],

  // ── ForecastEntry / MpsEntry ──────────────────────────────────────────
  period: [
    "period", "forecastperiod", "forecast_period", "planperiod", "plan_period",
    "week", "month", "quarter", "date", "forecastdate", "forecast_date",
    "bucket", "timebucket", "time_bucket", "periodkey", "periodstart",
    "weekof", "monthof",
  ],
  forecastQty: [
    "forecastqty", "forecast_qty", "forecastquantity", "forecast_quantity",
    "forecastdemand", "forecast_demand", "demandforecast", "demand",
    "forecasteddemand", "forecastedqty", "projecteddemand", "projectedqty",
    "dmd", "fcst", "fcstqty",
  ],
  channel: [
    "channel", "saleschannel", "sales_channel", "salesregion", "market",
    "region", "segment", "customersegment", "distributionchannel", "dc",
  ],
  version: [
    "version", "forecastversion", "forecast_version", "scenario", "cycle",
    "revision", "forecastcycle", "planversion", "forecastscenario",
  ],
  plannedQty: [
    "plannedqty", "planned_qty", "plannedquantity", "planned_quantity",
    "mpsqty", "mps_qty", "productionqty", "production_qty", "scheduledqty",
    "scheduled_qty", "plannedproduction", "qtyplanned", "planqty",
  ],
  confirmedQty: [
    "confirmedqty", "confirmed_qty", "confirmedquantity", "confirmed_quantity",
    "firmqty", "firm_qty", "fixedqty", "fixed_qty", "frozenqty", "frozen_qty",
  ],
  workCenter: [
    "workcenter", "work_center", "workstation", "line", "productionline",
    "production_line", "machinecenter", "machine_center", "resource",
    "routingcenter", "cell", "manufacturingcell", "facility", "plant",
  ],
  forecastUnit: [
    "forecastunit", "forecast_unit", "unit", "uom", "unitofmeasure",
    "unit_of_measure", "demandunit", "demand_unit",
  ],

  // ── WorkOrder ─────────────────────────────────────────────────────────
  scheduledDate: [
    "scheduleddate", "scheduled_date", "startdate", "start_date",
    "plannedstart", "planned_start", "schedulestart", "productionstart",
    "releasedate", "release_date", "scheduledstart",
  ],
  dueDate: [
    "duedate", "due_date", "finishdate", "finish_date", "completiondate",
    "completion_date", "plannedfinish", "planned_finish", "needdate",
    "need_date", "mustfinishby", "targetdate", "target_date",
  ],
  actualQty: [
    "actualqty", "actual_qty", "actualquantity", "actual_quantity",
    "completedqty", "completed_qty", "finishedqty", "finished_qty",
    "yieldqty", "yield_qty", "producedqty", "produced_qty", "goodqty",
  ],

  // ── Routing ────────────────────────────────────────────────────────────
  operationNo: [
    "operationno", "operation_no", "opno", "op_no", "operationnumber",
    "operation_number", "operationsequence", "opsequence", "stepno",
    "step_no", "seq", "sequence", "opseq", "routingstep",
  ],
  setupTimeMins: [
    "setuptimemins", "setup_time_mins", "setuptime", "setup_time",
    "setuptimemin", "setupminutes", "setup_minutes", "changeover",
    "changeovertime", "changeover_time", "setupmin",
  ],
  runTimeMins: [
    "runtimemins", "run_time_mins", "runtime", "run_time", "runtimemin",
    "runminutes", "run_minutes", "cycletime", "cycle_time", "tactime",
    "tact_time", "processingtime", "processing_time", "runmin",
  ],
  runTimeUnit: [
    "runtimeunit", "run_time_unit", "timeunit", "time_unit",
    "rateunit", "rate_unit", "timebase",
  ],

  // ── WorkCenter ────────────────────────────────────────────────────────
  availableHoursPerWeek: [
    "availablehoursperweek", "available_hours_per_week", "capacityhours",
    "capacity_hours", "weeklycapacity", "weekly_capacity", "availablehours",
    "available_hours", "hoursperweek", "hours_per_week", "capacityperweek",
    "weeklyavailability",
  ],
  efficiency: [
    "efficiency", "efficiencypct", "efficiency_pct", "efficiencyratio",
    "utilizationrate", "utilization_rate", "utilization", "performancerate",
    "performance_rate", "eff", "efficiencyfactor",
  ],
  costRatePerHour: [
    "costrateperhour", "cost_rate_per_hour", "costrate", "cost_rate",
    "hourlyrate", "hourly_rate", "machinerate", "machine_rate",
    "labourrate", "labor_rate", "operatingcost", "rateperhour",
  ],
  calendar: [
    "calendar", "shiftcalendar", "shift_calendar", "shift", "shiftcode",
    "shift_code", "workingcalendar", "productioncalendar", "calendarcode",
  ],

  // ── InventoryItem canonical ───────────────────────────────────────────
  locationId: [
    "locationid", "location_id", "locationcode", "location_code", "location",
    "warehouse", "warehousecode", "warehouse_code", "bin", "bincode",
  ],
  qtyOnHand: [
    "qtyonhand", "qty_on_hand", "quantityonhand", "quantity_on_hand",
    "qty", "quantity", "stock", "onhand", "on_hand", "currentstock",
    "stocklevel", "stockqty", "inventoryqty",
  ],
  qtyAllocated: [
    "qtyallocated", "qty_allocated", "allocatedqty", "allocated_qty",
    "reservedqty", "reserved_qty", "committed",
  ],
  qtyAvailable: [
    "qtyavailable", "qty_available", "availableqty", "available_qty",
    "availablestock", "available_stock", "free_stock",
  ],

  // ── PurchaseOrder ─────────────────────────────────────────────────────
  poNumber: [
    "ponumber", "po_number", "po", "purchaseordernumber", "purchase_order_number",
    "ponr", "po_nr", "orderreference", "po_ref", "ponumbe", "po_num",
  ],
  supplierId: [
    "supplierid", "supplier_id", "suppliercode", "supplier_code",
    "vendorid", "vendor_id", "vendorcode", "vendor_code", "vendor",
  ],

  // ── POLine ────────────────────────────────────────────────────────────
  purchaseOrderId: [
    "purchaseorderid", "purchase_order_id", "ponumber", "po_number",
    "po", "orderid", "order_id",
  ],
  qtyOrdered: [
    "qtyordered", "qty_ordered", "quantityordered", "quantity_ordered",
    "orderedqty", "ordered_qty", "qty", "quantity",
  ],
  qtyReceived: [
    "qtyreceived", "qty_received", "quantityreceived", "quantity_received",
    "receivedqty", "received_qty", "deliveredqty",
  ],

  // ── SalesOrder ────────────────────────────────────────────────────────
  soNumber: [
    "sonumber", "so_number", "so", "salesordernumber", "sales_order_number",
    "ordernumber", "order_number", "sonr", "so_nr", "so_ref",
  ],
  customerId: [
    "customerid", "customer_id", "customercode", "customer_code",
    "clientid", "client_id", "clientcode", "client_code",
    "accountnumber", "account_number",
  ],

  // ── WorkOrder canonical ───────────────────────────────────────────────
  woNumber: [
    "wonumber", "wo_number", "wo", "workordernumber", "work_order_number",
    "workorderid", "work_order_id", "wo_num", "wonr",
  ],
  qtyPlanned: [
    "qtyplanned", "qty_planned", "quantityplanned", "quantity_planned",
    "plannedqty", "planned_qty", "plannedquantity", "planned_quantity",
  ],

  // ── BOMHeader ─────────────────────────────────────────────────────────
  productId: [
    "productid", "product_id", "sku", "itemcode", "item_code",
    "partno", "partnumber", "part_number", "partcode",
  ],
  // "version" already covered above

  // ── Equipment ─────────────────────────────────────────────────────────
  // "code" already covered above
  // "name" already covered above
  serialNumber: [
    "serialnumber", "serial_number", "serial", "serialno", "serial_no",
    "sn", "assettag", "asset_tag",
  ],
  manufacturer: [
    "manufacturer", "make", "brand", "maker", "oem",
    "machinebrand", "machine_brand",
  ],

  // ── Order ─────────────────────────────────────────────────────────────
  orderNumber: [
    "ordernumber", "order_number", "orderno", "order_no", "orderid",
    "order_id", "ponumber", "po_number", "po", "purchaseordernumber",
    "documentnumber", "doc_number", "invoicenumber",
  ],
  supplierCode: [
    "suppliercode", "supplier_code", "vendor", "vendorcode", "vendor_code",
    "vendorid", "supplierid", "partner",
  ],
  status: [
    "status", "orderstatus", "order_status", "state", "documentstatus",
    "fulfillmentstatus",
  ],
  orderDate: [
    "orderdate", "order_date", "date", "podate", "po_date", "documentdate",
    "created", "createdate", "issuedate",
  ],
  expectedDate: [
    "expecteddate", "expected_date", "duedate", "due_date", "deliverydate",
    "delivery_date", "eta", "promiseddate", "requesteddate", "needbydate",
  ],
  totalAmount: [
    "totalamount", "total_amount", "total", "amount", "grandtotal",
    "grand_total", "ordervalue", "order_value", "ordertotal",
    "nettotal", "net_total",
  ],

  // ── Location ────────────────────────────────────────────────────────
  // "locationId" already covered above (InventoryItem canonical)
  countryCode: [
    "countrycode", "country_code", "country", "iso_country",
    "isocountry", "countryiso",
  ],
  isActive: [
    "isactive", "is_active", "active", "enabled", "isenabled",
  ],

  // ── Employee ────────────────────────────────────────────────────────
  employeeId: [
    "employeeid", "employee_id", "empid", "emp_id", "staffid",
    "staff_id", "workerid", "worker_id", "operatorid", "operator_id",
  ],
  department: [
    "department", "dept", "division", "team", "group",
    "businessunit", "business_unit",
  ],
  role: [
    "role", "jobtitle", "job_title", "position", "title",
    "jobfunction", "job_function",
  ],
  workCentreId: [
    "workcentreid", "work_centre_id", "workcenterid", "work_center_id",
    "wcid", "wc_id", "workcentre", "workcenter",
  ],
  competencyLevel: [
    "competencylevel", "competency_level", "skill_level", "skilllevel",
    "grade", "certification_level",
  ],
  skills: [
    "skills", "skill", "skillset", "skill_set", "competencies",
    "qualifications", "certifications",
  ],
  startDate: [
    "startdate", "start_date", "hiredate", "hire_date", "joindate",
    "join_date", "dateofhire", "employmentdate",
  ],

  // ── ExchangeRate ────────────────────────────────────────────────────
  fromCurrency: [
    "fromcurrency", "from_currency", "sourcecurrency", "source_currency",
    "basecurrency", "base_currency", "fromccy", "from_ccy",
  ],
  toCurrency: [
    "tocurrency", "to_currency", "targetcurrency", "target_currency",
    "quotecurrency", "quote_currency", "toccy", "to_ccy",
  ],
  rateDate: [
    "ratedate", "rate_date", "fxdate", "fx_date", "exchangedate",
    "exchange_date", "effectivedate", "effective_date",
  ],
  rate: [
    "rate", "exchangerate", "exchange_rate", "fxrate", "fx_rate",
    "conversionrate", "conversion_rate",
  ],
  rateType: [
    "ratetype", "rate_type", "fxtype", "fx_type",
  ],

  // ── PriceList / PriceListLine ───────────────────────────────────────
  priceListId: [
    "pricelistid", "price_list_id", "pricelist", "price_list",
    "plid", "pl_id", "pricelistcode", "price_list_code",
  ],
  unitPrice: [
    "unitprice", "unit_price", "price", "sellprice", "sell_price",
    "listprice", "list_price", "saleprice", "sale_price",
  ],
  minQty: [
    "minqty", "min_qty", "minimumqty", "minimum_qty",
    "minorderqty", "min_order_qty", "minimumquantity",
  ],
  discountPct: [
    "discountpct", "discount_pct", "discountpercent", "discount_percent",
    "discount", "disc", "discpct",
  ],
  validFrom: [
    "validfrom", "valid_from", "effectivefrom", "effective_from",
    "startdate", "start_date", "datefrom", "date_from",
  ],
  validTo: [
    "validto", "valid_to", "effectiveto", "effective_to",
    "enddate", "end_date", "expirydate", "expiry_date", "dateto",
  ],
  priority: [
    "priority", "rank", "sequence", "precedence", "prio",
  ],

  // ── BOMLine ─────────────────────────────────────────────────────────
  bomId: [
    "bomid", "bom_id", "bomheaderid", "bom_header_id", "bomcode",
    "bom_code", "bomref", "bom_ref",
  ],
  qtyPer: [
    "qtyper", "qty_per", "quantityper", "quantity_per",
    "qtyperunit", "qty_per_unit", "bomqty", "bom_qty",
  ],
  lineNumber: [
    "linenumber", "line_number", "lineno", "line_no", "lineitem",
    "line_item", "seq", "sequence",
  ],
  section: [
    "section", "bomsection", "bom_section", "group", "assembly_group",
  ],
  componentCost: [
    "componentcost", "component_cost", "partcost", "part_cost",
    "materialcost", "material_cost",
  ],
  extendedCost: [
    "extendedcost", "extended_cost", "totalcost", "total_cost",
    "linecost", "line_cost",
  ],
  makeBuy: [
    "makebuy", "make_buy", "makeorbuy", "make_or_buy",
    "sourcetype", "source_type", "procurement_type",
  ],
  isCritical: [
    "iscritical", "is_critical", "critical", "criticalpart",
    "critical_part",
  ],
  approvedSubSku: [
    "approvedsubsku", "approved_sub_sku", "alternatesku", "alternate_sku",
    "substitutesku", "substitute_sku",
  ],

  // ── RoutingHeader ───────────────────────────────────────────────────
  routingId: [
    "routingid", "routing_id", "routingcode", "routing_code",
    "routingref", "routing_ref",
  ],
  effectiveFrom: [
    "effectivefrom", "effective_from", "validfrom", "valid_from",
    "startdate", "start_date",
  ],
  effectiveTo: [
    "effectiveto", "effective_to", "validto", "valid_to",
    "enddate", "end_date",
  ],
  approvedBy: [
    "approvedby", "approved_by", "approver", "authorisedby",
    "authorizedby", "authorized_by",
  ],
  approvalDate: [
    "approvaldate", "approval_date", "approveddate", "approved_date",
  ],

  // ── RoutingOperation ────────────────────────────────────────────────
  operationName: [
    "operationname", "operation_name", "opname", "op_name",
    "opdescription", "op_description", "stepname", "step_name",
  ],
  setupMin: [
    "setupmin", "setup_min", "setupmins", "setup_mins",
    "setuptime", "setup_time", "setupminutes", "setup_minutes",
  ],
  runMinPerUnit: [
    "runminperunit", "run_min_per_unit", "runtimeperunit",
    "run_time_per_unit", "cycletime", "cycle_time",
  ],
  yieldPct: [
    "yieldpct", "yield_pct", "yieldpercent", "yield_percent",
    "yield", "yieldrate", "yield_rate",
  ],
  effRunMin: [
    "effrunmin", "eff_run_min", "effectiverunmin", "effective_run_min",
  ],
  lotSize: [
    "lotsize", "lot_size", "batchsize", "batch_size",
    "transferqty", "transfer_qty",
  ],
  inspectionRequired: [
    "inspectionrequired", "inspection_required", "qcrequired",
    "qc_required", "needsinspection",
  ],
  requiredSkill: [
    "requiredskill", "required_skill", "skillrequired",
    "skill_required", "operatorskill",
  ],
  certOperatorRequired: [
    "certoperatorrequired", "cert_operator_required",
    "certifiedoperator", "certified_operator",
  ],

  // ── ShiftCalendar ───────────────────────────────────────────────────
  shift: [
    "shift", "shiftname", "shift_name", "shiftcode", "shift_code",
    "shifttype", "shift_type",
  ],
  startTime: [
    "starttime", "start_time", "timestart", "time_start",
    "shiftstart", "shift_start",
  ],
  endTime: [
    "endtime", "end_time", "timeend", "time_end",
    "shiftend", "shift_end",
  ],
  availableHrs: [
    "availablehrs", "available_hrs", "availablehours", "available_hours",
    "capacityhrs", "capacity_hrs",
  ],

  // ── MaintenanceLog ──────────────────────────────────────────────────
  logId: [
    "logid", "log_id", "maintenanceid", "maintenance_id",
    "pmid", "pm_id", "logref",
  ],
  equipmentId: [
    "equipmentid", "equipment_id", "assetid", "asset_id",
    "machineid", "machine_id", "equipmentcode", "equipment_code",
  ],
  performedBy: [
    "performedby", "performed_by", "technician", "maintainedby",
    "maintained_by",
  ],
  performedByExternal: [
    "performedbyexternal", "performed_by_external",
    "externaltech", "external_technician",
  ],
  durationHrs: [
    "durationhrs", "duration_hrs", "durationhours", "duration_hours",
    "duration", "timespent", "time_spent",
  ],
  partsUsed: [
    "partsused", "parts_used", "sparesused", "spares_used",
    "materials",
  ],
  cost: [
    "cost", "maintenancecost", "maintenance_cost", "repaircost",
    "repair_cost", "totalcost",
  ],
  result: [
    "result", "outcome", "findings", "maintenanceresult",
    "maintenance_result",
  ],
  nextDue: [
    "nextdue", "next_due", "nextpmdate", "next_pm_date",
    "nextmaintenancedate", "next_maintenance_date",
  ],

  // ── Lot ─────────────────────────────────────────────────────────────
  lotNumber: [
    "lotnumber", "lot_number", "lot", "lotno", "lot_no",
    "batchnumber", "batch_number", "batch", "batchno", "batch_no",
  ],
  lotType: [
    "lottype", "lot_type", "batchtype", "batch_type",
  ],
  originType: [
    "origintype", "origin_type", "sourcetype", "source_type",
  ],
  supplierBatch: [
    "supplierbatch", "supplier_batch", "vendorbatch", "vendor_batch",
    "supplierlot", "supplier_lot",
  ],
  receivedDate: [
    "receiveddate", "received_date", "receiptdate", "receipt_date",
    "daterecieved", "date_received",
  ],
  mfgDate: [
    "mfgdate", "mfg_date", "manufacturingdate", "manufacturing_date",
    "productiondate", "production_date", "makeddate",
  ],
  expiryDate: [
    "expirydate", "expiry_date", "expirationdate", "expiration_date",
    "bestbefore", "best_before", "usebydate", "use_by_date",
  ],
  currentQty: [
    "currentqty", "current_qty", "qtyonhand", "qty_on_hand",
    "remainingqty", "remaining_qty",
  ],
  qcStatus: [
    "qcstatus", "qc_status", "qualitystatus", "quality_status",
    "inspectionstatus", "inspection_status",
  ],
  qcInspectionId: [
    "qcinspectionid", "qc_inspection_id", "inspectionid",
    "inspection_id", "qcid", "qc_id",
  ],
  holdReason: [
    "holdreason", "hold_reason", "quarantinereason",
    "quarantine_reason", "holdnote",
  ],

  // ── StockMovement ───────────────────────────────────────────────────
  movementId: [
    "movementid", "movement_id", "transactionid", "transaction_id",
    "txnid", "txn_id", "movementref",
  ],
  fromLocationId: [
    "fromlocationid", "from_location_id", "fromlocation",
    "from_location", "sourcelocation", "source_location",
  ],
  toLocationId: [
    "tolocationid", "to_location_id", "tolocation", "to_location",
    "destlocation", "dest_location", "destinationlocation",
  ],
  qty: [
    "qty", "quantity", "amount", "count", "units",
  ],
  refType: [
    "reftype", "ref_type", "referencetype", "reference_type",
    "sourcetype", "source_type",
  ],
  refId: [
    "refid", "ref_id", "referenceid", "reference_id",
    "sourceref", "source_ref",
  ],
  reason: [
    "reason", "reasoncode", "reason_code", "movementreason",
    "movement_reason", "justification",
  ],
  createdBy: [
    "createdby", "created_by", "enteredby", "entered_by",
    "operator", "userid", "user_id",
  ],

  // ── SupplierItem ────────────────────────────────────────────────────
  supplierPartNumber: [
    "supplierpartnumber", "supplier_part_number", "supplierpart",
    "supplier_part", "vendorpartno", "vendor_part_no",
    "vendorpartnumber", "vendor_part_number",
  ],
  moq: [
    "moq", "minorderqty", "min_order_qty", "minimumorderquantity",
    "minimum_order_quantity",
  ],
  orderMultiple: [
    "ordermultiple", "order_multiple", "lotmultiple", "lot_multiple",
    "packsize", "pack_size",
  ],
  countryOfOrigin: [
    "countryoforigin", "country_of_origin", "origincount",
    "origin_country", "coo", "madein", "made_in",
  ],
  qualityRating: [
    "qualityrating", "quality_rating", "supplierrating",
    "supplier_rating", "vendorrating", "vendor_rating",
  ],

  // ── WorkOrderOperation ──────────────────────────────────────────────
  woOpId: [
    "woopid", "wo_op_id", "workorderoperationid",
    "work_order_operation_id", "wooperationid",
  ],
  workOrderId: [
    "workorderid", "work_order_id", "woid", "wo_id",
    "wonumber", "wo_number",
  ],
  routingOpId: [
    "routingopid", "routing_op_id", "routingoperationid",
    "routing_operation_id",
  ],
  opNumber: [
    "opnumber", "op_number", "operationnumber", "operation_number",
    "opno", "op_no", "stepno", "step_no", "seq",
  ],
  productionLine: [
    "productionline", "production_line", "line", "mfgline",
    "mfg_line", "assemblyline", "assembly_line",
  ],
  operatorId: [
    "operatorid", "operator_id", "workerId", "worker_id",
    "technicianid", "technician_id",
  ],
  plannedSetupMin: [
    "plannedsetupmin", "planned_setup_min", "plansetup",
    "plan_setup", "targetsetup", "target_setup",
  ],
  plannedRunMin: [
    "plannedrunmin", "planned_run_min", "planrun",
    "plan_run", "targetrun", "target_run",
  ],
  actualSetupMin: [
    "actualsetupmin", "actual_setup_min", "realsetup",
    "real_setup",
  ],
  actualRunMin: [
    "actualrunmin", "actual_run_min", "realrun", "real_run",
  ],
  qtyIn: [
    "qtyin", "qty_in", "inputqty", "input_qty",
    "quantityin", "quantity_in",
  ],
  qtyGood: [
    "qtygood", "qty_good", "goodqty", "good_qty",
    "passedqty", "passed_qty",
  ],
  qtyScrapped: [
    "qtyscrapped", "qty_scrapped", "scrapqty", "scrap_qty",
    "scrappedqty", "scrapped_qty",
  ],
  scrapReason: [
    "scrapreason", "scrap_reason", "rejectcode", "reject_code",
    "defectcode", "defect_code",
  ],

  // ── SalesOrderLine ──────────────────────────────────────────────────
  soId: [
    "soid", "so_id", "salesorderid", "sales_order_id",
    "sonumber", "so_number",
  ],
  lineTotal: [
    "linetotal", "line_total", "linevalue", "line_value",
    "lineamount", "line_amount",
  ],
  requestedDate: [
    "requesteddate", "requested_date", "requireddate", "required_date",
    "needdate", "need_date",
  ],
  promisedDate: [
    "promiseddate", "promised_date", "confirmeddate", "confirmed_date",
    "committeddate", "committed_date",
  ],
  qtyShipped: [
    "qtyshipped", "qty_shipped", "shippedqty", "shipped_qty",
    "deliveredqty", "delivered_qty",
  ],
  discount: [
    "discount", "discountamount", "discount_amount",
    "linediscount", "line_discount",
  ],

  // ── Shipment ────────────────────────────────────────────────────────
  shipmentId: [
    "shipmentid", "shipment_id", "deliveryid", "delivery_id",
    "dispatchid", "dispatch_id", "shipmentnumber", "shipment_number",
  ],
  shipDate: [
    "shipdate", "ship_date", "shippingdate", "shipping_date",
    "dispatchdate", "dispatch_date", "deliverydate", "delivery_date",
  ],
  carrier: [
    "carrier", "shipper", "freightcarrier", "freight_carrier",
    "logisticsprovider", "logistics_provider",
  ],
  trackingNumber: [
    "trackingnumber", "tracking_number", "trackingno", "tracking_no",
    "trackingref", "tracking_ref", "awb",
  ],
  incoterms: [
    "incoterms", "incoterm", "shippingterms", "shipping_terms",
    "deliveryterms", "delivery_terms",
  ],
  shipFromLocationId: [
    "shipfromlocationid", "ship_from_location_id", "fromlocation",
    "from_location", "shippingfrom", "shipping_from",
  ],
  shipToCity: [
    "shiptocity", "ship_to_city", "destinationcity",
    "destination_city", "deliverycity", "delivery_city",
  ],
  shipToCountry: [
    "shiptocountry", "ship_to_country", "destinationcountry",
    "destination_country",
  ],
  totalQty: [
    "totalqty", "total_qty", "totalquantity", "total_quantity",
    "shipmentqty", "shipment_qty",
  ],
  totalValue: [
    "totalvalue", "total_value", "shipmentvalue", "shipment_value",
  ],

  // ── ShipmentLine ────────────────────────────────────────────────────
  serialNumbers: [
    "serialnumbers", "serial_numbers", "serials", "sns",
    "seriallist", "serial_list",
  ],

  // ── Invoice ─────────────────────────────────────────────────────────
  invoiceId: [
    "invoiceid", "invoice_id", "invoicenumber", "invoice_number",
    "invoiceno", "invoice_no", "invid", "inv_id",
  ],
  invoiceDate: [
    "invoicedate", "invoice_date", "billingdate", "billing_date",
    "billdate", "bill_date",
  ],
  currency: [
    "currency", "currencycode", "currency_code", "ccy",
    "isocurrency", "iso_currency",
  ],
  subtotal: [
    "subtotal", "sub_total", "netamount", "net_amount",
    "pretaxamount", "pre_tax_amount",
  ],
  taxAmount: [
    "taxamount", "tax_amount", "tax", "vat", "vatamount",
    "vat_amount", "salestax", "sales_tax",
  ],
  paymentDate: [
    "paymentdate", "payment_date", "paiddate", "paid_date",
    "settlementdate", "settlement_date",
  ],
  paymentRef: [
    "paymentref", "payment_ref", "paymentreference", "payment_reference",
    "transactionref", "transaction_ref",
  ],

  // ── ReturnRma ───────────────────────────────────────────────────────
  rmaId: [
    "rmaid", "rma_id", "rmanumber", "rma_number", "returnid",
    "return_id", "returnnumber", "return_number",
  ],
  returnDate: [
    "returndate", "return_date", "rmadate", "rma_date",
    "dateofreturn", "date_of_return",
  ],
  reasonCode: [
    "reasoncode", "reason_code", "returnreason", "return_reason",
    "rmareason", "rma_reason",
  ],
  disposition: [
    "disposition", "dispositioncode", "disposition_code",
    "action", "resolution", "resolutiontype", "resolution_type",
  ],
  creditNoteRef: [
    "creditnoteref", "credit_note_ref", "creditnote", "credit_note",
    "creditref", "credit_ref",
  ],
  resolutionDate: [
    "resolutiondate", "resolution_date", "resolveddate",
    "resolved_date", "closeddate", "closed_date",
  ],

  // ── QcInspection ────────────────────────────────────────────────────
  inspectionId: [
    "inspectionid", "inspection_id", "qcinspectionid",
    "qc_inspection_id", "inspectionnumber", "inspection_number",
  ],
  inspectedBy: [
    "inspectedby", "inspected_by", "inspector", "inspectorid",
    "inspector_id",
  ],
  inspectedDate: [
    "inspecteddate", "inspected_date", "inspectiondate",
    "inspection_date", "qcdate", "qc_date",
  ],
  sampleSize: [
    "samplesize", "sample_size", "sampleqty", "sample_qty",
    "inspectedqty", "inspected_qty",
  ],
  passQty: [
    "passqty", "pass_qty", "passedqty", "passed_qty",
    "qtypassed", "qty_passed",
  ],
  failQty: [
    "failqty", "fail_qty", "failedqty", "failed_qty",
    "qtyfailed", "qty_failed",
  ],
  overallResult: [
    "overallresult", "overall_result", "inspectionresult",
    "inspection_result", "qcresult", "qc_result",
  ],
  dispositionIfFail: [
    "dispositioniffail", "disposition_if_fail", "faildisposition",
    "fail_disposition",
  ],

  // ── NCR ─────────────────────────────────────────────────────────────
  ncrId: [
    "ncrid", "ncr_id", "ncrnumber", "ncr_number", "nonconformanceid",
    "non_conformance_id",
  ],
  dateRaised: [
    "dateraised", "date_raised", "raiseddate", "raised_date",
    "opendate", "open_date", "reportdate", "report_date",
  ],
  qtyAffected: [
    "qtyaffected", "qty_affected", "affectedqty", "affected_qty",
    "quantityaffected", "quantity_affected",
  ],
  rootCause: [
    "rootcause", "root_cause", "rootcauseanalysis", "root_cause_analysis",
    "rca",
  ],
  correctiveAction: [
    "correctiveaction", "corrective_action", "correction",
    "containmentaction", "containment_action",
  ],
  responsibleId: [
    "responsibleid", "responsible_id", "ownerid", "owner_id",
    "assignedto", "assigned_to",
  ],
  closedDate: [
    "closeddate", "closed_date", "closedate", "close_date",
    "completiondate", "completion_date",
  ],
  severity: [
    "severity", "severitylevel", "severity_level", "criticality",
    "impact", "riskrating", "risk_rating",
  ],

  // ── CAPA ────────────────────────────────────────────────────────────
  capaId: [
    "capaid", "capa_id", "capanumber", "capa_number",
    "correctiveactionid", "corrective_action_id",
  ],
  sourceReference: [
    "sourcereference", "source_reference", "sourceref", "source_ref",
    "originref", "origin_ref",
  ],
  dateOpened: [
    "dateopened", "date_opened", "openeddate", "opened_date",
    "opendate", "open_date",
  ],
  title: [
    "title", "subject", "summary", "heading", "capatitle",
    "capa_title",
  ],
  rootCauseCategory: [
    "rootcausecategory", "root_cause_category", "rcacategory",
    "rca_category",
  ],
  rootCauseDetail: [
    "rootcausedetail", "root_cause_detail", "rcadetail", "rca_detail",
    "rootcausedescription", "root_cause_description",
  ],
  actionPlan: [
    "actionplan", "action_plan", "plan", "correctiveplan",
    "corrective_plan",
  ],
  actionOwnerId: [
    "actionownerid", "action_owner_id", "ownerid", "owner_id",
    "assignee", "assignedto", "assigned_to",
  ],
  targetCloseDate: [
    "targetclosedate", "target_close_date", "targetdate",
    "target_date", "duedate", "due_date",
  ],
  actualCloseDate: [
    "actualclosedate", "actual_close_date", "closeddate",
    "closed_date", "completeddate", "completed_date",
  ],
  verificationMethod: [
    "verificationmethod", "verification_method", "verifymethod",
    "verify_method",
  ],
  verificationDate: [
    "verificationdate", "verification_date", "verifieddate",
    "verified_date",
  ],
  verificationResult: [
    "verificationresult", "verification_result", "verifyresult",
    "verify_result",
  ],
  effectivenessCheckDue: [
    "effectivenesscheckdue", "effectiveness_check_due",
    "effectivenessdue", "effectiveness_due",
  ],
  effectivenessResult: [
    "effectivenessresult", "effectiveness_result",
    "effectivenessoutcome", "effectiveness_outcome",
  ],
};

// ─── Core mapping function ────────────────────────────────────────────────────

export function suggestMappingWithConfidence(
  headers: string[],
  entity: EntityType
): MappingWithConfidence {
  const mapping: Record<string, string> = {};
  const confidence: Record<string, MappingConfidence> = {};
  const score: Record<string, number> = {};
  const fields = CANONICAL_FIELDS[entity];

  // Pull registry for this entity once — used for alias lookups below.
  const registryForEntity = getRegistryForEntity(entity);

  // Normalise each header once — reused across every field's exact, alias,
  // and fuzzy checks rather than being recomputed per field.
  const normHeaders = headers.map((h) => ({ orig: h, norm: normalize(h) }));

  // Track headers already claimed by exact/alias matches so fuzzy matching
  // doesn't double-map them to a second field (e.g. "Component SKU" claimed
  // by componentSku via alias should not also fuzzy-match totalComponents).
  const usedHeaders = new Set<string>();

  for (const { field } of fields) {
    const fieldNorm = normalize(field);
    // Registry is the primary source of aliases; fall back to FIELD_ALIASES
    // for any field not yet covered by the registry.
    const registryField = registryForEntity.find((rf) => rf.canonicalKey === field);
    const aliasList = registryField?.aliases ?? FIELD_ALIASES[field] ?? [fieldNorm];

    // 1. Exact match (score 1.0)
    const exactMatch = normHeaders.find((h) => h.norm === fieldNorm);
    if (exactMatch) {
      mapping[field] = exactMatch.orig;
      confidence[field] = "exact";
      score[field] = 1.0;
      usedHeaders.add(exactMatch.orig);
      continue;
    }

    // 2. Alias match — curated list
    //    Entity-scoped registry aliases score 1.0 (on par with exact match);
    //    fallback FIELD_ALIASES score 0.9.
    const aliasMatch = normHeaders.find((h) => aliasList.includes(h.norm));
    if (aliasMatch) {
      mapping[field] = aliasMatch.orig;
      confidence[field] = "alias";
      score[field] = registryField ? 1.0 : 0.9;
      usedHeaders.add(aliasMatch.orig);
      continue;
    }

    // 2b. Global canonical alias lookup (covers all 37 canonical entities)
    const globalAliases = getRegistryByAlias();
    const globalMatch = normHeaders.find((h) => {
      const entry = globalAliases[h.norm];
      return entry && entry.canonicalName === field;
    });
    if (globalMatch) {
      mapping[field] = globalMatch.orig;
      confidence[field] = "alias";
      score[field] = 0.88;
      usedHeaders.add(globalMatch.orig);
      continue;
    }

    // 3. Fuzzy match — bigram Dice coefficient against field name + all aliases.
    //    Pre-normalise the candidate set once per field (not per header).
    //    Skip headers already claimed by higher-confidence matches above.
    const candidates = [fieldNorm, ...aliasList.map(normalize)];
    let bestSim = 0;
    let bestHeader = "";
    for (const { orig, norm: headerNorm } of normHeaders) {
      if (usedHeaders.has(orig)) continue;
      const sim = Math.max(...candidates.map((c) => stringSimilarity(headerNorm, c)));
      if (sim > bestSim) { bestSim = sim; bestHeader = orig; }
    }

    if (bestHeader && bestSim >= AUTO_MAP_THRESHOLD) {
      mapping[field] = bestHeader;
      confidence[field] = "fuzzy";
      score[field] = bestSim;
    } else {
      // Don't add sub-threshold fuzzy matches to the mapping — they cause
      // garbage data when the mapping review screen is skipped.  The score
      // is still recorded so the UI can surface them as manual suggestions.
      confidence[field] = "none";
      score[field] = bestSim;
    }
  }

  // ── Post-processing: disambiguate sku vs parentSku ──────────────────────
  // When a BOM-like CSV is imported as InventoryItem (or Product, Forecast,
  // etc.), the fuzzy matcher may pick the "Parent SKU" column for `sku`
  // because "parentsku" is shorter / closer to "sku" than "componentsku".
  // The component column is the right match — each component is its own
  // inventory item, while the parent column has few unique values and causes
  // massive deduplication.
  if ("sku" in mapping && confidence.sku !== "exact") {
    const skuHeaderNorm = normalize(mapping.sku);
    const parentAliases = FIELD_ALIASES.parentSku ?? [];
    const componentAliases = FIELD_ALIASES.componentSku ?? [];
    const isParentLike =
      parentAliases.includes(skuHeaderNorm) || skuHeaderNorm.startsWith("parent");
    if (isParentLike) {
      const componentHeader = normHeaders.find(
        (h) => componentAliases.includes(h.norm) && h.orig !== mapping.sku,
      );
      if (componentHeader) {
        mapping.sku = componentHeader.orig;
        confidence.sku = "alias";
        score.sku = 0.88;
      }
    }
  }

  return { mapping, confidence, score };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Backwards-compatible wrapper (drops score). */
export function suggestMapping(
  headers: string[],
  entity: EntityType
): Record<string, string> {
  return suggestMappingWithConfidence(headers, entity).mapping;
}

/**
 * Returns true when every *required* field for the entity has a mapping
 * AND its confidence score is at or above AUTO_MAP_THRESHOLD.
 * When this is true the mapping UI can be skipped entirely.
 */
export function isHighConfidence(
  fields: readonly { field: string; required: boolean }[],
  score: Record<string, number>,
  mapping: Record<string, string>
): boolean {
  return fields
    .filter((f) => f.required)
    .every((f) => !!mapping[f.field] && (score[f.field] ?? 0) >= AUTO_MAP_THRESHOLD);
}

/** Apply mapping to a row, returning a canonical key → value object.
 *
 *  When an exact key lookup fails (e.g. XLSX headers with extra whitespace,
 *  or case differences between the stored mapping and re-parsed row keys),
 *  a normalised fallback lookup is attempted so imports don't silently drop
 *  every row.
 */
export function applyMapping(
  row: Record<string, string>,
  mapping: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};

  // Build a normalised key → original key map lazily (only if a miss occurs).
  let normKeyMap: Map<string, string> | null = null;
  function getNormKeyMap(): Map<string, string> {
    if (!normKeyMap) {
      normKeyMap = new Map();
      for (const key of Object.keys(row)) {
        normKeyMap.set(key.trim().toLowerCase(), key);
      }
    }
    return normKeyMap;
  }

  for (const [canonical, source] of Object.entries(mapping)) {
    // Skip UI placeholder keys (e.g. "(not available)") that were never resolved
    if (!canonical || canonical.startsWith("(")) continue;
    if (!source) continue;

    if (row[source] !== undefined) {
      result[canonical] = row[source];
    } else {
      // Fallback: normalised lookup handles trimming / casing mismatches
      const actualKey = getNormKeyMap().get(source.trim().toLowerCase());
      if (actualKey !== undefined && row[actualKey] !== undefined) {
        result[canonical] = row[actualKey];
      }
    }
  }
  return result;
}

/**
 * Apply canonical mapping AND collect extra columns into attributes.
 * @param attributeKeys  Source column names the user opted into for attributes storage.
 */
export function applyMappingWithAttributes(
  row: Record<string, string>,
  mapping: Record<string, string>,
  attributeKeys: string[]
): { canonical: Record<string, string>; attributes: Record<string, string> } {
  const canonical = applyMapping(row, mapping);

  const attributes: Record<string, string> = {};
  for (const col of attributeKeys) {
    const val = row[col];
    if (val !== undefined && val !== "") {
      const key = col.toLowerCase().replace(/[\s\-.]+/g, "_").replace(/[^a-z0-9_]/g, "");
      attributes[key] = String(val);
    }
  }

  return { canonical, attributes };
}

/**
 * Infer a column's data type from its sample values for the UI type badge.
 * Returns "numeric", "date", or "text".
 */
export function inferColumnType(samples: string[]): ColumnType {
  if (samples.length === 0) return "text";
  const nonEmpty = samples.filter((s) => s.trim() !== "");
  if (nonEmpty.length === 0) return "text";

  const numericCount = nonEmpty.filter((s) => !isNaN(Number(s.replace(/,/g, "")))).length;
  if (numericCount === nonEmpty.length) return "numeric";

  const dateRe = /^\d{1,4}[-\/\.]\d{1,2}[-\/\.]\d{1,4}$|^\d{4}-\d{2}-\d{2}T/;
  const dateCount = nonEmpty.filter((s) => dateRe.test(s.trim())).length;
  if (dateCount / nonEmpty.length >= 0.8) return "date";

  return "text";
}

// ─── Filename → entity detection ──────────────────────────────────────────────

/**
 * Maps filename patterns to canonical entity table names (snake_case).
 * Each key is a lowercased filename token; value is the canonical entity name.
 */
const FILENAME_ENTITY_MAP: Record<string, string> = {
  // Master Data
  location: "location",
  locations: "location",
  sites: "location",
  warehouses: "location",
  customer: "customer",
  customers: "customer",
  accounts: "customer",
  supplier: "supplier",
  suppliers: "supplier",
  vendors: "supplier",
  vendor: "supplier",
  product: "product",
  products: "product",
  skus: "product",
  items: "product",
  materials: "product",
  employee: "employee",
  employees: "employee",
  staff: "employee",
  operators: "employee",

  // Finance
  exchange_rates: "exchange_rate",
  fx_rates: "exchange_rate",
  currency_rates: "exchange_rate",
  exchange_rate: "exchange_rate",
  price_list: "price_list",
  price_lists: "price_list",
  pricelists: "price_list",
  price_list_lines: "price_list_line",
  prices: "price_list_line",
  item_prices: "price_list_line",
  customer_price_list: "customer_price_list",
  customer_prices: "customer_price_list",

  // Engineering
  bom: "bom_line",
  bill_of_materials: "bom_line",
  bom_lines: "bom_line",
  bom_header: "bom_header",
  bom_headers: "bom_header",
  routing: "routing_operation",
  routings: "routing_operation",
  operations: "routing_operation",
  routing_operations: "routing_operation",
  routing_header: "routing_header",
  routing_headers: "routing_header",
  work_centre: "work_centre",
  work_centres: "work_centre",
  work_center: "work_centre",
  work_centers: "work_centre",
  workcenters: "work_centre",
  shift_calendar: "shift_calendar",
  calendar: "shift_calendar",
  capacity_calendar: "shift_calendar",
  equipment: "equipment",
  assets: "equipment",
  machines: "equipment",
  maintenance: "maintenance_log",
  maintenance_log: "maintenance_log",
  pm_log: "maintenance_log",

  // Inventory
  inventory: "inventory_balance",
  stock: "inventory_balance",
  inventory_balance: "inventory_balance",
  on_hand: "inventory_balance",
  stock_on_hand: "inventory_balance",
  lot: "lot",
  lots: "lot",
  batch: "lot",
  batches: "lot",
  lot_master: "lot",
  serials: "serial_number",
  serial_numbers: "serial_number",
  serial_number: "serial_number",
  unit_history: "serial_number",
  stock_movements: "stock_movement",
  stock_ledger: "stock_movement",
  transactions: "stock_movement",
  stock_movement: "stock_movement",
  movements: "stock_movement",

  // Procurement
  supplier_item: "supplier_item",
  supplier_items: "supplier_item",
  approved_suppliers: "supplier_item",
  purchase_order: "purchase_order",
  purchase_orders: "purchase_order",
  po: "purchase_order",
  pos: "purchase_order",
  purchase_order_line: "purchase_order_line",
  purchase_order_lines: "purchase_order_line",
  po_lines: "purchase_order_line",
  po_line: "purchase_order_line",

  // Planning
  forecast: "sales_forecast",
  sales_forecast: "sales_forecast",
  demand_plan: "sales_forecast",
  demand_forecast: "sales_forecast",
  mps: "mps_entry",
  master_schedule: "mps_entry",
  production_plan: "mps_entry",
  mps_entry: "mps_entry",

  // Production
  work_orders: "work_order",
  work_order: "work_order",
  production_orders: "work_order",
  manufacturing_orders: "work_order",
  wo: "work_order",
  work_order_operation: "work_order_operation",
  work_order_operations: "work_order_operation",
  wo_operations: "work_order_operation",

  // Sales & Fulfilment
  sales_order: "sales_order",
  sales_orders: "sales_order",
  so: "sales_order",
  sales_order_line: "sales_order_line",
  sales_order_lines: "sales_order_line",
  so_lines: "sales_order_line",
  shipments: "shipment",
  deliveries: "shipment",
  dispatch: "shipment",
  shipment: "shipment",
  shipment_lines: "shipment_line",
  shipment_line: "shipment_line",
  invoices: "invoice",
  billing: "invoice",
  invoice: "invoice",
  returns: "return_rma",
  rma: "return_rma",
  rma_log: "return_rma",
  return_rma: "return_rma",

  // Quality
  qc: "qc_inspection",
  inspections: "qc_inspection",
  quality_inspections: "qc_inspection",
  qc_inspection: "qc_inspection",
  ncr: "ncr",
  non_conformance: "ncr",
  defects: "ncr",
  non_conformances: "ncr",
  capa: "capa",
  corrective_actions: "capa",
};

/**
 * Detect the canonical entity name from a filename.
 * Returns the snake_case entity name, or null if no match.
 */
export function detectEntityFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  // Try full base, then split by underscores and check individual tokens
  if (FILENAME_ENTITY_MAP[base]) return FILENAME_ENTITY_MAP[base];
  const tokens = base.split("_");
  // Try progressively shorter token combinations
  for (let len = tokens.length; len >= 1; len--) {
    for (let start = 0; start <= tokens.length - len; start++) {
      const key = tokens.slice(start, start + len).join("_");
      if (FILENAME_ENTITY_MAP[key]) return FILENAME_ENTITY_MAP[key];
    }
  }
  return null;
}

/**
 * Detect which canonical entities the uploaded columns map to.
 * Returns a map of entityName → count of matched columns.
 * Used for multi-entity detection in the import wizard.
 */
export function detectEntitiesFromHeaders(headers: string[]): Record<string, number> {
  const aliases = getRegistryByAlias();
  const counts: Record<string, number> = {};
  const normHeaders = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  for (const norm of normHeaders) {
    const entry = aliases[norm];
    if (entry) {
      counts[entry.entityName] = (counts[entry.entityName] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── Multi-entity column classification ──────────────────────────────────────

export type ColumnClassificationType =
  | "entity_match"
  | "sparse"
  | "outflow_fact"
  | "calculated"
  | "unclassified";

export interface ColumnClassification {
  type: ColumnClassificationType;
  entity?: string;
  canonicalField?: string;
  score?: number;
  outflowWindow?: number;
  logicParamKey?: string;
  logicParamValue?: { days: number; unit: string };
  windowAssumed?: boolean;
}

/**
 * Entity priority for classifier tie-breaking (lower = higher priority).
 * InventoryItem wins over Product when both match the same column equally.
 */
const CLASSIFIER_ENTITY_PRIORITY: string[] = [
  "InventoryItem", "Supplier", "Product", "BOM", "Order",
];
function entityPriorityForClassifier(entity: string | undefined): number {
  if (!entity) return CLASSIFIER_ENTITY_PRIORITY.length;
  const idx = CLASSIFIER_ENTITY_PRIORITY.indexOf(entity);
  return idx === -1 ? CLASSIFIER_ENTITY_PRIORITY.length : idx;
}

/** Keywords that identify outflow/exit columns (Hebrew + English). */
const OUTFLOW_KEYWORDS = ["outflow", "exit", "dispatch", "יציאות"];

/**
 * Compound keyword pairs that identify calculated days-of-stock columns.
 * A column must contain at least one pair (both words present) to qualify.
 */
const CALCULATED_KEYWORD_PAIRS: [string, string][] = [
  ["days", "supply"],
  ["days", "stock"],
  ["days", "coverage"],
  ["stock", "coverage"],
  ["stock", "turnover"],
  ["ימי", "מלאי"],
];

/**
 * Normalized column name patterns that are always classified as calculated
 * (days-of-supply family) even without a detectable window number.
 */
const CALCULATED_PATTERNS = [
  "daysofsupply", "daysofstock", "stockdays", "coveragedays",
  "dos", "inventorydays",
];

/** Time windows we recognise in column names. */
const KNOWN_WINDOWS = [7, 30, 60, 90, 92];

/**
 * Try to extract a known time-window number from a column name.
 * Returns the window (e.g. 30) or undefined.
 */
function extractWindow(header: string): number | undefined {
  const numbers = header.match(/\d+/g);
  if (!numbers) return undefined;
  for (const n of numbers) {
    const parsed = parseInt(n, 10);
    if (KNOWN_WINDOWS.includes(parsed)) return parsed;
  }
  return undefined;
}

/** True when every non-empty sample value is an integer. */
function allIntegers(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => /^-?\d+$/.test(v.trim()));
}

/** True when every non-empty sample value is numeric (int or float). */
function allNumeric(values: string[]): boolean {
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((v) => !isNaN(Number(v.trim())) && v.trim() !== "");
}

/**
 * Classify each column in a multi-entity upload.
 *
 * Classification order (first match wins):
 * 1. **outflow_fact** — outflow keywords + all-integer samples + detectable window
 * 2. **calculated** — days/stock keywords + numeric samples + detectable window
 * 3. **entity_match** — best entity/field match via `suggestMappingWithConfidence` ≥ 0.8
 *    (becomes **sparse** if >15% nulls and values repeat, indicating fill-down pattern)
 * 4. **unclassified** — everything else
 */
export function classifyColumns(
  headers: string[],
  sampleValues: Record<string, string[]>,
): Record<string, ColumnClassification> {
  const result: Record<string, ColumnClassification> = {};

  // Pre-compute entity mapping results for all entities — we'll pick the
  // best entity+field per header across ALL entity types.
  const entityTypes = Object.keys(CANONICAL_FIELDS) as EntityType[];

  for (const header of headers) {
    const headerLower = header.toLowerCase();
    const samples = sampleValues[header] ?? [];

    // ── 1. outflow_fact ────────────────────────────────────────────────
    const hasOutflowKeyword = OUTFLOW_KEYWORDS.some((kw) => headerLower.includes(kw));
    const window = extractWindow(header);
    if (hasOutflowKeyword && allIntegers(samples) && window !== undefined) {
      result[header] = { type: "outflow_fact", outflowWindow: window };
      continue;
    }

    // ── 2. calculated ──────────────────────────────────────────────────
    const headerNorm = headerLower.replace(/[^a-z0-9]/g, "");
    const hasCalcKeyword = CALCULATED_KEYWORD_PAIRS.some(
      ([a, b]) => headerLower.includes(a) && headerLower.includes(b),
    );
    const matchesCalcPattern = CALCULATED_PATTERNS.some((p) => headerNorm === p || headerNorm.includes(p));
    if ((hasCalcKeyword || matchesCalcPattern) && allNumeric(samples)) {
      const detectedWindow = window;
      result[header] = {
        type: "calculated",
        entity: "inventoryItem",
        canonicalField: "daysOfSupply",
        logicParamKey: "days_of_supply_lookback_days",
        logicParamValue: { days: detectedWindow ?? 30, unit: "days" },
        ...(detectedWindow === undefined ? { windowAssumed: true } : {}),
      };
      continue;
    }

    // ── 3. entity_match / sparse ───────────────────────────────────────
    let bestScore = 0;
    let bestEntity: string | undefined;
    let bestField: string | undefined;

    for (const entity of entityTypes) {
      const { mapping, score } = suggestMappingWithConfidence([header], entity);
      // mapping is canonical → source; find the field that mapped to this header
      for (const [field, sourceCol] of Object.entries(mapping)) {
        const fieldScore = score[field] ?? 0;
        if (sourceCol === header && fieldScore >= bestScore) {
          // On tie, prefer the entity with higher priority (InventoryItem > Product)
          if (fieldScore > bestScore || entityPriorityForClassifier(entity) < entityPriorityForClassifier(bestEntity)) {
            bestScore = fieldScore;
            bestEntity = entity;
            bestField = field;
          }
        }
      }
    }

    if (bestScore >= AUTO_MAP_THRESHOLD && bestEntity && bestField) {
      // Check for sparse pattern: >15% null rate + repeating values
      const nullCount = samples.filter(
        (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === ""),
      ).length;
      const nullRate = samples.length > 0 ? nullCount / samples.length : 0;
      const nonNullValues = samples.filter(
        (v) => v !== null && v !== undefined && (typeof v !== "string" || v.trim() !== ""),
      );
      const uniqueValues = new Set(nonNullValues);
      const hasRepeats = nonNullValues.length > uniqueValues.size;

      if (nullRate > 0.15 && hasRepeats) {
        result[header] = {
          type: "sparse",
          entity: bestEntity,
          canonicalField: bestField,
          score: bestScore,
        };
      } else {
        result[header] = {
          type: "entity_match",
          entity: bestEntity,
          canonicalField: bestField,
          score: bestScore,
        };
      }
      continue;
    }

    // ── 4. unclassified ────────────────────────────────────────────────
    result[header] = { type: "unclassified" };
  }

  return result;
}
