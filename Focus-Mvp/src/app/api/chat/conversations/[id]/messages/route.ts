export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, notFound, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { buildOrgContext, getContextTokenEstimate } from "@/lib/chat/build-context";
import { toolDefinitions, executeTool } from "@/lib/chat/tools";
import { checkAndIncrementUsage } from "@/lib/chat/rate-limiter";
import { recordTokenUsage } from "@/lib/usage/token-tracker";
import { sanitizeForApi } from "@/lib/utils/sanitize";

const SONNET_MODEL = "claude-sonnet-4-20250514";
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 4096;
const TOOL_CALL_CAP = 5;
const TOOL_RESULT_CHAR_LIMIT = 40_000; // ~10K tokens -- enough for 100 rows of any entity
const HISTORY_TOKEN_LIMIT = 160_000;

/**
 * Strip low-value fields and compact Decimal values from query_records rows
 * to reduce serialization size. Only used in the truncation path -- full rows
 * still go to toolCallsLog and the client UI so no data is lost for display.
 */

/**
 * Compact a Prisma Decimal / numeric string to a plain number.
 * Prisma serialises DECIMAL(65,30) as "170.000000000000000000000000000000"
 * -- 35+ chars of trailing zeroes per value. This compacts to "170" or "3.14".
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
  // `attributes` stays in STRIP_KEYS so it isn't emitted as a nested blob --
  // we flatten it into `custom:<key>` entries below so the AI can read the
  // org's custom fields inline with the rest of the row.
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
    // Flatten the attributes JSONB into `custom:<key>` entries so the AI can
    // reason over this org's custom fields without a separate tool call.
    const attrs = row.attributes;
    if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
      for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
        if (v === null || v === undefined) continue;
        slim[`custom:${k}`] = compactNumeric(v);
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

    // Even zero rows doesn't fit -- return metadata only
    return JSON.stringify({
      ...obj,
      rows: [],
      returnedCount: 0,
      _truncationNote: `All ${originalCount} rows omitted to fit context window. Ask the user to apply more specific filters.`,
    });
  }

  // Non-row results (aggregate, traceability) -- fall back to char slice
  return fullStr.slice(0, charLimit) + "\n... (truncated)";
}

/**
 * Final defence-in-depth sweep over the message array before it hits
 * the Anthropic API. Every upstream entry point (user text, tool
 * results, assistant prose, replayed history) already sanitizes at the
 * source; this pass catches anything that slips through, including
 * em-dashed literals carried inside tool_result.content or the text
 * portion of a nested content-block array.
 */
