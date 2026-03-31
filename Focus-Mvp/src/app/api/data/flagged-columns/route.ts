import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { entityType, columnName, sampleValues } = body as {
    entityType: string;
    columnName: string;
    sampleValues: unknown[];
  };

  if (!entityType || !columnName) {
    return NextResponse.json(
      { error: "entityType and columnName are required" },
      { status: 400 }
    );
  }

  const flagged = await prisma.flaggedColumn.create({
    data: {
      organizationId: ctx.org.id,
      entityType,
      columnName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sampleValues: (Array.isArray(sampleValues) ? sampleValues : []) as any,
    },
  });

  return NextResponse.json({ flagged }, { status: 201 });
}
