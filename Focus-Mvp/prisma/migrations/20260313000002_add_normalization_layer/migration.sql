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
