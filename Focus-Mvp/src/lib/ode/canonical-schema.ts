/**
 * ODE — Canonical operational schema.
 *
 * Every source system speaks its own language (ERP field names, WMS codes,
 * spreadsheet headers). The canonical schema is the single normalised
 * vocabulary the ODE understands. Connectors are responsible for mapping their
 * data *into* this schema before it is persisted.
 *
 * Key design principles:
 *  - Schema is additive: unknown fields land in `metadata` (never dropped).
 *  - Every entity has an `externalId` so the originating system record can
 *    always be traced.
 *  - Relationships are *inferred* from the data by the graph builder; sources
 *    do not need to provide them explicitly.
 */

import type { CanonicalField, OdeEntityType } from "./types";

// ---------------------------------------------------------------------------
// Field catalogue
// ---------------------------------------------------------------------------

export const CANONICAL_SCHEMA: Record<OdeEntityType, CanonicalField[]> = {
  PRODUCT: [
    {
      field: "sku",
      label: "SKU / Product Code",
      type: "string",
      required: true,
      aliases: ["sku", "productcode", "itemcode", "partno", "partnumber", "item_code", "product_id"],
    },
    {
      field: "name",
      label: "Product Name",
      type: "string",
      required: true,
      aliases: ["name", "productname", "itemname", "item_name", "product_name", "description", "title"],
    },
    {
      field: "description",
      label: "Description",
      type: "string",
      required: false,
      aliases: ["description", "details", "notes", "product_description"],
    },
    {
      field: "category",
      label: "Category",
      type: "string",
      required: false,
      aliases: ["category", "productcategory", "product_category", "type", "class", "group"],
    },
    {
      field: "unit",
      label: "Unit of Measure",
      type: "string",
      required: false,
      aliases: ["unit", "uom", "unitofmeasure", "unit_of_measure", "measure"],
    },
    {
      field: "unitCost",
      label: "Unit Cost",
      type: "number",
      required: false,
      aliases: ["unitcost", "unit_cost", "cost", "price", "stdcost", "standard_cost"],
    },
    {
      field: "externalId",
      label: "External ID",
      type: "string",
      required: false,
      aliases: ["externalid", "external_id", "erp_id", "system_id", "source_id"],
    },
  ],

  SUPPLIER: [
    {
      field: "code",
      label: "Supplier Code",
      type: "string",
      required: true,
      aliases: ["code", "suppliercode", "supplier_code", "vendorcode", "vendor_code", "vendor_id"],
    },
    {
      field: "name",
      label: "Supplier Name",
      type: "string",
      required: true,
      aliases: ["name", "suppliername", "supplier_name", "vendorname", "vendor_name", "company"],
    },
    {
      field: "email",
      label: "Email",
      type: "string",
      required: false,
      aliases: ["email", "emailaddress", "email_address", "contact_email"],
    },
    {
      field: "phone",
      label: "Phone",
      type: "string",
      required: false,
      aliases: ["phone", "telephone", "phonenumber", "phone_number", "contact_phone"],
    },
    {
      field: "country",
      label: "Country",
      type: "string",
      required: false,
      aliases: ["country", "countrycode", "country_code", "nation"],
    },
    {
      field: "leadTimeDays",
      label: "Lead Time (Days)",
      type: "number",
      required: false,
      aliases: ["leadtime", "leadtimedays", "lead_time", "lead_time_days", "lt_days"],
    },
    {
      field: "paymentTerms",
      label: "Payment Terms",
      type: "string",
      required: false,
      aliases: ["paymentterms", "payment_terms", "terms", "payment_conditions"],
    },
    {
      field: "externalId",
      label: "External ID",
      type: "string",
      required: false,
      aliases: ["externalid", "external_id", "erp_id", "system_id", "source_id"],
    },
  ],

  LOCATION: [
    {
      field: "code",
      label: "Location Code",
      type: "string",
      required: true,
      aliases: ["code", "locationcode", "location_code", "warehouse", "bin", "site_code"],
    },
    {
      field: "name",
      label: "Location Name",
      type: "string",
      required: true,
      aliases: ["name", "locationname", "location_name", "site", "warehouse_name"],
    },
    {
      field: "type",
      label: "Location Type",
      type: "string",
      required: false,
      aliases: ["type", "locationtype", "location_type", "zone", "area_type"],
    },
    {
      field: "parentCode",
      label: "Parent Location Code",
      type: "string",
      required: false,
      aliases: ["parentcode", "parent_code", "parent_location", "zone_code", "area_code"],
    },
    {
      field: "externalId",
      label: "External ID",
      type: "string",
      required: false,
      aliases: ["externalid", "external_id", "erp_id", "wms_id"],
    },
  ],

  INVENTORY_ITEM: [
    {
      field: "sku",
      label: "SKU / Product Code",
      type: "string",
      required: true,
      aliases: ["sku", "productcode", "itemcode", "partno", "product_code"],
    },
    {
      field: "quantity",
      label: "Quantity on Hand",
      type: "number",
      required: true,
      aliases: ["quantity", "qty", "qtyonhand", "qty_on_hand", "on_hand", "stock", "balance", "available"],
    },
    {
      field: "locationCode",
      label: "Location Code",
      type: "string",
      required: false,
      aliases: ["locationcode", "location_code", "warehouse", "bin", "storage_location"],
    },
    {
      field: "reservedQty",
      label: "Reserved Quantity",
      type: "number",
      required: false,
      aliases: ["reservedqty", "reserved_qty", "reserved", "allocated", "committed"],
    },
    {
      field: "reorderPoint",
      label: "Reorder Point",
      type: "number",
      required: false,
      aliases: ["reorderpoint", "reorder_point", "rop", "min_stock", "min_qty"],
    },
    {
      field: "reorderQty",
      label: "Reorder Quantity",
      type: "number",
      required: false,
      aliases: ["reorderqty", "reorder_qty", "eoq", "order_qty", "replenishment_qty"],
    },
  ],

  ORDER: [
    {
      field: "orderNumber",
      label: "Order Number",
      type: "string",
      required: true,
      aliases: ["ordernumber", "order_number", "orderno", "order_no", "ponumber", "po_number", "so_number"],
    },
    {
      field: "type",
      label: "Order Type (PURCHASE/SALES/TRANSFER)",
      type: "string",
      required: false,
      aliases: ["type", "ordertype", "order_type", "doc_type"],
    },
    {
      field: "supplierCode",
      label: "Supplier Code",
      type: "string",
      required: false,
      aliases: ["suppliercode", "supplier_code", "vendorcode", "vendor_code"],
    },
    {
      field: "status",
      label: "Status",
      type: "string",
      required: false,
      aliases: ["status", "orderstatus", "order_status", "state"],
    },
    {
      field: "orderDate",
      label: "Order Date",
      type: "date",
      required: false,
      aliases: ["orderdate", "order_date", "po_date", "document_date"],
    },
    {
      field: "expectedDate",
      label: "Expected Delivery Date",
      type: "date",
      required: false,
      aliases: ["expecteddate", "expected_date", "delivery_date", "due_date", "eta"],
    },
    {
      field: "totalAmount",
      label: "Total Amount",
      type: "number",
      required: false,
      aliases: ["totalamount", "total_amount", "total", "order_value", "po_value"],
    },
    {
      field: "currency",
      label: "Currency",
      type: "string",
      required: false,
      aliases: ["currency", "currency_code", "ccy"],
    },
    {
      field: "externalId",
      label: "External ID",
      type: "string",
      required: false,
      aliases: ["externalid", "external_id", "erp_id"],
    },
  ],

  ORDER_LINE: [
    {
      field: "orderNumber",
      label: "Order Number",
      type: "string",
      required: true,
      aliases: ["ordernumber", "order_number", "orderno"],
    },
    {
      field: "sku",
      label: "SKU / Product Code",
      type: "string",
      required: true,
      aliases: ["sku", "productcode", "itemcode"],
    },
    {
      field: "quantity",
      label: "Quantity",
      type: "number",
      required: true,
      aliases: ["quantity", "qty", "ordered_qty"],
    },
    {
      field: "unitPrice",
      label: "Unit Price",
      type: "number",
      required: false,
      aliases: ["unitprice", "unit_price", "price"],
    },
    {
      field: "totalPrice",
      label: "Total Price",
      type: "number",
      required: false,
      aliases: ["totalprice", "total_price", "line_total", "line_value"],
    },
  ],
};

