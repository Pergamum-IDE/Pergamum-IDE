/**
 * #384 Phase 2 - the pure plain-text search matcher for the Search pane.
 *
 * Plain substring search only (no regex, no glossary expansion - those are
 * later phases). Offsets are JavaScript string indices (UTF-16 code units)
 * so a match range can be handed straight to CodeMirror. `line` / `column`
 * are 1-based and for display only.
 *
 * Whole-word matching is Japanese-aware: for an ASCII/Latin query it is the
 * ordinary "word characters on neither side" rule; for a query that contains
 * any non-ASCII character (i.e. Japanese) only the PRECEDING boundary is
 * enforced - the character right before the match must not read as a
 * continuation of a word. So a katakana "maid" query matches "maid-fuku" /
 * "maid-san" but not "order-maid" / "hand-maid". No morphological analysis.
 */

export interface TextSearchOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
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
 * Characters that read as part of a running word for the Japanese-aware
 * preceding-boundary check: ASCII word chars, kanji, hiragana, katakana
 * (+ phonetic extensions, + prolonged sound marks U+30FC / U+FF70),
 * halfwidth katakana, and fullwidth alphanumerics / underscore. The katakana
 * middle dot sits inside the katakana block but is treated as a separator.
 */
function isWordContinuationCharacter(character: string): boolean {
  const code = character.codePointAt(0);
  if (code === undefined || KATAKANA_MIDDLE_DOT_CODES.has(code)) {
    return false;
  }
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x61 && code <= 0x7a) || // a-z
    code === 0x5f || // _
    /\p{Script=Han}/u.test(character) || // kanji
    (code >= 0x3040 && code <= 0x30ff) || // hiragana + katakana
    (code >= 0x31f0 && code <= 0x31ff) || // katakana phonetic extensions
    (code >= 0xff66 && code <= 0xff9f) || // halfwidth katakana
    (code >= 0xff10 && code <= 0xff19) || // fullwidth 0-9
    (code >= 0xff21 && code <= 0xff3a) || // fullwidth A-Z
    (code >= 0xff41 && code <= 0xff5a) // fullwidth a-z
  );
}

function queryHasNonAscii(query: string): boolean {
  for (const character of query) {
    if ((character.codePointAt(0) ?? 0) > 0x7f) {
      return true;
    }
  }
  return false;
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
  const after = end < text.length ? text[end] : "";

  if (queryHasNonAscii(query)) {
    // Japanese-aware: only the preceding side is enforced.
    return before === "" || !isWordContinuationCharacter(before);
  }

  // ASCII/Latin: ordinary word boundary on both sides.
  const beforeIsWord = before !== "" && ASCII_WORD_CHARACTER.test(before);
  const afterIsWord = after !== "" && ASCII_WORD_CHARACTER.test(after);
  return !beforeIsWord && !afterIsWord;
}

/** Line-start offsets for `text`, index 0 = offset 0. */
function lineStartOffsets(text: string): number[] {
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

export interface FindTextSearchMatchesOptions extends TextSearchOptions {
  /** Stop after this many matches (per document). `0` / omitted = no cap. */
  readonly limit?: number;
}

/**
 * Every plain-text occurrence of `query` in `text`, left to right, honouring
 * case sensitivity and (Japanese-aware) whole-word. An empty query yields
 * `[]`.
 */
export function findTextSearchMatches(
  text: string,
  query: string,
  options: FindTextSearchMatchesOptions
): TextSearchMatch[] {
  if (query.length === 0 || text.length === 0) {
    return [];
  }

  const caseSensitive = options.caseSensitive;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  if (needle.length === 0) {
    return [];
  }

  const limit =
    typeof options.limit === "number" && options.limit > 0
      ? options.limit
      : Number.POSITIVE_INFINITY;
  const lineStarts = lineStartOffsets(text);
  const matches: TextSearchMatch[] = [];

  let searchFrom = 0;
  while (matches.length < limit) {
    const start = haystack.indexOf(needle, searchFrom);
    if (start === -1) {
      break;
    }
    const end = start + needle.length;

    if (isWordBoundaryAccepted(text, start, end, query, options.wholeWord)) {
      const line = lineForOffset(lineStarts, start);
      const lineStart = lineStarts[line - 1] ?? 0;
      matches.push({
        startOffset: start,
        endOffset: end,
        line,
        column: start - lineStart + 1,
        matchedText: text.slice(start, end),
        ...buildPreview(text, start, end, lineStart)
      });
      searchFrom = end;
    } else {
      // Rejected: step one past this occurrence so an overlapping candidate
      // is still considered next time.
      searchFrom = start + 1;
    }
  }

  return matches;
}
