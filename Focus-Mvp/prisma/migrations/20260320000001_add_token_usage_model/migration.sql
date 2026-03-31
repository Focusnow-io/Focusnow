-- CreateTable
CREATE TABLE "TokenUsage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "feature" TEXT NOT NULL DEFAULT 'chat',
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "requestCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TokenUsage_orgId_date_idx" ON "TokenUsage"("orgId", "date");

-- CreateIndex
CREATE INDEX "TokenUsage_userId_date_idx" ON "TokenUsage"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TokenUsage_orgId_userId_date_feature_key" ON "TokenUsage"("orgId", "userId", "date", "feature");
