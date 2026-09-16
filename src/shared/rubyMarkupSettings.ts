/**
 * #486 — shared helpers and validators for ruby markup settings and text.
 */

export const RUBY_TEXT_MAX_GRAPHEMES = 50;

export function countGraphemes(text: string): number {
  if (typeof Intl !== "undefined" && (Intl as any).Segmenter) {
    const segmenter = new (Intl as any).Segmenter(undefined, {
      granularity: "grapheme"
    });
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}

/**
 * Validates ruby text input:
 * - Must not be empty
 * - Must not contain newlines (\n, \r)
 * - Must not contain forbidden characters 《, 》, ｜
 * - Length must be 1 to 50 graphemes
 */
export function validateRubyText(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) {
    return false;
  }
  if (text.includes("\n") || text.includes("\r")) {
    return false;
  }
  if (text.includes("《") || text.includes("》") || text.includes("｜")) {
    return false;
  }
  const len = countGraphemes(text);
  return len >= 1 && len <= RUBY_TEXT_MAX_GRAPHEMES;
}
