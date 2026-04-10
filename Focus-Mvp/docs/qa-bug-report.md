# QA Bug Report — Permission Security Audit
Date: 2026-04-09

Auditor: QA security tester (simulating VIEWER user)
VIEWER permissions: brain=false, import=false, sources=true, explorer=true, apps=true, chat=true

---

## Summary

**3 Critical** | **6 Medium** | **1 Low**

---

## Critical Issues (VIEWER can access restricted content)

### BUG-001: `GET /api/brain/rules` — No permission check, VIEWER can read all rules
- **Route:** `GET /api/brain/rules`
- **File:** `src/app/api/brain/rules/route.ts`
- **Method:** Direct API call (e.g., `fetch("/api/brain/rules")`)
- **Expected:** 403 Forbidden — VIEWER does not have `brain` permission
- **Actual:** Returns all brain rules for the org. No `brain` permission check exists on GET. Only `getSessionOrg()` + `unauthorized()` is checked — any authenticated member gets data.
- **Evidence:** Line 18–39 — GET handler calls `getSessionOrg()` and returns data with zero role/permission enforcement. The POST at line 44 correctly blocks with `hasRole(ctx.member.role, "MEMBER")`, but the GET is wide open to all authenticated members including VIEWERs.
- **Fix needed in:** `src/app/api/brain/rules/route.ts` — add `resolvePermissions` check, return 403 if `!permissions.brain`
- **Severity:** Critical — VIEWER can enumerate all operational rules, policies, and constraints
- **Department:** Backend

---

### BUG-002: `GET /api/brain/rules/[id]` — No permission check, VIEWER can read any single rule
- **Route:** `GET /api/brain/rules/:id`
- **File:** `src/app/api/brain/rules/[id]/route.ts`
- **Method:** Direct API call
- **Expected:** 403 Forbidden
- **Actual:** Returns full rule detail including all version history. The GET handler (lines 18–33) only checks `getSessionOrg()`, no `brain` permission check.
- **Fix needed in:** `src/app/api/brain/rules/[id]/route.ts` — add `resolvePermissions` and gate GET on `permissions.brain`
- **Severity:** Critical — VIEWER can read individual rules and their full version history
- **Department:** Backend

---

### BUG-003: `GET /api/admin/members` — No role check, VIEWER can list all org members
- **Route:** `GET /api/admin/members`
- **File:** `src/app/api/admin/members/route.ts`
- **Method:** Direct API call
- **Expected:** 403 Forbidden — only OWNER/ADMIN should see the member list
- **Actual:** Returns all members with names, emails, roles, and avatars. The GET handler (lines 4–22) only calls `getSessionOrg()` + `unauthorized()`. There is zero role check — no `hasRole`, no `ctx.member.role` check whatsoever.
- **Contrast:** `DELETE /api/admin/members/[id]` at line 15 in the sibling file DOES check `ctx.member.role !== "OWNER" && ctx.member.role !== "ADMIN"`. The GET on the list endpoint was left unguarded.
- **Fix needed in:** `src/app/api/admin/members/route.ts` — add `if (!hasRole(ctx.member.role, "ADMIN")) return forbidden();`
- **Severity:** Critical — VIEWER can enumerate every member of the org including their emails and roles, which is sensitive PII
- **Department:** Backend

---

## Medium Issues (Missing API permission checks on mutating operations)

### BUG-004: `POST /api/data/import` — No `import` permission check
- **Route:** `POST /api/data/import` (file upload)
- **File:** `src/app/api/data/import/route.ts`
- **Method:** Direct API call with multipart form data
- **Expected:** 403 Forbidden — VIEWER has `import=false`
- **Actual:** Accepts file upload, parses it, creates a `DataSource` record in the DB. Only `getSessionOrg()` + `unauthorized()` is checked (lines 72–74). No `import` permission check.
- **Note:** The page is protected by `src/app/(dashboard)/data/import/layout.tsx` which correctly blocks VIEWER from the UI, but a VIEWER can POST directly to the API endpoint and bypass the UI gate entirely.
- **Fix needed in:** `src/app/api/data/import/route.ts` — add `resolvePermissions` check, return 403 if `!permissions.import`
- **Severity:** Medium — VIEWER can upload files and create DataSource records, bypassing their role restriction
- **Department:** Backend

---

