import { prisma } from "@/lib/prisma";
import type Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Entity → Prisma model mapping
// ---------------------------------------------------------------------------

interface EntityConfig {
  model: string;
  /** Column on this model that stores orgId. Null for child tables whose org
   *  scope is resolved via a parent relation (see `orgParent`). */
  orgField: "organizationId" | "orgId" | null;
  /** For child tables (PO/SO/BOM lines) org scope is applied through the
   *  parent via a nested Prisma relation filter. rawWhere queries use the
   *  `foreignKey → parentTable` pair to build a subquery. */
  orgParent?: {
    relation: string;
    foreignKey: string;
    parentTable: string;
    parentOrgField: "orgId" | "organizationId";
  };
  displayName: string;
}

const ENTITY_MAP: Record<string, EntityConfig> = {
  product:         { model: "product",         orgField: "organizationId", displayName: "Product" },
  inventory:       { model: "inventoryItem",   orgField: "organizationId", displayName: "Inventory" },
  supplier:        { model: "supplier",        orgField: "organizationId", displayName: "Supplier" },
  customer:        { model: "customer",        orgField: "orgId",          displayName: "Customer" },
  purchase_order:  { model: "purchaseOrder",   orgField: "orgId",          displayName: "Purchase Order" },
  po_line:         { model: "pOLine",          orgField: null, displayName: "PO Line",
                    orgParent: { relation: "purchaseOrder", foreignKey: "purchaseOrderId", parentTable: "PurchaseOrder", parentOrgField: "orgId" } },
  sales_order:     { model: "salesOrder",      orgField: "orgId",          displayName: "Sales Order" },
  so_line:         { model: "sOLine",          orgField: null, displayName: "SO Line",
                    orgParent: { relation: "salesOrder", foreignKey: "salesOrderId", parentTable: "SalesOrder", parentOrgField: "orgId" } },
  work_order:      { model: "workOrder",       orgField: "organizationId", displayName: "Work Order" },
  location:        { model: "location",        orgField: "organizationId", displayName: "Location" },
  bom_header:      { model: "bOMHeader",       orgField: "orgId",          displayName: "BOM Header" },
  bom_line:        { model: "bOMLine",         orgField: null, displayName: "BOM Line",
                    orgParent: { relation: "bomHeader", foreignKey: "bomHeaderId", parentTable: "BOMHeader", parentOrgField: "orgId" } },
  lot:             { model: "lot",             orgField: "orgId",          displayName: "Lot" },
  equipment:       { model: "equipment",       orgField: "orgId",          displayName: "Equipment" },
  order:           { model: "order",           orgField: "organizationId", displayName: "Order (legacy)" },
  work_center:     { model: "workCenter",      orgField: "organizationId", displayName: "Work Center" },
  ncr:             { model: "ncr",             orgField: null,             displayName: "NCR" },
  capa:            { model: "capa",            orgField: null,             displayName: "CAPA" },
  serial_number:   { model: "serialNumber",    orgField: null,             displayName: "Serial Number" },
  shipment:        { model: "shipment",        orgField: null,             displayName: "Shipment" },
};

/** Build the org-scope predicate for a rawWhere SQL query. For top-level
 *  entities this is `"orgId" = $1`; for child tables it is a subquery against
 *  the parent. Uses $1 — the caller must pass orgId as the first parameter. */
