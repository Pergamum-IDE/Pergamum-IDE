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
import {
  countCaptureGroups,
  renderReplacement,
  validateReplacementTemplate,
  type ReplacementTemplateError
} from "../replace/replacementTemplate";
import type { TranslationKey } from "../../shared/i18n";

export type { TextSearchMatch };
export type { ReplacementTemplateError };

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

// ---------------------------------------------------------------------------
// #424 Slice 3: Replace-current
// ---------------------------------------------------------------------------

/**
 * The replacement string for one match. Plain mode → `replaceText` verbatim
 * (empty deletes the match). Regex mode → the shared #386 replacement
 * template (`$1` / `${1}` / `$$`) expanded against this match's capture
 * groups, re-`exec`'d at the match position against `text`.
 *
 * `ok:false` only in regex mode, when the template does not parse / references
 * a missing group — mirrors the project-wide Replace preflight exactly.
 */
export type ActiveDocumentReplacementResult =
  | { readonly ok: true; readonly replacement: string }
  | { readonly ok: false; readonly templateError: ReplacementTemplateError };

export function buildActiveDocumentReplacement(
  text: string,
  match: TextSearchMatch,
  replaceText: string,
  options: ActiveDocumentFindOptions,
  query: string
): ActiveDocumentReplacementResult {
  if (!options.useRegex) {
    return { ok: true, replacement: replaceText };
  }

  const validation = validateReplacementTemplate(
    replaceText,
    countCaptureGroups(query)
  );
  if (!validation.ok) {
    return { ok: false, templateError: validation.error };
  }

  const { regex } = compileSearchRegex(query, options.caseSensitive);
  if (regex === null) {
    // The caller gates on `regexError` first, so this is unreachable in
    // practice; treat the template as literal rather than throw.
    return { ok: true, replacement: replaceText };
  }
  regex.lastIndex = match.startOffset;
  const exec = regex.exec(text);
  const captureArray: readonly (string | undefined)[] =
    exec && exec.index === match.startOffset ? exec : [match.matchedText];

  return {
    ok: true,
    replacement: renderReplacement(validation.tokens, captureArray)
  };
}

// ---------------------------------------------------------------------------
// #424 Slice 4: Replace-all
// ---------------------------------------------------------------------------

/** One replacement edit against a single text snapshot. */
export interface ActiveDocumentReplaceChange {
  readonly from: number;
  readonly to: number;
  readonly insert: string;
}

export type ActiveDocumentReplaceAllResult =
  | {
      readonly ok: true;
      readonly changes: readonly ActiveDocumentReplaceChange[];
    }
  | { readonly ok: false; readonly templateError: ReplacementTemplateError };

/**
 * Every replacement edit for `matches` — all computed against the SAME `text`
 * snapshot, so the `from` / `to` offsets stay mutually consistent and can be
 * handed to CodeMirror as ONE transaction (one undo step). `matches` must be
 * the ascending, non-overlapping list `evaluateActiveDocumentFind` returns for
 * `text`.
 *
 * Plain mode → every `insert` is `replaceText` verbatim (empty deletes the
 * match). Regex mode → the shared #386 template (`$1` / `${1}` / `$$`) is
 * validated ONCE up front and, on failure, the whole batch is rejected
 * (`ok:false`) — exactly like the project-wide Replace preflight — then
 * expanded per match against that match's capture groups.
 */
export function buildActiveDocumentReplaceAllChanges(
  text: string,
  matches: readonly TextSearchMatch[],
  replaceText: string,
  options: ActiveDocumentFindOptions,
  query: string
): ActiveDocumentReplaceAllResult {
  const literalChanges = (): ActiveDocumentReplaceChange[] =>
    matches.map((match) => ({
      from: match.startOffset,
      to: match.endOffset,
      insert: replaceText
    }));

  if (!options.useRegex) {
    return { ok: true, changes: literalChanges() };
  }

  const validation = validateReplacementTemplate(
    replaceText,
    countCaptureGroups(query)
  );
  if (!validation.ok) {
    return { ok: false, templateError: validation.error };
  }

  const { regex } = compileSearchRegex(query, options.caseSensitive);
  if (regex === null) {
    // The caller gates on `regexError` first, so this is unreachable in
    // practice; treat the template as literal rather than throw.
    return { ok: true, changes: literalChanges() };
  }

  const changes: ActiveDocumentReplaceChange[] = matches.map((match) => {
    regex.lastIndex = match.startOffset;
    const exec = regex.exec(text);
    const captureArray: readonly (string | undefined)[] =
      exec && exec.index === match.startOffset ? exec : [match.matchedText];
    return {
      from: match.startOffset,
      to: match.endOffset,
      insert: renderReplacement(validation.tokens, captureArray)
    };
  });
  return { ok: true, changes };
}

/**
 * Where the active index lands after a replace-all: the first match (index `0`)
 * when any remain in the re-searched buffer, otherwise `null`.
 */
export function resolveActiveFindIndexAfterReplaceAll(
  matches: readonly unknown[]
): number | null {
  return matches.length > 0 ? 0 : null;
}

/**
 * The template-error (if any) for the current Replace-mode inputs — used to
 * disable the replace-current button and show a message. `null` outside regex
 * mode or when the template is fine.
 */
export function activeDocumentReplacementTemplateError(
  replaceText: string,
  options: ActiveDocumentFindOptions,
  query: string
): ReplacementTemplateError | null {
  if (!options.useRegex) {
    return null;
  }
  const validation = validateReplacementTemplate(
    replaceText,
    countCaptureGroups(query)
  );
  return validation.ok ? null : validation.error;
}

/**
 * i18n key for a replacement-template error — the SAME mapping the
 * project-wide Replace uses (`missingGroup` → its own key, everything else →
 * the generic "unsupported capture reference" message).
 */
export function replacementTemplateErrorTranslationKey(
  error: ReplacementTemplateError
): TranslationKey {
  return error === "missingGroup"
    ? "search.replace.template.missingGroup"
    : "search.replace.template.unsupported";
}

/**
 * Where the active index should land after a replace: the first match whose
 * start is at or after `replacementStartOffset` (so navigation continues
 * forward from where the replaced text was), wrapping to the first match when
 * none is left after that point. `null` when nothing matches any more.
 */
export function resolveActiveFindIndexAfterReplacement(
  matches: readonly Pick<TextSearchMatch, "startOffset">[],
  replacementStartOffset: number
): number | null {
  if (matches.length === 0) {
    return null;
  }
  const at = matches.findIndex(
    (m) => m.startOffset >= replacementStartOffset
  );
  return at === -1 ? 0 : at;
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
