# Schema Analysis — Focus Platform

Last updated: 2026-04-07 (revised 2026-04-07)

---

## Executive Summary

The schema is architecturally sound for a multi-tenant industrial SaaS platform. The primary issues are **two generations of fields** (original imported fields vs. canonical v2/v3 fields, with the canonical ones never populated), **duplicate model systems** for BOMs, forecasts, and MPS, and **inconsistent org field naming** (`organizationId` vs `orgId`). No security issues found.

The schema has grown substantially since the initial assessment: a full v3 canonical manufacturing layer has been added covering procurement (`PurchaseOrder`, `POLine`), sales (`SalesOrder`, `SOLine`, `Customer`, `Shipment`), quality (`QCInspection`, `CAPA`, `NCR`), traceability (`Lot`, `SerialNumber`, `StockMovement`, `ProductionBatch`), and maintenance (`Equipment`, `MaintenanceLog`). These models use `orgId` rather than `organizationId`.

---

## Current Model Inventory

| Layer | Models | Notes |
|---|---|---|
| Auth | User, Account, Session, VerificationToken, OtpCode | Clean |
| Multi-tenant core | Organization, OrgMember | Clean |
| Data ingestion | DataSource, MappingTemplate, FlaggedColumn | Clean |
| Operational data (v1/v2) | Product, Supplier, Location, InventoryItem, Order, OrderLine, BOMItem, ForecastEntry, MpsEntry, WorkOrder, Routing, WorkCenter | ⚠️ Partially deprecated |
| Operational data (v3 canonical) | PurchaseOrder, POLine, SalesOrder, SOLine, Customer, Shipment, BOMHeader, BOMLine, Lot, StockMovement, SerialNumber, Equipment, MaintenanceLog, WorkOrderOperation, RoutingOperation, ProductionBatch, QCInspection, CAPA, NCR, SupplierItem | Uses `orgId` — no ingestion path |
| Brain layer | BrainRule, BrainRuleVersion, LogicParam | Clean |
| App layer | AppInstance | Clean |
| ODE | Connector, ConnectorSync, OperationalRelationship, OperationalEvent | Clean |
| Normalization | EntityResolutionLog, ModelCompletenessReport, ModelFreshness | Clean |

**Note:** `DemandForecast` and `MPSEntry` are present in `schema.prisma` as v2 canonical models using `orgId`. `SalesForecast` is also present as a late-stage model using `@@map("sales_forecast")` but has **no `orgId` field** — see Sprint 2 review below for the tenant scoping gap. A prior assessment incorrectly recorded these as absent.

---

## Critical Issues

### 1. Dead Canonical Fields — Always Zero

These fields exist in the schema and Prisma client but are **never written during ingestion**. Any code reading them gets 0.

**InventoryItem:**
| Field | Status | Use instead |
|---|---|---|
| `quantity` | ✅ Populated by import | Use this |
| `reservedQty` | ✅ Populated by import | Use this |
| `qtyOnHand` | ❌ Always 0 | Deprecated |
| `qtyAllocated` | ❌ Always 0 | Deprecated |
| `qtyAvailable` | ❌ Always 0 | Deprecated |
| `qtyOnHold` | ❌ Always 0 | Deprecated |
| `qtyOnHandTotal` | ❌ Always 0 | Deprecated |
| `qtyOpenPO` | ❌ Always 0 | Deprecated |
| `qtyOnHandPlusPO` | ❌ Always 0 | Deprecated |

**WorkOrder:**
| Field | Status | Use instead |
|---|---|---|
| `plannedQty` | ✅ Populated | Use this |
| `actualQty` | ✅ Populated | Use this |
| `qtyPlanned` | ❌ Always 0 | Deprecated |
| `qtyProduced` | ❌ Always 0 | Deprecated |
| `qtyScrapped` | ❌ Always 0 | Deprecated |

**Recommendation:** Mark deprecated fields with a Prisma `@ignore` comment and a DB column comment. Do not drop yet — wait until the chat system is confirmed to not reference them.

---

### 2. Duplicate Model Systems

