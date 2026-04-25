/**
 * Canonical dataset vocabulary for the JSONB import store.
 *
 * Each of the 8 business concepts (matching IMPORT_CONCEPTS in the hub)
 * is defined here with its canonical field set and the identity fields
 * used to build an `externalId` for deduplicating re-imports. Aliases
 * are registered in DATASET_FIELD_ALIASES so the column mapper can turn
 * arbitrary CSV headers into these canonical keys.
 *
 * This file is deliberately self-contained — it does not import from
 * CANONICAL_FIELDS or the old field-mapper. The new pipeline writes to
 * ImportDataset / ImportRecord and has no relation to the per-entity
 * Prisma tables.
 */

export interface CanonicalDatasetField {
  label: string;
  type: "string" | "number" | "boolean" | "date";
  identity?: boolean;
  /** In merge mode, ADD the incoming value to the existing value instead of overwriting.
   *  Only meaningful for numeric fields (e.g. inventory quantity received). */
  accumulate?: boolean;
}

export const DATASETS = {
  products: {
    label: "Products",
    description: "Your product catalogue",
    fields: {
      sku:              { label: "SKU / Item Code",     type: "string", identity: true },
      name:             { label: "Product Name",        type: "string" },
      type:             { label: "Product Type",        type: "string" },
      uom:              { label: "Unit of Measure",     type: "string" },
      unit_cost:        { label: "Unit Cost",           type: "number" },
      list_price:       { label: "List Price",          type: "number" },
      make_buy:         { label: "Make / Buy",          type: "string" },
      lead_time_days:   { label: "Lead Time (Days)",    type: "number" },
      moq:              { label: "Min Order Qty",       type: "number" },
      order_multiple:   { label: "Order Multiple",      type: "number" },
      product_family:   { label: "Product Family",      type: "string" },
      product_line:     { label: "Product Line",        type: "string" },
      abc_class:        { label: "ABC Class",           type: "string" },
      safety_stock:     { label: "Safety Stock",        type: "number" },
      reorder_point:    { label: "Reorder Point",       type: "number" },
      status:           { label: "Status",              type: "string" },
      shelf_life_days:  { label: "Shelf Life (Days)",   type: "number" },
      drawing_number:   { label: "Drawing Number",      type: "string" },
      revision:         { label: "Revision",            type: "string" },
      regulatory_class: { label: "Regulatory Class",   type: "string" },
    },
    identityFields: ["sku"],
  },

  suppliers: {
    label: "Suppliers",
    description: "Your supplier and vendor list",
    fields: {
      supplier_code:    { label: "Supplier Code",       type: "string", identity: true },
      name:             { label: "Supplier Name",       type: "string" },
      country:          { label: "Country",             type: "string" },
      city:             { label: "City",                type: "string" },
      email:            { label: "Email",               type: "string" },
      phone:            { label: "Phone",               type: "string" },
      lead_time_days:   { label: "Lead Time (Days)",    type: "number" },
      payment_terms:    { label: "Payment Terms",       type: "string" },
      currency:         { label: "Currency",            type: "string" },
      quality_rating:   { label: "Quality Rating",      type: "number" },
      on_time_pct:      { label: "On-Time %",           type: "number" },
      certifications:   { label: "Certifications",      type: "string" },
      status:           { label: "Status",              type: "string" },
      approved_since:   { label: "Approved Since",      type: "date" },
      moq:              { label: "Min Order Qty",       type: "number" },
      unit_cost:        { label: "Unit Cost",           type: "number" },
      order_multiple:   { label: "Order Multiple",      type: "number" },
      supplier_part_no: { label: "Supplier Part No",    type: "string" },
      valid_to:         { label: "Valid To",            type: "date" },
      // AVL / sourcing fields — present when the file links suppliers to BOM components
      component_sku:    { label: "Component SKU",       type: "string", identity: true },
      component_name:   { label: "Component Name",      type: "string" },
      fg_sku:           { label: "FG SKU",              type: "string" },
      fg_name:          { label: "FG Name",             type: "string" },
      approved_sub:     { label: "Approved Substitute", type: "string" },
    },
    identityFields: ["supplier_code", "component_sku"],
  },

  customers: {
    label: "Customers",
    description: "Your customer accounts",
    fields: {
      customer_code:    { label: "Customer Code",       type: "string", identity: true },
      name:             { label: "Customer Name",       type: "string" },
      country:          { label: "Country",             type: "string" },
      city:             { label: "City",                type: "string" },
      email:            { label: "Email",               type: "string" },
      currency:         { label: "Currency",            type: "string" },
      payment_terms:    { label: "Payment Terms",       type: "string" },
      credit_limit:     { label: "Credit Limit",        type: "number" },
      type:             { label: "Customer Type",       type: "string" },
      status:           { label: "Status",              type: "string" },
    },
    identityFields: ["customer_code"],
  },

  locations: {
    label: "Locations",
    description: "Warehouses, stores, and sites",
    fields: {
      location_code:    { label: "Location Code",       type: "string", identity: true },
      name:             { label: "Location Name",       type: "string" },
      type:             { label: "Type",                type: "string" },
      city:             { label: "City",                type: "string" },
      country:          { label: "Country",             type: "string" },
      parent_code:      { label: "Parent Location",     type: "string" },
    },
    identityFields: ["location_code"],
  },

  inventory: {
    label: "Inventory",
    description: "Current stock levels per item and location",
    fields: {
      sku:              { label: "SKU / Product Code",  type: "string", identity: true },
      location_code:    { label: "Location Code",       type: "string", identity: true },
      quantity:         { label: "Quantity on Hand",    type: "number", accumulate: true },
      reorder_point:    { label: "Reorder Point",       type: "number" },
      safety_stock:     { label: "Safety Stock",        type: "number" },
      unit_cost:        { label: "Unit Cost",           type: "number" },
      total_value:      { label: "Total Value",         type: "number" },
      uom:              { label: "Unit of Measure",     type: "string" },
      lead_time_days:   { label: "Lead Time (Days)",    type: "number" },
      moq:              { label: "Min Order Qty",       type: "number" },
      order_multiple:   { label: "Order Multiple",      type: "number" },
      on_hold_qty:      { label: "On Hold / QC Qty",    type: "number" },
      reserved_qty:     { label: "Reserved Qty",        type: "number" },
      open_po_qty:      { label: "Open PO Qty",         type: "number" },
      days_of_supply:   { label: "Days of Supply",      type: "number" },
      demand_per_day:   { label: "Demand Per Day",      type: "number" },
      last_receipt_date:{ label: "Last Receipt Date",   type: "date" },
      buy_recommendation:{ label: "Buy Recommendation", type: "boolean" },
      recommended_qty:  { label: "Recommended Qty",     type: "number" },
    },
    // `sku + location_code` together form the unique key when location
    // is present; otherwise `sku` alone (see buildExternalId).
    identityFields: ["sku", "location_code"],
  },

  purchase_orders: {
    label: "Purchase Orders",
    description: "Orders placed with your suppliers",
    fields: {
      po_number:        { label: "PO Number",           type: "string", identity: true },
      supplier_code:    { label: "Supplier Code",       type: "string" },
      supplier_name:    { label: "Supplier Name",       type: "string" },
      sku:              { label: "Item Code / SKU",     type: "string", identity: true },
      item_name:        { label: "Item Name",           type: "string" },
      line_number:      { label: "Line Number",         type: "number" },
      qty_ordered:      { label: "Qty Ordered",         type: "number" },
      qty_received:     { label: "Qty Received",        type: "number" },
      qty_open:         { label: "Open / Outstanding Qty", type: "number" },
      unit_cost:        { label: "Unit Cost / Price",   type: "number" },
      line_value:       { label: "Line Value / Total",  type: "number" },
      currency:         { label: "Currency",            type: "string" },
      status:           { label: "Line Status",         type: "string" },
      order_date:       { label: "Order Date",          type: "date" },
      expected_date:    { label: "Expected / Delivery Date", type: "date" },
      confirmed_eta:    { label: "Confirmed ETA",       type: "date" },
      uom:              { label: "Unit of Measure",     type: "string" },
      buyer:            { label: "Buyer / Purchaser",   type: "string" },
      notes:            { label: "Notes",               type: "string" },
    },
    identityFields: ["po_number", "sku"],
  },

  sales_orders: {
    label: "Sales Orders",
    description: "Orders received from your customers",
    fields: {
      so_number:        { label: "SO Number",           type: "string", identity: true },
      customer_code:    { label: "Customer Code",       type: "string" },
      customer_name:    { label: "Customer Name",       type: "string" },
      sku:              { label: "Item Code / SKU",     type: "string", identity: true },
      item_name:        { label: "Item Name",           type: "string" },
      line_number:      { label: "Line Number",         type: "number" },
      qty_ordered:      { label: "Qty Ordered",         type: "number" },
      qty_shipped:      { label: "Qty Shipped",         type: "number" },
      qty_open:         { label: "Open Qty",            type: "number" },
      unit_price:       { label: "Unit Price",          type: "number" },
      line_value:       { label: "Line Value / Total",  type: "number" },
      currency:         { label: "Currency",            type: "string" },
      status:           { label: "Status",              type: "string" },
      order_date:       { label: "Order Date",          type: "date" },
      requested_date:   { label: "Requested Date",      type: "date" },
      uom:              { label: "Unit of Measure",     type: "string" },
      notes:            { label: "Notes",               type: "string" },
    },
    identityFields: ["so_number", "sku"],
  },

  bom: {
    label: "Bill of Materials",
    description: "Product structure and component lists",
    fields: {
      fg_sku:           { label: "Finished Good SKU",   type: "string", identity: true },
      fg_name:          { label: "FG Name",             type: "string" },
      component_sku:    { label: "Component SKU",       type: "string", identity: true },
      component_name:   { label: "Component Name",      type: "string" },
      qty_per:          { label: "Quantity Per",        type: "number" },
      uom:              { label: "Unit of Measure",     type: "string" },
      section:          { label: "Section / Group",     type: "string" },
      make_buy:         { label: "Make / Buy",          type: "string" },
      is_critical:      { label: "Is Critical",         type: "boolean" },
      component_cost:   { label: "Component Cost",      type: "number" },
      extended_cost:    { label: "Extended Cost",       type: "number" },
      revision:         { label: "BOM Revision",        type: "string" },
      // Optional BOM identifier — distinct from fg_sku. A "BOM ID" is
      // the header's own key (e.g. "BOM-DF-02-A"), whereas fg_sku is
      // the finished-good SKU the BOM produces (e.g. "DF-02"). Files
      // that carry both columns used to collapse onto fg_sku via the
      // alias list, which broke component rollups.
      bom_id:           { label: "BOM ID",              type: "string" },
      // Sourcing / AVL fields — common in "Approved Vendor List" BOM exports
      // that combine component structure with supplier sourcing data.
      supplier_name:    { label: "Supplier Name",       type: "string" },
      supplier_part_no: { label: "Supplier Part No",    type: "string" },
      status:           { label: "Status",              type: "string" },
      lead_time_days:   { label: "Lead Time (Days)",    type: "number" },
      moq:              { label: "Min Order Qty",       type: "number" },
      order_multiple:   { label: "Order Multiple",      type: "number" },
      unit_cost:        { label: "Unit Cost",           type: "number" },
      valid_from:       { label: "Valid From",          type: "date" },
      valid_to:         { label: "Valid To",            type: "date" },
      approved_sub:     { label: "Approved Substitute", type: "string" },
      country_of_origin:{ label: "Country of Origin",  type: "string" },
    },
    identityFields: ["fg_sku", "component_sku"],
  },
} as const satisfies Record<
  string,
  {
    label: string;
    description: string;
    fields: Record<string, CanonicalDatasetField>;
    identityFields: readonly string[];
  }
