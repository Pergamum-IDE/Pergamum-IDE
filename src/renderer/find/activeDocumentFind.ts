/**
 * #424 — pure helpers for the active-document Find panel.
 *
 * The panel searches ONLY the current Markdown editor buffer (a single text
 * string). Matching is delegated to the shared `findTextSearchMatches`
 * (`src/shared/textSearch.ts`), the same matcher the project-wide Search /
 * Replace features use, so `Ab` (Japanese-aware whole word), `Aa` (match
 * case) and `.*` (regex, incl. never-throw invalid-pattern handling) never
 * drift from the Search pane.
 */

import {
  compileSearchRegex,
  findTextSearchMatches,
  type TextSearchMatch,
  type TextSearchOptions
} from "../../shared/textSearch";

export type { TextSearchMatch };

/**
 * The `Ab` / `Aa` / `.*` toggle state. The shared `TextSearchOptions` shape
 * but with every flag required, so the panel never carries an ambiguous
 * `undefined`.
 */
export type ActiveDocumentFindOptions = Required<TextSearchOptions>;

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

/**
 * #424 Slice 2: matches plus a regex-error signal. `regexError` is non-null
 * ONLY when `.*` is on and the pattern does not compile — in that case
 * `matches` is empty and the UI shows the message rather than a stale count.
 * Never throws (delegates to the shared, non-throwing `compileSearchRegex`).
 */
export interface ActiveDocumentFindEvaluation {
  readonly matches: readonly TextSearchMatch[];
  readonly regexError: string | null;
}

export function evaluateActiveDocumentFind(
  text: string,
  query: string,
  options: ActiveDocumentFindOptions = DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS
): ActiveDocumentFindEvaluation {
  if (query.length === 0) {
    return { matches: [], regexError: null };
  }
  if (options.useRegex) {
    const { regex, error } = compileSearchRegex(query, options.caseSensitive);
    if (regex === null) {
      return { matches: [], regexError: error };
    }
  }
  return {
    matches: runActiveDocumentFind(text, query, options),
    regexError: null
  };
}

/**
 * #424 Slice 2: keep `activeIndex` inside `[0, matchCount)` after the match
 * set changes (e.g. the user edited the document under an open panel and the
 * count shrank). `matchCount === 0` / a `null` index → `null`.
 */
export function clampActiveFindIndex(
  activeIndex: number | null,
  matchCount: number
): number | null {
  if (matchCount <= 0 || activeIndex === null) {
    return null;
  }
  if (activeIndex < 0) {
    return 0;
  }
  if (activeIndex >= matchCount) {
    return matchCount - 1;
  }
  return activeIndex;
}

/**
 * #424 Slice 2: `.*` (regex) and `Ab` (whole word) are mutually exclusive
 * (mirrors the project-wide Search pane). Turning regex ON forces whole word
 * OFF; turning it OFF leaves whole word OFF (no auto-restore). Every other
 * toggle is independent.
 */
export function toggleActiveDocumentFindOption(
  options: ActiveDocumentFindOptions,
  key: keyof ActiveDocumentFindOptions
): ActiveDocumentFindOptions {
  const next = !options[key];
  if (key === "useRegex") {
    return {
      ...options,
      useRegex: next,
      wholeWord: next ? false : options.wholeWord
    };
  }
  return { ...options, [key]: next };
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
