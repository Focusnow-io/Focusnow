export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";
import { sanitizeForApi } from "@/lib/utils/sanitize";
import { queryRecords } from "@/lib/chat/record-query";

/**
 * POST /api/brain/rules/parse
 * AI-powered natural language → structured rule parsing.
 * The Brain captures operational knowledge — what IS true about the business,
 * not what should happen (no actions, no alerts).
 */
export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = await req.json();
  const { prompt, clarification } = body;

  if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
    return badRequest("prompt is required");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

  // Gather schema context: sample rows from ImportRecord + existing rules
  const orgId = ctx.org.id;
  const [invResult, prodResult, suppResult, poResult, existingRules] = await Promise.all([
    queryRecords({ dataset: "inventory",       orgId, limit: 3 }).catch(() => ({ rows: [] })),
    queryRecords({ dataset: "products",        orgId, limit: 3 }).catch(() => ({ rows: [] })),
    queryRecords({ dataset: "suppliers",       orgId, limit: 3 }).catch(() => ({ rows: [] })),
    queryRecords({ dataset: "purchase_orders", orgId, limit: 3 }).catch(() => ({ rows: [] })),
    prisma.brainRule.findMany({
      where: { organizationId: orgId },
      select: { name: true, description: true, category: true, entity: true, condition: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const schemaContext = `
## Available Entities & Fields (use these exact field names in condition.field)

### inventory
Fields: sku, location_code, quantity, reorder_point, safety_stock, unit_cost, total_value, uom, lead_time_days, moq, order_multiple, on_hold_qty, reserved_qty, open_po_qty, days_of_supply, demand_per_day, buy_recommendation, recommended_qty, last_receipt_date
Sample data: ${JSON.stringify(invResult.rows.slice(0, 3))}

### products
Fields: sku, name, type, uom, unit_cost, list_price, make_buy, lead_time_days, moq, order_multiple, product_family, abc_class, safety_stock, reorder_point, status
Sample data: ${JSON.stringify(prodResult.rows.slice(0, 3))}

### suppliers
Fields: supplier_code, name, country, city, email, phone, lead_time_days, payment_terms, currency, quality_rating, on_time_pct, certifications, status, approved_since
Sample data: ${JSON.stringify(suppResult.rows.slice(0, 3))}

### purchase_orders
Fields: po_number, supplier_code, supplier_name, sku, item_name, qty_ordered, qty_received, qty_open, unit_cost, line_value, currency, status, order_date, expected_date, confirmed_eta, uom, buyer
Sample data: ${JSON.stringify(poResult.rows.slice(0, 3))}
${existingRules.length > 0 ? `
### Existing Brain Rules
These rules already exist in this organization. Use them to understand patterns, avoid duplicates, and infer conventions (e.g., country codes, field usage).
${JSON.stringify(existingRules)}
` : ""}
`;

  const systemPrompt = `You are an operational knowledge parser for a manufacturing operations platform. Your job is to extract structured operational rules from natural language descriptions provided by Ops Managers.

The Brain layer captures WHAT is true about the business — operational thresholds, policies, constraints, and KPIs. It does NOT define actions or alerts. It only declares the operational logic.

${schemaContext}

## Available Operators
- lt: less than
- lte: less than or equal
- gt: greater than
- gte: greater than or equal
- eq: equals
- neq: does not equal

## Available Categories
- THRESHOLD: Numeric threshold rules (e.g. stock should not fall below X)
- POLICY: Business policy rules (e.g. supplier lead time should not exceed Y)
- CONSTRAINT: Constraint definitions (e.g. order total must not exceed Z)
- KPI: Key performance indicator targets (e.g. on-time delivery should be at least 90%)

## Instructions
Parse the user's natural language input into a structured operational rule. Return ONLY valid JSON with this exact structure:

{
  "name": "Short descriptive rule name",
  "description": "What operational logic this rule captures and why it matters",
  "category": "THRESHOLD|POLICY|CONSTRAINT|KPI",
  "entity": "inventory|products|suppliers|purchase_orders|sales_orders",
  "condition": {
    "field": "snake_case field name from the entity above",
    "operator": "lt|lte|gt|gte|eq|neq",
    "value": <number or string>
  },
  "summary": "Declarative plain English, e.g. 'inventory quantity should not fall below 50'",
  "confidence": 0.0-1.0
}

## Clarification Rules (STRICT)
- Be DECISIVE. Most rules can be mapped directly to an entity and field — just do it.
- NEVER ask about fields that exist in the schema above. If a field matches, use it.
- Check existing Brain rules before asking clarifying questions. If an existing rule uses a field/value pattern (e.g., country = "CN"), follow that convention instead of asking.
- Do not suggest rules that duplicate existing ones. If the user's input matches an existing rule, note it in the description.
- Set confidence >= 0.7 for any rule that maps clearly to an entity/field, even if the user phrased it informally.
- Only set confidence < 0.5 and add a clarifying question when the rule GENUINELY cannot be mapped to any available entity/field.
- Ask at most ONE question — the single most important ambiguity. Never bundle multiple questions.
- When you DO ask a clarifying question, you MUST also provide exactly 3-4 short suggested answers in a "suggestedAnswers" array:
  {"clarifyingQuestion": "Which field best represents X?", "suggestedAnswers": ["option A", "option B", "option C"]}
- When a "User clarification" is provided, ALWAYS incorporate it and produce a confident result (confidence >= 0.7). Do NOT ask follow-up questions after receiving clarification.

## Mapping Rules
If the user phrases their input as an action ("alert me when...", "flag any..."), extract the underlying operational logic:
- "Alert me when stock falls below 50" → quantity should not fall below 50
- "Flag suppliers with lead time over 30 days" → supplier lead time should not exceed 30 days

Map common operational language to the correct entity and field:
- "stock", "inventory", "SKU", "reorder point" → inventory entity, field: quantity or reorder_point
- "supplier", "vendor", "lead time", "country of origin", "country" → suppliers entity
- "purchase order", "PO", "order" → purchase_orders entity
- "product", "item cost" → products entity
- "safety stock", "reorder point" → use the matching snake_case field name
- "Chinese suppliers", "country of origin" → suppliers.country field`;

  // Token budget pre-flight check
  const budget = await checkTokenBudget(ctx.org.id, ctx.session.user!.id!, ctx.org.plan ?? "free");
  if (!budget.allowed) {
    return NextResponse.json({ error: budget.message }, { status: 429 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: "user",
        content: sanitizeForApi(clarification
          ? `${prompt.trim()}\n\nUser clarification: ${clarification}`
          : prompt.trim()),
      }],
    });

    // Record token usage
    await recordTokenUsage(ctx.org.id, ctx.session.user!.id!, "brain-parse", {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from the response (handle possible markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Failed to parse AI response", raw: text },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("[parse] AI error:", err);
    const message =
      err instanceof Anthropic.AuthenticationError
        ? "Invalid Anthropic API key"
        : err instanceof Anthropic.RateLimitError
          ? "Rate limit reached. Please try again."
          : err instanceof Error
            ? err.message
            : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
