export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { DATASETS, buildExternalId, type DatasetName } from "@/lib/ingestion/datasets";

// ---------------------------------------------------------------------------
// Widget Action API — handles create, update, updateStatus, delete
// All operations go through ImportRecord (the JSONB data store).
// ---------------------------------------------------------------------------

interface ActionPayload {
  action: "create" | "update" | "updateStatus" | "delete";
  entity: string;
  /** Record ID — required for update/updateStatus/delete */
  id?: string;
  /** Data payload — required for create/update */
  data?: Record<string, unknown>;
  /** Status value — shorthand for updateStatus */
  status?: string;
}

// Map widget entity names → canonical DatasetName
const ENTITY_TO_DATASET: Record<string, DatasetName> = {
  products: "products",
  product: "products",
  inventory: "inventory",
  suppliers: "suppliers",
  supplier: "suppliers",
  customers: "customers",
  customer: "customers",
  purchase_orders: "purchase_orders",
  purchase_order: "purchase_orders",
  sales_orders: "sales_orders",
  sales_order: "sales_orders",
  bom: "bom",
  locations: "locations",
  location: "locations",
};

// Name of the synthetic ImportDataset used for manually entered records
const MANUAL_SOURCE_LABEL = "Manual Entries";

/**
 * Get or create the "Manual Entries" ImportDataset for this org + dataset.
 * Manual records are kept separate from file imports so they survive deletes
 * of the original upload.
 */
async function getOrCreateManualDataset(
  orgId: string,
  datasetName: DatasetName,
): Promise<string> {
  const datasetDef = DATASETS[datasetName];
  const sourceFile = `manual:${datasetName}`;

  const existing = await prisma.importDataset.findFirst({
    where: { organizationId: orgId, name: datasetName, sourceFile },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.importDataset.create({
    data: {
      organizationId: orgId,
      name: datasetName,
      label: `${datasetDef.label} (${MANUAL_SOURCE_LABEL})`,
      sourceFile,
      columnMap: {},
      rawHeaders: [],
      importMode: "merge",
      rowCount: 0,
      importedRows: 0,
      skippedRows: 0,
    },
    select: { id: true },
  });
  return created.id;
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = (await req.json().catch(() => null)) as ActionPayload | null;
  if (!body?.action || !body?.entity) return badRequest("action and entity required");

  const orgId = ctx.org.id;
  const { action, entity, id, data, status } = body;

  try {
    switch (action) {
      case "create":
        return handleCreate(entity, orgId, data ?? {});
      case "update":
        if (!id) return badRequest("id required for update");
        return handleUpdate(entity, orgId, id, data ?? {});
      case "updateStatus":
        if (!id || !status) return badRequest("id and status required for updateStatus");
        return handleUpdate(entity, orgId, id, { status });
      case "delete":
        if (!id) return badRequest("id required for delete");
        return handleDelete(entity, orgId, id);
      default:
        return badRequest(`Unknown action: ${action}`);
    }
  } catch (err) {
    console.error("[widget-action]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Create — writes a new ImportRecord under the manual-entries dataset
// ---------------------------------------------------------------------------

async function handleCreate(
  entity: string,
  orgId: string,
  data: Record<string, unknown>,
) {
  const datasetName = ENTITY_TO_DATASET[entity];
  if (!datasetName) {
    return NextResponse.json(
      { error: `Create not supported for entity: ${entity}` },
      { status: 400 },
    );
  }

  // Strip fields that should not be persisted
  const cleanData = sanitizeData(data);

  const datasetId = await getOrCreateManualDataset(orgId, datasetName);
  const externalId = buildExternalId(datasetName, cleanData);

  // Upsert: if a record with the same externalId already exists (e.g. same
  // SKU entered twice), merge the new values into it rather than duplicating.
  let record;
  if (externalId) {
    record = await prisma.importRecord.upsert({
      where: {
        organizationId_datasetName_externalId: {
          organizationId: orgId,
          datasetName,
          externalId,
        },
      },
      create: {
        organizationId: orgId,
        datasetId,
        datasetName,
        externalId,
        data: cleanData as never,
      },
      update: {
        data: cleanData as never,
      },
    });
  } else {
    // No identity fields → always insert (no dedup possible)
    record = await prisma.importRecord.create({
      data: {
        organizationId: orgId,
        datasetId,
        datasetName,
        externalId: null,
        data: cleanData as never,
      },
    });
  }

  // Bump the manual dataset's row count
  await prisma.importDataset.update({
    where: { id: datasetId },
    data: { importedRows: { increment: 1 }, rowCount: { increment: 1 } },
  });

  return NextResponse.json({ success: true, data: { id: record.id, ...cleanData } });
}

// ---------------------------------------------------------------------------
// Update — merges new fields into an existing ImportRecord's data JSONB
// ---------------------------------------------------------------------------

async function handleUpdate(
  entity: string,
  orgId: string,
  id: string,
  data: Record<string, unknown>,
) {
  const datasetName = ENTITY_TO_DATASET[entity];
  if (!datasetName) {
    return NextResponse.json(
      { error: `Update not supported for entity: ${entity}` },
      { status: 400 },
    );
  }

  // Verify org ownership
  const existing = await prisma.importRecord.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, data: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Record not found or access denied" }, { status: 404 });
  }

  const cleanData = sanitizeData(data);
  if (Object.keys(cleanData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const mergedData = {
    ...((existing.data as Record<string, unknown>) ?? {}),
    ...cleanData,
  };

  // Recompute externalId from the merged result so it stays in sync
  const newExternalId = buildExternalId(datasetName, mergedData);

  const updated = await prisma.importRecord.update({
    where: { id },
    data: {
      data: mergedData as never,
      ...(newExternalId !== null ? { externalId: newExternalId } : {}),
    },
  });

  return NextResponse.json({ success: true, data: { id: updated.id, ...mergedData } });
}

// ---------------------------------------------------------------------------
// Delete — removes the ImportRecord (org-scoped)
// ---------------------------------------------------------------------------

async function handleDelete(entity: string, orgId: string, id: string) {
  const datasetName = ENTITY_TO_DATASET[entity];
  if (!datasetName) {
    return NextResponse.json(
      { error: `Delete not supported for entity: ${entity}` },
      { status: 400 },
    );
  }

  const existing = await prisma.importRecord.findFirst({
    where: { id, organizationId: orgId },
    select: { id: true, datasetId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Record not found or access denied" }, { status: 404 });
  }

  await prisma.importRecord.delete({ where: { id } });

  // Decrement the dataset row count (floor at 0)
  await prisma.importDataset.updateMany({
    where: { id: existing.datasetId, rowCount: { gt: 0 } },
    data: { rowCount: { decrement: 1 }, importedRows: { decrement: 1 } },
  });

  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip system fields and normalize the incoming data object. */
function sanitizeData(data: Record<string, unknown>): Record<string, unknown> {
  const clean = { ...data };
  // Remove fields that belong to the ImportRecord envelope, not the payload
  for (const f of ["id", "organizationId", "orgId", "datasetId", "datasetName", "importedAt", "createdAt", "updatedAt"]) {
    delete clean[f];
  }
  // Remove nested/dotted field keys — not valid for flat JSONB
  for (const key of Object.keys(clean)) {
    if (key.includes(".")) delete clean[key];
  }
  return clean;
}
