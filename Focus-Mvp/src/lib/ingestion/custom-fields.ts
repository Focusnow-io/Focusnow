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
  for (const field of fields) {
    const fieldKey = normaliseToFieldKey(field.sourceColumn);
    if (!fieldKey) continue;

    const sampleValues = field.sampleValues.slice(0, 5).map((v) => String(v ?? ""));
    const dataType = inferCustomFieldType(sampleValues);

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
  }
}
