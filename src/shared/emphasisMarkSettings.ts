/**
 * #484 — shared helpers and validators for emphasis mark notation settings.
 */

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
 * Validates Narou custom emphasis mark text:
 * - Must not be empty
 * - Must not contain newlines (\n, \r)
 * - Must not contain Japanese punctuation brackets 《, 》, ｜
 * - Length must be 1 to 8 graphemes
 */
export function validateNarouEmphasisMarkText(text: string): boolean {
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
  return len >= 1 && len <= 8;
}
