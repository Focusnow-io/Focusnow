/**
 * Org context builder — reads the new ImportDataset / ImportRecord store.
 *
 * The AI sees one section per dataset this org has imported, with the
 * record count, how long ago it landed, the canonical field list, and
 * a sample row so it knows what to reach for. No hardcoded vocabulary:
 * if the org has no PO data yet, no PO section appears. The dataset
 * vocabulary for the AI's tool calls is supplied separately through
 * the tool descriptions in tools.ts.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DATASETS, type DatasetName } from "@/lib/ingestion/datasets";
import { sanitizeForApi } from "@/lib/utils/sanitize";

// Datasets that carry a status field worth surfacing to the AI. The
// value is the JSONB key to aggregate on. When a dataset isn't here,
// we skip the status-value lookup entirely to keep context small.
const STATUS_FIELDS: Partial<Record<string, string>> = {
  purchase_orders: "status",
  sales_orders: "status",
  suppliers: "status",
  inventory: "status",
};

// ─── Cache ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000;

const contextCache = new Map<
  string,
  { context: string; builtAt: number; tokenEstimate: number }
>();

export function invalidateOrgContextCache(orgId: string) {
  contextCache.delete(orgId);
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function buildOrgContext(orgId: string): Promise<string> {
  const cached = contextCache.get(orgId);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    console.log(
      `[CHAT] context cache HIT for org=${orgId} (${cached.tokenEstimate} est. tokens)`,
    );
    return cached.context;
  }

  const context = await buildContextInternal(orgId);
  const tokenEstimate = Math.ceil(context.length / 4);
  console.log(
    `[CHAT] context cache MISS for org=${orgId} — built ${tokenEstimate} est. tokens (${context.length} chars)`,
  );

  contextCache.set(orgId, { context, builtAt: Date.now(), tokenEstimate });
  return context;
}

export function getContextTokenEstimate(orgId: string): number {
  const cached = contextCache.get(orgId);
  return cached ? cached.tokenEstimate : 0;
}

// ─── Internal ──────────────────────────────────────────────────────────────

function relativeDays(imported: Date): string {
  const diffDays = Math.floor(
    (Date.now() - imported.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

async function buildContextInternal(orgId: string): Promise<string> {
  // Latest ImportDataset per dataset name, grouped by label for display.
  // A dataset can be re-imported multiple times (one row per upload);
  // the freshest row tells the AI how recent the data is.
  const datasets = await prisma.importDataset.findMany({
    where: { organizationId: orgId },
    orderBy: { importedAt: "desc" },
    select: {
      name: true,
      label: true,
      importedAt: true,
      rowCount: true,
      importedRows: true,
    },
  });

  if (datasets.length === 0) {
    return [
      "# Data context",
      "",
      "No data has been imported yet. The user needs to upload a CSV or",
      "Excel file from the Import page before you can answer data questions.",
    ].join("\n");
  }

  const latestByDataset = new Map<string, (typeof datasets)[number]>();
  for (const ds of datasets) {
    if (!latestByDataset.has(ds.name)) latestByDataset.set(ds.name, ds);
  }

  const counts = await prisma.importRecord.groupBy({
    by: ["datasetName"],
    where: { organizationId: orgId },
    _count: { id: true },
  });
  const countMap: Record<string, number> = {};
  for (const c of counts) countMap[c.datasetName] = c._count.id;

  const sections: string[] = [
    "# Data context",
    "",
    "The following datasets have been imported for this organisation.",
    "Use the `query_records` and `aggregate_records` tools with the",
    "dataset name shown after each heading. Field names are snake_case",
    "and listed under each dataset.",
    "",
  ];

  const orderedNames = Array.from(latestByDataset.keys()).sort((a, b) => {
    const ia = Object.keys(DATASETS).indexOf(a);
    const ib = Object.keys(DATASETS).indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  for (const datasetName of orderedNames) {
    const dataset = latestByDataset.get(datasetName)!;
    const count = countMap[datasetName] ?? 0;
    if (count === 0) continue;

    const schema = DATASETS[datasetName as DatasetName];
    const fieldKeys = schema ? Object.keys(schema.fields) : [];

    // Pull one real sample so the AI knows what values look like for
    // this specific org — useful for understanding status vocabularies,
    // date formats, etc., without blowing the context up.
    const [sample] = await prisma.importRecord.findMany({
      where: { organizationId: orgId, datasetName },
      select: { data: true },
      orderBy: { importedAt: "desc" },
      take: 1,
    });
    const sampleData = (sample?.data as Record<string, unknown> | undefined) ?? {};
    const extraFields = Object.keys(sampleData).filter(
      (k) => !fieldKeys.includes(k),
    );

    sections.push(`## ${dataset.label} — dataset: \`${datasetName}\``);
    sections.push(`- Records: ${count.toLocaleString()}`);
    sections.push(`- Last imported: ${relativeDays(dataset.importedAt)}`);
    if (fieldKeys.length > 0) {
      sections.push(`- Canonical fields: ${fieldKeys.join(", ")}`);
    }
    if (extraFields.length > 0) {
      sections.push(`- Custom fields in this org's data: ${extraFields.join(", ")}`);
    }

    // Status-value sampling — surface the exact literals that live in
    // this org's data so the AI never invents legacy enums when
    // filtering. Scoped to datasets where a status field actually
    // exists per STATUS_FIELDS.
    const statusField = STATUS_FIELDS[datasetName];
    if (statusField) {
      try {
        const statusRows = await prisma.$queryRaw<
          Array<{ val: string | null; cnt: bigint }>
        >(Prisma.sql`
          SELECT "data"->>${statusField} AS val, COUNT(*)::bigint AS cnt
          FROM "ImportRecord"
          WHERE "organizationId" = ${orgId}
            AND "datasetName" = ${datasetName}
            AND "data"->>${statusField} IS NOT NULL
          GROUP BY "data"->>${statusField}
          ORDER BY COUNT(*) DESC
          LIMIT 10
        `);
        if (statusRows.length > 0) {
          const statusList = statusRows
            .filter((r) => r.val)
            .map((r) => `"${r.val}" (${Number(r.cnt)} records)`)
            .join(", ");
          sections.push(`- Exact status values: ${statusList}`);
          sections.push(
            `- Use ONLY these literals when filtering by status — no legacy enums.`,
          );
        }
      } catch (err) {
        // Non-fatal — missing status column just means no list appears.
        console.warn(`[build-context] status sampling failed for ${datasetName}:`, err);
      }
    }

    // Sample record — first 8 fields only, so the AI sees the shape
    // and value formats without the context ballooning. Sanitize the
    // whole preview because CSV-sourced values frequently carry em
    // dashes, smart quotes, and non-breaking spaces that blow up
    // downstream ByteString conversions.
    if (Object.keys(sampleData).length > 0) {
      const preview = sanitizeForApi(
        Object.entries(sampleData)
          .slice(0, 8)
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .join(", "),
      );
      sections.push(`- Sample record: { ${preview} }`);
    }
    sections.push("");
  }

  // Belt-and-suspenders sanitize at the source — every caller of
  // buildOrgContext now gets a byte-string-safe payload regardless
  // of what slipped through the per-field wrapping above.
  return sanitizeForApi(sections.join("\n"));
}
