# Bug Report — Focus MVP

**Project:** Focus MVP  
**Branch:** 6-add-additional-authentication-step  
**Date:** 2026-04-09  
**Reporter:** QA Department

---

## BUG-001 — Critical: Prisma Invalid `count()` with Dynamic NOT Clause

| Field | Value |
|-------|-------|
| **Severity** | Critical |
| **Status** | Fixed |
| **Department** | Backend / Data Science |
| **File** | `src/lib/normalization/data-quality-scorer.ts:125` |

### Description
The `computeDataQualityScore()` function crashes when evaluating required/optional/FK field coverage. Prisma 7.x does not resolve dynamic bracket keys inside a `NOT` array as valid model field filters.

### Error
```
PrismaClientValidationError: Invalid `model.count()` invocation
Argument `name` is missing.
Argument `sku` is missing.
```

### Root Cause
```typescript
// BROKEN — Prisma doesn't resolve [field] inside NOT array
model.count({ where: { ...where, NOT: [{ [field]: null }] } })
```

### Fix Applied
```typescript
// CORRECT — use field-level filter directly
model.count({ where: { ...where, [field]: { not: null } } })
```

Applied to lines 125, 131, 137 (requiredFields, optionalFields, fkFields maps).

### Impact
- All data import pipelines that trigger normalization fail with an unhandled exception
- Data quality scores are never computed or stored
- Import "Done" state is unreachable when normalization is enabled

---

## BUG-002 — High: No Page-Level Access Control (Authorization Bypass)

| Field | Value |
|-------|-------|
| **Severity** | High |
| **Status** | Fixed |
| **Department** | Backend |
| **Files** | `src/middleware.ts`, multiple page components |

### Description
The middleware only checks if a user is authenticated (logged in). It does NOT enforce feature-level permissions. A `VIEWER`-role user who is blocked from Brain/Rules in the sidebar can bypass that restriction by directly navigating to the URL (e.g., `/brain`, `/data/import`, `/rules`).

### Steps to Reproduce
1. Create a VIEWER account or set a member's role to VIEWER
2. Note that `/brain` is not shown in the sidebar
3. Manually navigate to `http://localhost:3000/brain`
4. Page loads without any authorization error

### Fix Applied
Added server-side segment-level `layout.tsx` files for restricted routes that check resolved permissions and redirect to `/dashboard` if access is denied:
- `/brain/*` → requires `permissions.brain`
- `/rules` → requires `permissions.brain`
- `/data/import` → requires `permissions.import`
- `/admin` → requires OWNER or ADMIN role

---

## BUG-003 — Medium: Session Has No Expiry / Inactivity Timeout

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Status** | Fixed |
| **Department** | Backend |
| **Files** | `src/lib/auth.ts`, `src/auth.config.ts` |

### Description
JWT sessions are created with no `maxAge`, defaulting to NextAuth's 30-day session lifetime. A user who leaves their browser open or closes the tab remains authenticated indefinitely, posing a security risk in shared/enterprise environments.

### Fix Applied
- Set `session.maxAge = 600` (10 minutes) in both `auth.ts` and `auth.config.ts`
- Set `session.updateAge = 0` so every API request refreshes the rolling window
- Added client-side `InactivityProvider` that listens for `mousemove`, `keydown`, `click`, `scroll` events and calls `signOut()` after 10 minutes of inactivity

---

## BUG-004 — Low: Contact/Demo Page Linked but Broken

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Status** | Fixed |
| **Department** | Frontend |
| **Files** | `src/app/(auth)/login/page.tsx`, `src/app/api/contact/route.ts` |

### Description
The login page shows a "Request a demo →" link pointing to `/contact`. The `/contact` folder exists but contains no `page.tsx`, resulting in a 404. The API endpoint (`/api/contact`) exists but the page-level UI was never built.

### Fix Applied
Removed the "Request a demo" link from the login page and deleted the orphaned `/api/contact` route and empty `/contact` folder, as a demo request flow is not required for the current MVP.

---

## BUG-005 — Low: Homepage Welcome Modal Not Role-Aware

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Status** | Fixed |
| **Department** | Frontend / Backend |
| **Files** | New: `src/components/dashboard/WelcomeModal.tsx` |

### Description
New users see no onboarding context after first login. The existing `OnboardingNudge` component is journey-state based but not personalized per role, leaving VIEWER and MEMBER users without guidance on what they can do.

### Fix Applied
Created `WelcomeModal.tsx` with role-specific messaging for OWNER, ADMIN, MEMBER, and VIEWER. Modal persists dismissal via `localStorage` and is shown once per user per browser.

---

## Summary Table

| Bug ID | Severity | Status | Department |
|--------|----------|--------|-----------|
| BUG-001 | Critical | Fixed | Backend |
| BUG-002 | High | Fixed | Backend |
| BUG-003 | Medium | Fixed | Backend |
| BUG-004 | Low | Fixed | Frontend |
| BUG-005 | Low | Fixed | Frontend |
