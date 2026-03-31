import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createSchema = z.object({
  template: z.enum(["INVENTORY_COMMAND_CENTER", "PROCUREMENT_HUB", "DEMAND_FULFILLMENT", "DATA_CHAT", "CUSTOM_DASHBOARD"]),
  name: z.string().min(1),
  description: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(_req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const instances = await prisma.appInstance.findMany({
    where: { organizationId: ctx.org.id, active: true },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ instances });
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const instance = await prisma.appInstance.create({
    data: {
      organizationId: ctx.org.id,
      template: parsed.data.template,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      config: (parsed.data.config ?? {}) as Record<string, never>,
    },
  });

  return NextResponse.json(instance, { status: 201 });
}
