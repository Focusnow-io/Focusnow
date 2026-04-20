export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const alertOnly = searchParams.get("alertOnly") === "true";

  const items = await prisma.inventoryItem.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(alertOnly
        ? {
            reorderPoint: { not: null },
            // We can't do field comparison in Prisma without raw, so filter in JS
          }
        : {}),
    },
    include: {
      product: true,
      location: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = alertOnly
    ? items.filter(
        (i) =>
          i.reorderPoint !== null &&
          Number(i.quantity) <= Number(i.reorderPoint)
      )
    : items;

  return NextResponse.json({ inventory: result });
}
