-- =============================================================
-- Migration: apply_remaining_migrations_5_7_9_10
-- Covers:
--   Migration  5 — SupplierItem (new model)
--   Migration  7 — RoutingOperation (new model) + Routing canonical fields
--   Migration  9 — DemandForecast (new model)
--   Migration 10 — MPSEntry (new model)
--   Field merges: Product, InventoryItem, BOMLine, PurchaseOrder,
--                 POLine, WorkOrderOperation
-- =============================================================

-- ── NEW ENUMS ─────────────────────────────────────────────────

CREATE TYPE "MakeBuyType" AS ENUM ('MAKE', 'BUY', 'OTHER');

CREATE TYPE "SupplierItemStatus" AS ENUM ('APPROVED', 'PREFERRED', 'BLOCKED');

CREATE TYPE "ForecastType" AS ENUM ('STARTING', 'SALES_ADJ', 'BACKLOG_CATCHUP', 'FINAL');

-- ── PRODUCT — new fields ──────────────────────────────────────

ALTER TABLE "Product"
  ADD COLUMN "makeBuy"               "MakeBuyType" NOT NULL DEFAULT 'BUY',
  ADD COLUMN "safetyStockConstraint" DECIMAL(65,30),
  ADD COLUMN "moq"                   INTEGER,
  ADD COLUMN "orderMultiple"         INTEGER;

-- ── INVENTORY ITEM — new fields ───────────────────────────────

ALTER TABLE "InventoryItem"
  ADD COLUMN "qtyOnHold"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "qtyOnHandTotal"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "qtyOpenPO"          DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "qtyOnHandPlusPO"    DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "demandCurrentMonth" DECIMAL(65,30),
  ADD COLUMN "demandNextMonth"    DECIMAL(65,30),
  ADD COLUMN "demandMonth3"       DECIMAL(65,30),
  ADD COLUMN "demandPerDay"       DECIMAL(65,30),
  ADD COLUMN "daysOfSupply"       DECIMAL(65,30),
  ADD COLUMN "lastReceiptDate"    TIMESTAMP(3),
  ADD COLUMN "buyRecommendation"  BOOLEAN,
  ADD COLUMN "recommendedQty"     DECIMAL(65,30),
  ADD COLUMN "moq"                INTEGER,
  ADD COLUMN "orderMultiple"      INTEGER;

-- ── BOM LINE — new fields ─────────────────────────────────────

ALTER TABLE "BOMLine"
  ADD COLUMN "parentComponentId" TEXT,
  ADD COLUMN "componentCost"     DECIMAL(65,30);

-- ── PURCHASE ORDER — new fields ───────────────────────────────

ALTER TABLE "PurchaseOrder"
  ADD COLUMN "confirmedETA" TIMESTAMP(3);

-- ── PO LINE — new fields ──────────────────────────────────────

ALTER TABLE "POLine"
  ADD COLUMN "qtyOpen"      DECIMAL(65,30),
  ADD COLUMN "confirmedETA" TIMESTAMP(3);

-- ── WORK ORDER OPERATION — new fields ─────────────────────────

ALTER TABLE "WorkOrderOperation"
  ADD COLUMN "workCenter" TEXT,
  ADD COLUMN "line"       TEXT,
  ADD COLUMN "setupMins"  DECIMAL(65,30);

-- ── ROUTING — canonical header fields (merge) ─────────────────

ALTER TABLE "Routing"
  ADD COLUMN "orgId"     TEXT,
  ADD COLUMN "productId" TEXT,
  ADD COLUMN "revision"  TEXT,
  ADD COLUMN "isActive"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notes"     TEXT;

-- ── SUPPLIER ITEM (Migration 5) ───────────────────────────────

