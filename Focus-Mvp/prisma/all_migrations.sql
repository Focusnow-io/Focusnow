-- ============================================================
-- 20260307220459_init
-- ============================================================
-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('CSV', 'XLSX');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'MAPPING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('PURCHASE', 'SALES', 'TRANSFER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RuleCategory" AS ENUM ('THRESHOLD', 'POLICY', 'CONSTRAINT', 'KPI', 'ALERT');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AppTemplate" AS ENUM ('REORDER_DASHBOARD', 'STOCK_ALERTS', 'SUPPLIER_PERFORMANCE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER,
    "importedRows" INTEGER,
    "errorMessage" TEXT,
    "mappingConfig" JSONB,
    "rawHeaders" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT,
    "unitCost" DECIMAL(12,4),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "country" TEXT,
    "leadTimeDays" INTEGER,
    "paymentTerms" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "parentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "reservedQty" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,4),
    "reorderQty" DECIMAL(12,4),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "type" "OrderType" NOT NULL DEFAULT 'PURCHASE',
    "supplierId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "orderDate" TIMESTAMP(3),
    "expectedDate" TIMESTAMP(3),
    "totalAmount" DECIMAL(12,2),
    "currency" TEXT,
    "notes" TEXT,
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unitPrice" DECIMAL(12,4),
    "totalPrice" DECIMAL(12,2),

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMItem" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "unit" TEXT,

    CONSTRAINT "BOMItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrainRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "RuleCategory" NOT NULL,
    "entity" TEXT NOT NULL,
    "condition" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "parameters" JSONB,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "tags" TEXT[],
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrainRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrainRuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "commitMessage" TEXT,
    "committedBy" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainRuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppInstance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "template" "AppTemplate" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "customCode" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMember_organizationId_userId_key" ON "OrgMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "DataSource_organizationId_idx" ON "DataSource"("organizationId");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "Product"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_organizationId_code_key" ON "Supplier"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Location_organizationId_idx" ON "Location"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_organizationId_code_key" ON "Location"("organizationId", "code");

-- CreateIndex
CREATE INDEX "InventoryItem_organizationId_idx" ON "InventoryItem"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_organizationId_productId_locationId_key" ON "InventoryItem"("organizationId", "productId", "locationId");

-- CreateIndex
CREATE INDEX "Order_organizationId_idx" ON "Order"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_orderNumber_key" ON "Order"("organizationId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BOMItem_parentId_childId_key" ON "BOMItem"("parentId", "childId");

-- CreateIndex
CREATE INDEX "BrainRule_organizationId_idx" ON "BrainRule"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BrainRule_organizationId_name_key" ON "BrainRule"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BrainRuleVersion_ruleId_version_key" ON "BrainRuleVersion"("ruleId", "version");

-- CreateIndex
CREATE INDEX "AppInstance_organizationId_idx" ON "AppInstance"("organizationId");

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMember" ADD CONSTRAINT "OrgMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMItem" ADD CONSTRAINT "BOMItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainRule" ADD CONSTRAINT "BrainRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrainRuleVersion" ADD CONSTRAINT "BrainRuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "BrainRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInstance" ADD CONSTRAINT "AppInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 20260311000000_ode_operational_data_environment
-- ============================================================
-- ============================================================
-- Migration: Operational Data Environment (ODE)
-- Adds Connector, ConnectorSync, OperationalRelationship,
-- and OperationalEvent models to support a real-time
-- operational graph of the company.
-- ============================================================

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

CREATE TYPE "ConnectorType" AS ENUM (
  'FILE_IMPORT',
  'REST_API',
  'WEBHOOK',
  'DATABASE',
  'SFTP'
);

CREATE TYPE "ConnectorStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'SYNCING',
  'ERROR'
);

CREATE TYPE "SyncStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'PARTIAL'
);

