import { NextResponse } from "next/server";
import { getSessionOrg, unauthorized, badRequest } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import { checkTokenBudget, recordTokenUsage } from "@/lib/usage/token-tracker";

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

  // Gather schema context: available entities, fields, and sample values
  const [inventorySample, productSample, supplierSample, orderSample, existingRules] =
    await Promise.all([
      prisma.inventoryItem.findMany({
        where: { organizationId: ctx.org.id },
        select: {
          quantity: true,
          reorderPoint: true,
          reorderQty: true,
          reservedQty: true,
          daysOfSupply: true,
          leadTimeDays: true,
          unitCost: true,
          totalValue: true,
          qtyOnHold: true,
          qtyOnHandTotal: true,
          qtyOpenPO: true,
          qtyOnHandPlusPO: true,
          demandCurrentMonth: true,
          demandNextMonth: true,
          demandMonth3: true,
          demandPerDay: true,
          outflow7d: true,
          outflow30d: true,
          outflow60d: true,
          outflow92d: true,
          moq: true,
          orderMultiple: true,
          buyRecommendation: true,
          recommendedQty: true,
          uom: true,
          lastReceiptDate: true,
          product: { select: { sku: true, name: true } },
        },
        take: 5,
      }),
      prisma.product.findMany({
        where: { organizationId: ctx.org.id },
        select: {
          sku: true,
          name: true,
          category: true,
          unitCost: true,
          leadTimeDays: true,
          reorderPoint: true,
          safetyStock: true,
          abcClass: true,
        },
        take: 5,
      }),
      prisma.supplier.findMany({
        where: { organizationId: ctx.org.id },
        select: {
          code: true,
          name: true,
          leadTimeDays: true,
          qualityRating: true,
          onTimePct: true,
          status: true,
          country: true,
          city: true,
          paymentTerms: true,
          certifications: true,
          active: true,
        },
        take: 5,
      }),
      prisma.order.findMany({
        where: { organizationId: ctx.org.id },
        select: {
          orderNumber: true,
          type: true,
          status: true,
          totalAmount: true,
          expectedDate: true,
        },
        take: 5,
      }),
      prisma.brainRule.findMany({
        where: { organizationId: ctx.org.id },
        select: {
          name: true,
          description: true,
          category: true,
          entity: true,
          condition: true,
          status: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
    ]);

  const schemaContext = `
## Available Entities & Fields

### InventoryItem
Fields: quantity (Decimal), reservedQty (Decimal), reorderPoint (Decimal), reorderQty (Decimal), daysOfSupply (Decimal), leadTimeDays (Int), unitCost (Decimal), totalValue (Decimal), qtyOnHold (Decimal), qtyOnHandTotal (Decimal), qtyOpenPO (Decimal), qtyOnHandPlusPO (Decimal), demandCurrentMonth (Decimal), demandNextMonth (Decimal), demandMonth3 (Decimal), demandPerDay (Decimal), outflow7d (Int), outflow30d (Int), outflow60d (Int), outflow92d (Int), moq (Int), orderMultiple (Int), buyRecommendation (Boolean), recommendedQty (Decimal), uom (String), lastReceiptDate (DateTime)
Sample data: ${JSON.stringify(inventorySample.slice(0, 3))}

### Product
Fields: unitCost (Decimal), leadTimeDays (Int), reorderPoint (Decimal), safetyStock (Decimal), shelfLifeDays (Int), abcClass (String), active (Boolean)
Sample data: ${JSON.stringify(productSample.slice(0, 3))}

### Supplier
Fields: leadTimeDays (Int), qualityRating (Decimal), onTimePct (Decimal), status (String), active (Boolean), country (String), city (String), paymentTerms (String), certifications (String)
Sample data: ${JSON.stringify(supplierSample.slice(0, 3))}

### Order
Fields: totalAmount (Decimal), status (String: OPEN, CONFIRMED, SHIPPED, DELIVERED, CANCELLED), expectedDate (DateTime), orderDate (DateTime), type (String: PURCHASE, SALES)
Sample data: ${JSON.stringify(orderSample.slice(0, 3))}
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
  "entity": "InventoryItem|Product|Supplier|Order",
  "condition": {
    "field": "field_name from the entity",
    "operator": "lt|lte|gt|gte|eq|neq",
    "value": <number or string>
  },
  "summary": "Declarative plain English, e.g. 'InventoryItem quantity should not fall below 50'",
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
- "stock", "inventory", "SKU", "reorder point" → InventoryItem
- "supplier", "vendor", "lead time", "country of origin", "country" → Supplier
- "purchase order", "PO", "order" → Order
- "product", "item cost" → Product
- "safety stock", "reorder point" → use the matching field name
- "Chinese suppliers", "country of origin" → Supplier.country field`;

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
        content: clarification
          ? `${prompt.trim()}\n\nUser clarification: ${clarification}`
          : prompt.trim(),
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
