/**
 * Connector framework — shared types.
 *
 * Every connector (file, REST API, webhook, SFTP, database) implements the
 * BaseConnector interface and produces CanonicalRecord objects.  The framework
 * is intentionally simple: connectors are synchronous "pull" adapters; the
 * webhook connector is the async "push" adapter.
 */

import type { OdeEntityType, SyncResult } from "@/lib/ode/types";

// ---------------------------------------------------------------------------
// Connector configuration shapes
// ---------------------------------------------------------------------------

/** Shared configuration present on every connector */
export interface BaseConnectorConfig {
  /** Human-readable label for event attribution */
  name: string;
  /** Which entity type this connector produces */
  entityType: OdeEntityType;
  /**
   * Field mapping: { canonicalField → sourceField }.
   * When omitted the connector attempts auto-mapping from canonical aliases.
   */
  fieldMapping?: Record<string, string>;
}

export interface FileConnectorConfig extends BaseConnectorConfig {
  type: "FILE_IMPORT";
  /** dataSourceId from the existing DataSource pipeline */
  dataSourceId: string;
}

export interface RestApiConnectorConfig extends BaseConnectorConfig {
  type: "REST_API";
  /** Base URL of the external API endpoint */
  baseUrl: string;
  /** Path appended to baseUrl, supports {page} and {cursor} tokens */
  path: string;
  /** HTTP method (default: GET) */
  method?: "GET" | "POST";
  /** Static headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Static query params */
  params?: Record<string, string>;
  /** JSON path to the records array in the response (e.g. "data.items") */
  recordsPath?: string;
  /** JSON path to the next-page cursor (enables pagination) */
  nextCursorPath?: string;
  /** Static body payload for POST requests */
  body?: Record<string, unknown>;
}

export interface WebhookConnectorConfig extends BaseConnectorConfig {
  type: "WEBHOOK";
  /**
   * Optional secret for HMAC-SHA256 signature verification
   * (header: X-Hub-Signature-256 or X-Webhook-Signature)
   */
  secret?: string;
  /** JSON path to the records array within the incoming payload */
  recordsPath?: string;
}

export interface DatabaseConnectorConfig extends BaseConnectorConfig {
  type: "DATABASE";
  /** Postgres connection string */
  connectionString: string;
  /** SQL query to execute (returns rows that map to canonical fields) */
  query: string;
}

export interface SftpConnectorConfig extends BaseConnectorConfig {
  type: "SFTP";
  host: string;
  port?: number;
  username: string;
  /** Either password or privateKey must be set */
  password?: string;
  privateKey?: string;
  /** Remote path to poll for new files */
  remotePath: string;
  /** File glob pattern (e.g. "*.csv") */
  filePattern?: string;
  /** File format: csv or xlsx */
  fileFormat: "csv" | "xlsx";
}

export type ConnectorConfig =
  | FileConnectorConfig
  | RestApiConnectorConfig
  | WebhookConnectorConfig
  | DatabaseConnectorConfig
  | SftpConnectorConfig;

// ---------------------------------------------------------------------------
// Connector interface
// ---------------------------------------------------------------------------

/**
 * Every connector must implement this interface.
 * `sync()` pulls records, normalises them, and returns a SyncResult.
 */
export interface IConnector {
  readonly type: ConnectorConfig["type"];
  sync(organizationId: string, connectorId: string): Promise<SyncResult>;
}
