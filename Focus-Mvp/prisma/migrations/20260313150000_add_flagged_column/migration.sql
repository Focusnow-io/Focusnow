-- CreateTable
CREATE TABLE "FlaggedColumn" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "sampleValues" JSONB NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "FlaggedColumn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlaggedColumn_entityType_status_idx" ON "FlaggedColumn"("entityType", "status");

-- AddForeignKey
ALTER TABLE "FlaggedColumn" ADD CONSTRAINT "FlaggedColumn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
