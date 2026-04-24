/**
 * Strip / replace non-ASCII characters that some HTTP clients can't
 * ship as ByteString values. The Anthropic API body itself is UTF-8
 * safe, but certain fetch polyfills (and some tool-use metadata
 * paths) throw "Cannot convert argument to a ByteString" when a code
 * point > 255 slips into a header or similar byte-oriented target.
 *
 * Replaces the common typographic characters we see in real CSV data
 * (em/en dash, smart quotes, ellipsis, non-breaking space) with their
 * ASCII equivalents, then strips anything still above 0xFF.
 *
 * Implemented with \u escapes (not literal characters) so the source
 * file's own encoding can never drift from the intended code points.
 */
export function sanitizeForApi(text: string): string {
  return text
    .replace(/\u2014/g, "--")              // em dash
    .replace(/\u2013/g, "-")               // en dash
    .replace(/[\u2018\u2019]/g, "'")        // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')         // smart double quotes
    .replace(/\u2026/g, "...")             // horizontal ellipsis
    .replace(/\u00A0/g, " ")               // non-breaking space
    .replace(/[^\x00-\xFF]/g, "");             // strip all remaining non-Latin-1
}
