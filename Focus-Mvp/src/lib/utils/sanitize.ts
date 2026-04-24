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
 */
export function sanitizeForApi(text: string): string {
  return text
    // Em dash → double hyphen
    .replace(/—/g, "--")
    // En dash → single hyphen
    .replace(/–/g, "-")
    // Smart single quotes → straight apostrophe
    .replace(/[‘’]/g, "'")
    // Smart double quotes → straight quote
    .replace(/[“”]/g, '"')
    // Horizontal ellipsis → three dots
    .replace(/…/g, "...")
    // Non-breaking space → regular space
    .replace(/ /g, " ")
    // Anything still above 0xFF gets dropped
    .replace(/[^\x00-\xFF]/g, "");
}
