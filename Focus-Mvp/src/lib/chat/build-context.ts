import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// In-memory context cache — 5-minute TTL, keyed by orgId
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;

const contextCache = new Map<
  string,
  { context: string; builtAt: number; tokenEstimate: number }
>();

export function invalidateOrgContextCache(orgId: string) {
  contextCache.delete(orgId);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function buildOrgContext(orgId: string): Promise<string> {
  const cached = contextCache.get(orgId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    console.log(
      `[CHAT] context cache HIT for org=${orgId} (${cached.tokenEstimate} est. tokens)`
    );
    return cached.context;
  }

  const context = await buildContextInternal(orgId);
  const tokenEstimate = Math.ceil(context.length / 4);
  console.log(
    `[CHAT] context cache MISS for org=${orgId} — built ${tokenEstimate} est. tokens (${context.length} chars)`
  );

  contextCache.set(orgId, { context, builtAt: Date.now(), tokenEstimate });
  return context;
}

export function getContextTokenEstimate(orgId: string): number {
  const cached = contextCache.get(orgId);
  return cached ? cached.tokenEstimate : 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dec = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// ---------------------------------------------------------------------------
// Lightweight context builder — counts + KPIs + schema only
// Uses ~2-3K tokens instead of ~60K. Detailed data is fetched via tools.
// ---------------------------------------------------------------------------

async function buildContextInternal(orgId: string): Promise<string> {
  const sections: string[] = [];

  // ── Entity counts ────────────────────────────────────────────────────────

  let productCount = 0, inventoryCount = 0, supplierCount = 0, customerCount = 0;
  let poCount = 0, soCount = 0, woCount = 0, locationCount = 0;
  let ncrCount = 0, capaCount = 0;
  let skuList: string[] = [];

  try {
    [
      productCount,
      inventoryCount,
      supplierCount,
      customerCount,
      poCount,
      soCount,
      woCount,
      locationCount,
    ] = await Promise.all([
      prisma.product.count({ where: { organizationId: orgId } }),
      prisma.inventoryItem.count({ where: { organizationId: orgId } }),
      prisma.supplier.count({ where: { organizationId: orgId } }),
      prisma.customer.count({ where: { orgId } }),
      prisma.purchaseOrder.count({ where: { orgId } }),
      prisma.salesOrder.count({ where: { orgId } }),
      prisma.workOrder.count({ where: { organizationId: orgId } }),
      prisma.location.count({ where: { organizationId: orgId } }),
    ]);

    const orgSkus = await prisma.product.findMany({
      where: { organizationId: orgId },
      select: { sku: true },
    });
    skuList = orgSkus.map((p) => p.sku);

    [ncrCount, capaCount] = await Promise.all([
      skuList.length > 0
        ? prisma.ncr.count({ where: { sku: { in: skuList } } })
        : Promise.resolve(0),
      prisma.capa.count(),
    ]);
  } catch (err) {
    console.error("[CHAT] context builder: entity counts failed:", err);
  }

  sections.push(`## Data Summary
- Products: ${productCount}
- Inventory items: ${inventoryCount}
- Suppliers: ${supplierCount}
- Customers: ${customerCount}
- Purchase orders: ${poCount}
- Sales orders: ${soCount}
- Work orders: ${woCount}
- Locations: ${locationCount}
- NCRs: ${ncrCount}
- CAPAs: ${capaCount}
`);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const inventoryWithCost = await prisma.inventoryItem.findMany({
      where: { organizationId: orgId },
      select: { quantity: true, unitCost: true, product: { select: { unitCost: true } } },
    });
    const totalInventoryValue = inventoryWithCost.reduce(
      // Prefer item-level unitCost (set during inventory import); fall back to product-level
      (sum, i) => sum + dec(i.quantity) * dec(i.unitCost ?? i.product.unitCost),
      0
    );

    const openPOs = await prisma.purchaseOrder.findMany({
      where: { orgId, status: { in: ["DRAFT", "SENT", "CONFIRMED", "PARTIAL"] } },
      select: { poNumber: true, totalAmount: true, confirmedETA: true },
    });
    const openPOValue = openPOs.reduce((sum, po) => sum + dec(po.totalAmount), 0);
    const overduePOs = openPOs.filter(
      (po) => po.confirmedETA && po.confirmedETA < today
    );

    const openSOs = await prisma.salesOrder.findMany({
      where: { orgId, status: { in: ["DRAFT", "CONFIRMED", "IN_PRODUCTION"] } },
      select: { totalAmount: true },
    });
    const openSOValue = openSOs.reduce((sum, so) => sum + dec(so.totalAmount), 0);

    const stockOuts = await prisma.inventoryItem.count({
      where: {
        organizationId: orgId,
        quantity: 0,
        product: { makeBuy: "BUY" },
      },
    });

    let ncrBySeverity = "";
    if (skuList.length > 0) {
      const openNcrAll = await prisma.ncr.findMany({
        where: { sku: { in: skuList }, status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { severity: true },
      });
      const severityCounts: Record<string, number> = {};
      for (const n of openNcrAll) {
        const sev = n.severity ?? "UNSPECIFIED";
        severityCounts[sev] = (severityCounts[sev] ?? 0) + 1;
      }
      ncrBySeverity = Object.entries(severityCounts)
        .map(([sev, count]) => `${sev}: ${count}`)
        .join(", ");
    }

    sections.push(`## KPIs
- Total inventory value: $${totalInventoryValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
- Open PO value: $${openPOValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
- Open SO value: $${openSOValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
- Overdue POs: ${overduePOs.length}${overduePOs.length > 0 ? ` — ${overduePOs.map((p) => p.poNumber).join(", ")}` : ""}
- Stock-outs: ${stockOuts}
- Open NCRs by severity: ${ncrBySeverity || "none"}
`);
  } catch (err) {
    console.error("[CHAT] context builder: KPIs failed:", err);
    sections.push("## KPIs\n(unavailable)\n");
  }

  // ── Schema reference ──────────────────────────────────────────────────────
  // Tell Claude what fields exist so it can form correct tool queries.

  sections.push(`## Available Tables & Key Fields (use tools to query)

IMPORTANT: For inventory stock levels, ALWAYS use the "quantity" field (current stock). Do NOT use qtyOnHand/qtyAllocated/qtyAvailable — those fields are empty. For work orders, use "plannedQty" and "actualQty" — NOT qtyPlanned/qtyProduced. For inventory VALUE calculations, use inventory.unitCost (set during import) multiplied by quantity — do NOT use product.unitCost which may be empty for auto-created product stubs.

- **product**: sku, name, type, category, unitCost, makeBuy, active, unit, productFamily, abcClass, productLine, shelfLifeDays, listPrice
- **inventory** (model: inventoryItem): productId, locationId, quantity (current stock — USE THIS), reservedQty, reorderPoint, reorderQty, uom, unitCost, daysOfSupply, demandPerDay, demandCurrentMonth, demandNextMonth, demandMonth3, qtyOnHold, totalValue, moq, orderMultiple, leadTimeDays
- **supplier**: code, name, country, city, leadTimeDays, active, status, qualityRating, onTimePct, certifications, paymentTerms, currency
- **customer**: code, name, country, currency, isActive, type, city, vatNumber
- **purchase_order**: poNumber, supplierId, status (DRAFT/SENT/CONFIRMED/PARTIAL/RECEIVED/CLOSED/CANCELLED), totalAmount, currency, expectedDate, confirmedETA, orderDate, poType
- **po_line**: purchaseOrderId, productId, qtyOrdered, qtyReceived, qtyOpen, unitCost
- **sales_order**: soNumber, customerId, status (DRAFT/CONFIRMED/IN_PRODUCTION/SHIPPED/DELIVERED/CANCELLED), totalAmount, currency, requestedDate, orderDate, paymentTerms
- **so_line**: salesOrderId, productId, qtyOrdered, qtyShipped, unitPrice
- **work_order**: woNumber/orderNumber, sku, productId, status (PLANNED/RELEASED/IN_PROGRESS/COMPLETED/CANCELLED), plannedQty (planned quantity — USE THIS), actualQty (produced quantity — USE THIS), unit, workCenter, productionLine, yieldPct, scheduledDate, dueDate
- **location**: name, code, type, city, countryCode
- **bom_header**: productId, version, isActive, totalComponents, totalBomCost, yieldPct
- **bom_line**: bomHeaderId, componentId, qty, uom, section, extendedCost
- **lot**: lotNumber, productId, status, lotType, originType, qtyCreated, qtyOnHand, expiryDate, manufacturedDate
- **ncr**: ncrId, type, sku, severity, status, description, dateRaised
- **capa**: capaId, type, title, status, priority, source, sourceReference, dateOpened, targetCloseDate
- **equipment**: code, name, type, status, locationId, installationDate, maintenanceIntervalDays, calibrationDue
- **serial_number**: serialNumber, sku, lotNumber, status
- **shipment**: shipmentNumber, type, status, carrier

### Grouping components by finished good (FG)
To group or roll up components by their parent finished good, join through BOM tables:
1. Query **bom_line** to find which bomHeaderId each component (componentId) belongs to.
2. Query **bom_header** to get the parent productId (the finished good) for each bomHeaderId.
3. Then query **product** for the FG SKU/name.
Alternatively, the **product.productFamily** field may already contain the FG grouping label.

### Raw SQL column names (for rawWhere in aggregate_records)
When using rawWhere for cross-column comparisons, column names must be double-quoted camelCase matching Prisma field names exactly:
- InventoryItem: "quantity", "reorderPoint", "daysOfSupply", "demandPerDay", "qtyOnHold", "reservedQty", "unitCost", "totalValue"
- Product: "sku", "name", "unitCost"
- Common patterns: \`"quantity" < "reorderPoint"\` (below ROP), \`"daysOfSupply" <= 10\` (low supply)
`);

  // ── Brain Rules ──────────────────────────────────────────────────────────
  // Include active rules so the AI can reference the user's operational logic.

  try {
    const activeRules = await prisma.brainRule.findMany({
      where: { organizationId: orgId, status: "ACTIVE" },
      select: {
        name: true,
        category: true,
        entity: true,
        description: true,
        condition: true,
      },
      take: 20,
    });

    if (activeRules.length > 0) {
      const ruleLines = activeRules.map((r) => {
        const cond = r.condition as Record<string, unknown>;
        return `- **${r.name}** (${r.category}, on ${r.entity}): ${r.description ?? ""} — Condition: ${cond.field} ${cond.operator} ${cond.value}`;
      });
      sections.push(`## Active Brain Rules
These are the user's operational rules. Use them to provide grounded, specific answers.
${ruleLines.join("\n")}
`);
    }
  } catch (err) {
    console.error("[CHAT] context builder: brain rules failed:", err);
  }

  return sections.join("\n");
}
