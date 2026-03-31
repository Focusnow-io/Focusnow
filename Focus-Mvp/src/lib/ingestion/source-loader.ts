/**
 * Shared helper: re-parse all rows from the raw file stored in a DataSource's
 * mappingConfig, falling back to the 10-row preview when the full file is
 * unavailable or corrupted.
 *
 * Three routes (process, validate, clone-pass) previously each inlined this
 * identical try/catch block — keep it here so fixes propagate everywhere.
 */
import { parseCSVBuffer } from "./csv-parser";
import { parseXLSXBuffer } from "./xlsx-parser";
import type { MappingConfig } from "./field-mapper";

export async function loadRowsFromConfig(
  config: Pick<MappingConfig, "rawFileBase64" | "rawFileType" | "selectedSheet" | "rawData">
): Promise<Record<string, string>[]> {
  if (config.rawFileBase64) {
    try {
      const buffer = Buffer.from(config.rawFileBase64, "base64");
      const parsed =
        config.rawFileType === "xlsx"
          ? parseXLSXBuffer(buffer, config.selectedSheet ?? undefined)
          : parseCSVBuffer(buffer);
      return parsed.rows;
    } catch (err) {
      console.error("[source-loader] Failed to reparse stored file, falling back to preview rows:", err);
      return config.rawData ?? [];
    }
  }
  return config.rawData ?? [];
}
