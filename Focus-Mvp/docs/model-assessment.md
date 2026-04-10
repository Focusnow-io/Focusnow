# Model Accuracy Assessment — Focus Platform

Last updated: 2026-04-07

---

## System Architecture

The platform has **two distinct AI interfaces**:

| Interface | Route | Method | Notes |
|---|---|---|---|
| App Chat | `/api/apps/chat` | Pre-fetched context in system prompt | Simpler; fetches data at request time and injects it as a system prompt |
| Brain / Vibe (tool-calling) | `/api/chat/conversations/[id]/messages` | Tool-calling via `src/lib/chat/tools.ts` + `src/lib/chat/build-context.ts` | More capable, used for operational Q&A |

**Note:** `/api/apps/vibe/route.ts` is **not** the operational Q&A system. It is a separate endpoint used exclusively for AI-assisted dashboard customization (config patches). The tool-calling operational system lives under `/api/chat/conversations/`.

This assessment focuses on the Brain/Vibe tool-calling interface as it is the more complex and capable system.

---

## What "Accuracy" Means Here

This is a **RAG + tool-calling** system, not a classifier. Accuracy is defined across 4 dimensions:

| Metric | Definition | Target |
|---|---|---|
| **Query coverage** | % of valid operational questions the system can answer with data | ≥ 0.95 |
| **Response relevance** | % of responses that correctly address the user's question | ≥ 0.95 |
| **Hallucination rate** | % of responses containing fabricated facts not in the data | ≤ 0.02 |
| **Data freshness** | % of responses based on data imported within the last 24h | ≥ 0.90 |

**Overall target: 0.95** = query coverage × relevance, with hallucination < 2%.

---

## Current Capabilities

### Can answer well ✅
- "What is the current stock level for SKU X?"
- "Which items are below reorder point?"
- "What are my open purchase orders?"
- "Show me overdue work orders"
- "What is my top supplier by order value?"
- "Which products have the most NCRs?"

### Cannot answer (data missing) ❌
- Demand forecasting questions (no ingested forecast data)
- Lead time vs. actual delivery comparison (no delivery date tracking)
- Cost variance analysis (no standard cost vs. actual cost)
- Customer segmentation (no customer dimension table)
- Real-time inventory (data is only as fresh as last import)

### Partially answered ⚠️
- BOM explosion (uses flat `BOMItem`, not multi-level `BOMHeader`/`BOMLine`)
- Quality trend analysis (NCR model exists but no time-series aggregation tool)
- Capacity planning (WorkCenter exists but no capacity field)

---

## Accuracy Gap Analysis

### Gap 1: Dead fields — partially fixed, residual bugs remain

`build-context.ts` correctly instructs Claude to use `quantity`, `plannedQty`, and `actualQty` and to avoid the dead fields. The `/api/apps/chat` route queries only the correct fields. However two residual issues exist in `src/lib/chat/tools.ts`:

1. **Work order output shape (line 459–460):** The `lookup_entity` tool returns work order quantities under the keys `qtyPlanned` and `qtyProduced`, even though it reads from `wo.plannedQty` and `wo.actualQty`. The model receives correctly-valued data under misleading key names. If the model ever attempts a follow-up filter using those key names, the filter will silently match the dead zero-valued DB columns instead.

2. **Filter example in tool description (line 57):** The `query_records` tool description includes `{ qtyOnHand: { gt: 0 } }` as an illustrative example filter. A model that follows this example literally will filter on the always-zero `qtyOnHand` column and return an empty result set for any inventory query intended to find items with stock.

- **Impact:** Stock-out and production queries may return incorrect or empty data in edge cases.
- **Fix:** Rename the output keys at lines 459–460 to `plannedQty`/`actualQty`. Replace the `qtyOnHand` example in the filter description with `{ quantity: { gt: 0 } }`.

### Gap 2: No forecast data ingestion
`DemandForecast` (orgId-scoped, v2 canonical) and `SalesForecast` (late-stage, no orgId yet) exist in the schema but have no CSV import path. No `forecast_entries.csv` is included in the synthetic dataset.
- **Impact:** System cannot answer "what is the demand forecast for Q3?" Forecast-based evaluation metrics (MAE, MAPE) cannot be measured.
- **Fix:** (1) Add `orgId` to `SalesForecast`. (2) Build CSV import for `DemandForecast`. (3) Add a `forecast_entries.csv` to the synthetic dataset.

