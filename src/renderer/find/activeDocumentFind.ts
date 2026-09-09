/**
 * #424 Slice 1 — pure helpers for the active-document Find panel.
 *
 * The panel searches ONLY the current Markdown editor buffer (a single text
 * string). Matching is delegated to the shared `findTextSearchMatches`
 * (`src/shared/textSearch.ts`), the same matcher the project-wide Search /
 * Replace features use, so behaviour never drifts. Slice 1 is plain-text,
 * case-insensitive only; `ActiveDocumentFindOptions` is already the full
 * `TextSearchOptions` shape so Slice 2 can add `Ab` / `Aa` / `.*` without a
 * signature change.
 */

import {
  findTextSearchMatches,
  type TextSearchMatch,
  type TextSearchOptions
} from "../../shared/textSearch";

export type { TextSearchMatch };

/** Slice 1 uses the full shared options shape but only ever the defaults. */
export type ActiveDocumentFindOptions = TextSearchOptions;

export const DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS: ActiveDocumentFindOptions = {
  caseSensitive: false,
  wholeWord: false,
  useRegex: false
};

/**
 * Safety ceiling on matches collected from one document — a pathological
 * query (e.g. a single space in a huge file) must not build an unbounded
 * array. Well above any realistic "navigate between matches" need.
 */
export const ACTIVE_DOCUMENT_FIND_MATCH_LIMIT = 5000;

/**
 * Every match of `query` in `text`, left to right. An empty query (or empty
 * text) yields `[]`. Offsets are UTF-16 code units, ready to hand straight to
 * a CodeMirror selection.
 */
export function runActiveDocumentFind(
  text: string,
  query: string,
  options: ActiveDocumentFindOptions = DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS
): TextSearchMatch[] {
  if (query.length === 0 || text.length === 0) {
    return [];
  }
  return findTextSearchMatches(text, query, {
    ...options,
    limit: ACTIVE_DOCUMENT_FIND_MATCH_LIMIT
  });
}

export type ActiveFindCursorDirection = "next" | "previous";

/**
 * The next cursor index for a previous / next step, with wrap-around.
 *
 * - `matchCount <= 0` → `null` (nothing to move to).
 * - `currentIndex` out of range / `null` → the first match for `"next"`, the
 *   last match for `"previous"`.
 * - otherwise → one step in `direction`, wrapping at the ends.
 */
export function resolveActiveFindCursor(
  matchCount: number,
  currentIndex: number | null,
  direction: ActiveFindCursorDirection
): number | null {
  if (matchCount <= 0) {
    return null;
  }
  if (
    currentIndex === null ||
    currentIndex < 0 ||
    currentIndex >= matchCount
  ) {
    return direction === "next" ? 0 : matchCount - 1;
  }
  return direction === "next"
    ? (currentIndex + 1) % matchCount
    : (currentIndex - 1 + matchCount) % matchCount;
}
