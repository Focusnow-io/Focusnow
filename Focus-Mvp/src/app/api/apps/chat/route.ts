import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { messages } = body;

  if (!messages || !Array.isArray(messages)) {
    return badRequest("messages array required");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 500 }
    );
  }

  // Token budget pre-flight check
  const budget = await checkTokenBudget(ctx.org.id, ctx.session.user!.id!, ctx.org.plan ?? "free");
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.message }, { status: 429 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Use count() queries for accurate totals; sample rows are limited to avoid token overflow
  const [
    inventory,
    inventoryCount,
    products,
    productCount,
    suppliers,
    orders,
    orderCount,
    rules,
    workOrders,
    bomHeaders,
    equipment,
  ] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { organizationId: ctx.org.id },
      select: {
        quantity: true, reorderPoint: true, uom: true, unitCost: true,
        product: { select: { sku: true, name: true, category: true } },
        location: { select: { code: true, name: true } },
      },
      take: 100,
    }),
    prisma.inventoryItem.count({
      where: { organizationId: ctx.org.id },
    }),
    prisma.product.findMany({
      where: { organizationId: ctx.org.id },
      select: { sku: true, name: true, category: true, unit: true, type: true, unitCost: true, reorderPoint: true, leadTimeDays: true, productFamily: true, abcClass: true },
      take: 100,
    }),
    prisma.product.count({
      where: { organizationId: ctx.org.id },
    }),
    prisma.supplier.findMany({
      where: { organizationId: ctx.org.id },
      select: { code: true, name: true, country: true, leadTimeDays: true, qualityRating: true, onTimePct: true, status: true },
    }),
    prisma.order.findMany({
      where: { organizationId: ctx.org.id },
      select: { orderNumber: true, type: true, status: true, totalAmount: true, orderDate: true, expectedDate: true, supplier: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.order.count({
      where: { organizationId: ctx.org.id },
    }),
    prisma.brainRule.findMany({
      where: { organizationId: ctx.org.id, status: "ACTIVE" },
      select: { name: true, category: true },
    }),
    prisma.workOrder.findMany({
      where: { organizationId: ctx.org.id },
      select: { orderNumber: true, sku: true, status: true, plannedQty: true, actualQty: true, workCenter: true, scheduledDate: true, dueDate: true, productionLine: true, yieldPct: true },
      orderBy: { dueDate: "asc" },
      take: 30,
    }),
    prisma.bOMHeader.findMany({
      where: { orgId: ctx.org.id, isActive: true },
      select: { version: true, yieldPct: true, totalComponents: true, totalBomCost: true, product: { select: { sku: true, name: true } }, lines: { select: { qty: true, uom: true, component: { select: { sku: true, name: true } } }, take: 10 } },
      take: 30,
    }),
    prisma.equipment.findMany({
      where: { orgId: ctx.org.id },
      select: { code: true, name: true, type: true, status: true, nextMaintenanceAt: true },
      take: 30,
    }),
  ]);

  const belowReorder = inventory.filter(
    (i) => i.reorderPoint !== null && Number(i.quantity) <= Number(i.reorderPoint)
  );
  const zeroStock = inventory.filter((i) => Number(i.quantity) === 0);
  const totalOrderValue = orders.reduce(
    (sum, o) => sum + Number(o.totalAmount ?? 0),
    0
  );

  const systemPrompt = `You are Focus, a world-class supply chain and operations expert serving ${ctx.org.name}. You bring the depth of a seasoned VP of Supply Chain with 20+ years across procurement, inventory management, demand planning, manufacturing operations, and supplier relationship management. You are fluent in best practices (lean, JIT, S&OP, ABC/XYZ analysis, safety stock optimization, EOQ, MRP/MRP II) and apply them naturally when advising. You help users understand and optimize their operational data: inventory, products, suppliers, orders, and manufacturing.

IMPORTANT: When the user asks about totals or counts, always use the "total in database" numbers below — NOT the number of sample rows shown.

## Live Data Summary

### Inventory Overview
- Total inventory items in database: ${inventoryCount}
- Sample items loaded below: ${inventory.length}
- Items below reorder point (in sample): ${belowReorder.length}
- Items at zero stock (in sample): ${zeroStock.length}

### Products (${productCount} total in database)
Sample of ${Math.min(products.length, 40)} products:
${
  products
    .slice(0, 40)
    .map(
      (p) =>
        `- ${p.sku}: ${p.name}${p.category ? ` [${p.category}]` : ""}${p.unit ? `, unit: ${p.unit}` : ""}${p.type ? `, type: ${p.type}` : ""}${p.reorderPoint ? `, reorder point: ${p.reorderPoint}` : ""}${p.leadTimeDays ? `, lead time: ${p.leadTimeDays}d` : ""}${p.abcClass ? `, ABC: ${p.abcClass}` : ""}`
    )
    .join("\n") || "No products on record"
}${productCount > 40 ? `\n... and ${productCount - 40} more products not shown` : ""}

### Suppliers (${suppliers.length} total)
${
  suppliers
    .map(
      (sup) =>
        `- ${sup.code}: ${sup.name}${sup.country ? ` (${sup.country})` : ""}${sup.leadTimeDays ? `, lead time: ${sup.leadTimeDays} days` : ""}${sup.qualityRating ? `, quality: ${sup.qualityRating}` : ""}${sup.onTimePct ? `, on-time: ${sup.onTimePct}%` : ""}${sup.status ? ` [${sup.status}]` : ""}`
    )
    .join("\n") || "No suppliers on record"
}

### Orders (${orderCount} total in database, showing ${Math.min(orders.length, 20)} most recent)
${
  orders
    .slice(0, 20)
    .map(
      (o) =>
        `- #${o.orderNumber}: ${o.supplier?.name ?? "unknown supplier"}, status: ${o.status}, amount: $${Number(o.totalAmount ?? 0).toLocaleString()}`
    )
    .join("\n") || "No orders on record"
}
- Total value of shown orders: $${totalOrderValue.toLocaleString()}

