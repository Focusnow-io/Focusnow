/**
 * JSONB import processor.
 *
 * Writes canonical rows to the ImportRecord table. No FK resolution, no
 * parent stubs, no relational cascade — rows are just typed JSONB blobs
 * keyed by a dataset-specific externalId for deduplication.
 *
 * The atomic unit of work is one upload (one ImportDataset). Replace mode
 * clears the org's existing records for the dataset up-front; merge mode
 * unions the new fields over whatever is already stored per externalId.
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { DATASETS, buildExternalId, type DatasetName } from "./datasets";

export interface ImportRowResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

/** Coerce one raw row into typed canonical data based on the dataset
 *  field definitions. Empty / whitespace-only / non-coercible values are
 *  dropped so we don't overwrite existing values with nulls during merge. */
function coerceRow(
  row: Record<string, unknown>,
  datasetName: DatasetName,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const fields = DATASETS[datasetName].fields as Record<
    string,
    { type: "string" | "number" | "boolean" | "date" }
  >;
  for (const [fieldKey, fieldDef] of Object.entries(fields)) {
    const val = row[fieldKey];
    if (val === null || val === undefined) continue;
    const str = String(val).trim();
    if (str === "") continue;

    switch (fieldDef.type) {
      case "number": {
        const num = Number(str.replace(/,/g, ""));
        if (!isNaN(num)) data[fieldKey] = num;
        break;
      }
      case "boolean": {
        const lower = str.toLowerCase();
        if (["true", "yes", "y", "1", "x"].includes(lower)) data[fieldKey] = true;
        else if (["false", "no", "n", "0"].includes(lower)) data[fieldKey] = false;
        // Unrecognised token: leave unset so existing merge value wins.
        break;
      }
      case "date": {
        const d = new Date(str);
        if (!isNaN(d.getTime())) data[fieldKey] = d.toISOString().split("T")[0];
        break;
      }
      default:
        data[fieldKey] = str;
    }
  }
  return data;
}

/** Upsert a batch of canonical rows into ImportRecord.
 *
 *  `rows` are expected to already be mapped to canonical field keys via
 *  `applyDatasetMapping`. This function owns typing (number/boolean/date
 *  coercion), externalId derivation, and the merge/replace branching. */
export async function importRecords(
  orgId: string,
  datasetId: string,
  datasetName: DatasetName,
  rows: Record<string, unknown>[],
  importMode: "merge" | "replace",
): Promise<ImportRowResult> {
  const result: ImportRowResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  // Replace mode: clear existing records for this dataset first. The
  // unique constraint on (orgId, datasetName, externalId) then makes
  // every upsert below a create.
  if (importMode === "replace") {
    await prisma.importRecord.deleteMany({
      where: { organizationId: orgId, datasetName },
    });
  }

  const BATCH_SIZE = 100;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row, batchIdx) => {
        const rowNum = i + batchIdx + 1;
        try {
          const data = coerceRow(row, datasetName);
          const externalId = buildExternalId(datasetName, data);

          if (!externalId) {
            // No identity fields in this row — append as an orphan record
            // so downstream dashboards still see it. The NULL externalId
            // means it can't be merged against future re-imports, which is
            // the only sensible behaviour when we have nothing to key on.
            await prisma.importRecord.create({
              data: {
                organizationId: orgId,
                datasetId,
                datasetName,
                externalId: null,
                data: data as Prisma.InputJsonValue,
              },
            });
            result.created++;
            return;
          }

          const existing = await prisma.importRecord.findUnique({
            where: {
              organizationId_datasetName_externalId: {
                organizationId: orgId,
                datasetName,
                externalId,
              },
            },
            select: { id: true, data: true },
          });

          if (existing) {
            // Merge: union new fields over stored ones so re-importing a
            // subset of columns doesn't wipe the rest. Replace: stored
            // fields were already wiped by deleteMany — we'll only hit
            // this branch for duplicate rows within the same file, where
            // last-write-wins is fine.
            const nextData =
              importMode === "merge"
                ? {
                    ...((existing.data as Record<string, unknown>) ?? {}),
                    ...data,
                  }
                : data;
            await prisma.importRecord.update({
              where: { id: existing.id },
              data: {
                data: nextData as Prisma.InputJsonValue,
                datasetId,
                importedAt: new Date(),
              },
            });
            result.updated++;
          } else {
            await prisma.importRecord.create({
              data: {
                organizationId: orgId,
                datasetId,
                datasetName,
                externalId,
                data: data as Prisma.InputJsonValue,
              },
            });
            result.created++;
          }
        } catch (err) {
          result.errors.push({
            row: rowNum,
            message: err instanceof Error ? err.message : "Unknown error",
          });
          result.skipped++;
        }
      }),
    );
  }

  return result;
}
