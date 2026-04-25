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
import { Prisma } from "@prisma/client";
import { DATASETS, buildExternalId, type DatasetName } from "./datasets";

/** Build a JSONB SET fragment that adds `accumulate: true` field values
 *  on top of the standard `||` merge. Returns the extra jsonb_build_object
 *  to overlay, or an empty string when the dataset has no accumulate fields. */
function buildAccumulateOverlay(datasetName: DatasetName): string {
  const fields = DATASETS[datasetName].fields as Record<
    string,
    { type: string; accumulate?: boolean }
  >;
  const accFields = Object.entries(fields)
    .filter(([, def]) => def.accumulate === true)
    .map(([key]) => key);

  if (accFields.length === 0) return "";

  // Build: jsonb_build_object('field', coalesce(old::numeric,0) + coalesce(new::numeric,0), ...)
  const pairs = accFields
    .map(
      (k) =>
        `'${k}', to_jsonb(COALESCE(("ImportRecord".data->>'${k}')::numeric, 0) + COALESCE((EXCLUDED.data->>'${k}')::numeric, 0))`,
    )
    .join(", ");

  return `|| jsonb_build_object(${pairs})`;
}

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

          // Atomic upsert — eliminates the findUnique+create race condition
          // that fires when two rows in the same Promise.all batch share
          // the same externalId (both read null, both try to create, second
          // hits the unique constraint).
          //
          // In merge mode, `accumulate: true` fields (e.g. inventory.quantity)
          // have their values ADDED to the existing stored value instead of
          // being overwritten. All other fields are overwritten by the new value.
          const isMerge = importMode === "merge";
          const jsonData = JSON.stringify(data);
          // accOverlay is a safe SQL fragment (field names come from the
          // DATASETS constant, not user input) appended to the || merge.
          const accOverlay = isMerge ? Prisma.raw(buildAccumulateOverlay(datasetName)) : Prisma.raw("");

          const upsertResult = await prisma.$queryRaw<[{ inserted: boolean }]>`
            INSERT INTO "ImportRecord" (id, "organizationId", "datasetId", "datasetName", "externalId", data, "importedAt")
            VALUES (
              gen_random_uuid(),
              ${orgId},
              ${datasetId},
              ${datasetName},
              ${externalId},
              ${jsonData}::jsonb,
              NOW()
            )
            ON CONFLICT ("organizationId", "datasetName", "externalId") DO UPDATE SET
              data = CASE
                WHEN ${isMerge} THEN "ImportRecord".data || EXCLUDED.data ${accOverlay}
                ELSE EXCLUDED.data
              END,
              "datasetId" = EXCLUDED."datasetId",
              "importedAt" = NOW()
            RETURNING (xmax = 0) AS inserted
          `;

          if (upsertResult[0]?.inserted) {
            result.created++;
          } else {
            result.updated++;
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
