/**
 * WebhookConnector — processes inbound webhook payloads.
 *
 * Unlike pull connectors, webhooks are push-based: an external system POSTs a
 * payload to /api/connectors/webhook/[connectorId] and this connector
 * processes it synchronously in the request handler.
 *
 * This file provides:
 *  1. Signature verification (HMAC-SHA256, optional)
 *  2. Payload → canonical row extraction
 *  3. Direct upsert + event emission (bypasses BaseConnector sync loop since
 *     there is no polling to do)
 */

import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { buildOperationalGraph } from "@/lib/ode/graph-builder";
import { normaliseRow } from "@/lib/ode/normalizer";
import {
  upsertProduct,
  upsertSupplier,
  upsertInventoryItem,
  upsertOrder,
} from "@/lib/ode/state-manager";
import { suggestCanonicalMapping } from "@/lib/ode/canonical-schema";
import type { WebhookConnectorConfig } from "./types";
import type { SyncResult } from "@/lib/ode/types";

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

export function verifyWebhookSignature(
  body: string,
  secret: string,
  headerValue: string | null
): boolean {
  if (!headerValue) return false;
  const digest = createHmac("sha256", secret).update(body).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  try {
    return timingSafeEqual(Buffer.from(headerValue), expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Payload processor
// ---------------------------------------------------------------------------

function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function flattenRecord(obj: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return result;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const nested = flattenRecord(value);
      for (const [nk, nv] of Object.entries(nested)) {
        result[`${key}.${nk}`] = nv;
      }
    } else {
      result[key] = value !== null && value !== undefined ? String(value) : "";
    }
  }
  return result;
}

/**
 * Process an inbound webhook payload for a given connectorId.
 * Returns a SyncResult for consistent API responses.
 */
export async function processWebhookPayload(
  organizationId: string,
  connectorId: string,
  payload: unknown
): Promise<SyncResult> {
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId, organizationId },
  });
  if (!connector) throw new Error("Connector not found");

  const config = connector.config as unknown as WebhookConnectorConfig;
  const entityType = config.entityType;

  // Extract records array
  const rawPayload = config.recordsPath
    ? getPath(payload, config.recordsPath)
    : payload;

  const rawRecords = Array.isArray(rawPayload) ? rawPayload : [rawPayload];

  // Auto-detect field mapping from first record
  let fieldMapping = config.fieldMapping;
  if (!fieldMapping && rawRecords.length > 0) {
    const firstRow = flattenRecord(rawRecords[0]);
    fieldMapping = suggestCanonicalMapping(Object.keys(firstRow), entityType);
  }
  fieldMapping = fieldMapping ?? {};

  // Create sync record
  const sync = await prisma.connectorSync.create({
    data: { connectorId, status: "RUNNING" },
  });

  let recordsRead = 0;
  let recordsUpserted = 0;
  let recordsFailed = 0;
  const errors: Array<{ row?: number; message: string }> = [];

  for (let i = 0; i < rawRecords.length; i++) {
    recordsRead++;
    const rawRow = flattenRecord(rawRecords[i]);

    const { record, errors: normaliseErrors } = normaliseRow(
      rawRow,
      entityType,
      fieldMapping,
      connector.name
    );

    if (!record || normaliseErrors.length > 0) {
      recordsFailed++;
      errors.push({ row: i + 1, message: normaliseErrors.join("; ") });
      continue;
    }

    try {
      const opts = { connectorId, source: connector.name };
      switch (entityType) {
        case "PRODUCT":
          await upsertProduct(organizationId, record.fields, opts);
          break;
        case "SUPPLIER":
          await upsertSupplier(organizationId, record.fields, opts);
          break;
        case "INVENTORY_ITEM":
          await upsertInventoryItem(organizationId, record.fields, opts);
          break;
        case "ORDER":
          await upsertOrder(organizationId, record.fields, opts);
          break;
        default:
          throw new Error(`No upsert handler for: ${entityType}`);
      }
      recordsUpserted++;
    } catch (err) {
      recordsFailed++;
      errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Rebuild graph
  await buildOperationalGraph(organizationId);

  const finalStatus: SyncResult["status"] =
    recordsFailed > 0 && recordsUpserted === 0
      ? "FAILED"
      : recordsFailed > 0
      ? "PARTIAL"
      : "COMPLETED";

  await prisma.connectorSync.update({
    where: { id: sync.id },
    data: {
      status: finalStatus,
      completedAt: new Date(),
      recordsRead,
      recordsUpserted,
      recordsFailed,
      errors: errors.length > 0 ? errors : undefined,
    },
  });

  await prisma.connector.update({
    where: { id: connectorId },
    data: {
      status: finalStatus === "FAILED" ? "ERROR" : "ACTIVE",
      lastSyncAt: new Date(),
    },
  });

  return { status: finalStatus, recordsRead, recordsUpserted, recordsFailed, errors };
}
