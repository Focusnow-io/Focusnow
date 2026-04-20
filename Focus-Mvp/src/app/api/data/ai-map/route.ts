import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import {
  upsertCustomFieldSchemas,
  normaliseToFieldKey,
  inferCustomFieldType,
} from "@/lib/ingestion/custom-fields";

const AI_MODEL = "claude-haiku-4-5-20251001";
const ALLOWED_ENTITY_TYPES = new Set([
  "InventoryItem",
  "Supplier",
  "Product",
  "PurchaseOrder",
  "POLine",
]);

const SYSTEM_PROMPT = `You are a data field mapper for an industrial manufacturing operations platform.
Your job is to analyse CSV column headers and sample values, then classify each
column as either:
1. A CANONICAL field that maps to our schema
2. A CUSTOM field that is specific to this company

You must respond with ONLY a valid JSON array, no other text.
Each element must have this exact shape:
{
  "header": "<original column header>",
  "type": "canonical" | "custom",
  "canonicalField": "<field name if type=canonical, else null>",
  "displayLabel": "<clean human label if type=custom, else null>",
  "reason": "<one sentence explaining your decision>"
}

CANONICAL fields for InventoryItem:
quantity, reorderPoint, reorderQty, unitCost, totalValue, daysOfSupply,
demandPerDay, leadTimeDays, moq, orderMultiple, buyRecommendation,
recommendedQty, qtyOnHold, lastReceiptDate, expiryDate, safetyStock

CANONICAL fields for Supplier:
code, name, email, phone, country, city, leadTimeDays, paymentTerms,
qualityRating, onTimePct, certifications, leadTimeCategory, approvedSince

CANONICAL fields for Product:
sku, name, description, category, unit, unitCost, unitPrice, type,
makeBuy, leadTimeDays, safetyStock, reorderPoint, productFamily,
shelfLifeDays, abcClass, productLine, regulatoryClass, listPrice

CANONICAL fields for PurchaseOrder:
poNumber, supplierId, status, totalAmount, currency, expectedDate,
confirmedETA, orderDate, poType, totalLines

CANONICAL fields for POLine:
purchaseOrderId, sku, qtyOrdered, qtyReceived, qtyOpen, unitCost,
status, lineNumber, itemName, lineValue

For each column: if it clearly maps to a canonical field (even with a
different name), mark it canonical. If it's company-specific data that
doesn't fit any canonical field, mark it custom.
For custom fields, write a clean display label (Title Case, no symbols).`;

interface UnmappedColumn {
  header: string;
  sampleValues: string[];
  columnType: string;
}

interface AiClassification {
  header: string;
  type: "canonical" | "custom";
  canonicalField: string | null;
  displayLabel: string | null;
  reason: string;
}

function buildUserMessage(entityType: string, columns: UnmappedColumn[]): string {
  const lines = [`Entity type: ${entityType}`, "", "Unmapped columns to classify:"];
  for (const col of columns) {
    lines.push(`Column: "${col.header}"`);
    lines.push(`Type: ${col.columnType}`);
    lines.push(`Sample values: ${col.sampleValues.join(", ")}`);
    lines.push("---");
  }
  return lines.join("\n");
}

/** Pull the first JSON array out of the model output. The system prompt asks
 *  for "ONLY a valid JSON array, no other text", but we defend against minor
 *  preamble/trailing whitespace the model may still emit. */