// ---------------------------------------------------------------------------
// Header → canonical field auto-mapper
// ---------------------------------------------------------------------------

const _normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Suggest a mapping from raw source headers to canonical fields for a given
 * entity type.  Returns a map of { canonicalField → sourceHeader }.
 */
export function suggestCanonicalMapping(
  headers: string[],
  entityType: OdeEntityType
): Record<string, string> {
  const fields = CANONICAL_SCHEMA[entityType] ?? [];
  const mapping: Record<string, string> = {};

  for (const { field, aliases = [] } of fields) {
    const candidates = [_normalize(field), ...aliases.map(_normalize)];
    const match = headers.find((h) => candidates.includes(_normalize(h)));
    if (match) mapping[field] = match;
  }

  return mapping;
}

/**
 * Apply a field mapping to a raw row, returning a canonical record payload.
 * Unknown source fields that are not covered by the mapping are collected into
 * `metadata` so no data is lost.
 */
export function applyCanonicalMapping(
  row: Record<string, string>,
  mapping: Record<string, string>
): { canonical: Record<string, string>; metadata: Record<string, string> } {
  const canonical: Record<string, string> = {};
  const mappedSourceKeys = new Set(Object.values(mapping));

  for (const [canonicalKey, sourceKey] of Object.entries(mapping)) {
    if (sourceKey && row[sourceKey] !== undefined) {
      canonical[canonicalKey] = row[sourceKey];
    }
  }

  // Preserve unmapped source fields in metadata
  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!mappedSourceKeys.has(key)) {
      metadata[key] = value;
    }
  }

  return { canonical, metadata };
}

/**
 * Validate a canonical record against the required fields for its entity type.
 * Returns an array of validation error messages (empty = valid).
 */
export function validateCanonical(
  record: Record<string, unknown>,
  entityType: OdeEntityType
): string[] {
  const fields = CANONICAL_SCHEMA[entityType] ?? [];
  const errors: string[] = [];

  for (const { field, label, required } of fields) {
    if (required) {
      const value = record[field];
      if (value === undefined || value === null || value === "") {
        errors.push(`Required field "${label}" (${field}) is missing or empty`);
      }
    }
  }

  return errors;
}
