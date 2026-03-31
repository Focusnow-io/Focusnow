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
