import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { buildOrgContext, getContextTokenEstimate } from "@/lib/chat/build-context";
import { toolDefinitions, executeTool } from "@/lib/chat/tools";
import { checkAndIncrementUsage } from "@/lib/chat/rate-limiter";
import { recordTokenUsage } from "@/lib/usage/token-tracker";

const SONNET_MODEL = "claude-sonnet-4-20250514";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4096;
const TOOL_CALL_CAP = 5;
const TOOL_RESULT_CHAR_LIMIT = 40_000; // ~10K tokens — enough for 100 rows of any entity
const HISTORY_TOKEN_LIMIT = 160_000;

/**
 * Strip low-value fields and compact Decimal values from query_records rows
 * to reduce serialization size. Only used in the truncation path — full rows
 * still go to toolCallsLog and the client UI so no data is lost for display.
 */

/**
 * Compact a Prisma Decimal / numeric string to a plain number.
 * Prisma serialises DECIMAL(65,30) as "170.000000000000000000000000000000"
 * — 35+ chars of trailing zeroes per value. This compacts to "170" or "3.14".
 */
function compactNumeric(v: unknown): unknown {
  if (typeof v === "number") return v;
  // Prisma Decimal.js objects have a toFixed method and serialise via toString()
  if (typeof v === "object" && v !== null && "toFixed" in v) {
    return Number(v.toString());
  }
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) && v.length > 6) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return v;
}

function slimRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const STRIP_KEYS = new Set([
    "id", "organizationId", "productId", "locationId", "lotId",
    "attributes", "updatedAt",
  ]);
  return rows.map((row) => {
    const slim: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (STRIP_KEYS.has(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === "object" && !Array.isArray(value) && value !== null) {
        // Check if it's a Decimal.js object first
        if ("toFixed" in value) {
          slim[key] = compactNumeric(value);
          continue;
        }
        const nested: Record<string, unknown> = {};
        for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
          if (STRIP_KEYS.has(nk)) continue;
          if (nv === null || nv === undefined) continue;
          nested[nk] = compactNumeric(nv);
        }
        slim[key] = nested;
      } else {
        slim[key] = compactNumeric(value);
      }
    }
    return slim;
  });
}

/**
 * Truncate a tool result to fit within the character limit by removing
 * rows from the end. Keeps JSON valid and updates metadata fields so
 * the model knows exactly how many rows it received.
 */