CREATE TYPE "RelationshipType" AS ENUM (
  'SUPPLIES',
  'STOCKS_AT',
  'SOURCES_FROM',
  'FULFILLS',
  'COMPONENT_OF',
  'LOCATED_IN',
  'TRANSFERS_BETWEEN',
  'SHIPS_TO'
);

CREATE TYPE "OdeEntityType" AS ENUM (
  'PRODUCT',
  'SUPPLIER',
  'LOCATION',
  'INVENTORY_ITEM',
  'ORDER',
  'ORDER_LINE'
);

-- ---------------------------------------------------------------------------
-- Connector — represents a connection to an operational system
-- ---------------------------------------------------------------------------

CREATE TABLE "Connector" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "type"           "ConnectorType" NOT NULL,
  "status"         "ConnectorStatus" NOT NULL DEFAULT 'INACTIVE',
  "config"         JSONB NOT NULL DEFAULT '{}',
  "syncIntervalMs" INTEGER,
  "lastSyncAt"     TIMESTAMP(3),
  "nextSyncAt"     TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Connector_organizationId_name_key"
  ON "Connector"("organizationId", "name");

CREATE INDEX "Connector_organizationId_idx"
  ON "Connector"("organizationId");

ALTER TABLE "Connector"
  ADD CONSTRAINT "Connector_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ConnectorSync — sync run history per connector
-- ---------------------------------------------------------------------------

CREATE TABLE "ConnectorSync" (
  "id"               TEXT NOT NULL,
  "connectorId"      TEXT NOT NULL,
  "status"           "SyncStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"      TIMESTAMP(3),
  "recordsRead"      INTEGER NOT NULL DEFAULT 0,
  "recordsUpserted"  INTEGER NOT NULL DEFAULT 0,
  "recordsFailed"    INTEGER NOT NULL DEFAULT 0,
  "errors"           JSONB,
  "metadata"         JSONB,

  CONSTRAINT "ConnectorSync_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConnectorSync_connectorId_idx"
  ON "ConnectorSync"("connectorId");

ALTER TABLE "ConnectorSync"
  ADD CONSTRAINT "ConnectorSync_connectorId_fkey"
  FOREIGN KEY ("connectorId")
  REFERENCES "Connector"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalRelationship — the operational graph edges
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalRelationship" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "type"           "RelationshipType" NOT NULL,
  "sourceType"     "OdeEntityType" NOT NULL,
  "sourceId"       TEXT NOT NULL,
  "targetType"     "OdeEntityType" NOT NULL,
  "targetId"       TEXT NOT NULL,
  "strength"       DOUBLE PRECISION,
  "metadata"       JSONB,
  "validFrom"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validTo"        TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OperationalRelationship_pkey" PRIMARY KEY ("id")
);

-- Unique edge constraint (one active edge per type + node pair)
CREATE UNIQUE INDEX "OperationalRelationship_unique_edge"
  ON "OperationalRelationship"(
    "organizationId",
    "type",
    "sourceType",
    "sourceId",
    "targetType",
    "targetId"
  );

-- Outbound traversal index
CREATE INDEX "OperationalRelationship_source_idx"
  ON "OperationalRelationship"("organizationId", "sourceType", "sourceId");

-- Inbound traversal index
CREATE INDEX "OperationalRelationship_target_idx"
  ON "OperationalRelationship"("organizationId", "targetType", "targetId");

-- Edge type filter index
CREATE INDEX "OperationalRelationship_type_idx"
  ON "OperationalRelationship"("organizationId", "type");

ALTER TABLE "OperationalRelationship"
  ADD CONSTRAINT "OperationalRelationship_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- OperationalEvent — immutable state-change event log
-- ---------------------------------------------------------------------------

CREATE TABLE "OperationalEvent" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType"     "OdeEntityType" NOT NULL,
  "entityId"       TEXT NOT NULL,
  "eventType"      TEXT NOT NULL,
  "previousState"  JSONB,
  "currentState"   JSONB NOT NULL,
  "connectorId"    TEXT,
  "source"         TEXT,
  "occurredAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);

