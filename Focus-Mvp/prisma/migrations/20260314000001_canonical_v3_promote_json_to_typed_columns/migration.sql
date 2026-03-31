-- canonical_v3: Promote all canonical-schema fields from JSON blobs to typed columns
-- Every field in canonical_schema.json must be a first-class typed column.

-- ── Product ───────────────────────────────────────────────────────────
ALTER TABLE "Product" ADD COLUMN "productFamily" TEXT;
ALTER TABLE "Product" ADD COLUMN "shelfLifeDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "drawingNumber" TEXT;
ALTER TABLE "Product" ADD COLUMN "drawingRevision" TEXT;
ALTER TABLE "Product" ADD COLUMN "abcClass" TEXT;
ALTER TABLE "Product" ADD COLUMN "productLine" TEXT;
ALTER TABLE "Product" ADD COLUMN "regulatoryClass" TEXT;
ALTER TABLE "Product" ADD COLUMN "listPrice" DECIMAL(12,2);

-- ── Supplier ──────────────────────────────────────────────────────────
ALTER TABLE "Supplier" ADD COLUMN "city" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "leadTimeCategory" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "qualityRating" DECIMAL(3,1);
ALTER TABLE "Supplier" ADD COLUMN "onTimePct" DECIMAL(5,2);
ALTER TABLE "Supplier" ADD COLUMN "certifications" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "status" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "approvedSince" TIMESTAMP(3);

-- ── Customer ──────────────────────────────────────────────────────────
ALTER TABLE "Customer" ADD COLUMN "type" TEXT;
ALTER TABLE "Customer" ADD COLUMN "city" TEXT;
ALTER TABLE "Customer" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "Customer" ADD COLUMN "accountManagerId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "status" TEXT;
ALTER TABLE "Customer" ADD COLUMN "sinceDate" TIMESTAMP(3);

-- ── Location ──────────────────────────────────────────────────────────
ALTER TABLE "Location" ADD COLUMN "city" TEXT;
ALTER TABLE "Location" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Location" ADD COLUMN "notes" TEXT;

-- ── InventoryItem ─────────────────────────────────────────────────────
ALTER TABLE "InventoryItem" ADD COLUMN "unitCost" DECIMAL(12,4);
ALTER TABLE "InventoryItem" ADD COLUMN "totalValue" DECIMAL(16,2);

-- ── Lot ───────────────────────────────────────────────────────────────
ALTER TABLE "Lot" ADD COLUMN "lotType" TEXT;
ALTER TABLE "Lot" ADD COLUMN "originType" TEXT;
ALTER TABLE "Lot" ADD COLUMN "originReference" TEXT;
ALTER TABLE "Lot" ADD COLUMN "qtyCreated" DECIMAL(65,30);
ALTER TABLE "Lot" ADD COLUMN "qtyOnHand" DECIMAL(65,30);
ALTER TABLE "Lot" ADD COLUMN "qtyConsumed" DECIMAL(65,30);
ALTER TABLE "Lot" ADD COLUMN "qtyScrapped" DECIMAL(65,30);
ALTER TABLE "Lot" ADD COLUMN "locationId" TEXT;
ALTER TABLE "Lot" ADD COLUMN "status" TEXT;
ALTER TABLE "Lot" ADD COLUMN "releasedBy" TEXT;
ALTER TABLE "Lot" ADD COLUMN "notes" TEXT;

-- ── StockMovement ─────────────────────────────────────────────────────
ALTER TABLE "StockMovement" ADD COLUMN "uom" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "fromLocationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "toLocationId" TEXT;

-- ── SupplierItem ──────────────────────────────────────────────────────
ALTER TABLE "SupplierItem" ADD COLUMN "currency" TEXT;

-- ── PurchaseOrder ─────────────────────────────────────────────────────
ALTER TABLE "PurchaseOrder" ADD COLUMN "orderDate" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "totalLines" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "buyerId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "poType" TEXT;

-- ── POLine ────────────────────────────────────────────────────────────
ALTER TABLE "POLine" ADD COLUMN "lineValue" DECIMAL(65,30);
ALTER TABLE "POLine" ADD COLUMN "status" TEXT;
ALTER TABLE "POLine" ADD COLUMN "notes" TEXT;

-- ── SalesOrder ────────────────────────────────────────────────────────
ALTER TABLE "SalesOrder" ADD COLUMN "orderDate" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN "actualShipDate" TIMESTAMP(3);
ALTER TABLE "SalesOrder" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "salesRepId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "incoterms" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "shipToLocationId" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN "customerPoRef" TEXT;

-- ── SOLine ────────────────────────────────────────────────────────────
ALTER TABLE "SOLine" ADD COLUMN "qtyOpen" DECIMAL(65,30);
ALTER TABLE "SOLine" ADD COLUMN "lineValue" DECIMAL(65,30);
ALTER TABLE "SOLine" ADD COLUMN "status" TEXT;
ALTER TABLE "SOLine" ADD COLUMN "confirmedDate" TIMESTAMP(3);