### Gap 3: Tool result size cap
`TOOL_RESULT_CHAR_LIMIT` (40,000 chars) could still truncate large result sets.
- **Impact:** For orgs with 500+ products, the model sees partial data
- **Fix:** Add pagination support to tools

### Gap 4: No temporal reasoning
The system has no "compare this month vs last month" capability. All tools return current snapshot only.
- **Impact:** Trend questions fail
- **Fix:** Add date-range filters to inventory and order tools

---

## Test Scenarios That Expose Weaknesses

1. Ask about inventory for a product with no import → model should say "no data" not hallucinate a number
2. Ask "how many units did we produce last week?" → will fail (no time-range on WO tool)
3. Ask "what is the reorder point for SKU X?" → depends on whether that field was imported
4. Ask a question with 300+ matching rows → verify truncation doesn't cause partial answers
5. Ask in a non-English language → system prompt is English-only

---

## Recommendations to Reach 0.95 Accuracy

1. **Fix dead field output keys** in `tools.ts` lines 459–460 — rename `qtyPlanned`/`qtyProduced` output keys to `plannedQty`/`actualQty`
2. **Fix misleading filter example** in `tools.ts` line 57 — replace `qtyOnHand` with `quantity`
3. **Add a data-freshness check** — warn the model when the last import is > 24h old
4. **Add date-range parameters** to inventory and work-order tools
5. **Build forecast import** — unlocks a whole category of questions
6. **Add a "no data" fallback** — when tool returns empty array, model should say "no records found" not make up data

---

## Evaluation Methodology v2

### Why Accuracy Alone Is Insufficient for Supply Chain AI

Reporting a single "accuracy" number for supply chain anomaly detection is misleading for two structural reasons:

**Class imbalance.** In any real inventory dataset, the vast majority of records are healthy. Anomalies (stockouts, overdue work orders, quality failures) are rare. A naive model that always predicts "normal" can achieve 95%+ accuracy while missing every anomaly. The 0.95 accuracy target stated in this document is only valid if the class distribution is reasonably balanced (roughly 50/50). On imbalanced data, F1 score is the correct headline metric.

**Cost asymmetry.** Not all errors are equal in supply chain:
- **False negative (FN)** = system says "healthy" but an anomaly exists → stockout, production stoppage, missed delivery. High cost.
- **False positive (FP)** = system raises an alert that turns out to be a false alarm → unnecessary reorder or investigation. Low cost.

The model should therefore be tuned to maximise Recall (catch every real anomaly) even at the cost of some Precision (accepting a few false alarms). The target thresholds below reflect this asymmetry.

---

### Required Metrics by AI Capability

| Capability | Primary Metrics | Notes |
|---|---|---|
| **Anomaly detection** (stockout risk, overdue WOs, QC failures) | Precision, Recall, F1, confusion matrix | Do NOT use accuracy on imbalanced data |
| **Demand forecasting** | MAE, RMSE, MAPE | Accuracy is meaningless for regression; MAPE is most interpretable for business users |
| **Order/risk classification** (e.g., at-risk PO, late delivery risk) | Precision@k, Recall@k, AUC-ROC | AUC-ROC is threshold-independent; use for ranking, not hard cutoffs |

---

### Confusion Matrix Template — Inventory Anomaly Detection

|  | Predicted Normal | Predicted Anomaly |
|---|---|---|
| **Actual Normal** | TN (correct — no alert) | FP (false alarm — unnecessary reorder) |
| **Actual Anomaly** | FN (**stockout risk — critical miss**) | TP (correct alert — action taken) |

The FN cell (bottom-left) represents the highest-cost error in supply chain operations. Model tuning should prioritise minimising FN even if FP increases.

---

### Target Thresholds

| Metric | Target | Rationale |
|---|---|---|
| **Recall** | >= 0.95 | Critical: missing a real anomaly causes stockouts or production stoppages |
| **Precision** | >= 0.90 | Low false alarms to avoid alert fatigue; some tolerance acceptable given cost asymmetry |
| **F1** | >= 0.92 | Harmonic mean; primary headline metric on imbalanced data |
| **Accuracy** | Use only if class distribution is balanced (within ~10% of 50/50) | Otherwise F1 is the correct headline metric |
| **MAE / MAPE** | Defined per product family once forecast data is ingested | No target set until Gap 2 (forecast ingestion) is resolved |
| **AUC-ROC** | >= 0.90 | For order risk classification once classification labels are available |

---

