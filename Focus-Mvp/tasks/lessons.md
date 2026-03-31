# Lessons Learned — Focus Platform

Patterns and rules to prevent repeated mistakes. Review at session start.

---

## 1. Supabase Migrations: Always Surface SQL to the User

**Pattern:** When a Prisma migration is created but can't be applied automatically (because we don't have direct DB access from this environment), I must **immediately** provide the user with the exact SQL to run in the Supabase SQL Editor — without waiting to be asked.

**Rule:**
- After generating any Prisma migration, **always** present the SQL with `IF NOT EXISTS` guards (safe to re-run) and the `_prisma_migrations` insert so Prisma stays in sync.
- Frame it clearly: "Run this in Supabase SQL Editor before proceeding."
- Never assume the migration will be applied later or that the user knows to check for it.
- This applies to **all** schema changes: new tables, new columns, index changes, enum additions, etc.

**Why:** The user has had to remind me about this multiple times. Migrations that sit unapplied silently break queries and imports.

---

## 2. Prisma Schema Is the Source of Truth

**Pattern:** All database models flow through `schema.prisma`. Never write raw SQL for schema changes without also updating the Prisma schema (or vice versa).

**Rule:**
- Schema change = update `schema.prisma` → generate migration → provide SQL to user → wait for confirmation before relying on new columns in code.
- Never add columns in SQL that aren't reflected in the Prisma schema.

---

## 3. Canonical Schema Alignment

**Pattern:** The canonical schema (`canonical_schema.json`) defines the full set of fields each entity should have. The Prisma schema and import mappers must stay aligned with it.

**Rule:**
- When adding canonical fields, update all three layers: `canonical_schema.json` → `schema.prisma` → import mapper/resolver.
- Don't leave fields as JSON blob extras when they belong as typed columns.

---

## 4. Test Before Declaring Done

**Pattern:** Don't mark a task complete without verifying it works end-to-end.

**Rule:**
- For schema changes: confirm migration is applied, `prisma generate` succeeds, and a test query works.
- For UI changes: confirm the page renders without errors.
- For imports: confirm a sample file imports successfully with the new fields populated.

---

## 5. Environment Constraints

**Pattern:** This environment cannot reach the Supabase database directly (network restrictions).

**Rule:**
- Never attempt `prisma migrate deploy` or `prisma db push` — it will fail.
- Always route DB changes through the user via SQL in the Supabase SQL Editor.
- `prisma generate` (client generation) works fine locally and should always be run after schema changes.

---

## 6. Don't Over-Engineer Simple Fixes

**Pattern:** When a bug has a clear root cause, fix it directly. Don't refactor surrounding code or add abstractions.

**Rule:**
- Match the scope of the fix to the scope of the problem.
- If a `select` clause is missing a field, add the field — don't restructure the entire query layer.

---

## 7. Verify Which DB Fields Actually Have Data Before Switching

**Pattern:** When refactoring which field the UI displays, always check which field is populated during import — not just which field exists in the schema.

**Rule:**
- Before swapping a column in the explorer, trace the import path (`process/route.ts`) to confirm the replacement field is actually populated.
- `quantity` is the primary inventory field set during import. `qtyOnHand` defaults to 0 and is never written to.
- Don't assume canonical fields have data just because they exist in the schema — check the ingestion code.

**Why:** Switching the explorer from `quantity` to `qtyOnHand` caused all values to show as "0" because `qtyOnHand` was never populated during import.

---

## 8. Canonical vs Imported Fields: Always Use the Populated One

**Pattern:** The schema has TWO generations of quantity fields on several models. Original "imported" fields have real data; newer "canonical" fields default to 0 and are never populated during ingestion. Any code that reads the wrong field silently returns zeros.

**Affected models and their correct fields:**

| Model | Has Real Data | Always 0 (canonical, never populated) |
|-------|--------------|---------------------------------------|
| InventoryItem | `quantity`, `reservedQty` | `qtyOnHand`, `qtyAllocated`, `qtyAvailable`, `qtyOnHold`, `qtyOnHandTotal`, `qtyOpenPO`, `qtyOnHandPlusPO` |
| WorkOrder | `plannedQty`, `actualQty` | `qtyPlanned`, `qtyProduced`, `qtyScrapped` |

