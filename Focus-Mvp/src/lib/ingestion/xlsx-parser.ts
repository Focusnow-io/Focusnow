import * as XLSX from "xlsx";
import type { ParsedFile } from "./csv-parser";

export function getXLSXSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  return workbook.SheetNames;
}

/**
 * Parse the workbook once and return both the sheet list and row counts.
 * Prefer this over calling getXLSXSheetNames + getXLSXSheetRowCounts
 * separately, which would read the buffer twice.
 */
export function getXLSXWorkbookInfo(buffer: Buffer): {
  sheetNames: string[];
  rowCounts: Record<string, number>;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const rowCounts: Record<string, number> = {};
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet["!ref"]) { rowCounts[name] = 0; continue; }
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    // Data rows = total range rows minus the header row (clamped to 0)
    rowCounts[name] = Math.max(0, range.e.r - range.s.r);
  }
  return { sheetNames: workbook.SheetNames, rowCounts };
}

/**
 * Returns the number of data rows (excluding the header row) for each sheet.
 * @deprecated Use getXLSXWorkbookInfo when you also need sheet names.
 */
export function getXLSXSheetRowCounts(buffer: Buffer): Record<string, number> {
  return getXLSXWorkbookInfo(buffer).rowCounts;
}

export function parseXLSXBuffer(buffer: Buffer, sheetName?: string): ParsedFile {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const targetSheet = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheet];

  if (!sheet || !sheet["!ref"]) return { headers: [], rows: [], rowCount: 0 };

  // Extract headers from the actual first row of the sheet range.
  // More reliable than reading keys from the first parsed row, which can miss
  // columns that are empty in row 1.
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const headers: string[] = [];
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddr = XLSX.utils.encode_cell({ r: range.s.r, c: col });
    const cell = sheet[cellAddr];
    const raw = cell ? String(cell.v).trim() : "";
    headers.push(raw || `Column${col + 1}`);
  }

  // Use header: 1 to get raw arrays, then zip with our manually extracted
  // (and trimmed) headers.  This guarantees that the row keys exactly match
  // `headers`, avoiding subtle mismatches when sheet_to_json uses its own
  // header parsing (e.g. untrimmed whitespace, __EMPTY for blanks, _1 dedup).
  const rawArrays = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  // First array is the header row (already captured above) — skip it.
  const dataArrays = rawArrays.slice(1);
  const rows: Record<string, string>[] = dataArrays.map((arr) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = String(arr[i] ?? "");
    }
    return obj;
  });

  return { headers, rows, rowCount: rows.length };
}