### Synthetic Data Test Scenarios for Evaluation

The `data/synthetic/` dataset (Meridian Industrial Components, 277 rows) provides the following evaluable anomaly signals:

**Anomaly detection — ground truth labels available:**

| Scenario | Records | Ground Truth Label | Evaluation Action |
|---|---|---|---|
| Overdue work orders | WO-2026-0046 through WO-2026-0060 (15 records) | Anomaly = `status: overdue` | System must flag all 15. Missing any = FN. |
| Low stock items | FG SKUs in WH-D with `quantity` <= `reorderPoint` | Anomaly = quantity at or below reorder threshold | System must surface these when asked; count against Recall |
| Open POs past expected date | PO-2026-0019 through PO-2026-0030 with April 2026 expected dates and `deliveryDate: null` | Anomaly = open PO with no delivery confirmation past expected date | Relevant once date-range tool (Gap 4) is implemented |
| Chrome rod supply blockage | WO-2026-0057 (blocked by WO-2026-0035, which depends on SUP-006) | Anomaly = multi-hop production chain at risk | Tests multi-step reasoning, not single-record lookup |

**Gaps in the synthetic dataset (not evaluable with current data):**

- **Demand forecasting metrics (MAE/MAPE):** No `forecast_entries.csv` is included. Gap 2 (forecast ingestion) must be resolved before these metrics can be measured.
- **Temporal trend anomalies:** All records use late March/early April 2026 dates. "Compare this month vs last month" anomaly patterns cannot be tested.
- **Large-dataset truncation:** 66 inventory rows, 51 products — cannot stress-test the 100-row tool cap or 40,000-char result limit.
- **Classification AUC-ROC:** No binary order-risk labels exist in the synthetic data. AUC-ROC cannot be computed without labelled training/test examples.

---

## Synthetic Data Coverage

The `data/synthetic/` directory contains 277 rows of realistic test data for a fictional manufacturer (Meridian Industrial Components). All five CSV files use the correct canonical field names (`quantity`, `reservedQty`, `plannedQty`, `actualQty`) and explicitly avoid the dead deprecated fields. The data is internally consistent: supplier IDs cross-reference between `suppliers.csv` and `products.csv`/`orders.csv`, SKUs cross-reference between `products.csv` and `inventory.csv`/`work_orders.csv`.

### Test scenarios enabled

| Scenario | Data present | Accuracy gap addressed |
|---|---|---|
| Items below reorder point | Several FG SKUs in WH-D have `quantity` at or near `reorderPoint`; cross-location items (same SKU in WH-A and WH-D) test aggregation vs. per-location answers | Gap 1 (quantity field), test scenario 1 |
| Overdue work orders | 15 work orders (WO-2026-0046 through WO-2026-0060) in `overdue` status with root-cause notes | Gap 1 (plannedQty/actualQty fields), test scenario 2 |
| Open purchase orders | 12 POs (PO-2026-0019 through PO-2026-0030) in `open` status with April 2026 expected dates and null delivery dates | Tests null handling in order queries |
| Top supplier by spend | SUP-001 (Meridian Steel Co.) is highest annual spend ($285,000) with multiple received POs; verifiable by summing order values or reading the `annualSpend` attribute | Test scenario 4 |
| Cross-location inventory | 9 SKUs appear in more than one warehouse (e.g., RM-STEEL-4140 in WH-A and WH-F, FG-HV-2000 in WH-D and WH-F) | Test scenario 5 — exposes whether the model aggregates or lists correctly |
| Production chain dependency | WO-2026-0057 (`status: overdue`, notes reference chrome rod shortage) and WO-2026-0035 (chrome plating delayed by SUP-006) | Test scenario 6 — multi-hop reasoning |

### Gaps the synthetic data does not address

- **Forecast data**: No `forecast_entries.csv` is included. The "cannot answer demand forecast questions" gap (Gap 2) remains untestable with this dataset.
- **Temporal trend queries**: All inventory rows use dates in late March/early April 2026. There is no historical time-series data to test "compare this month vs last month" scenarios (Gap 4).
- **Large result truncation**: The dataset is small (66 inventory rows, 51 products). The 100-row tool cap and 40,000-char result limit cannot be stress-tested with this data (Gap 3).
- **Non-English language**: Not covered by this dataset.
- **Customer dimension**: No `customers.csv` is included. The `Customer` model and `SalesOrder`/`SOLine` canonical tables cannot be populated from this dataset.