### Active Brain Rules (${rules.length})
${rules.map((r) => `- ${r.name} (${r.category})`).join("\n") || "No active rules"}

### Current Inventory Details (${inventoryCount} total, showing sample of ${Math.min(inventory.length, 60)})
${
  inventory
    .slice(0, 60)
    .map(
      (i) =>
        `- ${i.product.sku} @ ${i.location?.name ?? "—"}: qty ${i.quantity}${i.reorderPoint ? `, reorder at ${i.reorderPoint}` : ""}${Number(i.quantity) <= Number(i.reorderPoint ?? Infinity) && i.reorderPoint ? " ⚠️ REORDER" : ""}`
    )
    .join("\n") || "No inventory items"
}${inventoryCount > 60 ? `\n... and ${inventoryCount - 60} more items not shown` : ""}

### Work Orders (${workOrders.length} total)
${
  workOrders
    .slice(0, 20)
    .map(
      (wo) =>
        `- ${wo.orderNumber}: ${wo.sku}, status: ${wo.status}, planned: ${wo.plannedQty}${wo.actualQty ? `, actual: ${wo.actualQty}` : ""}${wo.workCenter ? `, WC: ${wo.workCenter}` : ""}${wo.productionLine ? `, line: ${wo.productionLine}` : ""}${wo.yieldPct ? `, yield: ${wo.yieldPct}%` : ""}${wo.dueDate ? `, due: ${wo.dueDate.toISOString().split("T")[0]}` : ""}`
    )
    .join("\n") || "No work orders on record"
}

### Active BOMs (${bomHeaders.length} total)
${
  bomHeaders
    .slice(0, 15)
    .map(
      (bom) =>
        `- ${bom.product.sku} v${bom.version}: ${bom.totalComponents ?? bom.lines.length} components${bom.totalBomCost ? `, cost: $${Number(bom.totalBomCost).toLocaleString()}` : ""}${bom.yieldPct ? `, yield: ${bom.yieldPct}%` : ""}\n${bom.lines.map((l) => `  · ${l.component.sku} (${l.component.name}): ${l.qty} ${l.uom}`).join("\n")}`
    )
    .join("\n") || "No active BOMs on record"
}

### Equipment (${equipment.length} total)
${
  equipment
    .map(
      (eq) =>
        `- ${eq.code}: ${eq.name}${eq.type ? ` (${eq.type})` : ""}, status: ${eq.status}${eq.nextMaintenanceAt ? `, next maint: ${eq.nextMaintenanceAt.toISOString().split("T")[0]}` : ""}`
    )
    .join("\n") || "No equipment on record"
}

## Response Guidelines

You are a world-class supply chain expert and precise operations analyst. Respond with the confidence and depth of a top-tier consultant who has seen every supply chain scenario. When relevant, reference industry best practices (safety stock formulas, reorder strategies, supplier diversification, lead time optimization, ABC classification) and explain *why* something matters, not just *what* the data shows. Follow these rules for every response:

**Structure**
- Use **bold** for key metrics and important values
- Use bullet lists for enumerations (keep each item short)
- Use markdown tables for comparisons, rankings, or multi-column data
- Use ## or ### headings only when the response has clearly separate sections
- End with a brief **Summary** or **Recommendation** line when actionable insight is relevant

**Tone & Length**
- Be concise — no filler phrases like "Great question!" or "Certainly!"
- Lead with the direct answer, then supporting detail
- Omit data the user didn't ask for
- Max 3–4 sentences of prose; prefer structured lists over paragraphs

**Data Accuracy**
- Only reference data provided above; if something is missing, say so in one sentence
- Always include units (qty, $, days) next to numbers
- Flag ⚠️ items (reorder alerts, zero stock) visually when mentioned`;

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages: messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        });

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(enc.encode(event.delta.text));
          } else if (event.type === "message_start" && event.message.usage) {
            inputTokens += event.message.usage.input_tokens;
            outputTokens += event.message.usage.output_tokens;
          } else if (event.type === "message_delta" && event.usage) {
            outputTokens += event.usage.output_tokens;
          }
        }

        // Record token usage
        await recordTokenUsage(ctx.org.id, ctx.session.user!.id!, "apps-chat", {
          inputTokens,
          outputTokens,
        });
      } catch (err) {
        console.error("[chat] Anthropic error:", err);
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your environment."
            : err instanceof Anthropic.RateLimitError
              ? "Rate limit reached. Please wait a moment and try again."
              : err instanceof Error
                ? `Error: ${err.message}`
                : "An unexpected error occurred.";
        controller.enqueue(enc.encode(msg));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
