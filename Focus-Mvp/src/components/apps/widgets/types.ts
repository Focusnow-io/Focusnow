export type WidgetSize = "sm" | "md" | "lg" | "full";

export type EntityType =
  | "products"
  | "inventory"
  | "orders"
  | "suppliers"
  | "purchase_orders"
  | "sales_orders"
  | "work_orders"
  | "lots"
  | "customers"
  | "locations"
  | "bom"
  | "forecasts";

export interface DataFilter {
  field: string;
  op: "eq" | "lt" | "gt" | "lte" | "gte" | "ne" | "contains";
  value: unknown;
}

export interface DataQuery {
  entity: EntityType;
  aggregation?: "count" | "sum" | "avg" | "min" | "max";
  field?: string;
  filters?: DataFilter[];
  groupBy?: string;
  sort?: { field: string; dir: "asc" | "desc" };
  limit?: number;
  /** Group date values into buckets for time-series charts */
  timeBucket?: "day" | "week" | "month" | "quarter";
  /** Compute a derived value from two fields */
  computedField?: {
    operation: "ratio" | "percentage" | "delta";
    numerator: string;
    denominator: string;
  };
}

export interface ColumnDef {
  key: string;
  label: string;
  format?: string;
}

export interface WidgetDisplay {
  format?: "number" | "currency" | "percentage";
  color?: string;
  valueField?: string;
  labelField?: string;
  columns?: ColumnDef[];
  description?: string;
  /** For progress_bar: the target/goal field or value */
  targetField?: string;
  targetValue?: number;
}

// ---------------------------------------------------------------------------
// Interactive widget types
// ---------------------------------------------------------------------------

/** Filter bar filter option */
export interface FilterOption {
  field: string;
  label: string;
  type: "select" | "search" | "date_range";
  /** Entity to fetch distinct values from (for "select" type) */
  entity?: EntityType;
  /** Field to group by for fetching options (for "select" type) */
  optionsField?: string;
}

/** Row action button in tables */
export interface RowAction {
  label: string;
  type: "updateStatus" | "delete" | "navigate";
  /** New status value for updateStatus */
  targetStatus?: string;
  /** Show confirmation dialog before executing */
  confirm?: boolean;
  /** Button color */
  color?: "blue" | "green" | "red" | "amber" | "gray";
  /** Only show when row field matches this condition */
  showWhen?: { field: string; op: DataFilter["op"]; value: unknown };
}

/** Form field definition */
export interface FormField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "textarea";
  required?: boolean;
  placeholder?: string;
  /** For select: static options */
  options?: { label: string; value: string }[];
  /** For select: fetch distinct values dynamically from an entity */
  optionsFrom?: { entity: EntityType; field: string };
  /** Default value */
  defaultValue?: unknown;
  /** Conditional visibility: only show when another field has a specific value */
  showWhen?: { field: string; value: string };
  /** Multi-step form: which step this field belongs to (1-based) */
  step?: number;
}

/** Widget interaction wiring */
export interface WidgetInteraction {
  /** This widget listens to filter changes from these filter_bar widget IDs */
  listenTo?: string[];
  /** Clicking a row/bar emits a filter event to these target widgets */
  onClick?: {
    targetWidgets: string[];
    filterField: string;
  };
}

/** Tab definition for tabbed layout */
export interface TabDef {
  label: string;
  widgetIds: string[];
}

// ---------------------------------------------------------------------------
// Widget config
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Insight widget (AI-generated narrative analysis)
// ---------------------------------------------------------------------------

export interface InsightConfig {
  /** Multiple data queries to fetch context for AI analysis */
  queries: DataQuery[];
  /** Prompt template with {{paramKey}} placeholders filled from simulator params */
  prompt: string;
  /** Max tokens for AI response (default 1024) */
  maxTokens?: number;
}

// ---------------------------------------------------------------------------
// Simulator widget (what-if parameter controls)
// ---------------------------------------------------------------------------

export interface SimulatorParameter {
  key: string;
  label: string;
  type: "slider" | "number" | "select";
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number | string;
  /** Display unit (e.g., "units", "$", "days") */
  unit?: string;
  /** Static options for select type */
  options?: { label: string; value: string }[];
}

export interface SimulatorConfig {
  /** Parameter definitions rendered as sliders/inputs */
  parameters: SimulatorParameter[];
  /** Connected widget IDs that recalculate when parameters change */
  targetWidgets: string[];
}

// ---------------------------------------------------------------------------
// Widget config
// ---------------------------------------------------------------------------

export interface WidgetConfig {
  id: string;
  type:
    | "stat_card"
    | "bar_chart"
    | "line_chart"
    | "pie_chart"
    | "table"
    | "alert_list"
    | "progress_bar"
    | "filter_bar"
    | "form"
    | "detail_view"
    | "kanban"
    | "insight"
    | "simulator";
  title: string;
  query: DataQuery;
  display?: WidgetDisplay;
  size: WidgetSize;

  // ── Interactive features ──────────────────────────────────────────────
  /** Widget interaction wiring (filter listening, click-to-filter) */
  interactions?: WidgetInteraction;
  /** Row actions for table widgets */
  actions?: RowAction[];
  /** Filter options for filter_bar widgets */
  filterOptions?: FilterOption[];
  /** Form fields for form widgets */
  formFields?: FormField[];
  /** Form submit action */
  formAction?: { type: "create" | "update"; entity: EntityType };
  /** Tab layout — groups widgets into tabs */
  tabs?: TabDef[];
  /** Detail panel: whether inline editing is enabled (default true) */
  detailEditable?: boolean;
  /** Table: clicking a row opens a detail panel */
  detailPanel?: boolean;
  /** Table: enable search bar (default true) */
  tableSearch?: boolean;
  /** Table: enable bulk select checkboxes + bulk delete */
  bulkActions?: boolean;
  /** Kanban: the field that determines which column a card belongs to */
  kanbanStatusField?: string;
  /** Kanban: ordered list of column values */
  kanbanColumns?: string[];
  /** Kanban: fields to display on each card */
  kanbanCardFields?: string[];
  /** Kanban: the field used as the card title */
  kanbanTitleField?: string;
  /** Stat card: sparkline trend config */
  sparkline?: {
    entity: EntityType;
    dateField: string;
    valueField: string;
    aggregation: "count" | "sum" | "avg";
    timeBucket: "day" | "week" | "month" | "quarter";
    periods?: number;
  };

  // ── Insight + Simulator ───────────────────────────────────────────────
  /** Insight widget: AI analysis configuration */
  insightConfig?: InsightConfig;
  /** Simulator widget: parameter controls for what-if analysis */
  simulatorConfig?: SimulatorConfig;
}

export interface PageDef {
  id: string;
  label: string;
  icon?: string;
  widgetIds: string[];
}

export interface CustomAppConfig {
  title: string;
  description: string;
  widgets: WidgetConfig[];
  /** Multi-page layout: defines sidebar pages. If present, uses sidebar nav. */
  pages?: PageDef[];
}
