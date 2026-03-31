/**
 * Connector registry — factory that returns the right connector instance for a
 * given ConnectorType.
 */

import { FileConnector } from "./file-connector";
import { RestApiConnector } from "./rest-api-connector";
import type { IConnector } from "./types";
import type { ConnectorType } from "@/lib/ode/types";

export function createConnector(type: ConnectorType): IConnector {
  switch (type) {
    case "FILE_IMPORT":
      return new FileConnector();
    case "REST_API":
      return new RestApiConnector();
    case "WEBHOOK":
      // Webhooks are push-based; they do not use the pull-sync loop.
      // Calling sync() on a webhook connector is a no-op that returns an
      // empty COMPLETED result.
      return {
        type: "WEBHOOK",
        async sync() {
          return {
            status: "COMPLETED",
            recordsRead: 0,
            recordsUpserted: 0,
            recordsFailed: 0,
            errors: [],
            metadata: { note: "Webhook connectors are push-based; use POST /api/connectors/webhook/[id] to deliver payloads." },
          };
        },
      };
    case "DATABASE":
    case "SFTP":
      throw new Error(`Connector type "${type}" is not yet implemented.`);
    default: {
      const exhaustive: never = type;
      throw new Error(`Unknown connector type: ${exhaustive}`);
    }
  }
}
