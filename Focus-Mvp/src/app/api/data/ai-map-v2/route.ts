export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionOrg, unauthorized } from "@/lib/api-helpers";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";

/**
 * POST /api/data/ai-map-v2
 *
 * Claude-Haiku assisted column mapper for the JSONB import pipeline.
 * The alias matcher in dataset-mapper.ts handles the 80% case; this
 * endpoint resolves the remainder — ambiguous columns where header
 * names collide (e.g. "BOM ID" vs "FG SKU" on a BOM file), or where
 * a column is unmapped entirely.
 *
 * The AI is given:
 *   - the canonical field set for the dataset
 *   - already-confirmed high-confidence mappings (so it can't reassign)
 *   - the ambiguous columns with up to 5 sample values each
 *
 * It returns a map of { [sourceHeader]: canonicalFieldKey | null }.
 * null means "this column doesn't fit any canonical field — store
 * as a custom field via the JSONB data blob". The caller validates
 * every returned field against the dataset vocabulary before trusting it.
 */

interface AmbiguousColumn {
  header: string;
  sampleValues: string[];
  currentMapping: string | null;
  confidence: number;
}

interface AiMapRequest {
  dataset: DatasetName;
  ambiguousColumns: AmbiguousColumn[];
  confirmedMappings: Record<string, string>;
}

export async function POST(req: Request) {
  const ctx = await getSessionOrg();
  if (!ctx) return unauthorized();

  if (!process.env.ANTHROPIC_API_KEY) {
    // Fail open — caller keeps the alias-based mapping if AI isn't
    // configured. Logging here lets us spot missing envs in prod
    // without breaking imports.
    console.warn("[ai-map-v2] ANTHROPIC_API_KEY missing, skipping AI mapping");
    return NextResponse.json({ mappings: {} });
  }

  const body = (await req.json().catch(() => null)) as AiMapRequest | null;
  if (!body?.dataset || !body.ambiguousColumns?.length) {
    return NextResponse.json({ mappings: {} });
  }

  const { dataset, ambiguousColumns, confirmedMappings } = body;
  const datasetDef = DATASETS[dataset];
  if (!datasetDef) {
    return NextResponse.json({ mappings: {} });
  }

  // Fields still open for assignment — the AI can only pick from these.
  // Also surface the header-vs-identifier distinction (e.g. fg_sku vs
  // bom_id on BOM) via the label text so value inspection carries the
  // right signal.
  const fieldDescriptions = Object.entries(datasetDef.fields)
    .filter(([key]) => !confirmedMappings[key])
    .map(([key, def]) => `  ${key}: ${def.label} (${def.type})`)
    .join("\n");

  const columnDescriptions = ambiguousColumns
    .map(
      (c) =>
        `  "${c.header}": samples = [${c.sampleValues
          .slice(0, 5)
          .map((v) => `"${v.replace(/"/g, '\\"')}"`)
          .join(", ")}]`,
    )
    .join("\n");

  const prompt = `You are mapping CSV columns to canonical field names for a ${datasetDef.label} dataset.

Already confirmed mappings (do not reassign these fields):
${
  Object.entries(confirmedMappings)
    .map(([k, v]) => `  ${k} → "${v}"`)
    .join("\n") || "  (none)"
}

Unassigned canonical fields that still need mapping:
${fieldDescriptions}

CSV columns that need classification (with sample values):
${columnDescriptions}

For each CSV column, decide:
1. Which canonical field it maps to (if any) — choose from the unassigned fields list only
2. Or return null if it doesn't match any canonical field (it will be stored as a custom field)

Rules:
- Look at the SAMPLE VALUES, not just the column name, to determine the correct mapping.
- A column named "BOM ID" with values like "BOM-DF-02-A" is a BOM reference ID, NOT the finished good SKU.
- A column named "FG SKU" with values like "DF-02" IS the finished good SKU (fg_sku).
- Each canonical field can only be assigned to ONE column.
- Prefer specificity — "Supplier Code" with values like "SUP-001" maps to supplier_code not name.
- If two columns could map to the same field, pick the one whose sample values better match.

Respond with ONLY a JSON object mapping column headers to canonical field keys (or null):
{
  "Column Header": "canonical_field_key" or null
}
No explanation. No markdown. Just the JSON object.`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/```json|```/g, "").trim();
    let aiMappings: Record<string, string | null>;
    try {
      aiMappings = JSON.parse(cleaned) as Record<string, string | null>;
    } catch (parseErr) {
      console.error("[ai-map-v2] Bad JSON from Haiku:", parseErr, text);
      return NextResponse.json({ mappings: {} });
    }

    // Validate — the Haiku output is untrusted. Only accept mappings
    // where the canonical field exists on the dataset and hasn't
    // already been confirmed. Also reject if the AI tries to
    // reassign a header that's already in confirmedMappings.
    const validFields = new Set(Object.keys(datasetDef.fields));
    const confirmedHeaders = new Set(Object.values(confirmedMappings));
    const validated: Record<string, string | null> = {};

    for (const [header, field] of Object.entries(aiMappings)) {
      if (field === null) {
        validated[header] = null;
        continue;
      }
      if (typeof field !== "string") continue;
      if (!validFields.has(field)) continue;
      if (confirmedMappings[field]) continue; // field already assigned
      if (confirmedHeaders.has(header)) continue; // header already claimed
      validated[header] = field;
    }

    console.log(
      `[ai-map-v2] dataset=${dataset} classified ${ambiguousColumns.length} columns:`,
      validated,
    );

    return NextResponse.json({ mappings: validated });
  } catch (err) {
    console.error("[ai-map-v2] Error:", err);
    return NextResponse.json({ mappings: {} });
  }
}
