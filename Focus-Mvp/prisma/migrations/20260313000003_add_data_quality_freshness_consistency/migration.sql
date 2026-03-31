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