-- Entity timeline index
CREATE INDEX "OperationalEvent_entity_idx"
  ON "OperationalEvent"("organizationId", "entityType", "entityId");

-- Chronological index
CREATE INDEX "OperationalEvent_time_idx"
  ON "OperationalEvent"("organizationId", "occurredAt");

-- Event type index
CREATE INDEX "OperationalEvent_eventType_idx"
  ON "OperationalEvent"("organizationId", "eventType");

ALTER TABLE "OperationalEvent"
  ADD CONSTRAINT "OperationalEvent_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 20260311160854_add_attributes_and_mapping_templates
-- ============================================================
-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "attributes" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "attributes" JSONB;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "attributes" JSONB;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "attributes" JSONB;

-- CreateTable
CREATE TABLE "MappingTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "attributeKeys" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MappingTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MappingTemplate_organizationId_idx" ON "MappingTemplate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MappingTemplate_organizationId_name_key" ON "MappingTemplate"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "MappingTemplate" ADD CONSTRAINT "MappingTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "OperationalEvent_entity_idx" RENAME TO "OperationalEvent_organizationId_entityType_entityId_idx";

-- RenameIndex
ALTER INDEX "OperationalEvent_eventType_idx" RENAME TO "OperationalEvent_organizationId_eventType_idx";

-- RenameIndex
ALTER INDEX "OperationalEvent_time_idx" RENAME TO "OperationalEvent_organizationId_occurredAt_idx";

-- RenameIndex
ALTER INDEX "OperationalRelationship_source_idx" RENAME TO "OperationalRelationship_organizationId_sourceType_sourceId_idx";

-- RenameIndex
ALTER INDEX "OperationalRelationship_target_idx" RENAME TO "OperationalRelationship_organizationId_targetType_targetId_idx";

-- RenameIndex
ALTER INDEX "OperationalRelationship_type_idx" RENAME TO "OperationalRelationship_organizationId_type_idx";

-- RenameIndex
ALTER INDEX "OperationalRelationship_unique_edge" RENAME TO "OperationalRelationship_organizationId_type_sourceType_sour_key";

-- ============================================================
-- 20260311172428_add_bom_forecast_mps
-- ============================================================
-- AlterTable
ALTER TABLE "BOMItem" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "scrapFactor" DECIMAL(6,4);

-- CreateTable
CREATE TABLE "ForecastEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "forecastQty" DECIMAL(12,4) NOT NULL,
    "forecastUnit" TEXT,
    "channel" TEXT,
    "version" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpsEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "plannedQty" DECIMAL(12,4) NOT NULL,
    "confirmedQty" DECIMAL(12,4),
    "workCenter" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastEntry_organizationId_idx" ON "ForecastEntry"("organizationId");

-- CreateIndex
CREATE INDEX "ForecastEntry_organizationId_sku_idx" ON "ForecastEntry"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastEntry_organizationId_sku_period_channel_version_key" ON "ForecastEntry"("organizationId", "sku", "period", "channel", "version");

-- CreateIndex
CREATE INDEX "MpsEntry_organizationId_idx" ON "MpsEntry"("organizationId");

-- CreateIndex
CREATE INDEX "MpsEntry_organizationId_sku_idx" ON "MpsEntry"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "MpsEntry_organizationId_sku_period_workCenter_key" ON "MpsEntry"("organizationId", "sku", "period", "workCenter");

-- AddForeignKey
ALTER TABLE "ForecastEntry" ADD CONSTRAINT "ForecastEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpsEntry" ADD CONSTRAINT "MpsEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 20260311173205_add_work_orders_routing_work_centers
-- ============================================================
-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "plannedQty" DECIMAL(12,4) NOT NULL,
    "actualQty" DECIMAL(12,4),
    "unit" TEXT,
    "workCenter" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "operationNo" INTEGER NOT NULL,
    "workCenter" TEXT NOT NULL,
    "description" TEXT,
    "setupTimeMins" DECIMAL(8,2),
    "runTimeMins" DECIMAL(8,4),
    "runTimeUnit" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "availableHoursPerWeek" DECIMAL(6,2),
    "efficiency" DECIMAL(5,4),
    "costRatePerHour" DECIMAL(10,2),
    "calendar" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_idx" ON "WorkOrder"("organizationId");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_sku_idx" ON "WorkOrder"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_orderNumber_key" ON "WorkOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "Routing_organizationId_idx" ON "Routing"("organizationId");

