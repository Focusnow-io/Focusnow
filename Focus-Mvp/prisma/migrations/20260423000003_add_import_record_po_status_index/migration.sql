-- Partial index on purchase_orders.status for the common "open POs",
-- "cancelled POs", "received POs" filter queries surfaced in the chat
-- tool layer. Paired with the existing po_number index, this covers
-- both identity lookups and status filters without a full table scan.
CREATE INDEX IF NOT EXISTS "ImportRecord_po_status_idx"
  ON "ImportRecord"(("data"->>'status'))
  WHERE "datasetName" = 'purchase_orders';

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'import_record_po_status_index_v1',
  NOW(), '20260423000003_add_import_record_po_status_index', NULL, NULL, NOW(), 1
) ON CONFLICT DO NOTHING;
