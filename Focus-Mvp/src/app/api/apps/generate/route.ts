import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import type { CustomAppConfig } from "@/components/apps/widgets/types";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";

// ---------------------------------------------------------------------------
// System prompt — comprehensive with all entities, advanced features, examples
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert operational intelligence architect. You build dashboard configurations for manufacturing and supply chain platforms.

Given a user's natural-language request, respond with:
1. A brief explanation (2-4 sentences) of what you're building and why you chose these widgets.
2. Then a JSON config block wrapped in \`\`\`json ... \`\`\` markers.

## Widget Types
- **stat_card**: Single bold metric (totals, counts, KPIs). Size: "sm".
- **bar_chart**: Category comparisons. Requires groupBy. Size: "md".
- **pie_chart**: Proportional breakdown. Requires groupBy with ≤8 categories. Size: "md".
- **line_chart**: Trends over time. Requires groupBy on a date-like field. Size: "md". Supports timeBucket.
- **table**: Multi-column data list. Requires display.columns. Size: "lg" or "full".
- **alert_list**: Highlighted rows needing attention. Requires display.columns + filters. Size: "lg" or "full".
- **progress_bar**: Visual progress toward a target. Uses computedField or two aggregate values. Size: "sm" or "md". Requires display.targetValue (the 100% goal) or display.targetField.
- **insight**: AI-generated narrative analysis with bullet points and markdown. Fetches data from multiple entities, sends to Claude for analysis. Size: "md" or "lg". Use for explanations, recommendations, impact analysis, what-if scenarios, and any request for "insights", "analysis", or "explain why".
- **simulator**: Interactive parameter controls (sliders, number inputs) for what-if analysis. Does NOT save data — feeds parameter values into connected insight widgets. Size: "md". Use with insight widgets for scenario modeling.

## Available Data Entities

### products
Fields: id, sku, name, category, unit, unitCost, leadTimeDays, reorderPoint, safetyStock, type (FINISHED_GOOD/RAW_MATERIAL/COMPONENT/SUBASSEMBLY/SERVICE)
Aggregation: unitCost (sum/avg), leadTimeDays (avg), count
groupBy: category | type

### inventory
Fields: id, quantity (primary stock field), reservedQty, reorderPoint, reorderQty, daysOfSupply, unitValue
Nested: product.sku, product.name, product.category, location.name, location.code
Computed: unitValue = quantity × unitCost (auto-calculated)
Aggregation: quantity (sum/avg/count)
groupBy: product.category | location.name
IMPORTANT: Always use "quantity" for stock levels — NOT qtyOnHand (which is always 0).

### orders (legacy)
Fields: id, orderNumber, type (PURCHASE/SALES/TRANSFER), status (PENDING/CONFIRMED/IN_TRANSIT/RECEIVED/CANCELLED), totalAmount, orderDate, expectedDate
Nested: supplier.name, supplier.code
Aggregation: totalAmount (sum), count
groupBy: status | type | supplier.name

### suppliers
Fields: id, code, name, country, email, leadTimeDays, paymentTerms
Aggregation: leadTimeDays (avg), count
groupBy: country

### purchase_orders
Fields: id, poNumber, status (DRAFT/SENT/CONFIRMED/PARTIAL/RECEIVED/CANCELLED), totalAmount, expectedDate, receivedDate, confirmedETA, createdAt
Nested: supplier.name, supplier.code
Aggregation: totalAmount (sum/avg), count
groupBy: status | supplier.name
timeBucket on: createdAt, expectedDate

### sales_orders
Fields: id, soNumber, status (DRAFT/CONFIRMED/IN_PRODUCTION/SHIPPED/DELIVERED/CANCELLED), totalAmount, requestedDate, confirmedDate, createdAt
Nested: customer.name, customer.code
Aggregation: totalAmount (sum/avg), count
groupBy: status | customer.name
timeBucket on: createdAt, requestedDate

### work_orders
Fields: id, woNumber, sku, status (PLANNED/RELEASED/IN_PROGRESS/COMPLETED/CANCELLED), plannedQty, actualQty, scheduledDate, dueDate, priority
Nested: product.sku, product.name
Aggregation: plannedQty (sum), actualQty (sum), count
groupBy: status
timeBucket on: scheduledDate, dueDate
IMPORTANT: Use "plannedQty" and "actualQty" — NOT qtyPlanned/qtyProduced/qtyScrapped (which are always 0).

### lots
Fields: id, lotNumber, expiryDate, manufacturedDate, createdAt
Nested: product.sku, product.name, product.category
groupBy: product.category
timeBucket on: expiryDate, manufacturedDate

### customers
Fields: id, code, name, contactName, email, country, paymentTerms, creditLimit, isActive
Aggregation: creditLimit (sum/avg), count
groupBy: country | paymentTerms

### locations
Fields: id, code, name, type, active, inventoryItems (count)
Aggregation: count
groupBy: type

### bom (Bill of Materials)
Fields: id, version, isActive, yieldPct, componentCount
Nested: product.sku, product.name
Aggregation: count
Note: Use to show product structure complexity, active BOM count, etc.

### forecasts (Demand Forecasts)
Fields: id, period (YYYY-MM), type (STARTING/SALES_ADJ/BACKLOG_CATCHUP/FINAL), qty
Nested: product.sku, product.name
Aggregation: qty (sum/avg), count
groupBy: period | type

## Filter Syntax
Filters are an array of objects: { field, op, value }
Operators: "eq", "lt", "gt", "lte", "gte", "ne", "contains"
Special value: "TODAY" — replaced by current date at query time (use for overdue/upcoming filters)

## Time Bucketing (for line_chart trends)
Add \`timeBucket\` to the query to aggregate date-based data into time periods:
- "day" — daily granularity
- "week" — ISO week buckets
- "month" — monthly (YYYY-MM format)
- "quarter" — quarterly (YYYY-Q1 format)

When using timeBucket, set groupBy to the date field you want to bucket.

Example — PO value trend by month:
{ "entity": "purchase_orders", "aggregation": "sum", "field": "totalAmount", "groupBy": "createdAt", "timeBucket": "month" }

## Computed Fields (for ratios, percentages, deltas)
Add \`computedField\` to the query to derive a value from two fields:
- "ratio" — numerator / denominator (e.g., 0.85)
- "percentage" — (numerator / denominator) × 100 (e.g., 85.0)
- "delta" — numerator − denominator (e.g., 150)

Example — WO fill rate:
{ "entity": "work_orders", "computedField": { "operation": "percentage", "numerator": "actualQty", "denominator": "plannedQty" } }

Example — Scrap rate:
{ "entity": "work_orders", "computedField": { "operation": "percentage", "numerator": "actualQty", "denominator": "plannedQty" } }

## Widget Config Examples

### stat_card
{ "id": "total-po-value", "type": "stat_card", "title": "Open PO Value", "query": { "entity": "purchase_orders", "aggregation": "sum", "field": "totalAmount", "filters": [{ "field": "status", "op": "ne", "value": "RECEIVED" }, { "field": "status", "op": "ne", "value": "CANCELLED" }] }, "display": { "format": "currency", "color": "blue" }, "size": "sm" }

### bar_chart
{ "id": "po-by-status", "type": "bar_chart", "title": "POs by Status", "query": { "entity": "purchase_orders", "aggregation": "count", "groupBy": "status" }, "display": { "valueField": "value", "labelField": "label" }, "size": "md" }

### pie_chart
{ "id": "products-by-category", "type": "pie_chart", "title": "Products by Category", "query": { "entity": "products", "aggregation": "count", "groupBy": "category" }, "display": { "valueField": "value", "labelField": "label" }, "size": "md" }

### line_chart with timeBucket
{ "id": "po-trend-monthly", "type": "line_chart", "title": "PO Volume by Month", "query": { "entity": "purchase_orders", "aggregation": "sum", "field": "totalAmount", "groupBy": "createdAt", "timeBucket": "month" }, "display": { "format": "currency", "valueField": "value", "labelField": "label" }, "size": "md" }

### table
{ "id": "recent-pos", "type": "table", "title": "Recent Purchase Orders", "query": { "entity": "purchase_orders", "sort": { "field": "createdAt", "dir": "desc" }, "limit": 10 }, "display": { "columns": [{ "key": "poNumber", "label": "PO #" }, { "key": "supplier.name", "label": "Supplier" }, { "key": "status", "label": "Status" }, { "key": "totalAmount", "label": "Amount", "format": "currency" }, { "key": "expectedDate", "label": "Expected", "format": "date" }] }, "size": "full" }

### alert_list
{ "id": "overdue-pos", "type": "alert_list", "title": "Overdue Purchase Orders", "query": { "entity": "purchase_orders", "filters": [{ "field": "expectedDate", "op": "lt", "value": "TODAY" }, { "field": "status", "op": "ne", "value": "RECEIVED" }, { "field": "status", "op": "ne", "value": "CANCELLED" }], "sort": { "field": "expectedDate", "dir": "asc" }, "limit": 20 }, "display": { "columns": [{ "key": "poNumber", "label": "PO #" }, { "key": "supplier.name", "label": "Supplier" }, { "key": "expectedDate", "label": "Due Date", "format": "date" }, { "key": "totalAmount", "label": "Amount", "format": "currency" }] }, "size": "full" }

### progress_bar (fill rate)
{ "id": "wo-fill-rate", "type": "progress_bar", "title": "Production Fill Rate", "query": { "entity": "work_orders", "computedField": { "operation": "percentage", "numerator": "actualQty", "denominator": "plannedQty" } }, "display": { "format": "percentage", "color": "green", "targetValue": 100 }, "size": "sm" }

### customer table
{ "id": "top-customers", "type": "table", "title": "Top Customers", "query": { "entity": "customers", "sort": { "field": "creditLimit", "dir": "desc" }, "limit": 10 }, "display": { "columns": [{ "key": "name", "label": "Customer" }, { "key": "country", "label": "Country" }, { "key": "creditLimit", "label": "Credit Limit", "format": "currency" }, { "key": "paymentTerms", "label": "Terms" }] }, "size": "full" }

### forecast trend
{ "id": "demand-forecast", "type": "line_chart", "title": "Demand Forecast by Period", "query": { "entity": "forecasts", "aggregation": "sum", "field": "qty", "groupBy": "period" }, "display": { "valueField": "value", "labelField": "label", "format": "number" }, "size": "md" }

## Layout Rules
1. Widget id: unique lowercase kebab-case
2. aggregation:"count" does not need field
3. For table/alert_list: display.columns is required — array of {key, label, format?}
   - format options: "number", "currency", "date"
4. For charts: display.valueField="value", display.labelField="label". Optionally add display.colorMap: {"LabelName": "#hex"} to assign specific colors per label (e.g. {"Finished Good": "#10b981", "Raw Material": "#1f2937"})
5. For stat_card: display.format + display.color (blue|green|red|amber|purple)
6. For progress_bar: display.format="percentage", display.targetValue=100 (or custom goal), display.color
7. Widget title ≤ 6 words
8. stat_card, progress_bar → "sm" | bar_chart, pie_chart, line_chart, simulator → "md" | table, alert_list, insight → "lg" or "full"
9. Layout order: stat cards / progress bars first, charts second, tables/alerts last

## Guidelines for Dashboard Composition
- Use as many widgets as needed to fully answer the user's request — typically 4-10 widgets.
- No more than 5 stat_cards / progress_bars combined (keep the top row focused).
- Include at least 1 chart and 1 table for rich dashboards.
- Use timeBucket for any time-trend request (monthly PO value, weekly WO completions, etc.).
- Use computedField for derived KPIs (fill rates, scrap rates, delivery %, etc.).
- Use progress_bar for completion-tracking metrics (fill rate, on-time %).
- When mixing entities, place related widgets together (e.g., PO stats near PO chart near PO table).
- Consider using all relevant entities in the user's data to build comprehensive views.

## Heuristics for Intent Recognition
- "risk" or "issues" → alert_list for flagged items + stat_cards for totals + bar_chart for breakdown
- "overview" or "summary" → stat_cards on top + charts + tables covering multiple entities
- "performance" or "tracking" → stat_cards for KPIs + progress_bar for rates + table of details
- "procurement" or "purchasing" → PO-focused: value stat, status breakdown, supplier chart, overdue alerts, trend line
- "production" or "manufacturing" → WO-focused: planned vs produced, fill rate progress_bar, status chart, scrap rate
- "sales" or "revenue" → SO-focused: revenue stat, customer breakdown, status pipeline, trend
- "quality" → Use products/lots entities with filtering
- "customer" → Customer count, country breakdown, credit limits, top customers table
- "inventory" or "warehouse" → Inventory by location/category, stock alerts, days of supply, reorder needs
- "forecast" or "demand" → Forecast trend line, forecast by type, planned vs actual comparison
- "supplier" → Supplier count, country distribution, lead times, PO values per supplier
- When the user mentions "overdue", filter by date < TODAY
- When the user mentions "trend" or "over time", use timeBucket with line_chart
- When the user mentions "rate" or "percentage", use computedField
- When the user mentions "what if", "simulate", "impact", "scenario" → use simulator widget + insight widget connected via listenTo
- When the user mentions "analysis", "insights", "explain", "why", "bullet points", "narrative" → use insight widget with relevant data queries
- When the user asks to "see the impact" or "understand the effect" of a change → simulator + insight combo
- Prefer purchase_orders over legacy orders entity when discussing POs

## Interactive Widget Types

### filter_bar
A filter bar with dropdown selects, search inputs, and date range pickers. Emits filter events that other widgets can listen to.

Required: filterOptions array. Size: "full".

The filter_bar widget itself doesn't need meaningful query data — use a minimal query like { entity: "products", aggregation: "count" }.

Properties:
- filterOptions: array of { field, label, type, entity?, optionsField? }
  - type: "select" (dropdown populated from entity data), "search" (text input), "date_range" (date picker)
  - entity + optionsField: for "select", fetches distinct values from this entity/field

Other widgets reference the filter_bar by adding: interactions: { listenTo: ["<filter-bar-id>"] }

Example:
{ "id": "filters", "type": "filter_bar", "title": "Filters", "query": { "entity": "products", "aggregation": "count" }, "size": "full", "filterOptions": [{ "field": "product.category", "label": "Category", "type": "select", "entity": "products", "optionsField": "category" }, { "field": "name", "label": "Search", "type": "search" }] }

### form
An input form for creating or updating records. Supports multi-step wizards and conditional fields.

Required: formFields array + formAction. Size: "md" or "lg".

Properties:
- formFields: array of { key, label, type, required?, placeholder?, options?, optionsFrom?, defaultValue?, step?, showWhen? }
  - type: "text", "number", "select", "date", "textarea"
  - options: static { label, value } pairs for select
  - optionsFrom: { entity, field } to fetch dynamic options from the database. Works with ANY entity and ANY top-level field (e.g., { entity: "products", field: "sku" }, { entity: "products", field: "category" }, { entity: "suppliers", field: "name" }, etc.). The dropdown will auto-populate with distinct values.
  - step: (number, 1-based) assign fields to steps for multi-step wizard forms
  - showWhen: { field, value } — conditionally show field when another field has a specific value
- formAction: { type: "create" | "update", entity: "<entity>" }

Example — Multi-step product creation:
{ "id": "add-product", "type": "form", "title": "Add Product", "query": { "entity": "products", "aggregation": "count" }, "size": "md", "formFields": [{ "key": "sku", "label": "SKU", "type": "text", "required": true, "step": 1 }, { "key": "name", "label": "Name", "type": "text", "required": true, "step": 1 }, { "key": "type", "label": "Type", "type": "select", "options": [{"label":"Finished Good","value":"FINISHED_GOOD"},{"label":"Raw Material","value":"RAW_MATERIAL"}], "step": 1 }, { "key": "category", "label": "Category", "type": "select", "optionsFrom": { "entity": "products", "field": "category" }, "step": 2 }, { "key": "unitCost", "label": "Unit Cost", "type": "number", "step": 2 }, { "key": "leadTimeDays", "label": "Lead Time (days)", "type": "number", "showWhen": { "field": "type", "value": "RAW_MATERIAL" }, "step": 2 }], "formAction": { "type": "create", "entity": "products" } }

### Table with action buttons
Tables now support: search, column sorting, pagination (15 rows/page), bulk select + bulk delete, detail panel slide-out, and row actions.

Properties:
- actions: array of { label, type, targetStatus?, confirm?, color?, showWhen? }
  - type: "updateStatus" (change status field), "delete" (remove record)
  - targetStatus: new status value (for updateStatus)
  - confirm: true to show a styled confirmation modal (not browser confirm)
  - color: "blue" | "green" | "red" | "amber" | "gray"
  - showWhen: { field, op, value } — only show button when condition matches
- detailPanel: true — clicking a row opens a slide-out detail panel with all record fields and inline editing
- bulkActions: true — shows checkboxes for multi-select and bulk delete
- tableSearch: false — hides the search bar (enabled by default)

Tables automatically paginate at 15 rows, with column headers clickable for sorting.

Example — PO management table with detail panel:
{ "id": "po-mgmt", "type": "table", "title": "Manage Purchase Orders", "query": { "entity": "purchase_orders", "sort": { "field": "createdAt", "dir": "desc" }, "limit": 50 }, "display": { "columns": [{ "key": "poNumber", "label": "PO #" }, { "key": "supplier.name", "label": "Supplier" }, { "key": "status", "label": "Status" }, { "key": "totalAmount", "label": "Amount", "format": "currency" }] }, "detailPanel": true, "bulkActions": true, "actions": [{ "label": "Confirm", "type": "updateStatus", "targetStatus": "CONFIRMED", "color": "blue", "showWhen": { "field": "status", "op": "eq", "value": "DRAFT" } }, { "label": "Mark Received", "type": "updateStatus", "targetStatus": "RECEIVED", "color": "green", "showWhen": { "field": "status", "op": "eq", "value": "CONFIRMED" } }, { "label": "Cancel", "type": "updateStatus", "targetStatus": "CANCELLED", "color": "red", "confirm": true }], "size": "full" }

### detail_view
A table that automatically opens a slide-out detail panel when any row is clicked. The panel shows all fields with labels and supports inline editing + save.

Same config as "table" but type is "detail_view". Use for record browsing/editing views.

### kanban
A drag-and-drop status board. Cards are grouped into columns by a status field. Dragging a card to another column updates the record's status.

Required: kanbanStatusField, kanbanColumns, kanbanTitleField. Size: "full".

Properties:
- kanbanStatusField: the field that determines column placement (e.g., "status")
- kanbanColumns: ordered array of column values (e.g., ["PLANNED", "IN_PROGRESS", "COMPLETED"])
- kanbanTitleField: the field shown as card title (e.g., "woNumber" or "name")
- kanbanCardFields: additional fields to show on each card (e.g., ["sku", "plannedQty"])

Example — Work Order Kanban:
{ "id": "wo-kanban", "type": "kanban", "title": "Work Order Board", "query": { "entity": "work_orders", "limit": 100 }, "size": "full", "kanbanStatusField": "status", "kanbanColumns": ["PLANNED", "RELEASED", "IN_PROGRESS", "COMPLETED"], "kanbanTitleField": "woNumber", "kanbanCardFields": ["sku", "plannedQty"] }

Example — PO Pipeline:
{ "id": "po-kanban", "type": "kanban", "title": "PO Pipeline", "query": { "entity": "purchase_orders", "limit": 50 }, "size": "full", "kanbanStatusField": "status", "kanbanColumns": ["DRAFT", "SENT", "CONFIRMED", "PARTIAL", "RECEIVED"], "kanbanTitleField": "poNumber", "kanbanCardFields": ["supplier.name", "totalAmount"] }

### insight (AI-generated analysis)
An AI-powered analysis widget that fetches data from multiple entities, sends it to Claude for analysis, and renders the response as styled markdown (bullet points, bold text, headers).

Required: insightConfig with queries array + prompt. Size: "md" or "lg".

Properties:
- insightConfig.queries: array of DataQuery objects — data fetched and sent as context to Claude
- insightConfig.prompt: analysis prompt template. Use {{paramKey}} placeholders that get filled from connected simulator widget parameters
- insightConfig.maxTokens: max AI response length (default 1024)
- interactions.listenTo: connect to filter_bar and/or simulator widgets

The insight widget reacts to filter changes AND simulator parameter changes. When filters or parameters change, it re-fetches data and regenerates the analysis.

Example — Inventory risk analysis:
{ "id": "risk-insight", "type": "insight", "title": "Risk Analysis", "query": { "entity": "inventory", "aggregation": "count" }, "size": "lg", "interactions": { "listenTo": ["filters"] }, "insightConfig": { "queries": [{ "entity": "inventory", "limit": 20 }, { "entity": "sales_orders", "filters": [{ "field": "status", "op": "ne", "value": "CANCELLED" }], "limit": 20 }], "prompt": "Analyze inventory risk: which items are below reorder point? Which open sales orders are at risk of not being fulfilled? What are the top 3 recommended actions?" } }

Example — SKU impact analysis with simulator:
{ "id": "impact-insight", "type": "insight", "title": "Impact Analysis", "query": { "entity": "inventory", "aggregation": "count" }, "size": "lg", "interactions": { "listenTo": ["sku-filter", "stock-sim"] }, "insightConfig": { "queries": [{ "entity": "inventory", "limit": 10 }, { "entity": "sales_orders", "filters": [{ "field": "status", "op": "ne", "value": "CANCELLED" }], "limit": 20 }], "prompt": "The user is simulating stock at {{simulatedQuantity}} units. Analyze: 1) How many open sales orders can be fulfilled? 2) Which orders are at risk? 3) Revenue impact. 4) Recommended actions." } }

### simulator (what-if parameter controls)
Interactive parameter controls for what-if scenario analysis. Does NOT persist any data — instead broadcasts parameter values to connected insight widgets via the interactions system.

Required: simulatorConfig with parameters array. Size: "md".

Properties:
- simulatorConfig.parameters: array of parameter definitions
  - key: parameter identifier (used in insight prompt as {{key}})
  - label: display name
  - type: "slider" (range input), "number" (numeric input), "select" (dropdown)
  - min, max, step: for slider/number types
  - defaultValue: initial value
  - unit: display unit (e.g., "units", "$", "days")
  - options: for select type — array of { label, value }
- simulatorConfig.targetWidgets: array of widget IDs that should react to parameter changes

Example — Stock level simulator:
{ "id": "stock-sim", "type": "simulator", "title": "Adjust Parameters", "query": { "entity": "inventory", "aggregation": "count" }, "size": "md", "simulatorConfig": { "parameters": [{ "key": "simulatedQuantity", "label": "Stock Quantity", "type": "slider", "min": 0, "max": 5000, "step": 10, "defaultValue": 500, "unit": "units" }], "targetWidgets": ["impact-insight"] } }

### stat_card with sparkline
Stat cards can show a mini trend chart (sparkline) with period-over-period change indicator.

Properties:
- sparkline: { entity, dateField, valueField, aggregation, timeBucket, periods? }
  - dateField: the date field to bucket (e.g., "createdAt")
  - valueField: the numeric field to aggregate (e.g., "totalAmount")
  - aggregation: "count" | "sum" | "avg"
  - timeBucket: "day" | "week" | "month" | "quarter"
  - periods: number of time periods to show (default 12)

The sparkline automatically shows an up/down trend indicator comparing the last two periods.

Example — Monthly PO value with sparkline:
{ "id": "po-value", "type": "stat_card", "title": "Open PO Value", "query": { "entity": "purchase_orders", "aggregation": "sum", "field": "totalAmount", "filters": [{ "field": "status", "op": "ne", "value": "RECEIVED" }, { "field": "status", "op": "ne", "value": "CANCELLED" }] }, "display": { "format": "currency", "description": "vs last month" }, "sparkline": { "entity": "purchase_orders", "dateField": "createdAt", "valueField": "totalAmount", "aggregation": "sum", "timeBucket": "month", "periods": 6 }, "size": "sm" }

## Widget Interactions

Widgets can interact with each other through filter events and click-to-filter.

### Filter listening
Any widget can listen to a filter_bar by adding:
\`"interactions": { "listenTo": ["<filter-bar-id>"] }\`

When the user changes a filter, all listening widgets automatically re-fetch with the new filters applied.

### Click-to-filter (drill-down)
Charts and tables can emit click events that filter other widgets:
\`"interactions": { "onClick": { "targetWidgets": ["<target-id>"], "filterField": "status" } }\`

When the user clicks a bar in a chart, the clicked label's value is sent as a filter to the target widgets.

### Refresh cascade
When a form creates a record or a table action updates one, ALL widgets automatically refresh to show the latest data. Toast notifications confirm success/failure.

## App Layouts

### Single page (default)
All widgets render in a grid. Best for simple dashboards with ≤10 widgets.

### Tabbed Layout
To organize an app into tabs, add a special tab-defining widget:
{ "id": "tab-layout", "type": "stat_card", "title": "", "query": { "entity": "products", "aggregation": "count" }, "size": "sm", "tabs": [{ "label": "Overview", "widgetIds": ["stat-1", "chart-1", "table-1"] }, { "label": "Management", "widgetIds": ["form-1", "mgmt-table"] }] }

Widgets NOT listed in any tab appear above the tabs (filter bars, global stats). The tab widget itself is hidden.

### Multi-page Sidebar Layout
For complex apps, add a "pages" array to the top-level config. This renders a sidebar navigation.

"pages": [
  { "id": "overview", "label": "Overview", "icon": "dashboard", "widgetIds": ["stat-1", "stat-2", "chart-1"] },
  { "id": "orders", "label": "Orders", "icon": "orders", "widgetIds": ["po-filters", "po-table"] },
  { "id": "inventory", "label": "Inventory", "icon": "inventory", "widgetIds": ["inv-alerts", "inv-table"] }
]

Available icons: home, dashboard, products, inventory, orders, suppliers, customers, production, analytics, settings

Use multi-page layout when the app has 3+ distinct sections with 15+ total widgets.

## Building Interactive Apps vs Dashboards
- When the user asks for a "dashboard" or "overview" → build a read-only dashboard (stat_cards with sparklines, charts, tables)
- When the user asks for an "app", "tool", "manager", "editor" → build a full interactive app with:
  1. A filter_bar at the top for searching/filtering
  2. Tables with detailPanel, bulkActions, and action buttons
  3. A form for creating new records (multi-step for complex entities)
  4. Kanban boards for status-driven workflows
  5. Multi-page or tabbed layout for organization
  6. Sparklines on stat cards for trend visibility
  7. Click-to-filter between charts and tables
- "Manage POs" → multi-page: Overview (stats+charts), Orders (kanban+table with actions), Create (multi-step form)
- "Product catalog" → filter bar + detail_view table + form to add products
- "Inventory tool" → filter bar + alert list + table with bulk actions + stock adjustment form
- "Customer manager" → multi-page: Customers (filters+table+detail panel), Analytics (charts), Add Customer (form)
- "Work order tracker" → kanban board + filter bar + fill rate progress_bar + WO table with actions + form
- "Supply chain overview" → dashboard with sparkline stat cards + PO/SO/WO charts + alert lists
- "SKU simulator" or "impact analysis" → filter_bar (SKU select) + simulator (parameter sliders) + insight (AI analysis) + stat_cards for context
- "What-if analysis" → simulator + insight widgets connected via listenTo, with relevant data queries in insightConfig

## Response Format
IMPORTANT: Keep your explanation to 2-3 sentences MAX. The JSON config is the priority — never sacrifice it for a long explanation.

Here's what I built for you: [brief explanation]

\`\`\`json
{ "title": "...", "description": "...", "widgets": [...], "pages": [...] }
\`\`\`

Note: "pages" is optional — only include it for multi-page apps with sidebar navigation.
CRITICAL: You MUST always include the complete \`\`\`json ... \`\`\` block. If you skip it or truncate it, the app will not render.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dec = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

async function buildDataContext(orgId: string, orgName: string, currentConfig?: CustomAppConfig): Promise<string> {
  // Counts — all entities
  const [
    productCount, supplierCount, inventoryCount, poCount, soCount,
    woCount, lotCount, customerCount, locationCount, bomCount, forecastCount,
  ] = await Promise.all([
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.supplier.count({ where: { organizationId: orgId } }),
    prisma.inventoryItem.count({ where: { organizationId: orgId } }),
    prisma.purchaseOrder.count({ where: { orgId } }),
    prisma.salesOrder.count({ where: { orgId } }),
    prisma.workOrder.count({ where: { organizationId: orgId } }),
    prisma.lot.count({ where: { orgId } }),
    prisma.customer.count({ where: { orgId } }),
    prisma.location.count({ where: { organizationId: orgId } }),
    prisma.bOMHeader.count({ where: { orgId } }),
    prisma.demandForecast.count({ where: { orgId } }),
  ]);

  // Metadata
  const [categories, productTypes, poStatuses, soStatuses, woStatuses, supplierCountries, customerCountries] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: orgId, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      take: 15,
    }),
    prisma.product.findMany({
      where: { organizationId: orgId, type: { not: null } },
      select: { type: true },
      distinct: ["type"],
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId },
      select: { status: true },
      distinct: ["status"],
    }),
    prisma.salesOrder.findMany({
      where: { orgId },
      select: { status: true },
      distinct: ["status"],
    }),
    prisma.workOrder.findMany({
      where: { organizationId: orgId },
      select: { status: true },
      distinct: ["status"],
    }),
    prisma.supplier.findMany({
      where: { organizationId: orgId, country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      take: 10,
    }),
    prisma.customer.findMany({
      where: { orgId, country: { not: null } },
      select: { country: true },
      distinct: ["country"],
      take: 10,
    }),
  ]);

  // KPIs
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [inventoryWithCost, openPOs, openSOs, stockOuts, woInProgress, woAll, lotsSoon] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { organizationId: orgId },
      select: { quantity: true, product: { select: { unitCost: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId, status: { notIn: ["RECEIVED", "CANCELLED"] } },
      select: { totalAmount: true, expectedDate: true },
    }),
    prisma.salesOrder.findMany({
      where: { orgId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
      select: { totalAmount: true },
    }),
    prisma.inventoryItem.count({
      where: { organizationId: orgId, quantity: 0 },
    }),
    prisma.workOrder.count({
      where: { organizationId: orgId, status: "IN_PROGRESS" },
    }),
    prisma.workOrder.findMany({
      where: { organizationId: orgId },
      select: { plannedQty: true, actualQty: true },
    }),
    prisma.lot.count({
      where: {
        orgId,
        expiryDate: { not: null, lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  const totalInventoryValue = inventoryWithCost.reduce(
    (sum, i) => sum + dec(i.quantity) * dec(i.product.unitCost), 0
  );
  const openPOValue = openPOs.reduce((sum, po) => sum + dec(po.totalAmount), 0);
  const openSOValue = openSOs.reduce((sum, so) => sum + dec(so.totalAmount), 0);
  const overduePOCount = openPOs.filter(
    (po) => po.expectedDate && po.expectedDate < today
  ).length;

  // WO fill rate (actualQty / plannedQty)
  const totalPlanned = woAll.reduce((s, w) => s + dec(w.plannedQty), 0);
  const totalProduced = woAll.reduce((s, w) => s + dec(w.actualQty), 0);
  const fillRate = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 1000) / 10 : 0;

  // Avg supplier lead time
  const supplierLeadTimes = await prisma.supplier.findMany({
    where: { organizationId: orgId, leadTimeDays: { not: null } },
    select: { leadTimeDays: true },
  });
  const avgLeadTime = supplierLeadTimes.length > 0
    ? Math.round(supplierLeadTimes.reduce((s, sl) => s + (sl.leadTimeDays ?? 0), 0) / supplierLeadTimes.length)
    : null;

  // Sample data (top 5 of key entities for AI context)
  const [sampleProducts, sampleSuppliers, sampleCustomers, samplePOs] = await Promise.all([
    prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true, name: true, category: true, unitCost: true, type: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.supplier.findMany({
      where: { organizationId: orgId },
      select: { name: true, country: true, leadTimeDays: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { orgId },
      select: { name: true, country: true, creditLimit: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseOrder.findMany({
      where: { orgId },
      select: { poNumber: true, status: true, totalAmount: true, expectedDate: true },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const catList = categories.map((c: { category: string | null }) => c.category).filter(Boolean);
  const typeList = productTypes.map((t: { type: string | null }) => t.type).filter(Boolean);

  let ctx = `
