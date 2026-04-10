-- Add ChatProject table
CREATE TABLE IF NOT EXISTS "ChatProject" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatProject_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChatProject_orgId_userId_idx" ON "ChatProject"("orgId", "userId");

-- Add projectId to Conversation
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

CREATE INDEX IF NOT EXISTS "Conversation_projectId_idx" ON "Conversation"("projectId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ChatProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
