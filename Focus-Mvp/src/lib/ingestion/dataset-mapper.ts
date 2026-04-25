/**
 * Column mapper + dataset detector for the JSONB import pipeline.
 *
 * Given a list of CSV headers, `suggestDatasetMapping` returns a best-
 * guess mapping from canonical field key → source header for a specific
 * dataset. `detectDataset` runs the same logic across every dataset and
 * ranks them so the import UI can auto-pick.
 *
 * Operates on the alias vocabulary in datasets.ts only — no dependency
 * on CANONICAL_FIELDS or the old field-mapper.
 */

import { DATASETS, DATASET_FIELD_ALIASES, type DatasetName } from "./datasets";

/** Normalise a header or alias so comparisons are tolerant of case,
 *  punctuation, extra spacing, and underscore/hyphen differences. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface MappingResult {
  /** canonical field → primary source CSV column header */
  mapping: Record<string, string>;
  /** canonical field → confidence score 0..1 */
  confidence: Record<string, number>;
  /** canonical field → ALL candidate source headers ordered best-first.
   *  Used by applyDatasetMapping to coalesce across multiple columns that
   *  alias to the same field (e.g. "SKU", "Item No", "Product Code"). */
  fallbackMapping: Record<string, string[]>;
  /** columns not mapped to any canonical field */
  unmappedColumns: string[];
  /** canonical fields not covered by any column */
  unmappedFields: string[];
}

/** Best-guess canonical→source mapping for one dataset.
 *
 *  Each canonical field claims the best header in the file by comparing
 *  the field's alias list to every header under a normalised equality
 *  check; partial substring overlaps score proportional to the shorter
 *  string's length. Headers claimed by one field are not considered for
 *  subsequent fields. */
export function suggestDatasetMapping(
  headers: string[],
  datasetName: DatasetName,
): MappingResult {
  const aliases = DATASET_FIELD_ALIASES[datasetName];
  const fields = Object.keys(DATASETS[datasetName].fields);
  const mapping: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const mappedHeaders = new Set<string>();

  // Pre-normalise headers once so we don't repeat the work per-field.
  const normHeaders = headers.map((h) => ({ orig: h, norm: normalise(h) }));

  for (const fieldKey of fields) {
    const fieldAliases = (aliases as Record<string, string[]> | undefined)?.[fieldKey] ?? [];
    // Include the canonical field name itself as a fallback alias so a
    // CSV whose header already matches the canonical key (e.g. "sku")
    // still resolves without being explicitly registered.
    const candidates = [fieldKey, ...fieldAliases].map(normalise);

    let bestHeader: string | null = null;
    let bestScore = 0;

    for (const { orig, norm } of normHeaders) {
      if (mappedHeaders.has(orig)) continue;

      for (const alias of candidates) {
        if (norm === alias) {
          if (1.0 > bestScore) {
            bestScore = 1.0;
            bestHeader = orig;
          }
        } else if (norm.includes(alias) || alias.includes(norm)) {
          const score =
            Math.min(norm.length, alias.length) /
            Math.max(norm.length, alias.length);
          if (score > bestScore) {
            bestScore = score;
            bestHeader = orig;
          }
        }
      }
    }

    if (bestHeader && bestScore >= 0.6) {
      mapping[fieldKey] = bestHeader;
      confidence[fieldKey] = bestScore;
      mappedHeaders.add(bestHeader);
    }
  }

  // Second pass: for each field, collect ALL headers (including those claimed
  // by other fields) that score ≥ 0.6, ordered best-first. Used by
  // applyDatasetMapping to coalesce across multiple columns that alias to the
  // same canonical field (e.g. a messy CSV where "SKU", "Item No", and
  // "Product Code" all carry the same data but only one column is filled per row).
  const fallbackMapping: Record<string, string[]> = {};
  for (const fieldKey of fields) {
    const fieldAliases = (aliases as Record<string, string[]> | undefined)?.[fieldKey] ?? [];
    const candidates = [fieldKey, ...fieldAliases].map(normalise);

    const scored: Array<{ header: string; score: number }> = [];
    for (const { orig, norm } of normHeaders) {
      let bestScore = 0;
      for (const alias of candidates) {
        if (norm === alias) {
          bestScore = Math.max(bestScore, 1.0);
        } else if (norm.includes(alias) || alias.includes(norm)) {
          const score =
            Math.min(norm.length, alias.length) /
            Math.max(norm.length, alias.length);
          bestScore = Math.max(bestScore, score);
        }
      }
      if (bestScore >= 0.6) {
        scored.push({ header: orig, score: bestScore });
      }
    }

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      fallbackMapping[fieldKey] = scored.map((s) => s.header);
    }
  }

  const unmappedColumns = headers.filter((h) => !mappedHeaders.has(h));
  const unmappedFields = fields.filter((f) => !mapping[f]);

  return { mapping, confidence, fallbackMapping, unmappedColumns, unmappedFields };
}

