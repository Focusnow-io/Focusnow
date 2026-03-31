# Pre-Built Apps Expert Redesign

## Goal
Redesign all 4 pre-built apps + dashboard homepage to reflect what a world-class supply chain operator would build and expect. Leverage existing schema fields that are currently unused.

---

## Phase 1: Dashboard Homepage — From Onboarding to Operations Center
- [ ] Enable Zone C (Attention Items) — already built but never rendered
- [ ] Add Operational KPI strip for ACTIVE state showing real metrics

## Phase 2: Inventory Command Center — Expert-Grade
- [ ] Add Inventory Turns KPI (outflow30d × 12 / totalValue)
- [ ] Add ABC Classification chart (product.abcClass)
- [ ] Add Velocity Analysis using outflow7d/30d/60d/92d
- [ ] Add Buy Recommendations KPI + Safety Stock Coverage
- [ ] Show demand trend per item in table

## Phase 3: Procurement Hub — Supplier Intelligence
- [ ] Add Supplier Risk Score (composite: quality + on-time + lead time)
- [ ] Add Spend Concentration chart (Pareto)
- [ ] Add Single-Source Risk detection (via SupplierItem)
- [ ] Add Quality Rating + actual onTimePct to scorecard

## Phase 4: Demand & Fulfillment — Service Level Intelligence
- [ ] Add Fill Rate KPI
- [ ] Add Demand Coverage Horizon chart
- [ ] Add Safety Stock gap + Buy Signal to at-risk table

## Phase 5: Verification
- [ ] Build passes (npm run build)
- [ ] Commit and push
