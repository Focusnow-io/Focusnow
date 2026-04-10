# Data Science — QA Edge Case Notes

## Purpose

`prisma/seed-qa.ts` populates a dedicated test organisation (`qa-edge-cases`) with deliberately confusing and edge-case data. The goal is to verify that:

1. The **data quality scorer** (`src/lib/normalization/data-quality-scorer.ts`) handles all edge cases correctly
2. The **dashboard** metrics are not distorted by bad data
3. The **AI chat tools** (`src/lib/chat/tools.ts`) return sensible results when data is noisy

Run with:
```bash
npx ts-node --project tsconfig.json prisma/seed-qa.ts
```

---

## Case Catalogue

### Products

| Case | SKU(s) | What it tests |
|------|--------|---------------|
| **A** | STUB-001..003 | `name === sku` stub detection in quality scorer — should suppress name quality penalty |
| **B** | DUP-A, DUP-B, DUP-C | Three products share the name "Widget Pro" → dedup / entity resolution should flag these |
| **C** | RICH-001 | All optional fields populated → quality scorer should return high optional score |
| **D** | SPARSE-001 | No optional fields → quality scorer should penalise optional score |

**Expected scorer behaviour:**
- STUB products: `requiredScore ≈ 1.0` (stub suppression active), `optionalScore ≈ 0.33` (no optional fields)
- RICH-001: `requiredScore = 1.0`, `optionalScore = 1.0`
- SPARSE-001: `requiredScore = 1.0`, `optionalScore = 0.0`

---

### Suppliers

| Case | Code | What it tests |
|------|------|---------------|
| **E** | SUP-ALPHA, SUP-BETA | Same name "Acme Supplies" with different codes → entity resolution dedup confusion |

**Expected:** `EntityResolutionLog` should surface these two as potential duplicates.

---

### Inventory Items

| Case | Product | Qty | What it tests |
|------|---------|-----|---------------|
| **F** | RICH-001 | 0 | Zero quantity — should appear in "at risk" SKUs on dashboard |
| **G** | SPARSE-001 | -5 | Negative quantity — invalid data, should be flagged; inventory health calculation must not crash |
| **H** | STUB-001 | 100 | FK locationId set → FK resolution score = 1.0 for this item |
| **I** | STUB-002 | 50 | FK locationId null → FK resolution score = 0.0 for this item |

**Expected scorer behaviour for InventoryItem:**
- FK resolution score = 0.5 (1 of 2 items has locationId set)
- Dashboard inventory health should handle negatives without NaN/crash

---

### Purchase Orders

| Case | PO # | Status | Expected Date | What it tests |
|------|------|--------|---------------|---------------|
| **J** | PO-OVERDUE-001 | SENT | 2024-01-01 (past) | Past-due PO — should appear in `overduePOs` count on dashboard |
| **K** | PO-FUTURE-001 | DRAFT | 2030-12-31 (future) | Far-future PO — should appear in `openPOValue` but not overdue |
| **L** | PO-CANCELLED-001 | CANCELLED | — | Cancelled PO — must be excluded from all active metrics |

**Expected:** Dashboard `overduePOs = 1` (only case J), `openPOValue` includes J + K but not L.

---

### BOM Headers

| Case | Version | isActive | Lines | What it tests |
|------|---------|----------|-------|---------------|
| **M** | v0-empty | false | 0 | Empty inactive BOM — no crash, FK score passes (productId set) |
| **N** | v1 | true | 0 | Active BOM with no lines — should not appear in "complete" coverage |

**Expected:** BOMHeader quality scorer should return `fkScore = 1.0` (productId is set for both). No crash on empty lines list.

---

### Work Orders

| Case | WO # | productId | What it tests |
|------|------|-----------|---------------|
| **O** | WO-LINKED-001 | RICH-001 | FK resolved correctly → fkScore contribution = 1.0 |
| **P** | WO-ORPHAN-001 | null | FK missing → fkScore contribution = 0.0; sku references phantom product |

**Expected:** WorkOrder quality scorer `fkScore = 0.5` (1 of 2 has productId).

---

### Customers

| Case | Code | email | What it tests |
|------|------|-------|---------------|
| **Q** | CUST-001 | present | Optional field present |
| **R** | CUST-002 | absent | Optional field absent → penalises optional score |
| **S/T** | CUST-DUP-A/B | both present | Same name "Acme Corp" different codes → dedup/resolution edge case |

**Expected:** Customer quality scorer `optionalScore = 0.75` (3 of 4 have email). EntityResolutionLog should flag CUST-DUP-A and CUST-DUP-B.

---

### Lots

| Case | Lot # | expiryDate | What it tests |
|------|-------|-----------|---------------|
| **T** | LOT-EXPIRED-001 | 2023-06-01 | Expired lot — should trigger expiry alerts; status = QUARANTINE |
| **U** | LOT-NOEXP-001 | null | Non-perishable lot — no expiry alert expected |

---

## Prisma Model Assessment

The schema is well-structured. Key observations:

- **Multi-tenant isolation** is consistent: all operational models carry `organizationId` or `orgId` with cascade deletes.
- **Unique constraints** on business keys (e.g., `organizationId_sku`, `organizationId_code`) prevent accidental duplicates within an org.
- **Soft-delete pattern** is applied to Product, Supplier, Location, Customer, Equipment via `deletedAt` / `deactivatedAt` — but the quality scorer does NOT filter these out. Consider adding `deletedAt: null` to all scorer `where` clauses.
- **Mixed FK styles**: Core models use `organizationId`; manufacturing models use `orgId`. The scorer's `EntityQualityConfig.orgField` handles this — but it must remain in sync with any future model additions.
- **InventoryItem.quantity is a required `Decimal`** — negative values are schema-valid. Application logic should add a CHECK constraint or validation layer to prevent negative quantities from entering the system.

## Recommended Next Steps

1. Add `deletedAt: null` filter to scorer `where` clauses to exclude soft-deleted records from quality scores
2. Add a business validation rule that rejects negative `InventoryItem.quantity` at the API level
3. Run entity resolution scan against the QA org to confirm dedup cases B, E, S/T are surfaced
4. Monitor dashboard KPI calculations with QA org to confirm negative/zero qty handling
