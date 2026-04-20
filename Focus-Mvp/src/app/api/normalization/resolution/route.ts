export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const orgId = ctx.org.id;

  // Detect potential duplicate products by normalized name (lowercase + trimmed)
  const products = await prisma.product.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, sku: true },
    orderBy: { name: "asc" },
  });

  // Group by normalized name
  const groups = new Map<string, Array<{ id: string; name: string; sku: string }>>();
  for (const product of products) {
    const key = product.name.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(product);
  }

  // Only keep groups with 2+ products (potential duplicates)
  const duplicateGroups = Array.from(groups.entries()).filter(
    ([, members]) => members.length >= 2
  );

  const items = duplicateGroups.map(([normalizedName, members], idx) => ({
    id: `dedup-product-${idx}`,
    entityType: "product",
    confidence: normalizedName === members[0].name.toLowerCase().trim() ? 95 : 80,
    candidates: members.map((m) => ({ id: m.id, name: `${m.name} (${m.sku})` })),
  }));

  return NextResponse.json({ total: items.length, items });
}
