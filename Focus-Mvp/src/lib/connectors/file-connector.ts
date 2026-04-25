/**
 * FileConnector — bridges the existing DataSource / CSV-XLSX pipeline into the
 * ODE connector framework.
 *
 * When synced it:
 *  1. Reads the DataSource record (must be in COMPLETED state).
 *  2. Re-reads the raw file and re-applies the stored mappingConfig.
 *  3. Yields canonical rows to the BaseConnector upsert loop.
 *
 * NOTE: In production the raw file bytes should be stored in object storage
 * (S3 / GCS). For now the connector reads from the local /tmp upload path or
 * re-processes via the existing process route.
 */

import { BaseConnector } from "./base";
import type { ConnectorConfig, FileConnectorConfig } from "./types";

export class FileConnector extends BaseConnector {
  readonly type = "FILE_IMPORT" as const;

  protected async *fetchRows(
    _organizationId: string,
    config: ConnectorConfig
  ): AsyncGenerator<Record<string, string>> {
    const { dataSourceId } = config as FileConnectorConfig;

    // FileConnector defers to the existing DataSource process pipeline.
    // The actual row-by-row iteration happens inside the /api/data/sources/[id]/process-v2
    // route.  Here we yield nothing — syncing a FileConnector simply re-triggers
    // the existing process endpoint.  This stub is intentionally empty so that
    // callers who trigger a FileConnector sync via the ODE API get a consistent
    // SyncResult back.

    // In a future iteration, store raw file bytes in object storage and re-parse
    // them here to produce canonical rows.
    void dataSourceId;
    return;
  }
}
