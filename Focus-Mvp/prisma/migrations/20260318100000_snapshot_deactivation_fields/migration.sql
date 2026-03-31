-- Snapshot deactivation fields for master data entities
-- Enables full-snapshot imports where records not in the file are soft-deactivated

-- Product
ALTER TABLE "Product" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Customer
ALTER TABLE "Customer" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Location
ALTER TABLE "Location" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Location" ADD COLUMN "deactivatedBySourceId" TEXT;

-- WorkCenter (also adding isActive which was missing)
ALTER TABLE "WorkCenter" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "WorkCenter" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "WorkCenter" ADD COLUMN "deactivatedBySourceId" TEXT;

-- Equipment (also adding isActive which was missing)
ALTER TABLE "Equipment" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Equipment" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "Equipment" ADD COLUMN "deactivatedBySourceId" TEXT;

-- DataSource — snapshot tracking
ALTER TABLE "DataSource" ADD COLUMN "snapshotDeactivatedCount" INTEGER;
ALTER TABLE "DataSource" ADD COLUMN "snapshotCompletedAt" TIMESTAMP(3);
