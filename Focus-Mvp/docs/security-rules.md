# Security Rules — Focus Platform

Last updated: 2026-04-07 (audit rev 2)

---

## 1. Authentication Flow

```
User submits email + password
    ↓
POST /api/auth/otp/send
    → Validates credentials (bcrypt, 12 rounds)
    → Checks emailVerified is set
    → Generates 6-digit OTP (crypto.randomInt), stores in OtpCode table
    → Sends OTP via email (Resend)
    → Returns { pendingId } — NO session created yet
    ↓
User enters OTP at /verify-otp
    ↓
POST /api/auth/otp/verify
    → Validates OTP against OtpCode record
    → Max 3 attempts before lockout
    → 10-minute expiry
    → On success: issues one-time signInToken (VerificationToken table, 5min TTL)
    ↓
Frontend calls signIn("credentials", { signInToken })
    ↓
NextAuth Credentials authorize()
    → consumeSignInToken(): finds + deletes token from DB (one-time use)
    → Returns user object → JWT issued
    ↓
Session active — user is fully authenticated
```

**Registration flow:**
```
POST /api/auth/register
    → Creates User (emailVerified = null), Organization, OrgMember (OWNER)
    → Sends verification email (Resend) with 24hr token
    → Redirects to /check-email
    ↓
User clicks link → GET /api/auth/verify-email?token=...
    → Sets emailVerified = now()
    → Redirects to /login?verified=1
```

---

## 2. Authorization Model

### Session
- **Strategy:** JWT (stateless) — session cookie, HttpOnly, signed with `NEXTAUTH_SECRET`
- **Contents:** `{ id, email, name, image }` — no sensitive data in JWT
- **Expiry:** NextAuth default (30 days)

### Org Isolation
Every user belongs to one or more Organizations via the `OrgMember` join table.

The `getSessionOrg()` helper in `src/lib/api-helpers.ts`:
1. Reads the session JWT
2. Finds the user's `OrgMember` record including the `Organization`
3. Returns `{ session, member, org }` or `null` if unauthenticated

**Every API route that touches org data:**
- Calls `getSessionOrg()` first
- Returns `401` if null
- Uses `organizationId: ctx.org.id` in ALL Prisma queries

This ensures: **a user can never read or write another org's data**, even with a valid session.

### Role System
| Role | Can do |
|---|---|
| `OWNER` | Everything — delete org, manage all members, change roles |
| `ADMIN` | Manage members (not other admins/owners), all data ops |
| `MEMBER` | Read + write data, no user management |
| `VIEWER` | Read only (enforced at route level per resource) |

---

## 3. Route Protection

### Middleware (`src/middleware.ts`)
- Runs on every request except static assets
- Reads JWT via `getToken()` (edge-safe, no DB call)
- **Unauthenticated + non-public route** → redirect to `/login`
- **Authenticated + auth page** → redirect to `/dashboard`

### Public routes (no auth required)
- `/login`, `/register`, `/verify-otp`, `/check-email`
- `/forgot-password`, `/reset-password`, `/contact`
- `/api/auth/**` (NextAuth handlers)
- `/api/contact` (demo request form)

### Protected routes
- Everything else under `/` and `/api/`

---

## 4. What is Protected

| Resource | Auth required | Org-scoped | Notes |
|---|---|---|---|
| All dashboard pages | ✅ | ✅ (via layout) | |
| All `/api/*` routes | ✅ | ✅ | Except auth + contact |
| Data sources | ✅ | ✅ | |
| Brain rules | ✅ | ✅ | |
| AI chat | ✅ | ✅ | |
| App instances | ✅ | ✅ | |
| Webhooks | ⚠️ Public URL | ✅ | HMAC sig validation when secret set |
| OTP codes | N/A | Per-user | Stored in OtpCode, max 3 attempts |

---

## 5. Sensitive Data Storage

| Data | Storage | Notes |
|---|---|---|
| Passwords | `User.passwordHash` — bcrypt 12 rounds | Never stored plain, never in JWT |
| OTP codes | `OtpCode` table — plain 6-digit number | Deleted on use or expiry |
| Verification tokens | `VerificationToken` table | Deleted on use |
| Session | JWT cookie (HttpOnly, signed) | No sensitive fields |
| API keys | Environment variables only | `NEXTAUTH_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY` |
| DB credentials | Environment variables only | Never hardcoded |