### BUG-005: `PUT /api/data/sources/[id]/map` — No `import` permission check
- **Route:** `PUT /api/data/sources/:id/map`
- **File:** `src/app/api/data/sources/[id]/map/route.ts`
- **Method:** Direct API call
- **Expected:** 403 Forbidden
- **Actual:** Accepts column mapping updates and persists them to the `DataSource`. Only `getSessionOrg()` + `unauthorized()` checked (lines 8–10).
- **Fix needed in:** `src/app/api/data/sources/[id]/map/route.ts`
- **Severity:** Medium
- **Department:** Backend

---

### BUG-006: `DELETE /api/data/sources/[id]` — No `import` permission check
- **Route:** `DELETE /api/data/sources/:id`
- **File:** `src/app/api/data/sources/[id]/route.ts`
- **Method:** Direct API call
- **Expected:** 403 Forbidden — only users with `import` (or at minimum MEMBER role) should delete data sources
- **Actual:** Deletes the data source if it belongs to the org. Only `getSessionOrg()` checked (lines 9–10). Any authenticated VIEWER can delete a source if they know the ID.
- **Fix needed in:** `src/app/api/data/sources/[id]/route.ts`
- **Severity:** Medium — destructive write, no permission gate
- **Department:** Backend

---

### BUG-007: `POST /api/apps/instances` — No `apps` permission check; VIEWER role cannot be blocked via role
- **Route:** `POST /api/apps/instances`
- **File:** `src/app/api/apps/instances/route.ts`
- **Method:** Direct API call
- **Expected:** At minimum, a check that the user has `apps` permission (or at least MEMBER role) before creating a new app instance
- **Actual:** No role or permission check exists on POST (lines 25–47). Only `getSessionOrg()` + `unauthorized()`. Any authenticated user, including a VIEWER, can call this and create app instances. This contradicts the intent of the `apps` permission flag.
- **Note:** VIEWER has `apps=true` by default, so this is medium severity (it aligns with role defaults), but the API provides no enforcement layer if the OWNER later revokes a member's `apps` permission via the custom license system.
- **Fix needed in:** `src/app/api/apps/instances/route.ts` — add permission check via `resolvePermissions` for the `apps` flag on POST/PATCH/DELETE
- **Severity:** Medium — no enforced permission check exists; revoked `apps` permissions are not honored at the API level
- **Department:** Backend

---

### BUG-008: `PATCH/DELETE /api/apps/instances/[id]` — No role or permission check
- **Route:** `PATCH /api/apps/instances/:id`, `DELETE /api/apps/instances/:id`
- **File:** `src/app/api/apps/instances/[id]/route.ts`
- **Method:** Direct API call
- **Expected:** Only users with `apps` permission (and ideally MEMBER+ for mutations) should update or delete app instances
- **Actual:** Lines 17–48 (PATCH) and 50–62 (DELETE) only check `getSessionOrg()`. No role check, no permission check. Any authenticated VIEWER can delete any app instance belonging to their org if they know the instance ID.
- **Fix needed in:** `src/app/api/apps/instances/[id]/route.ts`
- **Severity:** Medium — destructive DELETE with no permission gate
- **Department:** Backend

---

### BUG-009: `POST/DELETE /api/connectors` — No `import` or role permission check
- **Route:** `POST /api/connectors`, `PUT /api/connectors/[id]`, `DELETE /api/connectors/[id]`
- **File:** `src/app/api/connectors/route.ts`, `src/app/api/connectors/[id]/route.ts`
- **Method:** Direct API call
- **Expected:** Creating or deleting connectors should require at least MEMBER role or `import` permission
- **Actual:** All three files only check `getSessionOrg()` + `unauthorized()`. No role or permission enforcement on mutating operations. A VIEWER can create, update, and delete connectors.
- **Fix needed in:** `src/app/api/connectors/route.ts` (POST), `src/app/api/connectors/[id]/route.ts` (PUT, DELETE)
- **Severity:** Medium
- **Department:** Backend

---

## Low Issues

### BUG-010: `DELETE /api/settings/account` — No role check; any member (including VIEWER) can delete the entire workspace
- **Route:** `DELETE /api/settings/account`
- **File:** `src/app/api/settings/account/route.ts`
- **Method:** Direct API call
- **Expected:** Only the OWNER should be able to delete the organization and their account. The current check merely validates the workspace name matches — any authenticated member who knows the workspace name can trigger deletion.
- **Actual:** Lines 10–35 check only `getSessionOrg()` + `unauthorized()` plus a workspace name confirmation string. No role check. A VIEWER who knows the org name can call `DELETE /api/settings/account` with `{"confirmWorkspaceName":"<org name>"}` and delete the entire organization including all members.
- **Fix needed in:** `src/app/api/settings/account/route.ts` — add `if (ctx.member.role !== "OWNER") return forbidden();`
- **Severity:** Low (requires knowing workspace name) but consequence is catastrophic — full org destruction
- **Note:** Raising as Low only because the page is presumably behind settings UI that VIEWERs don't see; however API-level enforcement is completely absent.
- **Department:** Backend