-- CreateIndex
CREATE INDEX "Routing_organizationId_sku_idx" ON "Routing"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Routing_organizationId_sku_operationNo_key" ON "Routing"("organizationId", "sku", "operationNo");

-- CreateIndex
CREATE INDEX "WorkCenter_organizationId_idx" ON "WorkCenter"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_organizationId_code_key" ON "WorkCenter"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 20260312103139_add_manufacturing_canonical_fields
-- ============================================================
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('FINISHED_GOOD', 'RAW_MATERIAL', 'COMPONENT', 'SUBASSEMBLY', 'SERVICE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('WAREHOUSE', 'AREA', 'AISLE', 'BIN', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'SCRAP');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WOStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SOStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QCType" AS ENUM ('INCOMING', 'IN_PROCESS', 'FINAL', 'PERIODIC');

-- CreateEnum
CREATE TYPE "QCStatus" AS ENUM ('PENDING', 'PASS', 'FAIL', 'CONDITIONAL_PASS');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('OPERATIONAL', 'MAINTENANCE', 'DOWN', 'RETIRED');

-- CreateEnum
CREATE TYPE "MaintenanceType" AS ENUM ('PREVENTIVE', 'CORRECTIVE', 'PREDICTIVE', 'INSPECTION');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "lotId" TEXT,
ADD COLUMN     "qtyAllocated" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "qtyAvailable" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "qtyOnHand" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "uom" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "leadTimeDays" INTEGER,
ADD COLUMN     "reorderPoint" DECIMAL(65,30),
ADD COLUMN     "safetyStock" DECIMAL(65,30),
ADD COLUMN     "type" "ProductType",
ADD COLUMN     "unitPrice" DECIMAL(65,30),
ADD COLUMN     "uom" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "address" TEXT,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "actualEnd" TIMESTAMP(3),
ADD COLUMN     "actualStart" TIMESTAMP(3),
ADD COLUMN     "bomHeaderId" TEXT,
ADD COLUMN     "priority" INTEGER,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "qtyPlanned" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "qtyProduced" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "qtyScrapped" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "salesOrderId" TEXT,
ADD COLUMN     "scheduledEnd" TIMESTAMP(3),
ADD COLUMN     "woNumber" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "shippingAddress" TEXT,
    "billingAddress" TEXT,
    "country" TEXT,
    "currency" TEXT,
    "paymentTerms" TEXT,
    "creditLimit" DECIMAL(65,30),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "locationId" TEXT,
    "status" "EquipmentStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "serialNumber" TEXT,
    "manufacturer" TEXT,
    "purchasedAt" TIMESTAMP(3),
    "warrantyExpiry" TIMESTAMP(3),
    "nextMaintenanceAt" TIMESTAMP(3),
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMHeader" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "yieldPct" DECIMAL(65,30),
    "notes" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BOMHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BOMLine" (
    "id" TEXT NOT NULL,
    "bomHeaderId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "wasteFactorPct" DECIMAL(65,30),
    "isPhantom" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER,
    "notes" TEXT,

    CONSTRAINT "BOMLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "manufacturedDate" TIMESTAMP(3),
    "supplierId" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "MovementType" NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30),
    "expectedDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3),
    "notes" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "qtyOrdered" DECIMAL(65,30) NOT NULL,
    "qtyReceived" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "expectedDate" TIMESTAMP(3),

    CONSTRAINT "POLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "soNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "SOStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30),
    "requestedDate" TIMESTAMP(3),
    "confirmedDate" TIMESTAMP(3),
    "shippingAddress" TEXT,
    "notes" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SOLine" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "qtyOrdered" DECIMAL(65,30) NOT NULL,
    "qtyShipped" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "uom" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3),

    CONSTRAINT "SOLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderOperation" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "equipmentId" TEXT,
    "plannedMins" INTEGER,
    "actualMins" INTEGER,
    "status" "OpStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,

    CONSTRAINT "WorkOrderOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "outputLotId" TEXT,
    "qtyPlanned" DECIMAL(65,30) NOT NULL,
    "qtyActual" DECIMAL(65,30),
    "yieldActualPct" DECIMAL(65,30),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "attributes" JSONB,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCInspection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "QCType" NOT NULL,
    "status" "QCStatus" NOT NULL DEFAULT 'PENDING',
    "productId" TEXT,
    "lotId" TEXT,
    "workOrderId" TEXT,
    "poLineId" TEXT,
    "inspectedBy" TEXT,
    "inspectedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "attributes" JSONB,

    CONSTRAINT "QCInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QCResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "specMin" DECIMAL(65,30),
    "specMax" DECIMAL(65,30),
    "actualValue" TEXT,
    "isPassed" BOOLEAN NOT NULL,
    "notes" TEXT,

    CONSTRAINT "QCResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceLog" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "MaintenanceType" NOT NULL,
    "description" TEXT NOT NULL,
    "performedBy" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER,
    "cost" DECIMAL(65,30),
    "nextScheduledAt" TIMESTAMP(3),
    "attributes" JSONB,

    CONSTRAINT "MaintenanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_orgId_idx" ON "Customer"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_orgId_code_key" ON "Customer"("orgId", "code");