---

## 6. Known Limitations

1. **Multi-org users:** `getSessionOrg()` returns the first org membership. Users with multiple org memberships always land in the same org. Active org switching is not yet implemented.

2. **Webhook security:** HMAC signature verification only runs when `connector.config.secret` is set. Connectors without a secret accept all payloads. Consider making secrets mandatory for webhook connectors.

3. **Rate limiting:** `/api/auth/otp/send` has an in-process rate limiter (5 attempts / 15 min per email). No rate limiting on `/api/auth/forgot-password` — consider adding to prevent account enumeration amplification (token generation cost). In-process limiters reset on server restart; swap for Redis in multi-instance deployments.

4. **Email delivery:** While the sending domain (`focusnow.io`) is pending verification in Resend, emails only deliver to the Resend account owner. Registration verification URLs are logged to console as fallback.

5. **Password reset:** Reset tokens are stored in the shared `VerificationToken` table. Identifier format: `reset:{email}`.

---

## 8. Security Audit Log (2026-04-07)

### Audit scope
All API routes under `src/app/api/` reviewed for: missing auth checks, cross-org data leakage, hardcoded secrets, missing rate limiting, and missing structured logging.

### Findings

#### No issues found
- All data-touching routes call `getSessionOrg()` and return 401 when null.
- All Prisma queries on multi-tenant models (`brainRule`, `product`, `inventoryItem`, `order`, etc.) include `organizationId: ctx.org.id` — no cross-org leakage identified.
- No hardcoded secrets or credentials found in any source file. All secrets are referenced via `process.env`.
- Public auth routes (`/api/auth/**`, `/api/contact`) correctly bypass the session check — this matches the intentional design in middleware.
- Webhook endpoint (`/api/connectors/webhook/[id]`) is intentionally unauthenticated but uses opaque CUID-based URL with optional HMAC verification. Documented as known limitation #2.

#### CF-005 — Fixed (rules/page.tsx `handleDelete`)
- **Was:** `await fetch(...)` with no `.catch()` and no error feedback. Silent failure on network error or non-2xx response; list updated optimistically even if the server returned an error.
- **Fix:** Wrapped in try/catch, checks `res.ok`, renders error message in UI via `deleteError` state. List only updates on confirmed success.
- **File:** `src/app/(dashboard)/rules/page.tsx`

#### CF-007 — Fixed (brain/rules/[id] PUT handler)
- **Was:** `body` fields (`name`, `description`, `category`, `entity`, `condition`, `parameters`, `tags`) used directly from `await req.json()` without validation. Malformed payloads could pass unexpected types into Prisma.
- **Fix:** Added `updateSchema` (Zod, all fields optional) and validated with `safeParse` before use. Returns structured 400 on invalid input.
- **File:** `src/app/api/brain/rules/[id]/route.ts`

#### Structured logging gaps — Fixed
- `GET /api/admin/members` — no log on success; added `[API][admin/members/list]` entry.
- `DELETE /api/admin/members/[id]` — had a log after deletion; added an `[API][admin/member/delete] attempt` log at start of request for full audit trail.
- `PUT /api/admin/members/[id]/role` — had a log after update; added `[API][admin/member/role] attempt` log at start.
- `POST /api/auth/forgot-password` — had logs for unknown email and for the reset link; added `[API][auth/forgot-password]` log when a valid user is found and token generation begins.
- `POST /api/auth/reset-password` — fully covered with `console.warn` on bad/expired token and `console.log` on success. No changes needed.

### Remaining recommendations (not yet implemented)
- Add rate limiting to `POST /api/auth/forgot-password` (see Known Limitation #3).
- Consider requiring HMAC secrets on all webhook connectors (see Known Limitation #2).

---

## 7. Logging Format

All server logs follow this structure:

```
[API][resource/action] { userId, orgId }   ← start of every mutation
[API][resource/action] error: <Error>      ← catch blocks
[OTP][phase] message { context }           ← OTP flow events
[EMAIL][phase] message                     ← email events
[AUTH][phase] message                      ← auth events
```

QA team: search logs for `[API]`, `[OTP]`, `[EMAIL]`, `[AUTH]` prefixes.