---

## Pages Correctly Protected

The following routes are properly protected with server-side layout guards:

| Route | Protection | Notes |
|-------|------------|-------|
| `/brain` and all sub-routes | `src/app/(dashboard)/brain/layout.tsx` | Correctly calls `resolvePermissions`, redirects to `/dashboard` if `!permissions.brain` |
| `/data/import` | `src/app/(dashboard)/data/import/layout.tsx` | Correctly gates on `permissions.import`, redirects to `/data` |
| `/admin` | `src/app/(dashboard)/admin/layout.tsx` | Correctly checks `role !== "OWNER" && role !== "ADMIN"`, redirects to `/dashboard` |
| `/rules` | `src/app/(dashboard)/rules/layout.tsx` | Correctly gates on `permissions.brain`, redirects to `/dashboard` |
| All dashboard routes (top-level) | `src/app/(dashboard)/layout.tsx` | Correctly checks session, resolves permissions, passes to Sidebar |

The following API routes are correctly protected:

| Route | Method | Guard |
|-------|--------|-------|
| `POST /api/brain/rules` | POST | `hasRole(ctx.member.role, "MEMBER")` — blocks VIEWER ✓ |
| `PUT /api/brain/rules/[id]` | PUT | `hasRole(ctx.member.role, "MEMBER")` — blocks VIEWER ✓ |
| `DELETE /api/brain/rules/[id]` | DELETE | `hasRole(ctx.member.role, "ADMIN")` — blocks VIEWER and MEMBER ✓ |
| `PUT /api/settings/workspace` | PUT | `hasRole(ctx.member.role, "ADMIN")` ✓ |
| `DELETE /api/admin/members/[id]` | DELETE | Manual role check for OWNER/ADMIN ✓ |
| `PUT /api/admin/members/[id]/role` | PUT | `ctx.member.role !== "OWNER"` check ✓ |
| `PUT /api/admin/members/[id]/permissions` | PUT | `ctx.member.role !== "OWNER"` check ✓ |
| `POST /api/admin/members/create` | POST | Manual OWNER/ADMIN check ✓ |

---

## Middleware Assessment

`src/middleware.ts` only checks login status (presence of a valid JWT). It does NOT check feature permissions or roles. This is by design — feature/role enforcement is delegated to individual layout.tsx files and route handlers.

**Gap:** This design works if every protected route has a layout guard AND every API has a permission check. As the bugs above show, several API routes are missing their permission checks, meaning the middleware provides no safety net.

---

## Client-Side Bypass Analysis

### `/brain/page.tsx` — `"use client"` page, protected by `layout.tsx`
- The page is a client component (line 1: `"use client"`).
- The layout at `src/app/(dashboard)/brain/layout.tsx` is a server component and correctly blocks VIEWER before rendering the page.
- **Status: Correctly protected at the layout level.** The client component itself cannot be accessed without passing through the server layout guard.

### `/rules/page.tsx` — `"use client"` page, protected by `layout.tsx`
- Same pattern. The layout at `src/app/(dashboard)/rules/layout.tsx` is the server-side guard.
- **Status: Correctly protected at the layout level.**

### `/apps/page.tsx` — `"use client"` page, NO layout.tsx
- No `layout.tsx` exists anywhere under `src/app/(dashboard)/apps/`.
- The page is wide open to VIEWERs (VIEWER has `apps=true` by default, so this is acceptable per current permission design).
- However, the page calls `POST /api/apps/instances` when a user clicks a template card (`openTemplate` function, lines 359–368). Since that API has no permission check (BUG-007), even if `apps` permission were revoked via custom license, a VIEWER could still use the UI to create instances.
- **Status: No layout guard needed for default VIEWER (apps=true), but the missing API-level check (BUG-007, BUG-008) means custom permission revocation is not enforced.**

---

## Recommended Fix Priority

1. **IMMEDIATE — BUG-003:** Add role check to `GET /api/admin/members` — this leaks PII (emails, roles) to all members
2. **IMMEDIATE — BUG-001 & BUG-002:** Add `permissions.brain` check to both brain rule GET endpoints
3. **HIGH — BUG-010:** Add `role === "OWNER"` check to `DELETE /api/settings/account` — catastrophic consequence
4. **HIGH — BUG-004 to BUG-009:** Add `import`/`apps` permission checks to all data import and app instance mutating endpoints