**BOM:**
- `BOMItem` — flat legacy model, used by import
- `BOMHeader` + `BOMLine` — canonical v3, no ingestion path; queried by `/api/apps/chat` route

**Action:** Consolidate to `BOMHeader`/`BOMLine`. Write an ingestion path for them, then deprecate `BOMItem`.

**Forecast:**
- `ForecastEntry` — live, used by dashboard
- `DemandForecast` / `SalesForecast` / `MPSEntry` — **not present in current schema.prisma** (already removed or never merged)

**Action:** No action needed for the duplicates — they are gone. The live `ForecastEntry` model still has no CSV import path; this remains a gap.

**Orders:**
- `Order` — legacy flat model (ingestion writes here; queried by `/api/apps/chat`)
- `PurchaseOrder` + `SalesOrder` — canonical v3; `tools.ts` exposes these for the Brain tool-calling system; no ingestion path yet

**Action:** Migrate ingestion to `PurchaseOrder`/`SalesOrder` fully, then drop `Order`.

---

### 3. Inconsistent Org Field Naming

- Core models: `organizationId` (correct)
- Canonical v2 models: `orgId`
- Workaround: `ENTITY_MAP` in `tools.ts` has a per-model `orgField` property

**Impact:** Every new developer must know which field name to use per model. High error surface.

**Recommendation:** Standardize to `organizationId` in a single migration. Update all queries and the entity map.

---

## Missing Indexes

These indexes would significantly improve query performance at scale:

```sql
-- High priority
CREATE INDEX "InventoryItem_organizationId_quantity_idx" ON "InventoryItem"("organizationId", quantity);
CREATE INDEX "WorkOrder_organizationId_status_idx" ON "WorkOrder"("organizationId", status);
CREATE INDEX "PurchaseOrder_orgId_status_idx" ON "PurchaseOrder"("orgId", status);
CREATE INDEX "SalesOrder_orgId_status_idx" ON "SalesOrder"("orgId", status);
CREATE INDEX "Ncr_sku_status_idx" ON "Ncr"(sku, status);

-- Medium priority
CREATE INDEX "BrainRule_organizationId_status_idx" ON "BrainRule"("organizationId", status);
CREATE INDEX "OperationalEvent_organizationId_occurredAt_idx" ON "OperationalEvent"("organizationId", "occurredAt");
```

---

## Data Quality Constraints to Add

```sql
-- Inventory quantity should never be negative
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_non_negative"
  CHECK (quantity >= 0);

-- OTP attempts bounded
ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_attempts_bounded"
  CHECK (attempts >= 0 AND attempts <= 5);

-- Org plan must be known value
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_plan_valid"
  CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));
```

---

## Prioritized Recommendations

| Priority | Action | Effort | Risk |
|---|---|---|---|
| High | Add missing indexes above | Low | None |
| High | Stop writing dead canonical qty fields | Low | Low |
| High | Add `organizationId` / `orgId` to unscoped models (see Sprint 2 below) | Medium | Medium |
| Medium | Add FK relations and indexes to `Conversation`/`ChatUsage`/`TokenUsage` | Low | None |
| Medium | Standardize `orgId` → `organizationId` | High | Medium |
| Low | Consolidate BOM systems | High | High |
| Low | Add DB CHECK constraints | Low | None |
| Low | Remove or wire up `TODO` relation stubs in late-stage models | Medium | Low |

---

## Sprint 2 Schema Review

Last updated: 2026-04-07

### New Models Needed

No new models are required for the Sprint 2 create-user flow. The existing `OrgMember` model with the `OrgRole` enum (OWNER, ADMIN, MEMBER, VIEWER) is sufficient to represent the new member. The create-user API only needs to write a `User` + `OrgMember` row, which the schema already fully supports.

### RBAC Model Assessment — OrgMember

The `OrgMember` model is adequate for the new create-user flow:

- **Roles available:** `OWNER`, `ADMIN`, `MEMBER`, `VIEWER` — covers the invite/create-member use case without schema changes.
- **Cascade rule:** `onDelete: Cascade` is defined on both the `organization` and `user` relations, so deleting an org or user automatically removes the membership row. Correct.
- **Unique constraint:** `@@unique([organizationId, userId])` prevents duplicate memberships. Correct.
- **Gap:** `OrgMember` has **no index on `organizationId`** alone. Any admin page that lists all members of an org (e.g., `SELECT * FROM OrgMember WHERE organizationId = ?`) will do a full table scan at scale. Add `@@index([organizationId])`.

### Index Recommendations for Admin/Member Queries

```prisma
// Add to OrgMember
@@index([organizationId])   // member list page — fetch all members of an org
@@index([userId])           // already present via relation, but make it explicit
```

The existing `@@unique([organizationId, userId])` will satisfy point-lookups ("is this user a member of this org?") efficiently. The missing `@@index([organizationId])` is needed for list queries.

### Data Isolation Audit — Tenant Scoping

A full sweep of every model against the `orgId` / `organizationId` requirement:

**Correctly scoped — `organizationId` (v1/v2 models):**
`Organization`, `OrgMember`, `DataSource`, `MappingTemplate`, `FlaggedColumn`, `Product`, `Supplier`, `Location`, `InventoryItem`, `Order`, `ForecastEntry`, `MpsEntry`, `WorkOrder`, `Routing`, `WorkCenter`, `BrainRule`, `AppInstance`, `Connector`, `OperationalRelationship`, `OperationalEvent`, `EntityResolutionLog`, `ModelCompletenessReport`, `ModelFreshness`, `LogicParam`

**Correctly scoped — `orgId` (v3 canonical models):**
`Customer`, `Equipment`, `BOMHeader`, `Lot`, `StockMovement`, `PurchaseOrder`, `SalesOrder`, `ProductionBatch`, `QCInspection`, `SupplierItem`, `DemandForecast`, `MPSEntry`, `Conversation`, `ChatUsage`, `TokenUsage`

**Not tenant-scoped — data isolation gap:**

| Model | Missing Field | Risk |
|---|---|---|
| `Ncr` | No `orgId` / `organizationId` | Any org's query could return another org's NCRs |
| `Capa` | No `orgId` / `organizationId` | Same as above |
| `ExchangeRate` | No org field — intentional (shared reference data) | None — rates are global |
| `PriceList` | No org field | Cross-org data leak if queried via AI tools |
| `PriceListLine` | No org field | Same |
| `CustomerPriceList` | No org field | Same |
| `ShiftCalendar` | No org field | Cross-org data leak |
| `SerialNumber` | No org field | Cross-org data leak |
| `SalesForecast` | No org field | Cross-org data leak |
| `Shipment` | No org field | Cross-org data leak |
| `ShipmentLine` | No org field | Same |
| `Invoice` | No org field | Cross-org data leak |
| `ReturnRma` | No org field | Cross-org data leak |

**Action required:** `Ncr`, `Capa`, `PriceList`, `PriceListLine`, `CustomerPriceList`, `ShiftCalendar`, `SerialNumber`, `SalesForecast`, `Shipment`, `ShipmentLine`, `Invoice`, and `ReturnRma` all lack tenant scoping. These models should be given an `orgId` field and a corresponding index before being exposed to the AI tool-calling layer or any multi-tenant API endpoint. `ExchangeRate` is an intentional shared reference table and is exempt.

**Additional gap — missing FK relations on chat/usage models:**

`Conversation`, `ChatUsage`, and `TokenUsage` use `orgId` for scoping but define no `@relation` back to `Organization`. This means Prisma will not enforce referential integrity, and the `Organization` model does not list them as reverse relations. Low urgency (these are append-only logs), but the inconsistency should be cleaned up.

### Summary

| Check | Status |
|---|---|
| New models needed for Sprint 2 | None |
| `OrgMember` RBAC sufficient for create-user flow | Yes |
| Index missing on `OrgMember.organizationId` | Add `@@index([organizationId])` |
| All v1/v2 models tenant-scoped | Yes |
| All v3 canonical models tenant-scoped | Partial — 12 models missing `orgId` |
| Chat/usage models have FK to Organization | No — `orgId` string only, no relation |