CREATE TABLE "SupplierItem" (
    "id"                 TEXT NOT NULL,
    "orgId"              TEXT NOT NULL,
    "supplierId"         TEXT NOT NULL,
    "productId"          TEXT NOT NULL,
    "supplierPartNumber" TEXT,
    "status"             "SupplierItemStatus" NOT NULL DEFAULT 'APPROVED',
    "leadTimeDays"       INTEGER,
    "moq"                INTEGER,
    "orderMultiple"      INTEGER,
    "contractUnitCost"   DECIMAL(65,30),
    "costValidFrom"      TIMESTAMP(3),
    "costValidTo"        TIMESTAMP(3),
    "countryOfOrigin"    TEXT,
    "approvedSubstitute" TEXT,
    "notes"              TEXT,
    "attributes"         JSONB,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierItem_orgId_supplierId_productId_key"
    ON "SupplierItem"("orgId", "supplierId", "productId");

CREATE INDEX "SupplierItem_orgId_productId_idx"
    ON "SupplierItem"("orgId", "productId");

ALTER TABLE "SupplierItem"
  ADD CONSTRAINT "SupplierItem_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SupplierItem"
  ADD CONSTRAINT "SupplierItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ROUTING OPERATION (Migration 7) ──────────────────────────

CREATE TABLE "RoutingOperation" (
    "id"                TEXT NOT NULL,
    "routingId"         TEXT NOT NULL,
    "sequence"          INTEGER NOT NULL,
    "name"              TEXT NOT NULL,
    "workCenter"        TEXT,
    "line"              TEXT,
    "setupMins"         DECIMAL(65,30),
    "runMinsPerUnit"    DECIMAL(65,30),
    "effRunMinsPerUnit" DECIMAL(65,30),
    "yieldPct"          DECIMAL(65,30),
    "hasInspection"     BOOLEAN NOT NULL DEFAULT false,
    "lotSize"           INTEGER,
    "notes"             TEXT,

    CONSTRAINT "RoutingOperation_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RoutingOperation"
  ADD CONSTRAINT "RoutingOperation_routingId_fkey"
    FOREIGN KEY ("routingId") REFERENCES "Routing"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK from Routing.productId → Product.id (nullable)
ALTER TABLE "Routing"
  ADD CONSTRAINT "Routing_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── DEMAND FORECAST (Migration 9) ─────────────────────────────

CREATE TABLE "DemandForecast" (
    "id"          TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "periodYear"  INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "type"        "ForecastType" NOT NULL,
    "qty"         DECIMAL(65,30) NOT NULL,
    "source"      TEXT,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemandForecast_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemandForecast_orgId_productId_periodYear_periodMonth_type_key"
    ON "DemandForecast"("orgId", "productId", "periodYear", "periodMonth", "type");

CREATE INDEX "DemandForecast_orgId_productId_idx"
    ON "DemandForecast"("orgId", "productId");

CREATE INDEX "DemandForecast_orgId_periodYear_periodMonth_idx"
    ON "DemandForecast"("orgId", "periodYear", "periodMonth");

ALTER TABLE "DemandForecast"
  ADD CONSTRAINT "DemandForecast_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── MPS ENTRY (Migration 10) ───────────────────────────────────

CREATE TABLE "MPSEntry" (
    "id"                 TEXT NOT NULL,
    "orgId"              TEXT NOT NULL,
    "productId"          TEXT NOT NULL,
    "periodYear"         INTEGER NOT NULL,
    "periodMonth"        INTEGER NOT NULL,
    "forecastQty"        DECIMAL(65,30),
    "backlogCatchup"     DECIMAL(65,30),
    "begFGInventory"     DECIMAL(65,30),
    "targetEndInventory" DECIMAL(65,30),
    "unconstrainedBuild" DECIMAL(65,30),
    "lotSize"            INTEGER,
    "plannedBuild"       DECIMAL(65,30),
    "endFGInventory"     DECIMAL(65,30),
    "isLocked"           BOOLEAN NOT NULL DEFAULT false,
    "notes"              TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MPSEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MPSEntry_orgId_productId_periodYear_periodMonth_key"
    ON "MPSEntry"("orgId", "productId", "periodYear", "periodMonth");

CREATE INDEX "MPSEntry_orgId_productId_idx"
    ON "MPSEntry"("orgId", "productId");

CREATE INDEX "MPSEntry_orgId_periodYear_periodMonth_idx"
    ON "MPSEntry"("orgId", "periodYear", "periodMonth");

ALTER TABLE "MPSEntry"
  ADD CONSTRAINT "MPSEntry_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