>;

export type DatasetName = keyof typeof DATASETS;
export type DatasetField = string;

/** Build the stable externalId used by ImportRecord's unique constraint.
 *
 *  Concatenates the identity-field values with a `:` separator, trimming
 *  whitespace. Returns `null` when no identity values are present — the
 *  caller inserts the row as an append-only record in that case.
 *
 *  For composite identities (e.g. inventory's `sku + location_code`) we
 *  join whichever values are non-empty rather than forcing all of them,
 *  so a location-less inventory export still dedupes by SKU alone. */
export function buildExternalId(
  datasetName: DatasetName,
  data: Record<string, unknown>,
): string | null {
  const dataset = DATASETS[datasetName];
  const values = dataset.identityFields
    .map((f) => data[f])
    .filter((v) => v != null && String(v).trim() !== "");

  if (values.length === 0) return null;
  return values.map((v) => String(v).trim()).join(":");
}

/** Alias vocabulary used by the column mapper. Each entry maps a
 *  canonical dataset field to the list of CSV-header variants it should
 *  match. Aliases are normalised (lowercase, non-alphanumerics → `_`,
 *  collapsed runs) before comparison so the mapper tolerates spacing,
 *  casing, and punctuation differences in real-world exports. */
export const DATASET_FIELD_ALIASES: Record<DatasetName, Record<string, string[]>> = {
  products: {
    sku: ["sku", "item_code", "item code", "itemcode", "part_number", "part number",
          "partno", "product_code", "product code", "material_number", "article_number",
          "stock_code", "product_id"],
    name: ["name", "description", "product_name", "product name", "item_name",
           "item name", "item_description"],
    type: ["type", "product_type", "item_type", "category"],
    uom: ["uom", "unit", "unit_of_measure", "unitofmeasure", "measure"],
    unit_cost: ["unit_cost", "cost", "standard_cost", "std_cost", "purchase_price"],
    list_price: ["list_price", "list price", "selling_price", "sales_price", "price"],
    lead_time_days: ["lead_time_days", "lead_time", "leadtime", "lt_days", "lt",
                     "lead time", "lead time (days)", "lead_time_(days)"],
    moq: ["moq", "min_order_qty", "minimum_order_qty", "min_order_quantity",
          "min order qty", "minimum order qty"],
    order_multiple: ["order_multiple", "order_mult", "rounding"],
    make_buy: ["make_buy", "makebuy", "make/buy", "source"],
    product_family: ["product_family", "product family", "family", "product_group",
                     "product group"],
    product_line: ["product_line", "product line", "line", "product_range",
                   "product range"],
    abc_class: ["abc_class", "abc", "abc_classification", "abc class"],
    safety_stock: ["safety_stock", "ss", "safety_qty", "buffer_stock"],
    reorder_point: ["reorder_point", "rop", "reorder_level", "min_stock"],
    status: ["status", "product_status", "item_status", "active"],
    shelf_life_days: ["shelf_life_days", "shelf life days", "shelf_life",
                      "shelf life", "expiry_days", "expiry days"],
    drawing_number: ["drawing_number", "drawing number", "dwg_number", "dwg number",
                     "drawing_no", "drawing no", "dwg", "drawing"],
    revision: ["revision", "rev", "bom_revision", "version", "drawing_revision"],
    regulatory_class: ["regulatory_class", "regulatory class", "reg_class", "reg class",
                       "regulatory", "device_class", "risk_class"],
  },
  suppliers: {
    supplier_code: ["supplier_code", "supplier code", "suppliercode", "vendor_code",
                    "vendor code", "vendorcode", "supplier_id", "vendor_id"],
    name: ["name", "supplier_name", "supplier name", "vendor_name", "vendor name",
           "company_name", "company name"],
    country: ["country", "country_code", "nation", "country_of_origin", "country of origin", "coo"],
    lead_time_days: ["lead_time_days", "lead_time", "leadtime", "lt_days"],
    payment_terms: ["payment_terms", "payment terms", "paymentterms", "terms"],
    quality_rating: ["quality_rating", "quality rating", "qualityrating", "quality_score"],
    on_time_pct: ["on_time_pct", "on_time_%", "on_time_delivery", "otd", "otp"],
    status: ["status", "state", "active", "approval_status", "vendor_status"],
    approved_since: ["approved_since", "approved since", "approvedsince", "approved_date"],
    moq: ["moq", "min_order_qty", "minimum_order_qty", "min_order_quantity",
          "min order qty", "minimum order qty"],
    unit_cost: ["unit_cost", "unit cost", "purchase_price", "contract_unit_cost",
                "contract_current_unit_cost", "current_unit_cost", "price"],
    order_multiple: ["order_multiple", "order multiple", "order_mult", "rounding", "multiples"],
    supplier_part_no: ["supplier_part_no", "supplier_part_number", "supplier part number",
                       "supplier part no", "vendor_part_number", "vendor_part_no",
                       "vendor part number", "vendor part no", "mpn",
                       "manufacturer_part_number", "manufacturer part number"],
    valid_to: ["valid_to", "valid to", "validto", "expiry_date", "expiry date",
               "end_date", "end date", "contract_end", "contract_expiry",
               "approved_until", "approved until", "approval_expiry"],
    component_sku: ["component_sku", "component sku", "component_code", "component code",
                    "part_number", "part_no", "part number", "partno",
                    "item_number", "item_no", "item number",
                    "component_part_number", "component part number",
                    "child_sku", "child_part_number", "child part number",
                    "material_code", "rm_sku"],
    component_name: ["component_name", "component name", "part_name", "part name",
                     "component_description", "component description",
                     "item_description", "item description", "part_description",
                     "material_name", "child_name"],
    fg_sku: ["fg_sku", "fg sku", "fgsku", "fg_code", "fg code",
             "finished_good_sku", "finished good sku",
             "parent_sku", "parent sku", "assembly_sku", "assembly sku",
             "parent_part_number", "parent part number",
             "top_level_sku", "top_level_part"],
    fg_name: ["fg_name", "fg name", "fgname",
              "finished_good_name", "finished good name",
              "parent_name", "parent name", "assembly_name", "assembly name",
              "parent_description"],
    approved_sub: ["approved_sub", "approved sub", "approved_substitute",
                   "approved substitute", "approved_alternative",
                   "approved alternative", "substitute", "alternative_part"],
  },
  customers: {
    customer_code: ["customer_code", "customer code", "customercode", "client_code",
                    "account_number", "cust_id"],
    name: ["name", "customer_name", "customer name", "client_name", "company_name"],
    country: ["country", "country_code"],
    currency: ["currency", "ccy"],
    credit_limit: ["credit_limit", "credit limit", "creditlimit"],
    type: ["type", "customer_type", "segment"],
    status: ["status", "active"],
  },
  locations: {
    location_code: ["location_code", "location code", "locationcode", "loc_code",
                    "warehouse_code", "site_code", "wh_code"],
    name: ["name", "location_name", "location name", "warehouse_name", "site_name"],
    type: ["type", "location_type", "warehouse_type"],
  },
  inventory: {
    sku: ["sku", "item_code", "item code", "part_number", "product_code", "stock_code"],
    location_code: ["location_code", "location code", "loc_code", "warehouse_code",
                    "wh_code", "location_id", "warehouse"],
    quantity: ["quantity", "qty", "on_hand", "on hand", "onhand", "stock",
               "qty_on_hand", "qty on hand", "qoh", "soh", "stock_on_hand",
               "available_qty", "available qty"],
    reorder_point: ["reorder_point", "rop", "reorder_level", "reorder point",
                    "min_stock", "reorder"],
    safety_stock: ["safety_stock", "ss", "safety_qty", "buffer_stock", "safety stock"],
    unit_cost: ["unit_cost", "cost", "standard_cost", "unitcost"],
    total_value: ["total_value", "total value", "stock_value", "inventory_value"],
    uom: ["uom", "unit", "unit_of_measure"],
    lead_time_days: ["lead_time_days", "lead_time", "leadtime", "lt_days"],
    moq: ["moq", "min_order_qty", "minimum_order_qty"],
    order_multiple: ["order_multiple", "order_mult"],
    on_hold_qty: ["on_hold_qty", "on_hold", "on hold", "qc_qty", "hold_qty",
                  "on_hold_qc", "qa_hold"],
    reserved_qty: ["reserved_qty", "reserved", "allocated_qty", "allocated"],
    open_po_qty: ["open_po_qty", "open_po", "on_order_qty", "on_order",
                  "po_qty", "pending_receipts"],
    days_of_supply: ["days_of_supply", "dos", "days_supply", "days of supply",
                     "stock_days", "coverage_days"],
    demand_per_day: ["demand_per_day", "daily_demand", "avg_daily_demand",
                     "avg_demand", "demand per day"],
    buy_recommendation: ["buy_recommendation", "buy_rec", "reorder_flag", "order_flag"],
    recommended_qty: ["recommended_qty", "rec_qty", "order_qty", "reorder_qty"],
    last_receipt_date: ["last_receipt_date", "last_receipt", "last_received",
                        "last_delivery_date"],
  },
  purchase_orders: {
    po_number: ["po_number", "po number", "ponumber", "po_header_number",
                "po header number", "po#", "purchase_order_number", "order_number",
                "po_no", "po_num"],
    supplier_code: ["supplier_code", "supplier_id", "vendor_code", "vendor_id",
                    "supplier code", "vendor code"],
    supplier_name: ["supplier_name", "vendor_name", "supplier name", "vendor name"],
    sku: ["sku", "item_code", "item code", "part_number", "material_code",
          "product_code", "component_sku"],
    item_name: ["item_name", "item_description", "description", "product_name",
                "component_name"],
    line_number: ["line_number", "line_no", "po_line_number", "po line number",
                  "line#", "seq", "sequence", "line"],
    qty_ordered: ["qty_ordered", "quantity_ordered", "ordered_qty", "qty ordered",
                  "quantity", "qty"],
    qty_received: ["qty_received", "received_qty", "quantity_received", "received"],
    qty_open: ["qty_open", "open_qty", "outstanding_qty", "balance_qty",
               "remaining_qty", "open qty"],
    unit_cost: ["unit_cost", "unit_price", "price", "cost", "purchase_price"],
    line_value: ["line_value", "total_value", "extended_value", "line_total",
                 "total_ordered_value", "amount"],
    currency: ["currency", "ccy"],
    status: ["status", "line_status", "po_status", "state"],
    order_date: ["order_date", "po_date", "order date", "purchase_date", "created_date"],
    expected_date: ["expected_date", "delivery_date", "requested_date",
                    "requested_delivery_date", "due_date", "eta"],
    confirmed_eta: ["confirmed_eta", "confirmed_delivery", "committed_date",
                    "supplier_eta", "confirmed eta"],
    uom: ["uom", "unit", "unit_of_measure"],
    buyer: ["buyer", "buyer_id", "purchaser", "purchasing_agent"],
    notes: ["notes", "comments", "remarks"],
  },
  sales_orders: {
    so_number: ["so_number", "so number", "sonumber", "sales_order_number",
                "order_number", "so#", "so_no"],
    customer_code: ["customer_code", "customer_id", "client_code", "account_number",
                    "customer code"],
    customer_name: ["customer_name", "client_name", "customer name"],
    sku: ["sku", "item_code", "product_code", "part_number", "material_code"],
    item_name: ["item_name", "description", "product_name", "item_description"],
    line_number: ["line_number", "line_no", "so_line_number", "line#"],
    qty_ordered: ["qty_ordered", "ordered_qty", "quantity_ordered", "qty", "quantity"],
    qty_shipped: ["qty_shipped", "shipped_qty", "delivered_qty", "fulfilled_qty"],
    qty_open: ["qty_open", "open_qty", "outstanding_qty", "balance_qty"],
    unit_price: ["unit_price", "price", "selling_price", "sales_price"],
    line_value: ["line_value", "line_total", "total_value", "amount", "extended_price"],
    currency: ["currency", "ccy"],
    status: ["status", "order_status", "line_status"],
    order_date: ["order_date", "so_date", "order date", "sales_date"],
    requested_date: ["requested_date", "required_date", "due_date", "delivery_date",
                     "customer_required_date"],
    uom: ["uom", "unit", "unit_of_measure"],
    notes: ["notes", "comments", "remarks"],
  },
  bom: {
    // fg_sku is the finished-good SKU (e.g. "DF-02") the BOM produces.
    // Previously carried bom_id / bomid aliases, which pulled values
    // like "BOM-DF-02-A" into fg_sku. Those aliases now belong to the
    // separate bom_id field below. The remaining aliases cover the
    // FG-SKU column variants we see in real exports.
    fg_sku: ["fg_sku", "fgsku", "finished_good_sku", "finished good sku",
             "parent_sku", "assembly_sku", "fg_code", "parent_code",
             "bom_parent_sku", "assembly_code",
             "parent_part_number", "parent_part_no", "parent part number",
             "parent_item_number", "parent_item_no", "parent item number",
             "parent part", "parent item", "parent",
             "assembly_part_number", "assembly part number",
             "fg_part_number", "fg part number", "top_level_sku", "top_level_part"],
    fg_name: ["fg_name", "finished_good_name", "parent_name", "assembly_name",
              "product_name", "fg name", "parent_description", "assembly_description"],
    component_sku: ["component_sku", "component_id", "child_sku", "part_sku",
                    "rm_sku", "material_code", "component sku", "component code",
                    "ingredient_sku",
                    "part_number", "part_no", "part number", "partno",
                    "item_number", "item_no", "item number", "itemno",
                    "component_part_number", "component part number",
                    "child_part_number", "child part number",
                    "component_code", "component code"],
    component_name: ["component_name", "component_description", "part_name",
                     "material_name", "ingredient_name", "child_name",
                     "part_description", "item_description", "component description"],
    qty_per: ["qty_per", "quantity_per", "qtyper", "usage_qty", "qty",
              "quantity", "qty_each"],
    uom: ["uom", "unit", "unit_of_measure"],
    section: ["section", "group", "category", "assembly_section", "bom_section"],
    make_buy: ["make_buy", "make/buy", "makebuy", "source"],
    is_critical: ["is_critical", "critical", "isCritical"],
    component_cost: ["component_cost", "cost", "part_cost"],
    extended_cost: ["extended_cost", "extended cost", "total_cost", "line_cost"],
    revision: ["revision", "bom_revision", "rev", "version"],
    // Header-level BOM identifier. Kept separate from fg_sku so files
    // that carry both columns don't collapse onto fg_sku.
    bom_id: ["bom_id", "bomid", "bom id", "bom_code", "bom_number",
             "bom_header_id", "bom header id"],
    // Sourcing / AVL field aliases
    supplier_name: ["supplier_name", "supplier name", "vendor_name", "vendor name",
                    "manufacturer", "mfr"],
    supplier_part_no: ["supplier_part_no", "supplier_part_number", "supplier part number",
                       "vendor_part_no", "vendor part number", "vendor_part_number",
                       "mfr_part_number", "mpn", "part_number", "manufacturer_part_number"],
    status: ["status", "approval_status", "approved_status", "component_status",
             "vendor_status", "avl_status"],
    lead_time_days: ["lead_time_days", "lead_time", "lead time", "lead time (days)",
                     "leadtime", "lt_days", "lt"],
    moq: ["moq", "min_order_qty", "minimum_order_quantity", "minimum order quantity",
          "min order qty", "min_qty"],
    order_multiple: ["order_multiple", "order multiple", "order_mult", "rounding", "multiples"],
    unit_cost: ["unit_cost", "unit cost", "purchase_price", "contract_unit_cost",
                "contract_current_unit_cost", "contract/current unit cost",
                "current_unit_cost", "standard_cost"],
    valid_from: ["valid_from", "valid from", "effective_from", "start_date",
                 "valid_date_from", "contract_start"],
    valid_to: ["valid_to", "valid to", "expiry_date", "end_date",
               "valid_date_to", "contract_end", "contract_expiry"],
    approved_sub: ["approved_sub", "approved_substitute", "approved substitute",
                   "substitute", "alternate_part", "alt_part", "alternate"],
    country_of_origin: ["country_of_origin", "country of origin", "origin", "coo",
                        "made_in", "country", "mfr_country"],
  },
};
