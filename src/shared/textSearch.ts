/**
 * #384 - the pure text-search matcher for the Search pane.
 *
 * Two modes: plain substring search (default), or a JavaScript `RegExp` when
 * `useRegex` is set (the `.*` toggle). No glossary expansion - that is a later
 * phase. Offsets are JavaScript string indices (UTF-16 code units) so a match
 * range can be handed straight to CodeMirror. `line` / `column` are 1-based
 * and for display only.
 *
 * Regex mode: the pattern is compiled with `g` + `m` (so `^` / `$` are
 * per-line) and, unless the search is case-sensitive, `i`. `s` (dotAll) is
 * not set. Zero-length matches (`^`, `\b`, lookarounds) are never emitted as
 * result rows and cannot spin the scan. Whole-word filtering does not apply
 * in regex mode. Invalid patterns are reported by `compileSearchRegex` so the
 * caller can show a validation message instead of running a search.
 *
 * Whole-word matching is Japanese-aware:
 *
 * - An ASCII/Latin query (no Japanese-script characters) uses the ordinary
 *   "word characters on neither side" rule, both sides enforced. So "maid"
 *   hits `maid` / `"maid"` / `maid.` but not `handmaid` / `maidservant`.
 *
 * - A query that contains any Japanese-script character (hiragana, katakana,
 *   halfwidth katakana, kanji, or the prolonged sound mark) enforces ONLY the
 *   PRECEDING boundary, and only against a katakana run: the match is rejected
 *   when the character right before it is katakana / halfwidth katakana / the
 *   prolonged sound mark `ー` - i.e. it landed in the middle of a katakana
 *   loanword compound (`order-maid`, `hand-maid`). Any other preceding
 *   character (kanji, hiragana, a letter, a digit, a space, punctuation, or
 *   the start of the text) is accepted, and the trailing side is never
 *   constrained - so `メイド` hits `メイド服` / `メイドさん` / `超メイド` /
 *   `新人メイド` but not `ハンドメイド` / `オーダーメイド`.
 *
 * No morphological analysis / tokenizer / dictionary: kanji-word boundaries
 * (`管区` vs `第七管区`) are deliberately left permissive in v1.
 */

export interface TextSearchOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  /** `.*` toggle: treat the query as a JavaScript regular expression. When
   *  set, `wholeWord` is ignored (the two are mutually exclusive in the UI). */
  readonly useRegex?: boolean;
}

export interface TextSearchMatch {
  /** UTF-16 code unit offset of the match start in the document. */
  readonly startOffset: number;
  /** UTF-16 code unit offset just past the match end. */
  readonly endOffset: number;
  /** 1-based line of `startOffset`. */
  readonly line: number;
  /** 1-based column of `startOffset` within its line (UTF-16 units). */
  readonly column: number;
  /** A windowed slice of the match's line, for the result row preview. */
  readonly previewText: string;
  /** Offset of the match start within `previewText`. */
  readonly previewMatchStart: number;
  /** Offset just past the match end within `previewText`. */
  readonly previewMatchEnd: number;
  /** The exact matched substring (as it appears in the document). */
  readonly matchedText: string;
}

/** Longest preview slice; the match itself is always kept whole. */
const PREVIEW_MAX_LENGTH = 160;
/** How much leading context to keep before the match in a preview. */
const PREVIEW_LEAD = 32;
/** U+2026 HORIZONTAL ELLIPSIS, used to mark a clipped preview. */
const ELLIPSIS = "…";
/** Katakana middle dot (full U+30FB, halfwidth U+FF65) - a v1 word separator. */
const KATAKANA_MIDDLE_DOT_CODES = new Set([0x30fb, 0xff65]);

const ASCII_WORD_CHARACTER = /[A-Za-z0-9_]/;

/**
 * `true` when `character` is a Japanese-script character for the purpose of
 * classifying a query: hiragana, katakana (incl. the prolonged sound mark
 * U+30FC), katakana phonetic extensions, halfwidth katakana, or a kanji
 * (Han script - covers CJK ideograph extensions via the Unicode property).
 */
function isJapaneseScriptCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined) {
    return false;
  }
  return (
    (code >= 0x3040 && code <= 0x30ff) || // hiragana + katakana
    (code >= 0x31f0 && code <= 0x31ff) || // katakana phonetic extensions
    (code >= 0xff66 && code <= 0xff9f) || // halfwidth katakana
    /\p{Script=Han}/u.test(character) // kanji
  );
}

