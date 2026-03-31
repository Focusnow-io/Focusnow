-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "plannedQty" DECIMAL(12,4) NOT NULL,
    "actualQty" DECIMAL(12,4),
    "unit" TEXT,
    "workCenter" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "operationNo" INTEGER NOT NULL,
    "workCenter" TEXT NOT NULL,
    "description" TEXT,
    "setupTimeMins" DECIMAL(8,2),
    "runTimeMins" DECIMAL(8,4),
    "runTimeUnit" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "availableHoursPerWeek" DECIMAL(6,2),
    "efficiency" DECIMAL(5,4),
    "costRatePerHour" DECIMAL(10,2),
    "calendar" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_idx" ON "WorkOrder"("organizationId");

-- CreateIndex
CREATE INDEX "WorkOrder_organizationId_sku_idx" ON "WorkOrder"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_organizationId_orderNumber_key" ON "WorkOrder"("organizationId", "orderNumber");

-- CreateIndex
CREATE INDEX "Routing_organizationId_idx" ON "Routing"("organizationId");

-- CreateIndex
CREATE INDEX "Routing_organizationId_sku_idx" ON "Routing"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "Routing_organizationId_sku_operationNo_key" ON "Routing"("organizationId", "sku", "operationNo");

-- CreateIndex
CREATE INDEX "WorkCenter_organizationId_idx" ON "WorkCenter"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_organizationId_code_key" ON "WorkCenter"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
