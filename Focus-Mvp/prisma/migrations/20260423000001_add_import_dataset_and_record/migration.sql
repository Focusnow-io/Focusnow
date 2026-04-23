-- CreateTable: ImportDataset
CREATE TABLE IF NOT EXISTS "ImportDataset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sourceFile" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "columnMap" JSONB NOT NULL,
    "rawHeaders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "importMode" TEXT NOT NULL DEFAULT 'merge',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'complete',
    "errorSummary" TEXT,
    CONSTRAINT "ImportDataset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ImportDataset_organizationId_name_idx"
  ON "ImportDataset"("organizationId", "name");
CREATE INDEX IF NOT EXISTS "ImportDataset_organizationId_importedAt_idx"
  ON "ImportDataset"("organizationId", "importedAt");

ALTER TABLE "ImportDataset"
  DROP CONSTRAINT IF EXISTS "ImportDataset_organizationId_fkey";
ALTER TABLE "ImportDataset"
  ADD CONSTRAINT "ImportDataset_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: ImportRecord
CREATE TABLE IF NOT EXISTS "ImportRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "datasetName" TEXT NOT NULL,
    "externalId" TEXT,
    "data" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ImportRecord_organizationId_datasetName_externalId_key"
  ON "ImportRecord"("organizationId", "datasetName", "externalId");
CREATE INDEX IF NOT EXISTS "ImportRecord_organizationId_datasetName_idx"
  ON "ImportRecord"("organizationId", "datasetName");
CREATE INDEX IF NOT EXISTS "ImportRecord_datasetId_idx"
  ON "ImportRecord"("datasetId");

ALTER TABLE "ImportRecord"
  DROP CONSTRAINT IF EXISTS "ImportRecord_organizationId_fkey";
ALTER TABLE "ImportRecord"
  ADD CONSTRAINT "ImportRecord_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportRecord"
  DROP CONSTRAINT IF EXISTS "ImportRecord_datasetId_fkey";
ALTER TABLE "ImportRecord"
  ADD CONSTRAINT "ImportRecord_datasetId_fkey"
  FOREIGN KEY ("datasetId") REFERENCES "ImportDataset"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'import_dataset_and_record_v1',
  NOW(), '20260423000001_add_import_dataset_and_record', NULL, NULL, NOW(), 1
) ON CONFLICT DO NOTHING;
