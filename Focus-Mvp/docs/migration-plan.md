# Focus — Schema Migration Plan v2.0
## Instructions for Claude Code

---

## Step 1 — Read before touching anything

We are adding a manufacturing canonical schema to an existing Prisma project.
The project already has some models (Product, Supplier, InventoryItem, Order).

**Rules:**
- Do NOT drop or modify any existing model
- Do NOT rename any field — field names are used by the import field-mapper and must stay exact
- If a model in `schema-additions.prisma` already exists in `schema.prisma`, merge MISSING fields only
- If an enum already exists, check for missing values and add them — do not recreate it
- Run `npx prisma validate` after every migration before moving to the next
- All monetary fields use `Decimal` not `Float` — do not change this

---

## Step 2 — Check for conflicts first

Before writing any migration, run:

```bash
npx prisma validate
```

Compare existing models in `schema.prisma` against `docs/schema-additions.prisma`.
List any conflicts (same model name, differing fields) and resolve by merging — never replacing.

---

## Step 3 — Run migrations in this exact order

### Migration 1 — Enums
Add all enums that don't already exist:
`ProductType`, `MakeBuyType`, `LocationType`, `MovementType`, `POStatus`, `WOStatus`,
`OpStatus`, `SOStatus`, `QCType`, `QCStatus`, `EquipmentStatus`, `MaintenanceType`,
`SupplierItemStatus`, `ForecastType`

```bash
npx prisma migrate dev --name add_canonical_enums_v2
```

---

### Migration 2 — Foundation entities
Add or merge: `Product`, `Location`, `Supplier`, `Customer`, `Equipment`

New fields vs v1:
- Product: `makeBuy`, `safetyStockConstraint`, `moq`, `orderMultiple`
- No new models, just field additions

```bash
npx prisma migrate dev --name add_foundation_entities_v2
```

---

### Migration 3 — Inventory
Add or merge: `Lot`, `InventoryItem`, `StockMovement`

New fields in InventoryItem vs v1:
`qtyOnHold`, `qtyOnHandTotal`, `qtyOpenPO`, `qtyOnHandPlusPO`,
`demandCurrentMonth`, `demandNextMonth`, `demandMonth3`, `demandPerDay`,
`daysOfSupply`, `lastReceiptDate`, `buyRecommendation`, `recommendedQty`,
`moq`, `orderMultiple`

```bash
npx prisma migrate dev --name add_inventory_models_v2
```

---

### Migration 4 — BOM
Add or merge: `BOMHeader`, `BOMLine`

New fields vs v1:
- BOMLine: `parentComponentId`, `componentCost`

```bash
npx prisma migrate dev --name add_bom_models_v2
```

---

### Migration 5 — Supplier Item (NEW)
Add: `SupplierItem`

This is a new junction model — one component can have multiple approved suppliers,
each with their own pricing, lead time, MOQ, and status.

```bash
npx prisma migrate dev --name add_supplier_item
```

---

### Migration 6 — Orders
Add or merge: `PurchaseOrder`, `POLine`, `SalesOrder`, `SOLine`

New fields vs v1:
- PurchaseOrder: `orderDate`, `confirmedETA`
- POLine: `qtyOpen`, `confirmedETA`

```bash
npx prisma migrate dev --name add_order_models_v2
```

---

### Migration 7 — Routing (NEW)
Add: `Routing`, `RoutingOperation`

This is completely new — the bill of process model.
Defines manufacturing steps, work centers, setup/run times, and yield per operation.

```bash
npx prisma migrate dev --name add_routing_models
```

---

### Migration 8 — Production
Add or merge: `WorkOrder`, `WorkOrderOperation`, `ProductionBatch`

New fields in WorkOrderOperation vs v1:
`workCenter`, `line`, `setupMins`

```bash
npx prisma migrate dev --name add_production_models_v2
```

---

### Migration 9 — Demand Forecast (NEW)
Add: `DemandForecast`

Monthly forecast per SKU per period. Stores each forecast type
(Starting, Sales Adj, Backlog Catchup, Final) as a separate record.

```bash
npx prisma migrate dev --name add_demand_forecast
```

---

### Migration 10 — MPS (NEW)
Add: `MPSEntry`

Master Production Schedule — one row per SKU per period.
Stores all MPS fields (forecastQty, plannedBuild, inventory projections, etc.)

```bash
npx prisma migrate dev --name add_mps_entries
```

---

### Migration 11 — Quality
Add: `QCInspection`, `QCResult`

No changes vs v1.

```bash
npx prisma migrate dev --name add_quality_models_v2
```

---

### Migration 12 — Maintenance
Add: `MaintenanceLog`

No changes vs v1.

```bash
npx prisma migrate dev --name add_maintenance_models_v2
```

---

## Step 4 — Final validation

```bash
npx prisma validate
npx prisma generate
```

Both must complete without errors.

---

## Step 5 — Update field-mapper.ts

After migrations complete, update `src/lib/ingestion/field-mapper.ts`
to add the new entity types to `CANONICAL_FIELDS`:

| Entity | Required fields | Common aliases |
|---|---|---|
| Product | sku, name, type, uom | item_code, part_number, product_id, item_name, unit |
| Supplier | code, name | vendor_code, supplier_id, vendor_name, company_name |
| SupplierItem | supplierId, productId, status | supplier_name, item_code, component_sku, approved_status |
| Customer | code, name | customer_id, client_code, account_number, client_name |
| InventoryItem | sku, locationId, qtyOnHand | item_code, warehouse, qty, on_hand, stock |
| PurchaseOrder | poNumber, supplierId, status | po_number, po_num, vendor_id, supplier_code |
| POLine | purchaseOrderId, sku, qtyOrdered, unitCost | po_number, item_code, quantity, unit_cost, price |
| SalesOrder | soNumber, customerId, status | so_number, order_number, customer_code |
| WorkOrder | woNumber, sku, qtyPlanned | wo_number, work_order, item_code, planned_qty |
| BOMHeader | productId, version | item_code, sku, bom_version, revision |
| BOMLine | bomHeaderId, componentId, qty | fg_sku, component_sku, quantity, cost |
| Routing | productId, revision | fg_sku, routing_rev, revision |
| RoutingOperation | routingId, sequence, name | op_num, operation_name, work_center |
| DemandForecast | productId, periodYear, periodMonth, type, qty | sku, fg, month, forecast_qty |
| MPSEntry | productId, periodYear, periodMonth, plannedBuild | sku, fg, month, planned_build, mps |
| Equipment | code, name, status | asset_tag, machine_id, equipment_name |

---

## Important notes

- `StockMovement` is append-only — never add update or delete routes for it
- `deletedAt DateTime?` is soft-delete — always filter `WHERE deletedAt IS NULL` in default queries
- `attributes Json?` on every entity absorbs unmapped upload columns — never remove it
- `MPSEntry.isLocked` — locked periods must not be overwritten by re-imports or replanning runs
- `SupplierItem` is the preferred place to store supplier-specific pricing and lead times — not on Supplier directly
- `DemandForecast` and `MPSEntry` use `periodYear + periodMonth` integers not DateTime — simpler for planning queries