/** Sentinel values that are treated as "empty" during fallback coalescing.
 *  Avoids propagating literal text artefacts from messy CSVs. */
const EMPTY_SENTINELS = new Set(["null", "n/a", "na", "none", "-", "--", ""]);

/** Apply a canonical→source mapping to turn one raw CSV row into a
 *  canonical-key-keyed object ready for record-importer's coercion.
 *
 *  When `fallbackMapping` is provided, each canonical field is resolved
 *  by iterating through its candidate source columns in order and using
 *  the first non-empty, non-sentinel value. This handles messy CSVs where
 *  the same data (e.g. a SKU) is spread across multiple columns that are
 *  only partially filled per row. */
export function applyDatasetMapping(
  row: Record<string, string>,
  mapping: Record<string, string>,
  fallbackMapping?: Record<string, string[]>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [canonicalKey, primaryHeader] of Object.entries(mapping)) {
    const candidates = fallbackMapping?.[canonicalKey] ?? [primaryHeader];
    for (const col of candidates) {
      if (!col) continue;
      const raw = row[col];
      if (raw === undefined || raw === null) continue;
      const str = String(raw).trim();
      if (EMPTY_SENTINELS.has(str.toLowerCase())) continue;
      result[canonicalKey] = raw;
      break;
    }
  }
  return result;
}

/** Filename tokens that provide a weak-but-useful bias during dataset
 *  detection. Applied as an additive score bonus so column evidence
 *  still wins over a misleading filename. */
const FILENAME_HINTS: Record<string, DatasetName> = {
  inventory: "inventory",
  stock: "inventory",
  inv: "inventory",
  purchase: "purchase_orders",
  po: "purchase_orders",
  procurement: "purchase_orders",
  sales: "sales_orders",
  so: "sales_orders",
  orders: "sales_orders",
  bom: "bom",
  bill_of_materials: "bom",
  components: "bom",
  supplier: "suppliers",
  vendor: "suppliers",
  customer: "customers",
  client: "customers",
  product: "products",
  sku: "products",
  item: "products",
  location: "locations",
  warehouse: "locations",
};

/** Rank every dataset by how well its canonical vocabulary matches the
 *  file's headers. Primary sort is identity-field coverage; secondary is
 *  the summed confidence normalised by dataset size. Filename hints add
 *  a small bonus to the matching dataset's score. */
export function detectDataset(
  headers: string[],
  sampleRows: Record<string, string>[],
  filenameHint?: string,
): Array<{ dataset: DatasetName; score: number; identityFieldsMatched: number }> {
  // sampleRows are intentionally unused in this first cut — the alias
  // matcher keys off headers alone. Kept in the signature so future
  // value-based heuristics (e.g. "this column looks like a date, so it
  // can't be SKU") can be added without a breaking change.
  void sampleRows;

  const results: Array<{
    dataset: DatasetName;
    score: number;
    identityFieldsMatched: number;
  }> = [];

  for (const datasetName of Object.keys(DATASETS) as DatasetName[]) {
    const { mapping, confidence } = suggestDatasetMapping(headers, datasetName);
    const dataset = DATASETS[datasetName];

    const totalScore = Object.values(confidence).reduce((a, b) => a + b, 0);
    const fieldCount = Object.keys(dataset.fields).length;
    const normalizedScore = fieldCount > 0 ? totalScore / fieldCount : 0;

    const identityFieldsMatched = dataset.identityFields.filter(
      (f) => mapping[f],
    ).length;

    if (normalizedScore > 0.1 || identityFieldsMatched > 0) {
      results.push({
        dataset: datasetName,
        score: normalizedScore,
        identityFieldsMatched,
      });
    }
  }

  if (filenameHint) {
    const filenameLower = filenameHint.toLowerCase().replace(/[^a-z_]/g, "_");
    for (const [hint, dataset] of Object.entries(FILENAME_HINTS)) {
      if (filenameLower.includes(hint)) {
        const existing = results.find((r) => r.dataset === dataset);
        if (existing) existing.score += 0.3;
      }
    }
  }

  return results.sort((a, b) => {
    if (b.identityFieldsMatched !== a.identityFieldsMatched) {
      return b.identityFieldsMatched - a.identityFieldsMatched;
    }
    return b.score - a.score;
  });
}
