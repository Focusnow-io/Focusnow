/**
 * RestApiConnector — pulls records from any JSON REST endpoint.
 *
 * Supports:
 *  - GET / POST requests with static headers and query params
 *  - Nested records path  (e.g. "data.items")
 *  - Cursor-based pagination via a configurable next-cursor JSON path
 *  - Auto-mapping of response keys to canonical fields
 */

import { BaseConnector } from "./base";
import { suggestCanonicalMapping } from "@/lib/ode/canonical-schema";
import type { ConnectorConfig, RestApiConnectorConfig } from "./types";

// ---------------------------------------------------------------------------
// JSON path helper
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

function flattenRecord(obj: unknown, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (obj === null || obj === undefined) return result;
  if (typeof obj !== "object") {
    result[prefix] = String(obj);
    return result;
  }
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenRecord(value, fullKey));
    } else {
      result[fullKey] = value !== null && value !== undefined ? String(value) : "";
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export class RestApiConnector extends BaseConnector {
  readonly type = "REST_API" as const;

  protected async *fetchRows(
    _organizationId: string,
    config: ConnectorConfig
  ): AsyncGenerator<Record<string, string>> {
    const cfg = config as RestApiConnectorConfig;
    const method = cfg.method ?? "GET";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(cfg.headers ?? {}),
    };

    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      // Build URL with params
      const url = new URL(`${cfg.baseUrl}${cfg.path}`);
      for (const [k, v] of Object.entries(cfg.params ?? {})) {
        url.searchParams.set(k, v);
      }
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await fetch(url.toString(), {
        method,
        headers,
        ...(method === "POST" && cfg.body
          ? { body: JSON.stringify(cfg.body) }
          : {}),
      });

      if (!response.ok) {
        throw new Error(
          `REST API responded ${response.status} ${response.statusText} for ${url}`
        );
      }

      const json: unknown = await response.json();

      // Extract records array
      const rawRecords = cfg.recordsPath
        ? getPath(json, cfg.recordsPath)
        : json;

      if (!Array.isArray(rawRecords)) {
        throw new Error(
          `Expected array at path "${cfg.recordsPath ?? "(root)"}", got ${typeof rawRecords}`
        );
      }

      // Auto-detect mapping from first record keys if not provided
      if (!cfg.fieldMapping && rawRecords.length > 0) {
        const firstRecord = flattenRecord(rawRecords[0]);
        cfg.fieldMapping = suggestCanonicalMapping(
          Object.keys(firstRecord),
          cfg.entityType
        );
      }

      for (const item of rawRecords) {
        yield flattenRecord(item);
      }

      // Pagination
      if (cfg.nextCursorPath) {
        const next = getPath(json, cfg.nextCursorPath);
        if (next && typeof next === "string") {
          cursor = next;
        } else {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }
  }
}
