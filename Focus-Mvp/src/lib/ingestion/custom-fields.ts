import { prisma } from "@/lib/prisma";
import { inferCustomFieldType, normaliseToFieldKey } from "./custom-field-keys";

// Re-export the pure helpers so existing imports of custom-fields keep
// working.  field-mapper.ts — which is also imported by the client import
// page — pulls them from custom-field-keys.ts directly to avoid dragging
// Prisma into the client bundle.
export { inferCustomFieldType, normaliseToFieldKey };

/**
 * Upsert a batch of CustomFieldSchema records for an org. Called after AI
 * mapping determines which columns are custom fields (i.e. not in the
 * canonical registry) and stashes them inside the `attributes` JSONB blob.
 */
export async function upsertCustomFieldSchemas(
  organizationId: string,
  entityType: string,
  fields: Array<{ sourceColumn: string; sampleValues: string[] }>,
): Promise<void> {
  // If the Prisma client was generated before the CustomFieldSchema migration
  // was applied (or if migrations didn't run at all), this delegate is
  // literally undefined at runtime. Log loudly and bail — throwing would
  // mask any subsequent upsert failures in the same request.
  if (!prisma.customFieldSchema) {
    console.error(
      "[custom-fields] prisma.customFieldSchema is undefined — run `npx prisma generate` after applying the CustomFieldSchema migration.",
    );
    return;
  }

  for (const field of fields) {
    const fieldKey = normaliseToFieldKey(field.sourceColumn);
    if (!fieldKey) continue;

    const sampleValues = field.sampleValues.slice(0, 5).map((v) => String(v ?? ""));
    const dataType = inferCustomFieldType(sampleValues);

    try {
      await prisma.customFieldSchema.upsert({
        where: {
          organizationId_entityType_fieldKey: { organizationId, entityType, fieldKey },
        },
        create: {
          organizationId,
          entityType,
          fieldKey,
          displayLabel: field.sourceColumn,
          dataType,
          sampleValues,
          sourceColumn: field.sourceColumn,
        },
        update: {
          displayLabel: field.sourceColumn,
          dataType,
          sampleValues,
          sourceColumn: field.sourceColumn,
        },
      });
      console.log(`[custom-fields] upserted fieldKey: ${fieldKey} (${entityType}, ${dataType})`);
    } catch (err) {
      // Log and keep going — a single bad field shouldn't prevent the rest
      // of the batch from being registered.
      console.error(
        `[custom-fields] upsert failed for ${entityType}.${fieldKey} (source="${field.sourceColumn}", type=${dataType})`,
        err instanceof Error ? err.stack ?? err.message : err,
      );
    }
  }
}