/**
 * `true` when `query` contains any Japanese-script character, meaning the
 * Japanese-aware preceding-boundary rule applies instead of the ASCII one.
 * A mixed query (`AIメイド`, `第7管区`) counts as Japanese.
 */
function containsJapaneseText(query: string): boolean {
  for (const character of query) {
    if (isJapaneseScriptCharacter(character)) {
      return true;
    }
  }
  return false;
}

/**
 * `true` when `character` reads as part of a katakana run for the
 * Japanese-aware preceding-boundary check: a katakana letter, the prolonged
 * sound mark `ー` (U+30FC), katakana iteration marks, katakana phonetic
 * extensions, or halfwidth katakana (incl. the halfwidth prolonged sound mark
 * U+FF70). The katakana middle dot (U+30FB / U+FF65) sits in the block but is
 * a separator. Hiragana, kanji and alphanumerics are deliberately excluded -
 * only a katakana run suppresses a mid-compound match.
 */
function isKatakanaOrProlongedSoundMark(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined || KATAKANA_MIDDLE_DOT_CODES.has(code)) {
    return false;
  }
  return (
    (code >= 0x30a1 && code <= 0x30ff) || // katakana letters + marks (incl. U+30FC)
    (code >= 0x31f0 && code <= 0x31ff) || // katakana phonetic extensions
    (code >= 0xff66 && code <= 0xff9f) // halfwidth katakana (incl. U+FF70)
  );
}

/**
 * `true` when the character-boundary rule accepts a match of `query` at
 * `[start, end)` in `text`. Not whole-word -> always `true`.
 */
function isWordBoundaryAccepted(
  text: string,
  start: number,
  end: number,
  query: string,
  wholeWord: boolean
): boolean {
  if (!wholeWord) {
    return true;
  }

  const before = start > 0 ? text[start - 1] : "";

  if (containsJapaneseText(query)) {
    // Japanese-aware: reject only when the match sits directly after a
    // katakana run (a katakana loanword compound); the trailing side is
    // never constrained.
    return before === "" || !isKatakanaOrProlongedSoundMark(before);
  }

  // ASCII/Latin: ordinary word boundary on both sides.
  const after = end < text.length ? text[end] : "";
  const beforeIsWord = before !== "" && ASCII_WORD_CHARACTER.test(before);
  const afterIsWord = after !== "" && ASCII_WORD_CHARACTER.test(after);
  return !beforeIsWord && !afterIsWord;
}

/** Line-start offsets for `text`, index 0 = offset 0. Exported so another
 *  matcher (e.g. glossary atom search) can reuse the line/column/preview
 *  machinery via {@link createTextSearchMatch}. */
export function lineStartOffsets(text: string): number[] {
  const offsets = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      offsets.push(index + 1);
    }
  }
  return offsets;
}

/** 1-based line for `offset` given ascending `lineStarts` (binary search). */
function lineForOffset(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low + 1;
}

function buildPreview(
  text: string,
  matchStart: number,
  matchEnd: number,
  lineStart: number
): Pick<
  TextSearchMatch,
  "previewText" | "previewMatchStart" | "previewMatchEnd"
> {
  let lineEnd = text.indexOf("\n", matchStart);
  if (lineEnd === -1) {
    lineEnd = text.length;
  }
  // A multi-line match (query contains "\n") still previews from its start
  // line only; clip the shown match end to the line end.
  const shownMatchEnd = Math.min(matchEnd, lineEnd);

  let sliceStart = Math.max(lineStart, matchStart - PREVIEW_LEAD);
  let sliceEnd = Math.min(lineEnd, sliceStart + PREVIEW_MAX_LENGTH);
  // Keep the whole match visible even if it is long.
  if (sliceEnd < shownMatchEnd) {
    sliceEnd = Math.min(lineEnd, shownMatchEnd);
    sliceStart = Math.max(lineStart, sliceEnd - PREVIEW_MAX_LENGTH);
  }

  const leadingEllipsis = sliceStart > lineStart ? ELLIPSIS : "";
  const trailingEllipsis = sliceEnd < lineEnd ? ELLIPSIS : "";
  const previewText =
    leadingEllipsis + text.slice(sliceStart, sliceEnd) + trailingEllipsis;
  const previewMatchStart = leadingEllipsis.length + (matchStart - sliceStart);
  const previewMatchEnd = leadingEllipsis.length + (shownMatchEnd - sliceStart);

  return { previewText, previewMatchStart, previewMatchEnd };
}

