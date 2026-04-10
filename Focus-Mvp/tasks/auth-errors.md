# Auth System — Error Reference

All errors encountered during the build of the 2-step authentication system
(OTP login + email verification), what caused them, and how each was resolved.

---

## E1 — Edge Runtime: Node.js `crypto` module not supported

**Error:**
```
The edge runtime does not support Node.js 'crypto' module.
```

**Why:**
`middleware.ts` imported `auth` from `@/lib/auth`, which pulled in Prisma → `pg` → Node.js `crypto`.
Next.js middleware runs in the **edge runtime**, which is a restricted V8 environment — it has no access to Node.js built-ins like `crypto`, `fs`, or `net`.

**Fix:**
Split the auth config into two files:
- `src/auth.config.ts` — edge-safe (no Prisma, no Node.js imports), used by middleware
- `src/lib/auth.ts` — full Node.js runtime, used by API routes and server components

Later replaced with `getToken` from `next-auth/jwt` in middleware — reads the JWT cookie directly without needing any providers or database.

---

## E2 — Logged-in users could access `/register` and `/login`

**Error:**
No console error. Symptom: navigating to `/register` while authenticated loaded the page instead of redirecting to `/dashboard`.

**Why:**
`NextAuth(authConfig)` in middleware with `providers: []` creates a **separate auth instance** from the main `auth.ts`. In NextAuth v5 beta, these instances don't reliably share JWT verification — `req.auth` returned `null` even for valid sessions.

**Fix:**
Replaced the `NextAuth(authConfig)` wrapper in middleware with `getToken` from `next-auth/jwt`, which reads and verifies the JWT cookie directly using `NEXTAUTH_SECRET`. This works in the edge runtime and correctly identifies logged-in users.

---

## E3 — OTP verification did nothing (user immediately signed in)

**Error:**
No console error. Symptom: after entering email + password, user was immediately taken to the dashboard without any OTP step.

**Why:**
The original design called `signIn()` from NextAuth on step 1, which created a **full session immediately**. The plan was to patch the JWT's `needsVerification` flag using `useSession().update()` — but `update()` is silently inert without a `SessionProvider` in the component tree.

**Fix:**
Complete architectural redesign:
1. Login step 1 → `POST /api/auth/otp/send` — validates credentials, generates OTP, returns `pendingId`. **No session created.**
2. Login step 2 → `POST /api/auth/otp/verify` — validates OTP, returns a one-time `signInToken`.
3. Frontend calls `signIn("credentials", { signInToken })` — session is created only now.

---

## E4 — `useSession()` / `update()` silently did nothing

**Error:**
No console error. Symptom: `update({ upgradeToken: ... })` returned without error but the JWT was never changed.

**Why:**
`useSession()` and `update()` from `next-auth/react` require a `<SessionProvider>` ancestor in the React tree to function. The root layout only had `<ThemeProvider>` — no `SessionProvider` was mounted.

**Fix:**
Created `src/components/session-provider.tsx` (a thin client-side wrapper around `NextAuthSessionProvider`) and added it to `src/app/layout.tsx` wrapping all children.

---

## E5 — Registration crashed with Resend 403 error

**Error:**
```
[EMAIL] Resend error: { statusCode: 403, name: 'validation_error',
  message: 'You can only send testing emails to your own email address...' }
[REGISTER] Error creating account: Error: Failed to send email: 403
POST /api/auth/register 500
```

**Why:**
The `onboarding@resend.dev` sender address (used before domain verification) can **only deliver to the Resend account owner's email**. Any registration with a different email caused the Resend API to return 403, which was re-thrown as an exception, crashing the entire registration request with a 500.

**Fix:**
Made email sending **non-fatal** in `src/lib/email.ts` — Resend errors are logged with `console.error` but no longer throw. The verification URL is always printed to the server console so developers can click it during testing.

---

## E6 — `OtpCode` table does not exist in database

**Error:**
```
prisma:error Invalid prisma.otpCode.deleteMany() invocation
The table `public.OtpCode` does not exist in the current database.
POST /api/auth/otp/send 500
```

**Why:**
The Prisma migration file was created locally but the Supabase database only accepts schema changes via direct PostgreSQL connection (port 5432), which is blocked from the local network. The `OtpCode` table was never actually created in the production database.

**Fix:**
Run the following SQL manually in the **Supabase SQL Editor**:
```sql
CREATE TABLE "OtpCode" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "attempts"  INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OtpCode_userId_idx" ON "OtpCode"("userId");
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

---

## E7 — Login blocked: `email_not_verified` for existing accounts

**Error:**
```
[OTP][login] Unverified email login attempt { userId: 'cmnkbkabg000004jl0ukec6lw' }
POST /api/auth/otp/send 403
```

**Why:**
Accounts created **before** the email verification system was introduced have `emailVerified = null` in the database. The new `sendLoginOtp()` function rejects login for any user without a verified email.

**Fix:**
Manually verify existing accounts in Supabase SQL Editor:
```sql
UPDATE "User"
SET "emailVerified" = NOW()
WHERE id = 'cmnkbkabg000004jl0ukec6lw';
```
New accounts registered after the system was deployed will receive a verification email and must click the link before logging in.

---

## E8 — VS Code shows `otpCode` property errors on `prisma.*`

**Error (IDE only, not compiler):**
```
Property 'otpCode' does not exist on type 'PrismaClient<PrismaClientOptions, never, DefaultArgs>'
```

**Why:**
VS Code's TypeScript Language Server caches type information and can become **stale** after `prisma generate` runs. The `"incremental": true` setting in `tsconfig.json` causes `.tsbuildinfo` to be cached. The actual `tsc --noEmit` compiler has zero errors — this is a display issue only.

**Fix:**
1. Delete the stale cache files:
   ```bash
   rm tsconfig.tsbuildinfo .next/cache/.tsbuildinfo
   ```
2. Regenerate the Prisma client:
   ```bash
   npx prisma generate
   ```
3. In VS Code: `Ctrl + Shift + P` → **TypeScript: Restart TS Server**

---

## E9 — Resend domain pending: emails not delivered to real users

**Error:**
No console error. Symptom: user registers, sees "Check your inbox", but receives nothing.

**Why:**
The Resend `onboarding@resend.dev` sender address is a **sandbox sender** — it can only deliver to the email address registered with the Resend account. All other recipients are silently dropped (or the API returns a 403 if the call is not suppressed).

**Resolution (in progress):**
DNS records have been added to `focusnow.io` in Hostinger:
- DKIM TXT record at `resend._domainkey`
- MX record at `send`
- SPF TXT record at `send`
- DMARC TXT record at `_dmarc`

Once Resend shows the domain as **verified**, update `.env`:
```env
EMAIL_FROM=Focus <focus@focusnow.io>
```

**Workaround during pending state:**
The verification URL is always printed to the **server console** (`npm run dev` terminal). Copy and paste it into the browser to verify the account manually.

---

## Permanent rules added from this feature

| Rule | Description |
|---|---|
| Always apply migration SQL immediately | Never leave a Prisma schema change without the corresponding Supabase SQL — see `tasks/lessons.md` rule #1 |
| Email sending must be non-fatal | Network/provider errors must be caught and logged, never re-thrown from registration/login paths |
| No session until fully authenticated | Never call `signIn()` until ALL verification steps are complete |
| Edge runtime = no Node.js imports | Any file used in middleware must be edge-safe — no Prisma, no `pg`, no `bcrypt`, no `crypto` |
| `SessionProvider` required for client hooks | `useSession()` and `update()` are no-ops without a `SessionProvider` in the tree |

---

*Last updated: 2026-04-07*
