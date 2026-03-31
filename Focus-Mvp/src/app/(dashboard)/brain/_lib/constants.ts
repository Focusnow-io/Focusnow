export const CATEGORIES = ["THRESHOLD", "POLICY", "CONSTRAINT", "KPI"];
export const ENTITIES = ["InventoryItem", "Product", "Supplier", "Order"];

export const OPERATORS = [
  { value: "lt", label: "is less than (<)" },
  { value: "lte", label: "is less than or equal (\u2264)" },
  { value: "gt", label: "is greater than (>)" },
  { value: "gte", label: "is greater than or equal (\u2265)" },
  { value: "eq", label: "equals (=)" },
  { value: "neq", label: "does not equal (\u2260)" },
];

export const OPERATOR_LABELS: Record<string, string> = {
  lt: "is less than",
  lte: "is less than or equal to",
  gt: "is greater than",
  gte: "is greater than or equal to",
  eq: "equals",
  neq: "does not equal",
};

export const ENTITY_FIELDS: Record<string, string[]> = {
  InventoryItem: [
    "quantity",
    "reservedQty",
    "reorderPoint",
    "reorderQty",
    "daysOfSupply",
    "leadTimeDays",
    "unitCost",
    "qtyOnHand",
    "qtyAvailable",
    "outflow30d",
  ],
  Product: ["unitCost", "leadTimeDays", "reorderPoint", "safetyStock", "shelfLifeDays"],
  Supplier: ["leadTimeDays", "qualityRating", "onTimePct", "country", "status", "paymentTerms", "certifications", "city", "active"],
  Order: ["totalAmount"],
};
