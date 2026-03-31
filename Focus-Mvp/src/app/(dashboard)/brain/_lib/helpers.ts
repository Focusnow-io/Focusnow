import { OPERATOR_LABELS } from "./constants";

export interface SummaryParams {
  entity: string;
  condField: string;
  condOperator: string;
  condValue: string;
}

export function buildSummary(params: SummaryParams): string {
  const opLabel = OPERATOR_LABELS[params.condOperator] ?? params.condOperator;
  return `When any ${params.entity}\u2019s ${params.condField} ${opLabel} ${params.condValue}.`;
}

export function flattenSample(
  sample: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(sample)) {
    if (key === "id") continue;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      for (const [subKey, subVal] of Object.entries(
        val as Record<string, unknown>
      )) {
        result[subKey] = subVal == null ? "\u2014" : String(subVal);
      }
    } else {
      result[key] = val == null ? "\u2014" : String(val);
    }
  }
  return result;
}
