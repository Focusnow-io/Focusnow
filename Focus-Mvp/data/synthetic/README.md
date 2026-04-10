# Synthetic Data — Meridian Industrial Components

## Company Profile

**Meridian Industrial Components** is a fictional mid-size manufacturer of hydraulic systems and components headquartered in Pittsburgh, PA. The company has approximately 500 employees and produces:

- Hydraulic cylinders (HV series — 2000, 3500, 5000 PSI ratings)
- Vane and gear pumps (VP and GP series)
- Directional control, pressure relief, and flow control valves
- Complete hydraulic power packs (MTPM series)
- Spare parts, hoses, fittings, and instrumentation

The company sells to construction, mining, agricultural, marine, and industrial customers across North America.

---

## Dataset Files

| File | Rows | Description |
|---|---|---|
| `products.csv` | 51 | Full product catalog — raw materials, WIP, and finished goods |
| `suppliers.csv` | 15 | Supplier master with ratings, lead times, and annual spend |
| `inventory.csv` | 66 | Inventory records across 6 warehouse locations |
| `orders.csv` | 85 | 30 purchase orders + 55 sales orders (Jan–Apr 2026) |
| `work_orders.csv` | 60 | Work orders — completed, in progress, open, and overdue |

---

## Warehouse Locations

| Code | Name | Purpose |
|---|---|---|
| WH-A | Main Warehouse A | Raw material overflow + finished goods buffer |
| WH-B | Raw Material Store B | Primary raw material storage (steel, aluminum, rubber) |
| WH-C | WIP Floor Storage | Work-in-process components adjacent to shop floor |
| WH-D | Finished Goods Store | Primary FG warehouse — ships to customers |
| WH-E | Spare Parts Warehouse | Aftermarket and spare parts inventory |
| WH-F | Heavy Equipment Bay | Large cylinders, motors, and heavy components |

---

## SKU Naming Convention

| Prefix | Category | Example |
|---|---|---|
| `RM-` | Raw Material | `RM-STEEL-4140` |
| `WIP-` | Work In Process | `WIP-PISTON-01` |
| `FG-` | Finished Good | `FG-HV-2000` |

---

## Designed Test Scenarios

The data is structured to expose specific AI query capabilities:

1. **Below reorder point**: Several FG SKUs in WH-D have `quantity` close to or at `reorderPoint` — the AI should surface these when asked "what items are below reorder point?"

2. **Overdue work orders**: 15 work orders (`WO-2026-0046` through `WO-2026-0060`) are in `overdue` status with detailed notes explaining root causes.

3. **Open purchase orders**: 12 POs (`PO-2026-0019` through `PO-2026-0030`) are open with expected delivery dates in April 2026.

4. **Top supplier by spend**: `SUP-001` (Meridian Steel Co.) is the highest annual spend supplier at $285,000. The AI should identify this correctly.

5. **Cross-location inventory**: Several SKUs appear in multiple warehouses — the AI should aggregate or specify location correctly.

6. **Production chain dependency**: `WO-2026-0057` is blocked waiting for chrome rods from `WO-2026-0035`, which in turn is delayed by `SUP-006` chemistry.

---

## Import Instructions

### Using the Focus Platform CSV Importer

1. Go to **Data Sources** in the dashboard
2. Click **+ New Data Source**
3. Upload each CSV file in this order:
   - `suppliers.csv` first (referenced by products and orders)
   - `products.csv`
   - `inventory.csv`
   - `orders.csv`
   - `work_orders.csv`
4. Use the column mapping interface to map CSV headers to schema fields
5. After import, go to **Brain → Chat** and test with the scenarios above

### Field Mapping Reference

**products.csv → Product model**
- `sku` → `sku`
- `name` → `name`
- `unitCost` → `unitCost`
- `reorderPoint` → `reorderPoint`
- `supplierId` → (link to Supplier)

**inventory.csv → InventoryItem model**
- `sku` → `sku` (links to Product)
- `quantity` → `quantity` ✅ (use this, NOT qtyOnHand)
- `reservedQty` → `reservedQty` ✅ (use this)
- `locationCode` → `locationCode`

**work_orders.csv → WorkOrder model**
- `plannedQty` → `plannedQty` ✅ (use this, NOT qtyPlanned)
- `actualQty` → `actualQty` ✅ (use this, NOT qtyProduced)
- `status` → `status` (`open`, `in_progress`, `completed`, `overdue`)

---

## Notes

- All dates are ISO 8601 (YYYY-MM-DD)
- Currency is USD throughout
- Supplier IDs (`SUP-001` etc.) in `products.csv` reference the `supplierId` column in `suppliers.csv`
- Empty fields in `orders.csv` (e.g., `deliveryDate` for open POs) are intentional — leave as null on import
