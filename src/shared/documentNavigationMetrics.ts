/**
 * #360 Phase 1 — pure helper for the Document Navigation (文書ナビ) left
 * pane's 原稿用紙 estimate.
 *
 * The character count itself is NOT computed here: the Document Navigation
 * pane reuses the status-bar character-count value (#259 —
 * `countMarkdownDocumentCharacters` + `editor.characterCount.exclude`
 * settings) so the two surfaces always agree. This module only turns that
 * count into a manuscript-page estimate.
 */

/** Characters counted per manuscript page (原稿用紙 20×20). */
export const MANUSCRIPT_PAGE_CHARACTER_COUNT = 400;

/**
 * Estimated 原稿用紙 (400-character manuscript page) count for a character
 * total: `ceil(characterCount / 400)`.
 *
 * - `0` (or anything ≤ 0) → `0`
 * - non-finite / non-number input → `0` (never throws, never `NaN`)
 * - the result is always a whole number
 */
export function estimateManuscriptPages(characterCount: number): number {
  if (typeof characterCount !== "number" || !Number.isFinite(characterCount)) {
    return 0;
  }
  if (characterCount <= 0) {
    return 0;
  }
  return Math.ceil(characterCount / MANUSCRIPT_PAGE_CHARACTER_COUNT);
}