**Rule:**
- When adding ANY code that reads inventory or work order quantities, ALWAYS use the imported field (`quantity`, `plannedQty`, `actualQty`).
- Never use `qtyOnHand`, `qtyPlanned`, or `qtyProduced` — they are all 0.
- When documenting schema fields for AI context, annotate which fields have real data.
- Before referencing a field in a new feature, check `src/app/api/data/sources/[id]/process/route.ts` to confirm it's populated during import.

**Why:** The new chat system (`build-context.ts`, `tools.ts`) was merged from main using canonical fields (`qtyOnHand`, `qtyPlanned`, `qtyProduced`) causing the chat to report all inventory as 0 and 100% stock-outs. The explorer pages were already correct because they used the original fields.

---

## 9. Always Read CLAUDE.md and lessons.md at Session Start

**Pattern:** Starting work without reviewing project instructions and lessons leads to repeating known mistakes.

**Rule:**
- FIRST action of any session: read `CLAUDE.md` and `tasks/lessons.md` before touching any code.
- Specifically check lesson #8 (canonical vs imported fields) before writing any query code.
- Don't assume context from prior sessions — verify against documented lessons.

**Why:** Wrote an entire feature (widget-data routes, generate route, data context) using `qtyOnHand`, `qtyPlanned`, `qtyProduced`, `qtyScrapped` — all of which are always 0. This was already documented in lesson #8 but wasn't reviewed before starting.

---

## 10. Ingestion Must Never Silently Drop Rows Due to Missing Parents

**Pattern:** Entity ingestion cases that look up a parent (Product, Supplier, Customer) and `return null` when missing cause entire file imports to silently produce 0 rows. The user sees "completed" with a row count, but nothing appears in Explorer.

**Rule:**
- When an entity references a parent (e.g., InventoryItem → Product, PO → Supplier, SO → Customer), always **auto-create a stub** for the parent using `upsert`, not `findUnique` + `return null`.
- Follow the BOM pattern (which already auto-creates product stubs).
- Never silently skip an import row because a dependency doesn't exist — create the dependency or surface a visible error.
- If an import claims N rows imported but Explorer shows 0, check `upsertEntity()` for early `return null` paths that bypass the actual database write.

**Why:** A user uploaded inventory CSVs without a product file. All 1,156 rows were "imported" (counter incremented) but zero InventoryItem rows were created because each one hit `if (!invProduct) return null`. Same pattern existed for PurchaseOrder (missing supplier) and SalesOrder (missing customer).

---

## 11. Every tool_use Block Must Have a Matching tool_result

**Pattern:** When the Anthropic API sees a `tool_use` block in the message history without a corresponding `tool_result` in the next user message, it returns a 400 `invalid_request_error`.

**Rule:**
- Never push an assistant message containing `tool_use` blocks into the messages array without also pushing matching `tool_result` blocks as the next user message.
- When hitting a tool call cap or short-circuiting the tool loop, always execute the tools and add results **before** adding any forced user message.
- When reconstructing conversation history from DB (where tool calls are stored as JSON on assistant messages), rebuild proper `tool_use` + `tool_result` message pairs — don't just send plain text.
- Avoid consecutive same-role messages by merging `tool_result` blocks with the next user text message.

**Why:** The chat's tool call cap path pushed `tool_use` blocks then skipped execution, jumping to a plain user message. Also, `buildAnthropicMessages()` stripped tool call history to plain text, losing context and risking malformed messages on edge cases.

---

## 12. Schema Changes Break Prisma RETURNING Clauses

**Pattern:** Adding a column to `schema.prisma` and running `prisma generate` makes the Prisma client include that column in RETURNING clauses (even if you never write it explicitly). If the column doesn't exist in the DB, every `create`/`update` without an explicit `select` clause fails.

