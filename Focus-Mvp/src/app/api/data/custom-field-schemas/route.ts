import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

const ALLOWED_ENTITY_TYPES = new Set([
  "InventoryItem",
  "Supplier",
  "Product",
  "PurchaseOrder",
  "POLine",
]);
const ALLOWED_DATA_TYPES = new Set(["number", "text", "date", "boolean"]);

export async function GET(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");

  const schemas = await prisma.customFieldSchema.findMany({
    where: {
      organizationId: ctx.org.id,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: [{ entityType: "asc" }, { displayLabel: "asc" }],
  });

  return NextResponse.json({ schemas });
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = (await req.json()) as {
    entityType?: string;
    fieldKey?: string;
    displayLabel?: string;
    dataType?: string;
    sampleValues?: unknown;
    sourceColumn?: string | null;
  };

  const { entityType, fieldKey, displayLabel } = body;
  const dataType = body.dataType ?? "text";
  const sourceColumn = body.sourceColumn ?? null;
  const sampleValues = Array.isArray(body.sampleValues)
    ? body.sampleValues.map(String).slice(0, 5)
    : [];

  if (!entityType || !fieldKey || !displayLabel) {
    return NextResponse.json(
      { error: "entityType, fieldKey and displayLabel are required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json(
      { error: `Unsupported entityType: ${entityType}` },
      { status: 400 }
    );
  }
  if (!ALLOWED_DATA_TYPES.has(dataType)) {
    return NextResponse.json(
      { error: `Unsupported dataType: ${dataType}` },
      { status: 400 }
    );
  }

  const schema = await prisma.customFieldSchema.upsert({
    where: {
      organizationId_entityType_fieldKey: {
        organizationId: ctx.org.id,
        entityType,
        fieldKey,
      },
    },
    create: {
      organizationId: ctx.org.id,
      entityType,
      fieldKey,
      displayLabel,
      dataType,
      sampleValues,
      sourceColumn,
    },
    update: {
      displayLabel,
      dataType,
      sampleValues,
      sourceColumn,
    },
  });

  return NextResponse.json({ schema }, { status: 200 });
}
