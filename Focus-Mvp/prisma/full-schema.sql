-- Full schema migration — generated Tue Apr  7 13:19:09 JDT 2026
-- Run this once in Supabase SQL Editor to create all tables

-- ===== 20260307220459_init =====
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

-- ===== 20260311000000_ode_operational_data_environment =====
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

-- ===== 20260311160854_add_attributes_and_mapping_templates =====
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

-- ===== 20260311172428_add_bom_forecast_mps =====
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

-- ===== 20260311173205_add_work_orders_routing_work_centers =====
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

-- ===== 20260312103139_add_manufacturing_canonical_fields =====
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

-- ===== 20260313000001_apply_remaining_migrations_5_7_9_10 =====
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

-- ===== 20260313000002_add_normalization_layer =====
-- Migration: Add Normalization Layer
-- Adds EntityResolutionLog, ModelCompletenessReport, ResolutionStatus enum,
-- and normalizationStatus field on DataSource.

-- ResolutionStatus enum
CREATE TYPE "ResolutionStatus" AS ENUM (
  'PENDING',
  'AUTO_MERGED',
  'REVIEWED_MERGED',
  'REVIEWED_KEPT',
  'NO_MATCH'
);

-- EntityResolutionLog: records every dedup decision during import
CREATE TABLE "EntityResolutionLog" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "entityType"     TEXT NOT NULL,
  "incomingId"     TEXT NOT NULL,
  "matchedId"      TEXT,
  "confidence"     DOUBLE PRECISION NOT NULL,
  "status"         "ResolutionStatus" NOT NULL DEFAULT 'PENDING',
  "matchFields"    JSONB,
  "resolvedAt"     TIMESTAMP(3),
  "resolvedBy"     TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EntityResolutionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EntityResolutionLog_organizationId_entityType_status_idx"
  ON "EntityResolutionLog"("organizationId", "entityType", "status");

CREATE INDEX "EntityResolutionLog_organizationId_incomingId_idx"
  ON "EntityResolutionLog"("organizationId", "incomingId");

ALTER TABLE "EntityResolutionLog"
  ADD CONSTRAINT "EntityResolutionLog_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ModelCompletenessReport: one row per org, always overwritten with latest snapshot
CREATE TABLE "ModelCompletenessReport" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "generatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entityCounts"   JSONB NOT NULL,
  "capabilities"   JSONB NOT NULL,
  "overallScore"   DOUBLE PRECISION NOT NULL,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ModelCompletenessReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModelCompletenessReport_organizationId_key"
  ON "ModelCompletenessReport"("organizationId");

ALTER TABLE "ModelCompletenessReport"
  ADD CONSTRAINT "ModelCompletenessReport_organizationId_fkey"
  FOREIGN KEY ("organizationId")
  REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add normalizationStatus to DataSource
ALTER TABLE "DataSource"
  ADD COLUMN "normalizationStatus" TEXT NOT NULL DEFAULT 'pending';

-- ===== 20260313000003_add_data_quality_freshness_consistency =====
-- Phase 2: DataQualityScore + ModelFreshness + ConsistencyReport
-- Migration: 20260313000003_add_data_quality_freshness_consistency

-- Add dataQualityScores to DataSource
ALTER TABLE "DataSource" ADD COLUMN "dataQualityScores" JSONB;

-- Add consistencyIssues to ModelCompletenessReport
ALTER TABLE "ModelCompletenessReport" ADD COLUMN "consistencyIssues" JSONB;

-- Create ModelFreshness table
CREATE TABLE "ModelFreshness" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "lastImportedAt" TIMESTAMP(3) NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "staleDays" INTEGER NOT NULL,
    "isStale" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelFreshness_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per org per entity type
CREATE UNIQUE INDEX "ModelFreshness_organizationId_entityType_key" ON "ModelFreshness"("organizationId", "entityType");

-- Index for org-scoped queries
CREATE INDEX "ModelFreshness_organizationId_idx" ON "ModelFreshness"("organizationId");

-- Foreign key to Organization
ALTER TABLE "ModelFreshness" ADD CONSTRAINT "ModelFreshness_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 20260313150000_add_flagged_column =====
-- CreateTable
CREATE TABLE "FlaggedColumn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "sampleValues" JSONB NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "FlaggedColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlaggedColumn_entityType_status_idx" ON "FlaggedColumn"("entityType", "status");

-- AddForeignKey
ALTER TABLE "FlaggedColumn" ADD CONSTRAINT "FlaggedColumn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== 20260314000001_canonical_v3_promote_json_to_typed_columns =====
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

-- ===== 20260318000001_add_datasource_tracking_to_inventory =====
-- Track which DataSource created each InventoryItem so stale records
-- from a previous (broken) import can be cleaned up on re-import.
ALTER TABLE "InventoryItem" ADD COLUMN "dataSourceId" TEXT;
CREATE INDEX "InventoryItem_dataSourceId_idx" ON "InventoryItem"("dataSourceId");

-- ===== 20260318100000_snapshot_deactivation_fields =====
-- Snapshot deactivation fields for master data entities
-- Enables full-snapshot imports where records not in the file are soft-deactivated

-- Product
ALTER TABLE "Product" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Customer
ALTER TABLE "Customer" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Location
ALTER TABLE "Location" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "deactivatedBySourceId" TEXT;

-- WorkCenter (also adding isActive which was missing)
ALTER TABLE "WorkCenter" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkCenter" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "WorkCenter" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Equipment (also adding isActive which was missing)
ALTER TABLE "Equipment" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Equipment" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Equipment" ADD COLUMN "deactivatedBySourceId" TEXT;

-- DataSource — snapshot tracking
ALTER TABLE "DataSource" ADD COLUMN "snapshotDeactivatedCount" INTEGER;
ALTER TABLE "DataSource" ADD COLUMN "snapshotCompletedAt" TIMESTAMP(3);

-- ===== 20260319000001_rename_app_templates =====
-- Rename AppTemplate enum values for new supply chain apps
ALTER TYPE "AppTemplate" RENAME VALUE 'REORDER_DASHBOARD' TO 'INVENTORY_COMMAND_CENTER';
ALTER TYPE "AppTemplate" RENAME VALUE 'STOCK_ALERTS' TO 'DEMAND_FULFILLMENT';
ALTER TYPE "AppTemplate" RENAME VALUE 'SUPPLIER_PERFORMANCE' TO 'PROCUREMENT_HUB';

-- ===== 20260320000001_add_token_usage_model =====
-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'chat',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenUsage_orgId_date_idx" ON "TokenUsage"("orgId", "date");

-- CreateIndex
CREATE INDEX "TokenUsage_userId_date_idx" ON "TokenUsage"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsage_orgId_userId_date_feature_key" ON "TokenUsage"("orgId", "userId", "date", "feature");

-- ===== 20260320000002_add_org_custom_token_limits =====
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "customDailyTokenLimit" INTEGER;
ALTER TABLE "Organization" ADD COLUMN "customWeeklyTokenLimit" INTEGER;

-- ===== 20260404000001_add_otp_codes =====
-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpCode_userId_idx" ON "OtpCode"("userId");

-- AddForeignKey
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