**Rule:**
- Never add a column to `schema.prisma` without IMMEDIATELY providing the Supabase SQL (lesson #1).
- Always add `select: { id: true }` to `create`/`update` calls that don't use the return value. This prevents RETURNING from referencing columns that may not exist yet.
- Before adding any schema column, ask: "Is this column needed in the code RIGHT NOW?" If not, don't add it.
- Test the full import flow after any schema change — don't just check `tsc`.

**Why:** Added `dataSourceId` to InventoryItem schema + ran `prisma generate`. The column was never created in Supabase. Every inventory `create`/`update` silently failed because Prisma's RETURNING clause referenced the non-existent column. This broke ALL inventory imports for ALL users.

---

## 13. Don't Add Cleanup/Deletion Logic to Stabilize Imports

**Pattern:** When fixing an import bug, resist the urge to add automatic deletion of "stale" records. Deletion logic is high-risk and hard to scope correctly (single-source vs multi-source accounts, timing issues with `updatedAt`).

**Rule:**
- Fix the mapping/upsert logic first. Get the core import working correctly.
- Only add deletion logic after the core is stable AND there's a clear, safe scoping mechanism.
- Never delete records based on `updatedAt` timestamps — too fragile.
- If stale records exist from a previous bug, handle them as a one-time cleanup, not automated logic.

**Why:** Added `updatedAt`-based stale record cleanup that ran after every InventoryItem import. This added unnecessary risk to every import operation while the core import itself was still broken.

---

## 14. Don't Restrict Data the AI Model Needs to See

**Pattern:** When fixing AI chat hallucination or truncation issues, don't add complexity to work around an artificially small limit. Increase the limit instead.

**Rule:**
- `TOOL_RESULT_CHAR_LIMIT` must be large enough for the model to see all rows from a normal query (up to 100 rows). 8000 chars (~2K tokens) is far too small — use 40,000+ chars (~10K tokens).
- If the model is fabricating, truncating, or asking users to follow up for remaining rows, check the char limit FIRST before adding slimming/truncation/prompt hacks.
- Each layer of workaround (slimRows, truncateToolResult, _truncationNote, auto-fetch prompts) made things worse: 14 → 6 → 4 visible rows across three rounds.
- The root cause was always the pipe size, not the data or the model's behavior.

**Why:** Three rounds of increasingly complex fixes (row-aware truncation, field slimming, system prompt changes) each reduced the visible row count further. The actual fix was one line: change `8000` to `40_000`.

---

## 15. New Features Must Have Graceful Degradation for Missing Infrastructure

**Pattern:** Adding database-dependent features (like token tracking) without error handling means a missing migration takes down the entire app.

**Rule:**
- Any new Prisma query on a new table MUST be wrapped in try-catch with a sensible fallback (e.g., allow the request, return zeroed data).
- Never let an infrastructure dependency (migration not applied, table missing) block core functionality.
- Pre-flight checks should fail open (allow) not fail closed (block) when the underlying system isn't ready.

**Why:** Token limits commit added `checkTokenBudget()` which queried a non-existent `TokenUsage` table. This crashed ALL chat requests with "Request failed" because there was no try-catch.

---

## 16. Always Include Soft Warnings Before Hard Blocks

**Pattern:** Going from 0% to "you're blocked" with no transition destroys user trust, especially for pilot/paying customers.

**Rule:**
- Any rate-limiting system must include a soft warning at 80% usage before the hard block at 100%.
- The warning should be visible where the user interacts (e.g., above the chat input), not just in a settings page.
- Include an estimate of remaining interactions, not raw numbers.

**Why:** CTO flagged this as a trust-destroying UX gap. A pilot customer hitting a hard block mid-session with no prior warning is unacceptable.

---

## 17. Always Include Per-Customer Override Fields for Limits

**Pattern:** Any system with limits (tokens, messages, API calls) will need per-customer exceptions within the first week of pilot.

**Rule:**
- When adding limit enforcement, always add nullable override fields on the entity (e.g., `customDailyTokenLimit` on Organization).
- The enforcement code should check overrides first, then fall back to plan defaults.
- Without this, the only option for a customer exception is a manual database change or code deploy.

**Why:** CTO predicted this would be needed in week one. Adding it upfront is 30 minutes; scrambling later is disruptive.

---

## 18. Show Users Human-Friendly Numbers, Not Raw Tokens

**Pattern:** Users don't understand "45,231 / 500,000 tokens." They understand "9% — ~45 interactions remaining."

**Rule:**
- In user-facing UI: show percentages and interaction estimates.
- In admin/settings pages: show both raw numbers AND the friendly format.
- Estimate interactions using average tokens per interaction (~3K is reasonable for chat).

**Why:** CTO flagged raw token numbers as meaningless to pilot customers. Would hurt demos.

---

*Last updated: 2026-03-20*