function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf("[");
    const last = trimmed.lastIndexOf("]");
    if (first === -1 || last === -1 || last <= first) throw new Error("No JSON array in response");
    return JSON.parse(trimmed.slice(first, last + 1));
  }
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  const body = (await req.json()) as {
    sourceId?: string;
    entityType?: string;
    unmappedColumns?: UnmappedColumn[];
  };

  const { sourceId, entityType } = body;
  const unmappedColumns = Array.isArray(body.unmappedColumns) ? body.unmappedColumns : [];

  if (!sourceId || !entityType) {
    return NextResponse.json(
      { error: "sourceId and entityType are required" },
      { status: 400 }
    );
  }
  if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json(
      { error: `Unsupported entityType: ${entityType}` },
      { status: 400 }
    );
  }
  if (unmappedColumns.length === 0) {
    return NextResponse.json({ canonicalMappings: {}, customFields: [] });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[ai-map] ANTHROPIC_API_KEY not set — returning empty result");
    return NextResponse.json({ canonicalMappings: {}, customFields: [] });
  }

  // ── Call Claude ────────────────────────────────────────────────────────
  let classifications: AiClassification[];
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(entityType, unmappedColumns) }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Model returned no text content");
    }
    const parsed = extractJsonArray(textBlock.text);
    if (!Array.isArray(parsed)) throw new Error("Model response was not an array");
    classifications = parsed as AiClassification[];
  } catch (err) {
    console.error("[ai-map] Claude call/parse failed:", err);
    // Non-blocking: let the import proceed as if no AI mapping happened.
    return NextResponse.json({ canonicalMappings: {}, customFields: [] });
  }

  // ── Split canonical vs custom ──────────────────────────────────────────
  const canonicalMappings: Record<string, string> = {};
  const customFields: Array<{
    sourceColumn: string;
    fieldKey: string;
    displayLabel: string;
    dataType: string;
    sampleValues: string[];
  }> = [];

  const samplesByHeader = new Map(unmappedColumns.map((c) => [c.header, c.sampleValues]));

  for (const c of classifications) {
    if (!c || typeof c.header !== "string") continue;
    const samples = samplesByHeader.get(c.header) ?? [];

    if (c.type === "canonical" && c.canonicalField) {
      // { canonicalField → source header } matches the shape of suggestedMapping.
      canonicalMappings[c.canonicalField] = c.header;
    } else if (c.type === "custom") {
      const fieldKey = normaliseToFieldKey(c.header);
      if (!fieldKey) continue;
      customFields.push({
        sourceColumn: c.header,
        fieldKey,
        displayLabel: c.displayLabel?.trim() || c.header,
        dataType: inferCustomFieldType(samples),
        sampleValues: samples.slice(0, 5),
      });
    }
  }

  // ── Persist custom field schemas (org-scoped) ──────────────────────────
  console.log(
    `[ai-map] org=${ctx.org.id} entity=${entityType} classified`,
    `canonical=${Object.keys(canonicalMappings).length}`,
    `custom=${customFields.length}`,
    customFields.length > 0
      ? `customKeys=${customFields.map((f) => `${f.fieldKey}:${f.dataType}`).join(",")}`
      : "",
  );

  if (customFields.length > 0) {
    console.log(
      `[ai-map] upserting ${customFields.length} custom field(s) to CustomFieldSchema:`,
      customFields.map((f) => f.sourceColumn),
    );
    try {
      await upsertCustomFieldSchemas(
        ctx.org.id,
        entityType,
        customFields.map((f) => ({ sourceColumn: f.sourceColumn, sampleValues: f.sampleValues })),
      );
      console.log("[ai-map] upsert complete");

      // Verification read — confirms rows actually made it into the table
      // and not a silent driver-level drop. Surfaces in Railway/Vercel logs.
      try {
        const written = await prisma.customFieldSchema.findMany({
          where: { organizationId: ctx.org.id, entityType },
          select: { fieldKey: true },
        });
        console.log(
          `[ai-map] CustomFieldSchema rows after upsert: count=${written.length}`,
          written.map((r) => r.fieldKey),
        );
      } catch (err) {
        console.error(
          "[ai-map] post-upsert verification read failed:",
          err instanceof Error ? err.stack ?? err.message : err,
        );
      }
    } catch (err) {
      // Log and continue — the import must not be blocked on a schema write.
      console.error(
        "[ai-map] upsertCustomFieldSchemas failed — custom fields will NOT appear in the chat context",
        err instanceof Error ? err.stack ?? err.message : err,
      );
    }
  }

  return NextResponse.json({ canonicalMappings, customFields });
}
