-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "expiryDate" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'add_inventory_expiry_date_v1',
  NOW(),
  '20260421000002_add_inventory_expiry_date',
  NULL,
  NULL,
  NOW(),
  1
) ON CONFLICT DO NOTHING;
