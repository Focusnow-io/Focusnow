import Papa from "papaparse";

export interface ParsedFile {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
}

export function parseCSVBuffer(buffer: Buffer): ParsedFile {
  // Strip UTF-8 BOM if present (common in Excel-exported CSV files)
  let text = buffer.toString("utf-8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = result.meta.fields ?? [];
  const rows = result.data;

  return { headers, rows, rowCount: rows.length };
}