function buildRawOrgClause(config: EntityConfig): string | null {
  if (config.orgField) {
    return `"${config.orgField}" = $1`;
  }
  if (config.orgParent) {
    const { foreignKey, parentTable, parentOrgField } = config.orgParent;
    return `"${foreignKey}" IN (SELECT id FROM "${parentTable}" WHERE "${parentOrgField}" = $1)`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tool definitions for the Anthropic API
// ---------------------------------------------------------------------------

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: "query_records",
    description:
      "Query records from a canonical data table. Returns matching rows as JSON. Use this to look up specific records, search by filters, or get lists of entities. Supports Prisma-style nested filters and optional relation includes. NOTE: Results are capped at 100 rows. The response includes totalCount (true count matching filters) and returnedCount (rows actually returned). For counting or totaling, use aggregate_records instead — it returns exact counts without row limits.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description: `Table name: ${Object.keys(ENTITY_MAP).join(", ")}`,
        },
        filters: {
          type: "object",
          description:
            'Prisma-style where clause. Supports operators: { status: { in: ["OPEN","CLOSED"] } }, { quantity: { gt: 0 } }, { name: { contains: "steel" } }, { createdAt: { gte: "2025-01-01" } }, { daysOfSupply: { lte: 10 } }. Simple equality: { status: "OPEN" }. For inventory use "quantity" (not "qtyOnHand"). For work orders use "plannedQty" and "actualQty" (not "qtyPlanned"/"qtyProduced"). NOTE: Prisma filters can only compare against literal values, not other columns. For cross-column comparisons use rawWhere.',
          additionalProperties: true,
        },
        rawWhere: {
          type: "string",
          description:
            'Raw SQL WHERE clause for cross-column comparisons or complex conditions that Prisma filters cannot express. Examples: \'"quantity" < "reorderPoint"\', \'"daysOfSupply" <= 10\'. Column names must be double-quoted camelCase matching the Prisma schema. This is ANDed with org scoping and any Prisma filters.',
        },
        include: {
          type: "object",
          description:
            'Relations to include. Examples: { "product": { "select": { "sku": true, "name": true } } }, { "supplier": true }, { "lines": true }, { "customer": true }, { "location": true }. Use select within include to limit fields.',
          additionalProperties: true,
        },
        orderBy: {
          type: "string",
          description:
            "Field name to order by. Prefix with - for descending (e.g. '-createdAt').",
        },
        limit: {
          type: "number",
          description: "Max rows to return (1–100, default 50). Use smaller limits for broad queries. For counting, use aggregate_records instead.",
        },
      },
      required: ["entity"],
    },
  },
  {
    name: "aggregate_records",
    description:
      "Aggregate records from a canonical table. Supports COUNT, SUM, and AVG grouped by a field.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description: `Table name: ${Object.keys(ENTITY_MAP).join(", ")}`,
        },
        groupByField: {
          type: "string",
          description: "Field to group results by.",
        },
        metric: {
          type: "string",
          enum: ["COUNT", "SUM", "AVG"],
          description: "Aggregation metric.",
        },
        valueField: {
          type: "string",
          description: "Field to compute SUM or AVG on (required for SUM/AVG).",
        },
        filters: {
          type: "object",
          description:
            'Prisma-style where clause for filtering before aggregating. Same syntax as query_records filters. NOTE: Prisma filters can only compare a column against a literal value — not against another column. For cross-column comparisons use rawWhere instead.',
          additionalProperties: true,
        },
        rawWhere: {
          type: "string",
          description:
            'Raw SQL WHERE clause for cross-column comparisons that Prisma filters cannot express. Examples: \'"quantity" < "reorderPoint"\', \'"daysOfSupply" <= 10\'. Column names must be double-quoted camelCase matching the Prisma schema. This is ANDed with org scoping. Supports COUNT, SUM, and AVG metrics (no groupBy).',
        },
      },
      required: ["entity", "metric"],
    },
  },
  {
    name: "get_traceability",
    description:
      "Trace a lot number or serial number through the supply chain. Returns the full chain: lot → work order → BOM → components → PO → supplier, or serial → lot → work order → sales order → customer → shipments.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: {
          type: "string",
          enum: ["LOT", "SERIAL"],
          description: "Whether to trace a lot number or serial number.",
        },
        value: {
          type: "string",
          description: "The lot number or serial number to trace.",
        },
      },
      required: ["type", "value"],
    },
  },
  {
    name: "get_entity_by_id",
    description:
      "Get a single record by its ID with all fields. Use this when you have an entity ID and need the full detail.",
    input_schema: {
      type: "object" as const,
      properties: {
        entity: {
          type: "string",
          description: `Table name: ${Object.keys(ENTITY_MAP).join(", ")}`,
        },
        id: {
          type: "string",
          description: "The record ID.",
        },
      },
      required: ["entity", "id"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
  switch (toolName) {
    case "query_records":
      return executeQueryRecords(input, orgId);
    case "aggregate_records":
      return executeAggregateRecords(input, orgId);
    case "get_traceability":
      return executeTraceability(input, orgId);
    case "get_entity_by_id":
      return executeGetEntityById(input, orgId);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// ---------------------------------------------------------------------------
// query_records
// ---------------------------------------------------------------------------

async function executeQueryRecords(
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
  const entityName = String(input.entity ?? "").toLowerCase();
  const config = ENTITY_MAP[entityName];
  if (!config) {
    return { error: `Unknown entity: ${input.entity}. Valid: ${Object.keys(ENTITY_MAP).join(", ")}` };
  }

  const filters = (input.filters ?? {}) as Record<string, unknown>;
  const includeParam = input.include as Record<string, unknown> | undefined;
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const orderByField = input.orderBy as string | undefined;
  const rawWhere = input.rawWhere as string | undefined;

  // Build where clause with org scoping.
  // Child tables (po_line / so_line / bom_line) scope via a nested relation
  // filter on the parent table that carries the orgId — required for both
  // correctness and multi-tenant isolation.
  const where: Record<string, unknown> = { ...filters };
  if (config.orgField) {
    where[config.orgField] = orgId;
  } else if (config.orgParent) {
    where[config.orgParent.relation] = { [config.orgParent.parentOrgField]: orgId };
  }

  // Build orderBy
  let orderBy: Record<string, string> | undefined;
  if (orderByField) {
    const desc = orderByField.startsWith("-");
    const field = desc ? orderByField.slice(1) : orderByField;
    orderBy = { [field]: desc ? "desc" : "asc" };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (prisma as any)[config.model];
    if (!model) return { error: `Model ${config.model} not found` };

    // ── rawWhere path: fetch IDs via raw SQL, then hydrate with Prisma ──
    if (rawWhere) {
      const forbidden = /;|--|\/\*|\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;
      if (forbidden.test(rawWhere)) {
        return { error: "rawWhere contains forbidden SQL patterns" };
      }

      const tableName = config.model.charAt(0).toUpperCase() + config.model.slice(1);
      const orderClause = orderByField
        ? `ORDER BY "${orderByField.replace(/^-/, "")}" ${orderByField.startsWith("-") ? "DESC" : "ASC"}`
        : "";
      const orgClause = buildRawOrgClause(config);
      if (!orgClause) {
        return { error: `Entity ${entityName} has no org scope configured — rawWhere not supported` };
      }

      // Get total count + limited IDs in parallel
      const [countResult, idResult] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint as count FROM "${tableName}" WHERE ${orgClause} AND (${rawWhere})`,
          orgId
        ),
        prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id FROM "${tableName}" WHERE ${orgClause} AND (${rawWhere}) ${orderClause} LIMIT ${limit}`,
          orgId
        ),
      ]);

      const totalCount = Number(countResult[0]?.count ?? 0);
      const ids = idResult.map((r) => r.id);

      if (ids.length === 0) {
        return { entity: entityName, totalCount: 0, returnedCount: 0, rows: [] };
      }

      // Hydrate via Prisma to get full objects with includes
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hydrateQuery: any = { where: { id: { in: ids } }, orderBy };
      if (includeParam && Object.keys(includeParam).length > 0) {
        hydrateQuery.include = includeParam;
      }
      const rows = await model.findMany(hydrateQuery);
      return { entity: entityName, totalCount, returnedCount: rows.length, rows };
    }

    // ── Standard Prisma path ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { where, orderBy, take: limit };
    if (includeParam && Object.keys(includeParam).length > 0) {
      query.include = includeParam;
    }

    const [rows, totalCount] = await Promise.all([
      model.findMany(query),
      model.count({ where }),
    ]);
    return { entity: entityName, totalCount, returnedCount: rows.length, rows };
  } catch (err) {
    return { error: `Query failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// aggregate_records
// ---------------------------------------------------------------------------

async function executeAggregateRecords(
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
  const entityName = String(input.entity ?? "").toLowerCase();
  const config = ENTITY_MAP[entityName];
  if (!config) {
    return { error: `Unknown entity: ${input.entity}` };
  }

  const metric = String(input.metric ?? "COUNT").toUpperCase();
  const groupByField = input.groupByField as string | undefined;
  const valueField = input.valueField as string | undefined;
  const filters = (input.filters ?? {}) as Record<string, unknown>;
  const rawWhere = input.rawWhere as string | undefined;

  const where: Record<string, unknown> = { ...filters };
  if (config.orgField) {
    where[config.orgField] = orgId;
  } else if (config.orgParent) {
    where[config.orgParent.relation] = { [config.orgParent.parentOrgField]: orgId };
  }

  try {
    // ── rawWhere path: use raw SQL for cross-column comparisons ──────
    if (rawWhere) {
      const forbidden = /;|--|\/\*|\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;
      if (forbidden.test(rawWhere)) {
        return { error: "rawWhere contains forbidden SQL patterns" };
      }

      // Prisma model name = PG table name (no @@map on core models)
      const tableName = config.model.charAt(0).toUpperCase() + config.model.slice(1);
      const orgClause = buildRawOrgClause(config);
      if (!orgClause) {
        return { error: `Entity ${entityName} has no org scope configured — rawWhere not supported` };
      }

      // Build SELECT based on metric
      let selectExpr: string;
      if (metric === "COUNT") {
        selectExpr = "COUNT(*)::bigint as value";
      } else if (metric === "SUM" && valueField) {
        selectExpr = `COALESCE(SUM("${valueField}"), 0)::double precision as value`;
      } else if (metric === "AVG" && valueField) {
        selectExpr = `AVG("${valueField}")::double precision as value`;
      } else {
        selectExpr = "COUNT(*)::bigint as value";
      }

      const result: Array<{ value: bigint | number }> = await prisma.$queryRawUnsafe(
        `SELECT ${selectExpr} FROM "${tableName}" WHERE ${orgClause} AND (${rawWhere})`,
        orgId
      );

      const value = Number(result[0]?.value ?? 0);
      return { entity: entityName, metric, count: metric === "COUNT" ? value : undefined, value };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (prisma as any)[config.model];
    if (!model) return { error: `Model ${config.model} not found` };

    if (groupByField) {
      // Use groupBy
      const aggOp: Record<string, unknown> = {};
      if (metric === "COUNT") {
        aggOp._count = { _all: true };
      } else if (metric === "SUM" && valueField) {
        aggOp._sum = { [valueField]: true };
      } else if (metric === "AVG" && valueField) {
        aggOp._avg = { [valueField]: true };
      }

      const result = await model.groupBy({
        by: [groupByField],
        where,
        ...aggOp,
        orderBy: { [groupByField]: "asc" },
      });

      return {
        entity: entityName,
        metric,
        groupByField,
        results: result.map((r: Record<string, unknown>) => ({
          group: r[groupByField],
          value:
            metric === "COUNT"
              ? (r._count as Record<string, unknown>)?._all
              : metric === "SUM" && valueField
                ? (r._sum as Record<string, unknown>)?.[valueField]
                : metric === "AVG" && valueField
                  ? (r._avg as Record<string, unknown>)?.[valueField]
                  : null,
        })),
      };
    } else {
      // Simple aggregate without groupBy
      const result = await model.aggregate({
        where,
        _count: { _all: true },
        ...(valueField && metric === "SUM" ? { _sum: { [valueField]: true } } : {}),
        ...(valueField && metric === "AVG" ? { _avg: { [valueField]: true } } : {}),
      });

      return {
        entity: entityName,
        metric,
        count: result._count._all,
        value:
          metric === "SUM" && valueField
            ? result._sum?.[valueField]
            : metric === "AVG" && valueField
              ? result._avg?.[valueField]
              : result._count._all,
      };
    }
  } catch (err) {
    return { error: `Aggregation failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ---------------------------------------------------------------------------
// get_traceability
// ---------------------------------------------------------------------------

async function executeTraceability(
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
  const type = String(input.type ?? "").toUpperCase();
  const value = String(input.value ?? "");

  if (type === "LOT") {
    // lot → product → work orders → BOM → components → PO lines → supplier
    const lot = await prisma.lot.findFirst({
      where: { orgId, lotNumber: value },
      include: { product: true },
    });
    if (!lot) return { error: `Lot ${value} not found for this org` };

    const workOrders = await prisma.workOrder.findMany({
      where: { organizationId: orgId, sku: lot.product.sku },
      take: 20,
    });

    const bomItems = await prisma.bOMItem.findMany({
      where: { parentId: lot.productId },
      include: { child: { select: { sku: true, name: true, id: true } } },
    });

    // Find POs for component products
    const componentIds = bomItems.map((b) => b.child.id);
    const poLines = componentIds.length > 0
      ? await prisma.pOLine.findMany({
          where: { productId: { in: componentIds } },
          include: {
            purchaseOrder: {
              include: { supplier: { select: { code: true, name: true } } },
            },
          },
          take: 50,
        })
      : [];

    return {
      type: "LOT",
      lotNumber: value,
      product: { sku: lot.product.sku, name: lot.product.name },
      expiryDate: lot.expiryDate,
      manufacturedDate: lot.manufacturedDate,
      workOrders: workOrders.map((wo) => ({
        orderNumber: wo.woNumber ?? wo.orderNumber,
        status: wo.status,
        plannedQty: Number(wo.plannedQty),
        actualQty: Number(wo.actualQty),
      })),
      bomComponents: bomItems.map((b) => ({
        sku: b.child.sku,
        name: b.child.name,
        qtyPer: Number(b.quantity),
      })),
      purchaseOrders: poLines.map((pl) => ({
        poNumber: pl.purchaseOrder.poNumber,
        supplier: pl.purchaseOrder.supplier.name,
        qtyOrdered: Number(pl.qtyOrdered),
        qtyReceived: Number(pl.qtyReceived),
      })),
    };
  }

  if (type === "SERIAL") {
    // serial → lot → work order → sales order → customer → shipments
    const serial = await prisma.serialNumber.findUnique({
      where: { serialNumber: value },
    });
    if (!serial) return { error: `Serial number ${value} not found` };

    // Verify belongs to org via SKU
    const product = await prisma.product.findFirst({
      where: { organizationId: orgId, sku: serial.sku },
    });
    if (!product) return { error: `Serial ${value} does not belong to this org` };

    let lotInfo = null;
    if (serial.lotNumber) {
      const lot = await prisma.lot.findFirst({
        where: { orgId, lotNumber: serial.lotNumber },
      });
      lotInfo = lot
        ? { lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, manufacturedDate: lot.manufacturedDate }
        : null;
    }

    let woInfo = null;
    if (serial.workOrderId) {
      const wo = await prisma.workOrder.findFirst({
        where: { id: serial.workOrderId, organizationId: orgId },
      });
      woInfo = wo
        ? { orderNumber: wo.woNumber ?? wo.orderNumber, status: wo.status }
        : null;
    }

    let soInfo = null;
    let customerInfo = null;
    if (serial.soId) {
      const so = await prisma.salesOrder.findFirst({
        where: { id: serial.soId, orgId },
        include: { customer: true },
      });
      if (so) {
        soInfo = { soNumber: so.soNumber, status: so.status };
        customerInfo = { code: so.customer.code, name: so.customer.name };
      }
    }

    const shipments = serial.soId
      ? await prisma.shipment.findMany({ where: { soId: serial.soId }, take: 10 })
      : [];

    return {
      type: "SERIAL",
      serialNumber: value,
      product: { sku: product.sku, name: product.name },
      status: serial.status,
      productionDate: serial.productionDate,
      lot: lotInfo,
      workOrder: woInfo,
      salesOrder: soInfo,
      customer: customerInfo,
      shipments: shipments.map((s) => ({
        shipmentId: s.shipmentId,
        status: s.status,
        shipDate: s.shipDate,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
      })),
    };
  }

  return { error: `Invalid traceability type: ${type}. Use LOT or SERIAL.` };
}

// ---------------------------------------------------------------------------
// get_entity_by_id
// ---------------------------------------------------------------------------

async function executeGetEntityById(
  input: Record<string, unknown>,
  orgId: string
): Promise<unknown> {
  const entityName = String(input.entity ?? "").toLowerCase();
  const id = String(input.id ?? "");
  const config = ENTITY_MAP[entityName];
  if (!config) {
    return { error: `Unknown entity: ${input.entity}` };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (prisma as any)[config.model];
    if (!model) return { error: `Model ${config.model} not found` };

    // Try to find by primary key — include parent relation when we need to
    // verify org scope through it (po_line / so_line / bom_line).
    const findArgs: Record<string, unknown> = { where: { id } };
    if (!config.orgField && config.orgParent) {
      findArgs.include = { [config.orgParent.relation]: { select: { [config.orgParent.parentOrgField]: true } } };
    }
    const record = await model.findUnique(findArgs);
    if (!record) return { error: `${config.displayName} with id=${id} not found` };

    // Verify org ownership either directly or through the parent relation.
    if (config.orgField) {
      if (record[config.orgField] !== orgId) {
        return { error: `${config.displayName} with id=${id} not found` };
      }
    } else if (config.orgParent) {
      const parent = record[config.orgParent.relation] as Record<string, unknown> | null;
      if (!parent || parent[config.orgParent.parentOrgField] !== orgId) {
        return { error: `${config.displayName} with id=${id} not found` };
      }
    }

    return record;
  } catch (err) {
    // Some models use non-standard primary keys (e.g., ncrId, capaId)
    return { error: `Lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}