-- ── BOMHeader ─────────────────────────────────────────────────────────
ALTER TABLE "BOMHeader" ADD COLUMN "status" TEXT;
ALTER TABLE "BOMHeader" ADD COLUMN "totalComponents" INTEGER;
ALTER TABLE "BOMHeader" ADD COLUMN "totalBomCost" DECIMAL(12,2);
ALTER TABLE "BOMHeader" ADD COLUMN "applicableStandard" TEXT;
ALTER TABLE "BOMHeader" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "BOMHeader" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "BOMHeader" ADD COLUMN "approvalDate" TIMESTAMP(3);

-- ── BOMLine ───────────────────────────────────────────────────────────
ALTER TABLE "BOMLine" ADD COLUMN "section" TEXT;
ALTER TABLE "BOMLine" ADD COLUMN "extendedCost" DECIMAL(12,4);
ALTER TABLE "BOMLine" ADD COLUMN "makeBuy" TEXT;
ALTER TABLE "BOMLine" ADD COLUMN "isCritical" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BOMLine" ADD COLUMN "approvedSubSku" TEXT;

-- ── Routing ───────────────────────────────────────────────────────────
ALTER TABLE "Routing" ADD COLUMN "status" TEXT;
ALTER TABLE "Routing" ADD COLUMN "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "Routing" ADD COLUMN "effectiveTo" TIMESTAMP(3);
ALTER TABLE "Routing" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Routing" ADD COLUMN "approvalDate" TIMESTAMP(3);

-- ── RoutingOperation ──────────────────────────────────────────────────
ALTER TABLE "RoutingOperation" ADD COLUMN "requiredSkill" TEXT;
ALTER TABLE "RoutingOperation" ADD COLUMN "certOperatorRequired" BOOLEAN NOT NULL DEFAULT false;

-- ── WorkCenter ────────────────────────────────────────────────────────
ALTER TABLE "WorkCenter" ADD COLUMN "department" TEXT;
ALTER TABLE "WorkCenter" ADD COLUMN "capacityHrsDay" DECIMAL(5,2);
ALTER TABLE "WorkCenter" ADD COLUMN "operatorsPerShift" INTEGER;
ALTER TABLE "WorkCenter" ADD COLUMN "shiftsPerDay" INTEGER;
ALTER TABLE "WorkCenter" ADD COLUMN "availableDaysWeek" INTEGER;
ALTER TABLE "WorkCenter" ADD COLUMN "oeeTargetPct" DECIMAL(5,2);
ALTER TABLE "WorkCenter" ADD COLUMN "oeeCurrentPct" DECIMAL(5,2);
ALTER TABLE "WorkCenter" ADD COLUMN "notes" TEXT;

-- ── Equipment ─────────────────────────────────────────────────────────
ALTER TABLE "Equipment" ADD COLUMN "installationDate" TIMESTAMP(3);
ALTER TABLE "Equipment" ADD COLUMN "maintenanceIntervalDays" INTEGER;
ALTER TABLE "Equipment" ADD COLUMN "lastPmDate" TIMESTAMP(3);
ALTER TABLE "Equipment" ADD COLUMN "calibrationDue" TIMESTAMP(3);
ALTER TABLE "Equipment" ADD COLUMN "notes" TEXT;

-- ── MaintenanceLog ────────────────────────────────────────────────────
ALTER TABLE "MaintenanceLog" ADD COLUMN "performedByExternal" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "partsUsed" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "result" TEXT;
ALTER TABLE "MaintenanceLog" ADD COLUMN "notes" TEXT;

-- ── WorkOrder ─────────────────────────────────────────────────────────
ALTER TABLE "WorkOrder" ADD COLUMN "routingId" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "productionLine" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "yieldPct" DECIMAL(5,2);
ALTER TABLE "WorkOrder" ADD COLUMN "lotNumber" TEXT;
ALTER TABLE "WorkOrder" ADD COLUMN "operatorLeadId" TEXT;

-- ── WorkOrderOperation ────────────────────────────────────────────────
ALTER TABLE "WorkOrderOperation" ADD COLUMN "routingOpId" TEXT;
ALTER TABLE "WorkOrderOperation" ADD COLUMN "operatorId" TEXT;
ALTER TABLE "WorkOrderOperation" ADD COLUMN "plannedQty" DECIMAL(65,30);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualQtyGood" DECIMAL(65,30);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualQtyScrap" DECIMAL(65,30);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualQtyRework" DECIMAL(65,30);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "plannedSetupMin" DECIMAL(8,2);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualSetupMin" DECIMAL(8,2);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "plannedRunMin" DECIMAL(8,2);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualRunMin" DECIMAL(8,2);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "plannedStart" TIMESTAMP(3);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualStart" TIMESTAMP(3);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "actualEnd" TIMESTAMP(3);
ALTER TABLE "WorkOrderOperation" ADD COLUMN "yieldPct" DECIMAL(5,2);

-- ── QCInspection ──────────────────────────────────────────────────────
ALTER TABLE "QCInspection" ADD COLUMN "qtyInspected" DECIMAL(65,30);
ALTER TABLE "QCInspection" ADD COLUMN "qtyPassed" DECIMAL(65,30);
ALTER TABLE "QCInspection" ADD COLUMN "qtyFailed" DECIMAL(65,30);
ALTER TABLE "QCInspection" ADD COLUMN "yieldPct" DECIMAL(5,2);
ALTER TABLE "QCInspection" ADD COLUMN "disposition" TEXT;
