-- Add custom permissions column to OrgMember
-- null = use role defaults; set = owner's custom overrides
ALTER TABLE "OrgMember" ADD COLUMN IF NOT EXISTS "permissions" JSONB;
