const ENTITY_EXAMPLE_PROMPTS: Record<string, string[]> = {
  InventoryItem: [
    "Stock should not fall below reorder point for any SKU",
    "Days of supply should not drop below 14 days for any item",
    "On-hand quantity should not fall below 50 units",
  ],
  Product: [
    "Product lead time should not exceed 30 days",
    "Safety stock should not be below reorder point",
  ],
  Supplier: [
    "Supplier lead time should not exceed 30 days",
    "Supplier on-time delivery should be at least 90%",
    "Supplier quality rating should be at least 3",
  ],
  Order: [
    "Order total should not exceed $10,000",
    "Orders should not exceed their expected delivery date",
  ],
};

const DEFAULT_PROMPTS = [
  "Stock should not fall below reorder point for any SKU",
  "Supplier lead time should not exceed 30 days",
  "Days of supply should not drop below 14 days for any item",
  "On-hand quantity should not fall below 50 units",
];

export function getRelevantPrompts(entities: string[]): string[] {
  if (entities.length === 0) return DEFAULT_PROMPTS;

  const prompts: string[] = [];
  let idx = 0;
  while (prompts.length < 4 && idx < entities.length * 3) {
    const entity = entities[idx % entities.length];
    const entityPrompts = ENTITY_EXAMPLE_PROMPTS[entity] ?? [];
    const pick = entityPrompts[Math.floor(idx / entities.length)];
    if (pick && !prompts.includes(pick)) prompts.push(pick);
    idx++;
  }
  return prompts.length > 0 ? prompts : DEFAULT_PROMPTS;
}
