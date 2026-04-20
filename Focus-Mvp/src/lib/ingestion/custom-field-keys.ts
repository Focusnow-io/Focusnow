/**
 * Pure (no-prisma) utilities for mapping CSV column headers onto the
 * normalised keys stored inside the `attributes` JSONB blob + on
 * CustomFieldSchema.fieldKey.
 *
 * This file must stay dependency-free so it can be imported from client
 * bundles (e.g. src/lib/ingestion/field-mapper.ts is used by the import
 * page) without pulling Prisma along with it.
 */

/** Share of non-empty samples that must agree on a type for inference to lock
 *  onto that type (keeps a few stray values from pushing us to plain text). */
const INFERENCE_THRESHOLD = 0.8;

/** Accepts strict ISO-style dates (YYYY-MM-DD) plus common slash/dot variants
 *  (DD/MM/YYYY, MM/DD/YYYY, YYYY.MM.DD). Intentionally narrow — free-form
 *  date text should fall through to "text". */
const DATE_REGEX =
  /^\s*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\s*$/;

const BOOLEAN_TOKENS = new Set([
  "y", "n", "yes", "no", "true", "false", "t", "f", "1", "0",
]);

/**
 * Infer the data type of a custom field from its sample values.
 * Returns "number" | "date" | "boolean" | "text".
 */
export function inferCustomFieldType(samples: string[]): string {
  const cleaned = samples
    .map((s) => (s == null ? "" : String(s).trim()))
    .filter((s) => s !== "");
  if (cleaned.length === 0) return "text";

  let numberHits = 0;
  let dateHits = 0;
  let booleanHits = 0;

  for (const s of cleaned) {
    const numLike = s.replace(/%$/, "").replace(/,/g, "");
    if (numLike !== "" && !isNaN(Number(numLike))) numberHits++;
    if (DATE_REGEX.test(s)) dateHits++;
    if (BOOLEAN_TOKENS.has(s.toLowerCase())) booleanHits++;
  }

  const threshold = cleaned.length * INFERENCE_THRESHOLD;
  if (booleanHits >= threshold) return "boolean";
  if (numberHits >= threshold) return "number";
  if (dateHits >= threshold) return "date";
  return "text";
}

/**
 * Normalise a CSV column header to a safe JSONB key.
 *   "On-Time Delivery %" → "on_time_delivery_pct"
 *   "Certification Level" → "certification_level"
 *   "Lead Time (Days)" → "lead_time_days"
 */
export function normaliseToFieldKey(columnHeader: string): string {
  return columnHeader
    .toLowerCase()
    .replace(/%/g, "_pct")
    .replace(/[()]/g, "")
    .replace(/[\s\-/]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