## Data Profile (${orgName})

### Entity Counts
- Products: ${productCount}${catList.length ? ` (categories: ${catList.join(", ")})` : ""}${typeList.length ? ` (types: ${typeList.join(", ")})` : ""}
- Inventory items: ${inventoryCount}
- Suppliers: ${supplierCount}${supplierCountries.length ? ` (countries: ${supplierCountries.map((s: { country: string | null }) => s.country).filter(Boolean).join(", ")})` : ""}
- Purchase Orders: ${poCount}${poStatuses.length ? ` (statuses: ${poStatuses.map((o: { status: string }) => o.status).join(", ")})` : ""}
- Sales Orders: ${soCount}${soStatuses.length ? ` (statuses: ${soStatuses.map((o: { status: string }) => o.status).join(", ")})` : ""}
- Work Orders: ${woCount}${woStatuses.length ? ` (statuses: ${woStatuses.map((o: { status: string }) => o.status).join(", ")})` : ""}
- Lots: ${lotCount}
- Customers: ${customerCount}${customerCountries.length ? ` (countries: ${customerCountries.map((c: { country: string | null }) => c.country).filter(Boolean).join(", ")})` : ""}
- Locations: ${locationCount}
- BOMs: ${bomCount}
- Demand Forecasts: ${forecastCount}

