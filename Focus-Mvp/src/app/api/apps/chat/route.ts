export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";
import { buildOrgContext } from "@/lib/chat/build-context";
import { sanitizeForApi } from "@/lib/utils/sanitize";

/**
 * Apps chat — streaming Anthropic response with a dataset-vocabulary
 * context block. Uses the same buildOrgContext as the Brain chat so
 * widgets and Brain chat give consistent answers.
 */
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
      { status: 500 },
    );
  }

  const budget = await checkTokenBudget(
    ctx.org.id,
    ctx.session.user!.id!,
    ctx.org.plan ?? "free",
  );
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.message }, { status: 429 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Data availability gate — if the org has no ImportRecord rows the
  // chat can still stream, but the AI is told so up-front rather than
  // fabricating counts from a stale context.
  const counts = await prisma.importRecord.groupBy({
    by: ["datasetName"],
    where: { organizationId: ctx.org.id },
    _count: { id: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.datasetName] = c._count.id;
  const totalRecords = Object.values(countMap).reduce((a, b) => a + b, 0);

  // Dynamic per-dataset context block. Same builder the Brain chat uses
  // — one section per imported dataset, with canonical + custom fields
  // and a truncated sample row so the AI sees real-world field shapes.
  const orgContext =
    totalRecords > 0
      ? await buildOrgContext(ctx.org.id)
      : "_No data has been imported yet. Ask the user to upload a CSV from the Import page before answering operational questions._";

  const systemPrompt = `You are Focus, a world-class supply chain and operations expert serving ${ctx.org.name}. You bring the depth of a seasoned VP of Supply Chain with 20+ years across procurement, inventory management, demand planning, manufacturing operations, and supplier relationship management. You are fluent in best practices (lean, JIT, S&OP, ABC/XYZ analysis, safety stock optimization, EOQ, MRP/MRP II) and apply them naturally when advising.

## Available Data
${orgContext}

## Response Guidelines

You are a world-class supply chain expert and precise operations analyst. Respond with the confidence and depth of a top-tier consultant. When relevant, reference industry best practices (safety stock formulas, reorder strategies, supplier diversification, lead time optimization, ABC classification) and explain *why* something matters, not just *what* the data shows.

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
- Flag ⚠️ items (reorder alerts, zero stock) visually when mentioned
- Field names use snake_case matching the canonical dataset vocabulary (quantity, reorder_point, po_number, supplier_code, etc.)`;

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let inputTokens = 0;
      let outputTokens = 0;
      try {
        const anthropicStream = anthropic.messages.stream({
          model: "claude-opus-4-6",
          max_tokens: 2048,
          system: sanitizeForApi(systemPrompt),
          messages: messages.map((m: { role: string; content: string }) => ({
            role: m.role as "user" | "assistant",
            content: sanitizeForApi(m.content),
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