/**
 * Assemble a `TextSearchMatch` (line / column / windowed preview) for the
 * `[start, end)` range of `text`. `lineStarts` comes from
 * {@link lineStartOffsets}. Exported so a non-substring matcher can produce
 * the same result shape as `findTextSearchMatches`.
 */
export function createTextSearchMatch(
  text: string,
  lineStarts: readonly number[],
  start: number,
  end: number
): TextSearchMatch {
  const line = lineForOffset(lineStarts, start);
  const lineStart = lineStarts[line - 1] ?? 0;
  return {
    startOffset: start,
    endOffset: end,
    line,
    column: start - lineStart + 1,
    matchedText: text.slice(start, end),
    ...buildPreview(text, start, end, lineStart)
  };
}

/** Flags for a Search-pane regex: always global; multiline so `^` / `$` bind
 *  per line; case-insensitive unless the search is case-sensitive. */
function searchRegexFlags(caseSensitive: boolean): string {
  return caseSensitive ? "gm" : "gim";
}

export interface CompiledSearchRegex {
  /** The compiled expression, or `null` when `query` is not a valid regex. */
  readonly regex: RegExp | null;
  /** The `RegExp` constructor's error message when `regex` is `null`. */
  readonly error: string | null;
}

/**
 * Compile `query` as a Search-pane regular expression. Never throws: an
 * invalid pattern comes back as `{ regex: null, error }` so the caller can
 * show a validation message and skip the search instead of crashing.
 */
export function compileSearchRegex(
  query: string,
  caseSensitive: boolean
): CompiledSearchRegex {
  try {
    return {
      regex: new RegExp(query, searchRegexFlags(caseSensitive)),
      error: null
    };
  } catch (error) {
    return {
      regex: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export interface FindTextSearchMatchesOptions extends TextSearchOptions {
  /** Stop after this many matches (per document). `0` / omitted = no cap. */
  readonly limit?: number;
}

/**
 * Every match of `query` in `text`, left to right. Plain substring search by
 * default (case sensitivity + Japanese-aware whole-word); a JavaScript
 * `RegExp` when `options.useRegex` is set. An empty query, empty text, or an
 * invalid regex yields `[]`.
 */
export function findTextSearchMatches(
  text: string,
  query: string,
  options: FindTextSearchMatchesOptions
): TextSearchMatch[] {
  if (query.length === 0 || text.length === 0) {
    return [];
  }

  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? options.limit
      : Number.POSITIVE_INFINITY;
  const lineStarts = lineStartOffsets(text);

  if (options.useRegex) {
    return findRegexSearchMatches(
      text,
      query,
      options.caseSensitive,
      lineStarts,
      limit
    );
  }

  const caseSensitive = options.caseSensitive;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const matches: TextSearchMatch[] = [];

  let searchFrom = 0;
  while (matches.length < limit) {
    const start = haystack.indexOf(needle, searchFrom);
    if (start === -1) {
      break;
    }
    const end = start + needle.length;

    if (isWordBoundaryAccepted(text, start, end, query, options.wholeWord)) {
      matches.push(createTextSearchMatch(text, lineStarts, start, end));
      searchFrom = end;
    } else {
      // Rejected: step one past this occurrence so an overlapping candidate
      // is still considered next time.
      searchFrom = start + 1;
    }
  }

  return matches;
}

/**
 * Regex-mode enumeration. The pattern is validated upstream; a stray invalid
 * pattern here is treated as "no matches" rather than thrown. Zero-length
 * matches are skipped (and `lastIndex` is nudged) so `^` / `\b` / lookarounds
 * neither flood the results nor spin forever.
 */
function findRegexSearchMatches(
  text: string,
  pattern: string,
  caseSensitive: boolean,
  lineStarts: readonly number[],
  limit: number
): TextSearchMatch[] {
  const { regex } = compileSearchRegex(pattern, caseSensitive);
  if (regex === null) {
    return [];
  }

  const matches: TextSearchMatch[] = [];
  let execResult: RegExpExecArray | null;
  while (
    matches.length < limit &&
    (execResult = regex.exec(text)) !== null
  ) {
    const matchedText = execResult[0];
    if (matchedText.length === 0) {
      // Global `exec` does not advance past a zero-length match on its own.
      regex.lastIndex += 1;
      continue;
    }
    const start = execResult.index;
    matches.push(
      createTextSearchMatch(text, lineStarts, start, start + matchedText.length)
    );
    // A non-empty match already moved `lastIndex` to its end.
  }

  return matches;
}
