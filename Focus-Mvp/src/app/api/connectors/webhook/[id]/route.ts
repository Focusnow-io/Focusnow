/**
 * POST /api/connectors/webhook/[id]
 *
 * Public endpoint (no session required) that receives push payloads from
 * external systems.  The connector record must exist and belong to the
 * referenced organisation; the connectorId acts as an opaque secret URL
 * segment (and can optionally be verified with HMAC-SHA256).
 *
 * Security:
 *  - The connectorId in the URL is unguessable (CUID).
 *  - If config.secret is set, the X-Hub-Signature-256 or
 *    X-Webhook-Signature header is validated before processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  processWebhookPayload,
  verifyWebhookSignature,
} from "@/lib/connectors/webhook-connector";
import type { WebhookConnectorConfig } from "@/lib/connectors/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: connectorId } = await params;

  // Look up connector without org session (webhook is unauthenticated endpoint)
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
  });

  if (!connector || connector.type !== "WEBHOOK") {
    // Return 404 to avoid leaking existence information
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const config = connector.config as unknown as WebhookConnectorConfig;

  // Signature verification (optional but recommended)
  if (config.secret) {
    const rawBody = await req.text();
    const sig =
      req.headers.get("x-hub-signature-256") ??
      req.headers.get("x-webhook-signature");

    if (!verifyWebhookSignature(rawBody, config.secret, sig)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const result = await processWebhookPayload(
      connector.organizationId,
      connectorId,
      payload
    );
    return NextResponse.json({ result });
  }

  // No signature required — parse body directly
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  try {
    const result = await processWebhookPayload(
      connector.organizationId,
      connectorId,
      payload
    );
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ODE] webhook processing error:", err);
    return NextResponse.json(
      { error: "Failed to process webhook payload" },
      { status: 500 }
    );
  }
}
