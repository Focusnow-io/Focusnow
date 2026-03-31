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