function truncateToolResult(result: unknown, charLimit: number): string {
  const fullStr = JSON.stringify(result, null, 2);
  if (fullStr.length <= charLimit) return fullStr;

  // Row-aware truncation for query_records results
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as Record<string, unknown>).rows)
  ) {
    const obj = result as Record<string, unknown>;
    // Slim rows first to fit more data in the budget
    const rows = slimRows([...(obj.rows as Record<string, unknown>[])]);
    const originalCount = rows.length;

    // Check if slimmed rows fit without dropping any
    const slimFull = JSON.stringify({ ...obj, rows, returnedCount: rows.length }, null, 2);
    if (slimFull.length <= charLimit) return slimFull;

    // Remove rows from the end until it fits
    while (rows.length > 0) {
      rows.pop();
      const candidate = JSON.stringify(
        {
          ...obj,
          rows,
          returnedCount: rows.length,
          _truncationNote: `Only ${rows.length} of ${originalCount} matching rows are included below (${originalCount - rows.length} omitted to fit context window). Do NOT guess or fabricate the omitted rows.`,
        },
        null,
        2,
      );
      if (candidate.length <= charLimit) return candidate;
    }

    // Even zero rows doesn't fit — return metadata only
    return JSON.stringify({
      ...obj,
      rows: [],
      returnedCount: 0,
      _truncationNote: `All ${originalCount} rows omitted to fit context window. Ask the user to apply more specific filters.`,
    });
  }

  // Non-row results (aggregate, traceability) — fall back to char slice
  return fullStr.slice(0, charLimit) + "\n... (truncated)";
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, delayMs: number) => void,
  maxRetries = 4,
  baseDelayMs = 5000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 5s, 10s, 20s, 40s
        console.log(`[CHAT] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        onRetry?.(attempt + 1, delay);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// GET — load message history
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: ctx.org.id },
  });
  if (!conversation) return notFound("Conversation not found");

  const messages = await prisma.conversationMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      toolCalls: true,
      tokensUsed: true,
      model: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ messages });
}

// ---------------------------------------------------------------------------
// POST — send a message, stream response
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.content !== "string" || !body.content.trim()) {
    return badRequest("content is required");
  }

  const userContent = body.content.trim();

  // Validate conversation belongs to user's org
  const conversation = await prisma.conversation.findFirst({
    where: { id, orgId: ctx.org.id },
  });
  if (!conversation) return notFound("Conversation not found");

  // Rate limiting (message count + token budget)
  const rateLimitResult = await checkAndIncrementUsage(
    ctx.org.id,
    ctx.session.user!.id!,
    0, // Estimated tokens updated after the call
    ctx.org.plan ?? "free"
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json({ error: rateLimitResult.message }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Persist user message
  await prisma.conversationMessage.create({
    data: {
      conversationId: id,
      role: "USER",
      content: userContent,
    },
  });

  // Mark onboarding complete if user has active rules and hasn't completed yet
  if (!ctx.org.onboardingCompletedAt) {
    const hasActiveRule = await prisma.brainRule.count({
      where: { organizationId: ctx.org.id, status: "ACTIVE" },
    });
    if (hasActiveRule > 0) {
      await prisma.organization.update({
        where: { id: ctx.org.id },
        data: { onboardingCompletedAt: new Date() },
      });
    }
  }

  // Update title from first message if it's still the default
  if (conversation.messageCount === 0) {
    const autoTitle = userContent.slice(0, 80) + (userContent.length > 80 ? "…" : "");
    await prisma.conversation.update({
      where: { id },
      data: { title: autoTitle },
    });
  }

  // Increment message count
  await prisma.conversation.update({
    where: { id },
    data: { messageCount: { increment: 1 }, updatedAt: new Date() },
  });

  // Check if org has any operational data before proceeding
  const [productCount, inventoryCount, supplierCount, poCount] = await Promise.all([
    prisma.product.count({ where: { organizationId: ctx.org.id } }),
    prisma.inventoryItem.count({ where: { organizationId: ctx.org.id } }),
    prisma.supplier.count({ where: { organizationId: ctx.org.id } }),
    prisma.purchaseOrder.count({ where: { orgId: ctx.org.id } }),
  ]);
  const hasAnyData = productCount + inventoryCount + supplierCount + poCount > 0;

  if (!hasAnyData) {
    const noDataMessage =
      "It looks like there's no operational data in your account yet. Please import at least one file — Products, Inventory, Suppliers, or Purchase Orders — before asking questions. You can do this from the **Import** page.";

    await prisma.conversationMessage.create({
      data: { conversationId: id, role: "ASSISTANT", content: noDataMessage },
    });
    await prisma.conversation.update({
      where: { id },
      data: { messageCount: { increment: 1 }, updatedAt: new Date() },
    });

    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "text", content: noDataMessage }) + "\n")
          );
          controller.enqueue(encoder.encode(JSON.stringify({ type: "done" }) + "\n"));
          controller.close();
        },
      }),
      { headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // Build context
  const orgContext = await buildOrgContext(ctx.org.id);
  const contextTokens = getContextTokenEstimate(ctx.org.id);

  // Model selection: Haiku for first turn + small context
  const isFirstTurn = conversation.messageCount === 0;
  const useHaiku = isFirstTurn && contextTokens < 40_000;
  const model = useHaiku ? HAIKU_MODEL : SONNET_MODEL;

  // System prompt with cache_control
  const systemPrompt: Anthropic.MessageCreateParams["system"] = [
    {
      type: "text",
      text: `You are Focus, a world-class supply chain and operations expert serving ${ctx.org.name}. You bring the depth of a seasoned VP of Supply Chain with 20+ years across procurement, inventory management, demand planning, manufacturing operations, and supplier relationship management. You are fluent in best practices (lean, JIT, S&OP, ABC/XYZ analysis, safety stock optimization, EOQ, MRP/MRP II) and apply them naturally when advising. You have access to their complete operational dataset as of ${new Date().toISOString()}.

## Instructions

- Answer questions directly and precisely with the authority of a top-tier supply chain consultant. Cite record IDs, PO numbers, lot numbers and other identifiers so users can verify your answers.
- Go beyond the raw data — interpret it through the lens of supply chain best practices, flag risks, and suggest actionable improvements.
- Proactively flag anomalies — if you notice a related issue while answering, mention it briefly.
- When you use a tool, tell the user what you are looking up in one sentence before calling it.
- Never fabricate data. If you cannot find something in the context or via tools, say so.
- **CRITICAL: For "how many" / count / total questions, ALWAYS use aggregate_records with metric COUNT — never count rows from query_records.** The query_records tool caps results at 100 rows, so counting returned rows will give wrong answers for datasets larger than 100. Use aggregate_records with filters to get exact counts (e.g., count inventory items where quantity < reorderPoint).
- Use query_records only when you need to **list or inspect specific records**, not for counting or totaling.
- **Use include** in query_records to fetch related data in one call (e.g., include supplier when querying POs) instead of making separate queries.
- **Use Prisma filter operators** for precise queries: \`{ in: [...] }\`, \`{ gt: 0 }\`, \`{ lte: 10 }\`, \`{ contains: "text" }\`, \`{ gte: "2025-01-01" }\`. NOTE: Prisma filters can only compare a column against a literal value, not another column.
- **Cross-column comparisons** (e.g., "which items have quantity below their reorder point"): use aggregate_records with the \`rawWhere\` parameter instead of Prisma filters. Example: \`rawWhere: '"quantity" < "reorderPoint"'\`. Column names in rawWhere must be double-quoted camelCase matching the Prisma schema fields (e.g., "reorderPoint", "daysOfSupply", "demandPerDay"). Both query_records and aggregate_records support rawWhere.
- **Entity routing for procurement attributes:** Lead time (leadTimeDays), MOQ (moq), reorder point (reorderPoint), days of supply (daysOfSupply), and order multiple (orderMultiple) all live on the **inventory** entity, not product. Always query inventory (not product) for replenishment and procurement fields.
- **Plan your queries** before calling tools. For analytical questions, think about what data you need and batch related lookups.
- If query_records returns returnedCount < totalCount and totalCount ≤ 100, immediately make another query_records call with limit set to totalCount to fetch all records. Do NOT present partial results or ask the user if they want more. If totalCount > 100, show what you have and tell the user to add filters to narrow results. NEVER list, describe, or invent records not present in the rows array — only cite data you actually received.
- When a user questions a count result, use query_records (with rawWhere if needed) to list the matching records with their key fields so they can verify the data.
- You have up to 5 tool calls per question. Use them efficiently.
- **Data availability gate:** Before answering any question, check the Data Summary counts below. If the question is about a specific data type (e.g., inventory, suppliers, purchase orders, locations, work orders) and that entity has 0 records, do NOT attempt to answer or speculate. Instead, tell the user that data hasn't been uploaded yet and direct them to the Import page to upload it first. Example: if inventory items = 0 and the user asks about stock levels, say "You don't have any inventory data uploaded yet. Go to the Import page and upload an Inventory file to answer questions like this."

## Current Dataset

${orgContext}`,
      cache_control: { type: "ephemeral" },
    },
  ];

  // Load conversation history
  const historyMessages = await prisma.conversationMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });

  // Build messages array for Anthropic
  let anthropicMessages = buildAnthropicMessages(historyMessages);

  // Token estimation and summarization
  const historyChars = anthropicMessages.reduce(
    (sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content).length),
    0
  );
  const totalEstimatedTokens = contextTokens + Math.ceil(historyChars / 4);

  if (totalEstimatedTokens > HISTORY_TOKEN_LIMIT && anthropicMessages.length > 4) {
    anthropicMessages = summarizeOldHistory(anthropicMessages);
  }

  // Stream response
  const encoder = new TextEncoder();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 0 });

  const stream = new ReadableStream({
    async start(controller) {
      let finalModel = model;
      let fullAssistantContent = "";

      try {
        let toolCallCount = 0;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let cacheReadTokens = 0;
        let cacheWriteTokens = 0;
        const toolCallsLog: unknown[] = [];

        // Tool call loop
        let continueLoop = true;
        while (continueLoop) {
          const response = await callWithRetry(
            () =>
              anthropic.messages.create({
                model: finalModel,
                max_tokens: MAX_TOKENS,
                system: systemPrompt,
                messages: anthropicMessages,
                tools: toolDefinitions,
                stream: true,
              }),
            (_attempt, delayMs) => {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({ type: "text", content: `\n\n*Rate limited by API, retrying in ${Math.round(delayMs / 1000)}s...*\n\n` }) + "\n"
                )
              );
            }
          );

          let currentText = "";
          let currentToolUse: { id: string; name: string; input: string } | null = null;
          let stopReason: string | null = null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contentBlocks: any[] = [];

          for await (const event of response) {
            switch (event.type) {
              case "message_start":
                if (event.message.usage) {
                  totalInputTokens += event.message.usage.input_tokens;
                  totalOutputTokens += event.message.usage.output_tokens;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const usage = event.message.usage as any;
                  cacheReadTokens += usage.cache_read_input_tokens ?? 0;
                  cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
                }
                break;

              case "content_block_start":
                if (event.content_block.type === "text") {
                  currentText = "";
                } else if (event.content_block.type === "tool_use") {
                  currentToolUse = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    input: "",
                  };
                  // Send tool call start event to client
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: "tool_call",
                        name: event.content_block.name,
                        id: event.content_block.id,
                      }) + "\n"
                    )
                  );
                }
                break;

              case "content_block_delta":
                if (event.delta.type === "text_delta") {
                  currentText += event.delta.text;
                  fullAssistantContent += event.delta.text;
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({ type: "text", content: event.delta.text }) + "\n"
                    )
                  );
                } else if (event.delta.type === "input_json_delta" && currentToolUse) {
                  currentToolUse.input += event.delta.partial_json;
                }
                break;

              case "content_block_stop":
                if (currentToolUse) {
                  contentBlocks.push({
                    type: "tool_use",
                    id: currentToolUse.id,
                    name: currentToolUse.name,
                    input: JSON.parse(currentToolUse.input || "{}"),
                  });
                  currentToolUse = null;
                } else if (currentText) {
                  contentBlocks.push({ type: "text", text: currentText });
                  currentText = "";
                }
                break;

              case "message_delta":
                stopReason = event.delta.stop_reason;
                if (event.usage) {
                  totalOutputTokens += event.usage.output_tokens;
                }
                break;
            }
          }

          // Check if we need to process tool calls
          const toolUseBlocks = contentBlocks.filter(
            (b: { type: string }) => b.type === "tool_use"
          ) as Array<{ type: "tool_use"; id: string; name: string; input: Record<string, unknown> }>;

          if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
            toolCallCount += toolUseBlocks.length;

            // Add assistant message with all content blocks
            anthropicMessages.push({
              role: "assistant",
              content: contentBlocks,
            });

            // Execute each tool and collect results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const toolBlock of toolUseBlocks) {
              try {
                const result = await executeTool(
                  toolBlock.name,
                  toolBlock.input as Record<string, unknown>,
                  ctx.org.id
                );

                const resultStr = JSON.stringify(result, null, 2);
                toolCallsLog.push({
                  name: toolBlock.name,
                  input: toolBlock.input,
                  result,
                });

                // Send tool result to client
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: "tool_result",
                      name: toolBlock.name,
                      id: toolBlock.id,
                      result: resultStr.length > 2000
                        ? resultStr.slice(0, 2000) + "... (truncated in UI)"
                        : resultStr,
                    }) + "\n"
                  )
                );

                // Truncate large results to stay within TPM budget (row-aware)
                const truncatedResult = truncateToolResult(result, TOOL_RESULT_CHAR_LIMIT);

                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: truncatedResult,
                });
              } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: toolBlock.id,
                  content: JSON.stringify({ error: errorMsg }),
                  is_error: true,
                });
              }
            }

            // Add tool results as user message, appending cap notice if needed
            if (toolCallCount >= TOOL_CALL_CAP) {
              anthropicMessages.push({
                role: "user",
                content: [
                  ...toolResults,
                  { type: "text" as const, text: "You have used all available tool calls. Please give your best answer now based on the information retrieved so far." },
                ],
              });
              toolCallCount = TOOL_CALL_CAP + 1; // Prevent further tool calls
            } else {
              anthropicMessages.push({
                role: "user",
                content: toolResults,
              });
            }

            // Continue loop for another API call
            continueLoop = true;
          } else {
            // No more tool calls — we're done
            continueLoop = false;
          }
        }

        // Persist assistant message
        await prisma.conversationMessage.create({
          data: {
            conversationId: id,
            role: "ASSISTANT",
            content: fullAssistantContent,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            toolCalls: toolCallsLog.length > 0 ? (toolCallsLog as any) : undefined,
            tokensUsed: totalInputTokens + totalOutputTokens,
            model: finalModel,
          },
        });

        // Update conversation
        await prisma.conversation.update({
          where: { id },
          data: { messageCount: { increment: 1 }, updatedAt: new Date() },
        });

        // Record token usage for budget tracking
        await recordTokenUsage(ctx.org.id, ctx.session.user!.id!, "chat", {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens,
          cacheWriteTokens,
        });

        // Log monitoring info
        console.log(
          `[CHAT] orgId=${ctx.org.id} userId=${ctx.session.user!.id} model=${finalModel} ` +
          `input_tokens=${totalInputTokens} output_tokens=${totalOutputTokens} ` +
          `cache_read_tokens=${cacheReadTokens} cache_write_tokens=${cacheWriteTokens}`
        );

        // Send done event
        controller.enqueue(
          encoder.encode(
            JSON.stringify({ type: "done", model: finalModel }) + "\n"
          )
        );
      } catch (err) {
        console.error("[CHAT] streaming error:", err);
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "Invalid API key"
            : err instanceof Anthropic.RateLimitError
              ? "Rate limit reached. Try again in a moment."
              : err instanceof Error
                ? err.message
                : "An unexpected error occurred";

        // Persist error as assistant message so it survives page re-renders
        const errorContent = fullAssistantContent
          ? fullAssistantContent + `\n\n**Error:** ${msg}`
          : `**Error:** ${msg}`;
        try {
          await prisma.conversationMessage.create({
            data: {
              conversationId: id,
              role: "ASSISTANT",
              content: errorContent,
              model: finalModel,
            },
          });
          await prisma.conversation.update({
            where: { id },
            data: { messageCount: { increment: 1 }, updatedAt: new Date() },
          });
        } catch (persistErr) {
          console.error("[CHAT] failed to persist error message:", persistErr);
        }

        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "error", message: msg }) + "\n")
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
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DBMessage {
  role: string;
  content: string;
  toolCalls?: unknown;
}

