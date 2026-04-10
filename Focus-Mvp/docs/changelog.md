# Focus MVP — Changelog

## [Sprint 2] — 2026-04-07

### Authentication & Security

- **Two-step login (OTP):** Added mandatory 6-digit email OTP verification after password login. Users land on `/verify-otp` before accessing any dashboard route. Middleware guards all routes.
- **Admin-created users bypass email verification:** When an admin creates a user, `emailVerified` is set automatically so the OTP flow doesn't block them on first login.
- **Invite flow:** Admin creates users without a password. A 48-hour invite link is sent by email so the user can set their own password. Name is required; password is never set by the admin.

### Role-Based Access Control (RBAC)

- **Sidebar gating by role:** The sidebar now filters navigation items based on the user's role. OWNER and ADMIN see everything including the Admin panel. MEMBER sees all features except the Admin panel. VIEWER sees read-only features only (no Import, no Brain/Rules).
- **Custom per-user permissions (Owner only):** Beyond roles, the owner can now configure exactly which features each individual member can access — regardless of their role. Useful for users from different departments who need different access within the same role tier.
  - Permissions are toggled via a sliders icon on each member row in the Admin panel.
  - Features are grouped into Data, Intelligence, and Apps, each with an on/off toggle.
  - A "Reset to defaults" button restores the role's baseline permissions.
  - Custom permissions are stored as JSON on the `OrgMember` record and resolved at page load.
- **Admin panel hidden** from MEMBER and VIEWER roles entirely.
- **Delete user = full removal:** Removing a member from the admin panel now deletes the user record from the database entirely (not just the membership row).

### Brain / Rules

- **Duplicate name constraint removed:** The unique constraint on `(organizationId, name)` for `BrainRule` was dropped. Rules with the same name can now coexist.
- **Dashboard rule count fixed:** The dashboard was only counting `ACTIVE` rules for the "Brain" status tile. It now counts both `ACTIVE` and `DRAFT` rules, so rules show up immediately after creation.

### Data Import

- **Back button on upload step:** A clearly visible "Back to Import" button was added above the upload card. It resets state and returns to the supply chain hub (select step).
- **Upload step UI improved:** Drop zone is taller with a circular icon, turns green when a file is selected, and the entity name is shown as a heading.

### Admin Panel

- **Create User modal:** Replaced the coming-soon popup with a full modal. Name is required; no password field. Sends an invite email with a set-password link.
- **Role selector redesigned:** Role badges use color-coded pills (blue = OWNER, purple = ADMIN, emerald = MEMBER, gray = VIEWER) with a dot indicator. The editable dropdown matches the same pill style.
- **Permissions editor:** A new per-user permissions modal (sliders icon) lets the owner toggle individual feature access. See permission matrix below.

---

## Permission Model

### Role defaults (applied when no custom permissions are set)

| Feature                   | VIEWER | MEMBER | ADMIN | OWNER |
| ------------------------- | :----: | :----: | :---: | :---: |
| Dashboard, Settings, Help |   ✓    |   ✓    |   ✓   |   ✓   |
| Data Sources (view)       |   ✓    |   ✓    |   ✓   |   ✓   |
| Data Explorer             |   ✓    |   ✓    |   ✓   |   ✓   |
| App Gallery               |   ✓    |   ✓    |   ✓   |   ✓   |
| Data Chat                 |   ✓    |   ✓    |   ✓   |   ✓   |
| Import data               |   —    |   ✓    |   ✓   |   ✓   |
| Brain / Rules             |   —    |   ✓    |   ✓   |   ✓   |
| Admin panel               |   —    |   —    |   ✓   |   ✓   |
| Change member roles       |   —    |   —    |   —   |   ✓   |
| Edit member permissions   |   —    |   —    |   —   |   ✓   |
| Delete members            |   —    |   —    |   ✓   |   ✓   |

### Custom permissions (owner override)

The owner can override any feature toggle per individual user via the Admin panel. Custom permissions take full precedence over role defaults. This allows, for example, a VIEWER from the procurement department to have access to Import while another VIEWER from finance does not.

---

## Database Migrations (manual — Supabase SQL Editor)

Run these in order, then `npx prisma generate` after all are applied.

### 1. Chat Projects

```sql
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
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
CREATE INDEX IF NOT EXISTS "Conversation_projectId_idx" ON "Conversation"("projectId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "ChatProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

### 2. Remove BrainRule duplicate name constraint

```sql
ALTER TABLE "BrainRule" DROP CONSTRAINT IF EXISTS "BrainRule_organizationId_name_key";
```

### 3. Custom member permissions

```sql
ALTER TABLE "OrgMember" ADD COLUMN IF NOT EXISTS "permissions" JSONB;
```