### Key Metrics
- Inventory value: $${totalInventoryValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
- Open PO value: $${openPOValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
- Open SO value: $${openSOValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
- Overdue POs: ${overduePOCount}
- Stock-outs (qty=0): ${stockOuts}
- WOs in progress: ${woInProgress}
${totalPlanned > 0 ? `- WO fill rate: ${fillRate}% (${totalProduced.toLocaleString()} actual / ${totalPlanned.toLocaleString()} planned)\n` : ""}${avgLeadTime !== null ? `- Avg supplier lead time: ${avgLeadTime} days\n` : ""}${lotsSoon > 0 ? `- Lots expiring within 30 days: ${lotsSoon}\n` : ""}
### Insights for Dashboard Design`;

  if (overduePOCount > 0) ctx += `\n- WARNING: ${overduePOCount} overdue purchase orders — consider an alert widget`;
  if (stockOuts > 0) ctx += `\n- WARNING: ${stockOuts} items at zero stock — consider a stock alert widget`;
  if (woInProgress > 0) ctx += `\n- ${woInProgress} work orders in progress — production tracking + fill rate widgets useful`;
  if (fillRate > 0 && fillRate < 80) ctx += `\n- WARNING: Fill rate at ${fillRate}% — consider a fill rate progress_bar widget`;
  if (lotsSoon > 0) ctx += `\n- ${lotsSoon} lots expiring soon — consider an expiry alert widget`;
  if (customerCount > 0) ctx += `\n- ${customerCount} customers available — customer analytics possible (country breakdown, credit analysis)`;
  if (forecastCount > 0) ctx += `\n- ${forecastCount} demand forecasts — trend line and forecast vs actual widgets available`;
  if (bomCount > 0) ctx += `\n- ${bomCount} BOMs — product structure complexity analysis available`;
  if (locationCount > 1) ctx += `\n- ${locationCount} locations — inventory by location analysis available`;
  if (poCount === 0 && soCount === 0) ctx += "\n- No POs or SOs yet — focus on inventory and product widgets";

  // Sample data
  if (sampleProducts.length > 0) {
    ctx += `\n\n### Sample Products (recent ${sampleProducts.length})`;
    for (const p of sampleProducts) {
      ctx += `\n- ${p.sku}: ${p.name}${p.category ? ` [${p.category}]` : ""}${p.type ? ` (${p.type})` : ""} — $${Number(p.unitCost ?? 0).toFixed(2)}`;
    }
  }
  if (sampleSuppliers.length > 0) {
    ctx += `\n\n### Sample Suppliers (recent ${sampleSuppliers.length})`;
    for (const s of sampleSuppliers) {
      ctx += `\n- ${s.name}${s.country ? ` (${s.country})` : ""}${s.leadTimeDays ? ` — ${s.leadTimeDays}d lead time` : ""}`;
    }
  }
  if (sampleCustomers.length > 0) {
    ctx += `\n\n### Sample Customers (recent ${sampleCustomers.length})`;
    for (const c of sampleCustomers) {
      ctx += `\n- ${c.name}${c.country ? ` (${c.country})` : ""}${c.creditLimit ? ` — $${Number(c.creditLimit).toLocaleString()} credit limit` : ""}`;
    }
  }
  if (samplePOs.length > 0) {
    ctx += `\n\n### Sample POs (recent ${samplePOs.length})`;
    for (const po of samplePOs) {
      ctx += `\n- ${po.poNumber}: ${po.status} — $${Number(po.totalAmount ?? 0).toLocaleString()}${po.expectedDate ? ` (expected ${po.expectedDate.toISOString().slice(0, 10)})` : ""}`;
    }
  }

  if (currentConfig) {
    ctx += `\n\n### Current Config (user wants to refine this)\n${JSON.stringify(currentConfig, null, 2)}`;
  }

  return ctx;
}

// ---------------------------------------------------------------------------
// Streaming endpoint
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Invalid JSON body");

  const { messages, currentConfig } = body as {
    messages: { role: "user" | "assistant"; content: string }[];
    currentConfig?: CustomAppConfig;
  };

  if (!messages?.length) return badRequest("messages required");
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500 });
  }

  // Token budget pre-flight check
  const budget = await checkTokenBudget(ctx.org.id, ctx.session.user!.id!, ctx.org.plan ?? "free");
  if (!budget.allowed) {
    return new Response(JSON.stringify({ error: budget.message }), { status: 429 });
  }

  const dataContext = await buildDataContext(ctx.org.id, ctx.org.name, currentConfig);
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 16384,
          system: SYSTEM_PROMPT + "\n\n" + dataContext,
          messages,
          stream: true,
        });

        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({ type: "text_delta", text: event.delta.text }) + "\n"
              )
            );
          } else if (event.type === "message_start" && event.message.usage) {
            inputTokens += event.message.usage.input_tokens;
            outputTokens += event.message.usage.output_tokens;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens += event.usage.output_tokens;
          }
        }

        // Record token usage
        await recordTokenUsage(ctx.org.id, ctx.session.user!.id!, "generate", {
          inputTokens,
          outputTokens,
        });

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "done" }) + "\n")
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", error: msg }) + "\n")
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
