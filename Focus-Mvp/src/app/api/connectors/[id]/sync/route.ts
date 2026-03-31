/**
 * POST /api/connectors/[id]/sync
 *
 * Manually trigger a sync for the given connector.
 * For FILE_IMPORT and REST_API connectors this runs the full pull loop.
 * For WEBHOOK connectors a no-op COMPLETED result is returned (payloads are
 * delivered via POST /api/connectors/webhook/[id]).
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { createConnector } from "@/lib/connectors/registry";
import type { ConnectorType } from "@/lib/ode/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { id } = await params;
  const connector = await prisma.connector.findFirst({
    where: { id, organizationId: ctx.org.id },
  });

  if (!connector) {
    return NextResponse.json({ error: "Connector not found" }, { status: 404 });
  }

  if (connector.status === "SYNCING") {
    return NextResponse.json(
      { error: "Connector is already syncing" },
      { status: 409 }
    );
  }

  try {
    const instance = createConnector(connector.type as ConnectorType);
    const result = await instance.sync(ctx.org.id, connector.id);
    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ODE] connector sync error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