-- CreateIndex
CREATE INDEX "Equipment_orgId_idx" ON "Equipment"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_orgId_code_key" ON "Equipment"("orgId", "code");

-- CreateIndex
CREATE INDEX "BOMHeader_orgId_idx" ON "BOMHeader"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BOMHeader_orgId_productId_version_key" ON "BOMHeader"("orgId", "productId", "version");

-- CreateIndex
CREATE INDEX "Lot_orgId_idx" ON "Lot"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_orgId_lotNumber_key" ON "Lot"("orgId", "lotNumber");

-- CreateIndex
CREATE INDEX "StockMovement_orgId_productId_idx" ON "StockMovement"("orgId", "productId");

-- CreateIndex
CREATE INDEX "StockMovement_orgId_occurredAt_idx" ON "StockMovement"("orgId", "occurredAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orgId_idx" ON "PurchaseOrder"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orgId_poNumber_key" ON "PurchaseOrder"("orgId", "poNumber");

-- CreateIndex
CREATE INDEX "SalesOrder_orgId_status_idx" ON "SalesOrder"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orgId_soNumber_key" ON "SalesOrder"("orgId", "soNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_orgId_batchNumber_key" ON "ProductionBatch"("orgId", "batchNumber");

-- CreateIndex
CREATE INDEX "QCInspection_orgId_status_idx" ON "QCInspection"("orgId", "status");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_bomHeaderId_fkey" FOREIGN KEY ("bomHeaderId") REFERENCES "BOMHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMHeader" ADD CONSTRAINT "BOMHeader_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMLine" ADD CONSTRAINT "BOMLine_bomHeaderId_fkey" FOREIGN KEY ("bomHeaderId") REFERENCES "BOMHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BOMLine" ADD CONSTRAINT "BOMLine_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "POLine" ADD CONSTRAINT "POLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOLine" ADD CONSTRAINT "SOLine_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SOLine" ADD CONSTRAINT "SOLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderOperation" ADD CONSTRAINT "WorkOrderOperation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderOperation" ADD CONSTRAINT "WorkOrderOperation_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCInspection" ADD CONSTRAINT "QCInspection_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "POLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QCResult" ADD CONSTRAINT "QCResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "QCInspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceLog" ADD CONSTRAINT "MaintenanceLog_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

