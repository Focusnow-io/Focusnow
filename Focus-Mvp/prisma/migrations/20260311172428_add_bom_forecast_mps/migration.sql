-- AlterTable
ALTER TABLE "BOMItem" ADD COLUMN     "attributes" JSONB,
ADD COLUMN     "scrapFactor" DECIMAL(6,4);

-- CreateTable
CREATE TABLE "ForecastEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "forecastQty" DECIMAL(12,4) NOT NULL,
    "forecastUnit" TEXT,
    "channel" TEXT,
    "version" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpsEntry" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "plannedQty" DECIMAL(12,4) NOT NULL,
    "confirmedQty" DECIMAL(12,4),
    "workCenter" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpsEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForecastEntry_organizationId_idx" ON "ForecastEntry"("organizationId");

-- CreateIndex
CREATE INDEX "ForecastEntry_organizationId_sku_idx" ON "ForecastEntry"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastEntry_organizationId_sku_period_channel_version_key" ON "ForecastEntry"("organizationId", "sku", "period", "channel", "version");

-- CreateIndex
CREATE INDEX "MpsEntry_organizationId_idx" ON "MpsEntry"("organizationId");

-- CreateIndex
CREATE INDEX "MpsEntry_organizationId_sku_idx" ON "MpsEntry"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "MpsEntry_organizationId_sku_period_workCenter_key" ON "MpsEntry"("organizationId", "sku", "period", "workCenter");

-- AddForeignKey
ALTER TABLE "ForecastEntry" ADD CONSTRAINT "ForecastEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpsEntry" ADD CONSTRAINT "MpsEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