function sanitizeMessages(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { ...m, content: sanitizeForApi(m.content) };
    }
    return {
      ...m,
      content: m.content.map((block) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b = block as any;
        if (b.type === "text" && typeof b.text === "string") {
          return { ...b, text: sanitizeForApi(b.text) };
        }
        if (b.type === "tool_result") {
          if (typeof b.content === "string") {
            return { ...b, content: sanitizeForApi(b.content) };
          }
          if (Array.isArray(b.content)) {
            return {
              ...b,
              content: b.content.map((c: { type?: string; text?: string }) =>
                c?.type === "text" && typeof c.text === "string"
                  ? { ...c, text: sanitizeForApi(c.text) }
                  : c,
              ),
            };
          }
        }
        return block;
      }),
    };
  });
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
// GET -- load message history
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
// POST -- send a message, stream response
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
      "It looks like there's no operational data in your account yet. Please import at least one file -- Products, Inventory, Suppliers, or Purchase Orders -- before asking questions. You can do this from the **Import** page.";

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

  // Build context. Sanitize the whole thing once here -- the context
  // may contain smart-quoted / em-dashed values pulled from user CSVs,
  // and some fetch polyfills reject those when downstream layers
  // assemble byte strings (headers / proxy paths / trace metadata).
  const orgContext = sanitizeForApi(await buildOrgContext(ctx.org.id));
  const contextTokens = getContextTokenEstimate(ctx.org.id);

  // Model selection: Haiku for first turn + small context
  const isFirstTurn = conversation.messageCount === 0;
  const useHaiku = isFirstTurn && contextTokens < 40_000;
  const model = useHaiku ? HAIKU_MODEL : SONNET_MODEL;

  // System prompt with cache_control
  const systemPrompt: Anthropic.MessageCreateParams["system"] = [
    {
      type: "text",
      // sanitizeForApi strips any em-dash / smart-quote / ellipsis /
      // non-breaking-space that slipped in from the prose or the
      // interpolated orgContext. Keeps the prompt byte-string-safe
      // for downstream header / proxy paths.
      text: sanitizeForApi(`You are Focus, a world-class supply chain and operations expert serving ${ctx.org.name}. You bring the depth of a seasoned VP of Supply Chain with 20+ years across procurement, inventory management, demand planning, manufacturing operations, and supplier relationship management. You are fluent in best practices (lean, JIT, S&OP, ABC/XYZ analysis, safety stock optimization, EOQ, MRP/MRP II) and apply them naturally when advising. You have access to their complete operational dataset as of ${new Date().toISOString()}.

## Data Layer
All data is stored in ImportRecord with JSONB field names in snake_case.
Never use camelCase field names. Never use old enum values.
Always use the exact field names and status values shown in the context.

## Dataset Field Reference

### inventory
Key fields: sku, location_code, quantity, reorder_point, safety_stock,
unit_cost, total_value, uom, lead_time_days, moq, order_multiple,
on_hold_qty, reserved_qty, open_po_qty, days_of_supply, demand_per_day,
buy_recommendation, recommended_qty, last_receipt_date

Rules:
- Stock level = \`quantity\` (never \`qtyOnHand\`, never \`qty_on_hand\`)
- Below reorder = \`quantity < reorder_point\` (use rawWhere for cross-column)
- Buy flag = \`buy_recommendation = true\`

### purchase_orders
Key fields: po_number, supplier_code, supplier_name, sku, item_name,
line_number, qty_ordered, qty_received, qty_open, unit_cost, line_value,
currency, status, order_date, expected_date, confirmed_eta, buyer

Rules:
- Status values are raw from CSV -- check context for actual values
- "Open" POs = whatever status value(s) the context shows as open
- Total value = SUM(\`line_value\`) -- never \`totalAmount\`
- Filter by supplier using \`supplier_code\` -- never \`supplierId\`

### products
Key fields: sku, name, type, uom, unit_cost, list_price, make_buy,
lead_time_days, moq, order_multiple, product_family, abc_class,
safety_stock, reorder_point

### suppliers
Key fields: supplier_code, name, country, city, email, lead_time_days,
payment_terms, quality_rating, on_time_pct, status, approved_since

### customers
Key fields: customer_code, name, country, city, currency,
payment_terms, credit_limit, type, status

### sales_orders
Key fields: so_number, customer_code, customer_name, sku, item_name,
line_number, qty_ordered, qty_shipped, qty_open, unit_price, line_value,
currency, status, order_date, requested_date

### bom
Key fields: fg_sku (the finished good SKU e.g. "DF-02"), fg_name,
component_sku, component_name, qty_per, uom, section, make_buy,
is_critical, component_cost, extended_cost, revision,
bom_id (the BOM identifier e.g. "BOM-DF-02-A")

Rules:
- Filter by finished good using \`fg_sku\` (e.g. \`fg_sku = "DF-02"\`).
- Do NOT filter by \`bom_id\` when the user asks about a product SKU --
  \`bom_id\` is the BOM header's own identifier, not the product's.
- Total BOM cost = SUM(\`extended_cost\`) grouped by \`fg_sku\`.
- Component count = COUNT(*) grouped by \`fg_sku\`.

### locations
Key fields: location_code, name, type, city, country

## Query Rules
1. Always use snake_case field names.
2. Status values: use EXACT values from the context -- never assume
   a legacy enum (no DRAFT / SENT / CONFIRMED / Open / Partial unless
   the context shows that exact literal). If a question asks about
   "open" POs, read the context's "Exact status values" list and
   pick whichever literal(s) represent open state for this org.
3. Numeric comparisons: \`quantity\`, \`unit_cost\`, \`line_value\`,
   \`qty_ordered\`, etc. are stored as numbers in JSONB -- use numeric
   filters, not string equality.
4. Date fields: stored as ISO date strings (YYYY-MM-DD). Compare
   against ISO strings, not Date objects.
5. Boolean fields: \`buy_recommendation\`, \`is_critical\` are stored
   as \`true\`/\`false\`.
6. Cross-dataset questions: run separate queries per dataset and
   combine the results yourself -- do NOT attempt SQL joins.

## Hallucination Guard
- Only report values that appear in tool results.
- If a tool returns 0 results, say so -- do not invent data.
- If the status values in your query don't match any in the context's
  status-value list, re-query with the correct literals shown in the
  context before answering.

## Numeric threshold operator precision
**STRICT RULE: "below X", "under X", "fewer than X", "less than X" always
means strictly less than -- use \`lt\`, never \`lte\`. Items at exactly X
are NOT below X.**

- "below X" / "under X" / "fewer than X" → strict \`lt\` (\`<\`)
- "at or below X" / "X or less" / "no more than X" → inclusive \`lte\` (\`<=\`)
- "above X" / "over X" / "more than X" → strict \`gt\` (\`>\`)
- "at least X" / "X or more" → inclusive \`gte\` (\`>=\`)

## Count vs list
- **For "how many" / count / total questions, ALWAYS use
  aggregate_records with metric COUNT** -- never count rows from
  query_records. query_records caps results, so counting returned
  rows gives wrong answers for datasets larger than the cap.
- Use query_records only when you need to list or inspect specific
  records. Cite SKUs, PO numbers, supplier codes so users can verify.

## Cross-column comparisons
Use aggregate_records with \`rawWhere\` when a comparison is between
two fields on the same row (e.g. "items where quantity below reorder
point"). rawWhere is a simple two-operand grammar --
\`field op field-or-number\` -- with both sides referenced by their
snake_case canonical names and operators from \`< <= > >= = !=\`.

Examples:
- "items below reorder point" → \`rawWhere: "quantity < reorder_point"\`
- "items at or below safety stock" → \`rawWhere: "quantity <= safety_stock"\`
- "items with fewer than 10 days of supply" → \`rawWhere: "days_of_supply < 10"\`

## Data availability gate
Before answering, check the dataset counts in the context. If the
question targets a dataset with 0 records, tell the user the data
hasn't been imported yet and point them at the Import page -- don't
speculate.

## Custom fields
Records may carry org-specific fields prefixed with \`custom:\` (for
example \`custom:on_time_delivery_pct\`, \`custom:certification\`).
They appear in the Custom Fields section of the context with fieldKey,
displayLabel, and dataType. Use the \`query_custom_field\` tool to
filter / count by a custom field value. Always cite both the fieldKey
and displayLabel so the user knows which field you mean.

## Current Dataset

${orgContext}`),
      cache_control: { type: "ephemeral" },
    },
  ];

  // Belt-and-suspenders: sweep the final system-prompt structure one
  // more time. If a future block gets appended without its own
  // sanitize call, this pass still strips non-Latin-1 before the API
  // call. Handles both text-typed blocks and the legacy plain-string
  // form (Anthropic.MessageCreateParams["system"] accepts both).
  const safeSystemPrompt: Anthropic.MessageCreateParams["system"] =
    Array.isArray(systemPrompt)
      ? systemPrompt.map((block) =>
          block.type === "text"
            ? { ...block, text: sanitizeForApi(block.text) }
            : block,
        )
      : sanitizeForApi(systemPrompt);

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
      const finalModel = model;
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
          // Sweep the message array one last time before it hits the
          // API. The live loop already sanitizes each entry point
          // (tool_result content, assistant text blocks, history
          // replay), but a final pass guarantees no em-dashed string
          // reaches Anthropic's ByteString-constrained transport.
          const safeMessages = sanitizeMessages(anthropicMessages);
          const response = await callWithRetry(
            () =>
              anthropic.messages.create({
                model: finalModel,
                max_tokens: MAX_TOKENS,
                system: safeSystemPrompt,
                messages: safeMessages,
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
                  // Sanitize so the assistant's own em-dashed prose
                  // doesn't round-trip back into the next request and
                  // blow up the same way a tool_result would.
                  contentBlocks.push({ type: "text", text: sanitizeForApi(currentText) });
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

                // Truncate large results to stay within TPM budget (row-aware).
                // Sanitize here -- ImportRecord.data routinely carries em
                // dashes and smart quotes in product names / notes /
                // section labels, and those values land in tool_result
                // content verbatim. Without the sanitize, the next
                // Anthropic call throws "Cannot convert argument to a
                // ByteString" the moment any tool output includes --.
                const truncatedResult = sanitizeForApi(
                  truncateToolResult(result, TOOL_RESULT_CHAR_LIMIT),
                );

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
                  content: sanitizeForApi(JSON.stringify({ error: errorMsg })),
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
            // No more tool calls -- we're done
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
      // User-typed content may contain em-dashes / smart quotes from
      // native macOS / Windows autocorrect. Sanitize every user
      // message text the same way we sanitize the system prompt so
      // downstream ByteString conversions don't throw.
      const userText = sanitizeForApi(msg.content);
      if (pendingToolResults) {
        // Merge tool_result blocks + user text into one user message
        messages.push({
          role: "user",
          content: [
            ...pendingToolResults,
            { type: "text" as const, text: userText },
          ],
        });
        pendingToolResults = null;
      } else {
        messages.push({ role: "user", content: userText });
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
        // Build assistant content: text (if any) + tool_use blocks.
        // Both the historical assistant prose and the stored tool
        // results can contain em dashes (from ImportRecord.data or
        // the model's own previous output), so sanitize every string
        // we replay back to the API.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const assistantContent: any[] = [];
        if (msg.content) {
          assistantContent.push({ type: "text", text: sanitizeForApi(msg.content) });
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
          const truncated =
            resultStr.length > TOOL_RESULT_CHAR_LIMIT
              ? resultStr.slice(0, TOOL_RESULT_CHAR_LIMIT) + "\n... (truncated)"
              : resultStr;
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUseId,
            content: sanitizeForApi(truncated),
          });
        }

        messages.push({ role: "assistant", content: assistantContent });
        // Hold tool results to merge with the next user message
        pendingToolResults = toolResults;
      } else {
        // Plain text assistant message -- sanitize historical prose
        // the same way the live-loop contentBlocks path does.
        messages.push({ role: "assistant", content: sanitizeForApi(msg.content) });
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
