/**
 * BaseConnector — abstract base class for all ODE connectors.
 *
 * Handles:
 *  - ConnectorSync lifecycle (create → RUNNING → COMPLETED/FAILED)
 *  - Batch upsert dispatch through the state-manager
 *  - OperationalRelationship graph rebuild after each sync
 */

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
// Normalization pipeline removed with the legacy relational import flow.
// Connectors no longer trigger graph relinking / completeness / consistency
// checks — those were tied to the per-entity Prisma tables that are no
// longer populated by the pipeline.
import type { IConnector, ConnectorConfig } from "./types";
import type { CanonicalRecord, SyncResult, OdeEntityType } from "@/lib/ode/types";

// ---------------------------------------------------------------------------
// Dispatch table — maps entity type to upsert function
// ---------------------------------------------------------------------------

async function upsertRecord(
  organizationId: string,
  record: CanonicalRecord,
  opts: { connectorId?: string; source?: string }
) {
  switch (record.entityType) {
    case "PRODUCT":
      return upsertProduct(organizationId, record.fields, opts);
    case "SUPPLIER":
      return upsertSupplier(organizationId, record.fields, opts);
    case "INVENTORY_ITEM":
      return upsertInventoryItem(organizationId, record.fields, opts);
    case "ORDER":
      return upsertOrder(organizationId, record.fields, opts);
    default:
      throw new Error(`No upsert handler for entity type: ${record.entityType}`);
  }
}

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

export abstract class BaseConnector implements IConnector {
  abstract readonly type: ConnectorConfig["type"];

  /**
   * Subclasses implement this to yield raw rows from the source system.
   * Rows are plain string maps; the base class handles normalisation.
   */
  protected abstract fetchRows(
    organizationId: string,
    config: ConnectorConfig
  ): AsyncGenerator<Record<string, string>>;

  async sync(organizationId: string, connectorId: string): Promise<SyncResult> {
    // Load connector record + config
    const connector = await prisma.connector.findUniqueOrThrow({
      where: { id: connectorId },
    });

    const config = connector.config as unknown as ConnectorConfig;
    const entityType = config.entityType;
    const fieldMapping =
      config.fieldMapping ??
      suggestCanonicalMapping([], entityType); // will be refined per connector

    // Create sync record
    const sync = await prisma.connectorSync.create({
      data: { connectorId, status: "RUNNING" },
    });

    // Mark connector as syncing
    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: "SYNCING" },
    });

    let recordsRead = 0;
    let recordsUpserted = 0;
    let recordsFailed = 0;
    const errors: Array<{ row?: number; message: string }> = [];

    try {
      let rowIndex = 0;
      for await (const rawRow of this.fetchRows(organizationId, config)) {
        rowIndex++;
        recordsRead++;

        const { record, errors: normaliseErrors } = normaliseRow(
          rawRow,
          entityType,
          fieldMapping,
          connector.name
        );

        if (!record || normaliseErrors.length > 0) {
          recordsFailed++;
          errors.push({
            row: rowIndex,
            message: normaliseErrors.join("; "),
          });
          continue;
        }

        try {
          await upsertRecord(organizationId, record, {
            connectorId,
            source: connector.name,
          });
          recordsUpserted++;
        } catch (err) {
          recordsFailed++;
          errors.push({
            row: rowIndex,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // buildOperationalGraph is stubbed to return an empty graph
      // while the ODE is rewritten against ImportRecord. Call it
      // anyway so any downstream cache is refreshed.
      await buildOperationalGraph(organizationId);

      const finalStatus: SyncResult["status"] =
        recordsFailed > 0 && recordsUpserted === 0
          ? "FAILED"
          : recordsFailed > 0
          ? "PARTIAL"
          : "COMPLETED";

      // Update sync record
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

      // Update connector status
      await prisma.connector.update({
        where: { id: connectorId },
        data: {
          status: recordsFailed > 0 && recordsUpserted === 0 ? "ERROR" : "ACTIVE",
          lastSyncAt: new Date(),
        },
      });

      return { status: finalStatus, recordsRead, recordsUpserted, recordsFailed, errors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await prisma.connectorSync.update({
        where: { id: sync.id },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          recordsRead,
          recordsUpserted,
          recordsFailed,
          errors: [{ message }],
        },
      });

      await prisma.connector.update({
        where: { id: connectorId },
        data: { status: "ERROR", lastSyncAt: new Date() },
      });

      return {
        status: "FAILED",
        recordsRead,
        recordsUpserted,
        recordsFailed,
        errors: [{ message }],
      };
    }
  }
}