function buildAnthropicMessages(
  dbMessages: DBMessage[]
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  // Pending tool_result blocks to merge with the next user message
  let pendingToolResults: Anthropic.ToolResultBlockParam[] | null = null;

  for (const msg of dbMessages) {
    if (msg.role === "USER") {
      if (pendingToolResults) {
        // Merge tool_result blocks + user text into one user message
        messages.push({
          role: "user",
          content: [
            ...pendingToolResults,
            { type: "text" as const, text: msg.content },
          ],
        });
        pendingToolResults = null;
      } else {
        messages.push({ role: "user", content: msg.content });
      }
    } else if (msg.role === "ASSISTANT") {
      // Flush any pending tool results as a standalone user message
      // (shouldn't happen with well-formed history, but just in case)
      if (pendingToolResults) {
        messages.push({ role: "user", content: pendingToolResults });
        pendingToolResults = null;
      }

      // If this assistant message had tool calls, reconstruct the full
      // tool_use → tool_result exchange so the API sees valid history.
      const toolCalls = msg.toolCalls as Array<{
        name: string;
        input: unknown;
        result: unknown;
      }> | null;

      if (toolCalls && toolCalls.length > 0) {
        // Build assistant content: text (if any) + tool_use blocks
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assistantContent: any[] = [];
        if (msg.content) {
          assistantContent.push({ type: "text", text: msg.content });
        }
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (let i = 0; i < toolCalls.length; i++) {
          const tc = toolCalls[i];
          const toolUseId = `hist_tool_${i}`;
          assistantContent.push({
            type: "tool_use",
            id: toolUseId,
            name: tc.name,
            input: tc.input ?? {},
          });
          const resultStr = typeof tc.result === "string"
            ? tc.result
            : JSON.stringify(tc.result ?? {});
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: resultStr.length > TOOL_RESULT_CHAR_LIMIT
              ? resultStr.slice(0, TOOL_RESULT_CHAR_LIMIT) + "\n... (truncated)"
              : resultStr,
          });
        }

        messages.push({ role: "assistant", content: assistantContent });
        // Hold tool results to merge with the next user message
        pendingToolResults = toolResults;
      } else {
        // Plain text assistant message
        messages.push({ role: "assistant", content: msg.content });
      }
    }
  }

  // Flush any remaining tool results (last message was assistant with tools)
  if (pendingToolResults) {
    messages.push({ role: "user", content: pendingToolResults });
  }

  return messages;
}

function summarizeOldHistory(
  messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  if (messages.length <= 4) return messages;

  const halfIndex = Math.floor(messages.length / 2);
  const oldMessages = messages.slice(0, halfIndex);
  const recentMessages = messages.slice(halfIndex);

  // Build a summary of old messages
  const summaryParts: string[] = ["[Summary of earlier conversation:]"];
  for (const msg of oldMessages) {
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
    const truncated = content.length > 200 ? content.slice(0, 200) + "…" : content;
    summaryParts.push(`${msg.role}: ${truncated}`);
  }

  return [
    { role: "assistant", content: summaryParts.join("\n") },
    ...recentMessages,
  ];
}
