-- GIN index for fast JSONB field queries on ImportRecord.data
CREATE INDEX IF NOT EXISTS "ImportRecord_data_gin_idx"
  ON "ImportRecord" USING GIN ("data");

-- Partial indexes for the most common per-dataset field lookups.
-- Quantity is sorted DESC NULLS LAST because the "worst-stocked" / "top
-- inventory" queries both scan from the largest value downward.
CREATE INDEX IF NOT EXISTS "ImportRecord_inventory_quantity_idx"
  ON "ImportRecord"((("data"->>'quantity')::numeric) DESC NULLS LAST)
  WHERE "datasetName" = 'inventory';

CREATE INDEX IF NOT EXISTS "ImportRecord_purchase_orders_po_number_idx"
  ON "ImportRecord"(("data"->>'po_number'))
  WHERE "datasetName" = 'purchase_orders';

CREATE INDEX IF NOT EXISTS "ImportRecord_bom_fg_sku_idx"
  ON "ImportRecord"(("data"->>'fg_sku'))
  WHERE "datasetName" = 'bom';

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
  gen_random_uuid()::text,
  'import_record_gin_indexes_v1',
  NOW(), '20260423000002_add_import_record_gin_indexes', NULL, NULL, NOW(), 1
) ON CONFLICT DO NOTHING;
