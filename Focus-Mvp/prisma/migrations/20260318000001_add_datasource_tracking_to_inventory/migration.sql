-- Track which DataSource created each InventoryItem so stale records
-- from a previous (broken) import can be cleaned up on re-import.
ALTER TABLE "InventoryItem" ADD COLUMN "dataSourceId" TEXT;
CREATE INDEX "InventoryItem_dataSourceId_idx" ON "InventoryItem"("dataSourceId");
