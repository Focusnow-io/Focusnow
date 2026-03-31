/**
 * Pre-processing utilities for multi-entity import.
 * Pure functions with no external dependencies.
 */

/**
 * Fill-down: for each column in `columns`, iterate rows top-to-bottom —
 * when a cell is null, empty string, or whitespace-only, replace it with
 * the last non-null value seen for that column.
 *
 * Mutates a **deep copy** of `rows` (never the original).
 * Returns the filled rows.
 */
export function fillDown<T extends Record<string, unknown>>(
  rows: T[],
  columns: string[],
): T[] {
  const filled: T[] = rows.map((row) => ({ ...row }));

  for (const col of columns) {
    let lastValue: unknown = undefined;
    for (const row of filled) {
      const val = row[col];
      if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
        if (lastValue !== undefined) {
          (row as Record<string, unknown>)[col] = lastValue;
        }
      } else {
        lastValue = val;
      }
    }
  }

  return filled;
}
