import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { runQuery, filterCompatibleFilters } from "@/lib/widget-query";
import type { DataQuery } from "@/components/apps/widgets/types";
import Anthropic from "@anthropic-ai/sdk";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";
import { sanitizeForApi } from "@/lib/utils/sanitize";

const INSIGHT_SYSTEM = `You are a concise supply chain analyst. Given operational data, provide actionable analysis.

Rules:
- Use markdown: **bold** for emphasis, bullet points for insights, ### headers for sections
- Be specific with numbers — cite actual values from the data
- Keep analysis focused and scannable (5-15 bullet points max)
- Highlight risks in bold, recommendations as action items
- Never fabricate data — only reference what's in the provided context`;

interface InsightRequest {
  queries: DataQuery[];
  prompt: string;
  simParams?: Record<string, unknown>;
  maxTokens?: number;
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => null) as InsightRequest | null;
  if (!body?.queries?.length || !body?.prompt) {
    return badRequest("queries and prompt required");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), { status: 500 });
  }

  // Token budget pre-flight check
  const budget = await checkTokenBudget(ctx.org.id, ctx.session.user!.id!, ctx.org.plan ?? "free");
  if (!budget.allowed) {
    return new Response(JSON.stringify({ error: budget.message }), { status: 429 });
  }

  try {
    // Run all queries in parallel. Org scoping is now applied inside
    // runQuery against ImportRecord — we only forward the filters.
    const queryResults = await Promise.all(
      body.queries.map(async (query, i) => {
        const compatibleFilters = filterCompatibleFilters(query.entity, query.filters);
        const data = await runQuery(ctx.org.id, query, compatibleFilters);
        return { index: i, entity: query.entity, data };
      })
    );

    // Build data context
    let dataContext = "## Data Context\n\n";
    for (const result of queryResults) {
      dataContext += `### Query ${result.index + 1}: ${result.entity}\n`;
      const json = JSON.stringify(result.data, null, 2);
      // Limit each query result to avoid overwhelming the prompt
      dataContext += json.length > 8000 ? json.slice(0, 8000) + "\n... (truncated)" : json;
      dataContext += "\n\n";
    }

    // Fill prompt template with simulation parameters
    let prompt = body.prompt;
    if (body.simParams) {
      for (const [key, value] of Object.entries(body.simParams)) {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(value));
      }
    }

    // Stream Claude response
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let inputTokens = 0;
        let outputTokens = 0;
        try {
          const response = await client.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: body.maxTokens ?? 1024,
            system: sanitizeForApi(INSIGHT_SYSTEM + "\n\n" + dataContext),
            messages: [{ role: "user", content: sanitizeForApi(prompt) }],
            stream: true,
          });

          for await (const event of response) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "text_delta", text: event.delta.text }) + "\n"
                )
              );
            } else if (event.type === "message_start" && event.message.usage) {
              inputTokens += event.message.usage.input_tokens;
              outputTokens += event.message.usage.output_tokens;
            } else if (event.type === "message_delta" && event.usage) {
              outputTokens += event.usage.output_tokens;
            }
          }

          // Record token usage
          await recordTokenUsage(ctx.org.id, ctx.session.user!.id!, "widget-insight", {
            inputTokens,
            outputTokens,
          });

          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "done" }) + "\n")
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "error", error: msg }) + "\n")
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err) {
    console.error("[widget-insight]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Insight generation failed" }),
      { status: 500 }
    );
  }
}
