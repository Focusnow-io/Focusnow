-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomFieldSchema" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "dataType" TEXT NOT NULL DEFAULT 'text',
    "sampleValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceColumn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomFieldSchema_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldSchema_organizationId_entityType_fieldKey_key"
  ON "CustomFieldSchema"("organizationId", "entityType", "fieldKey");

CREATE INDEX IF NOT EXISTS "CustomFieldSchema_organizationId_entityType_idx"
  ON "CustomFieldSchema"("organizationId", "entityType");

ALTER TABLE "CustomFieldSchema"
  DROP CONSTRAINT IF EXISTS "CustomFieldSchema_organizationId_fkey";
ALTER TABLE "CustomFieldSchema"
  ADD CONSTRAINT "CustomFieldSchema_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'custom_field_schema_v1',
  NOW(), '20260421000001_add_custom_field_schema', NULL, NULL, NOW(), 1
) ON CONFLICT DO NOTHING;
