import type {
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryForm,
  GlossaryFormId,
  GlossaryFormMatchBoundary,
  GlossaryWarningPolicy
} from "./glossary";
import { shouldAcceptGlossarySurfaceBoundary } from "./glossarySurfaceBoundary";

export type GlossarySurfaceMatchRelation =
  | "canonical"
  | "alias"
  | "variant";

export interface GlossarySurfaceMatchingOptions {
  minimumSurfaceLength?: number;
}

export interface GlossarySurfaceIndexEntry {
  entryId: GlossaryEntryId;
  formId: GlossaryFormId;
  surface: string;
  relation: GlossarySurfaceMatchRelation;
  warningPolicy: GlossaryWarningPolicy | null;
  matchBoundaryStart: GlossaryFormMatchBoundary;
  matchBoundaryEnd: GlossaryFormMatchBoundary;
  /**
   * #365: `true` when this is an opted-in single-code-point form whose
   * surface is a CJK ideograph. Such a match is additionally rejected when
   * the character immediately before or after it is a DIFFERENT kanji
   * (compound-word guard). Same kanji, a Japanese iteration mark, kana,
   * punctuation, or the text edge do not reject.
   */
  singleCharacterKanjiGuard: boolean;
}

export interface GlossarySurfaceIndex {
  readonly entries: readonly GlossarySurfaceIndexEntry[];
}

export interface GlossarySurfaceMatchCandidate {
  entryId: GlossaryEntryId;
  formId: GlossaryFormId;
  surface: string;
  relation: GlossarySurfaceMatchRelation;
  warningPolicy: GlossaryWarningPolicy | null;
}

export interface GlossarySurfaceTextMatch {
  matchedText: string;
  range: {
    start: number;
    end: number;
  };
  candidates: readonly GlossarySurfaceMatchCandidate[];
}

const defaultMinimumSurfaceLength = 2;

const relationSortRank: Record<GlossarySurfaceMatchRelation, number> = {
  canonical: 0,
  alias: 1,
  variant: 2
};

interface RawGlossarySurfaceMatch {
  start: number;
  end: number;
  entry: GlossarySurfaceIndexEntry;
}

function normalizedMinimumSurfaceLength(
  options?: GlossarySurfaceMatchingOptions
): number {
  return Math.max(
    0,
    Math.floor(options?.minimumSurfaceLength ?? defaultMinimumSurfaceLength)
  );
}

function surfaceCharacterLength(surface: string): number {
  return Array.from(surface).length;
}

/**
 * #365: Japanese iteration / repetition marks. Handled by an EXPLICIT
 * allowlist (not a Unicode category), so widening the ideograph ranges later
 * never silently changes iteration-mark behaviour.
 *   々  U+3005  ideographic iteration mark
 *   ゝ  U+309D  hiragana iteration mark
 *   ゞ  U+309E  hiragana voiced iteration mark
 *   ヽ  U+30FD  katakana iteration mark
 *   ヾ  U+30FE  katakana voiced iteration mark
 */
const JAPANESE_ITERATION_MARKS: ReadonlySet<string> = new Set([
  "々",
  "ゝ",
  "ゞ",
  "ヽ",
  "ヾ"
]);

/**
 * #365: narrow "is this a CJK ideograph (kanji)?" test used only for the
 * single-character compound-word guard. Deliberately does NOT include
 * U+3005 々 / U+3007 〇 / iteration marks / kana.
 */
function isCjkIdeographCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK Unified Ideographs
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // Extension A
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // Compatibility Ideographs
    (codePoint >= 0x20000 && codePoint <= 0x2ebef) || // Extensions B–F
    (codePoint >= 0x2f800 && codePoint <= 0x2fa1f) // Compat. Ideographs Suppl.
  );
}

/** Code point ending immediately before `index`, or `undefined` at the start. */
function codePointBefore(text: string, index: number): number | undefined {
  if (index <= 0) {
    return undefined;
  }
  const low = text.charCodeAt(index - 1);
  if (low >= 0xdc00 && low <= 0xdfff && index - 2 >= 0) {
    const high = text.charCodeAt(index - 2);
    if (high >= 0xd800 && high <= 0xdbff) {
      return (high - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
    }
  }
  return low;
}

/**
 * #365: does the neighbouring code point `neighbour` block a single-kanji
 * match of `matchedCodePoint`? Only a DIFFERENT kanji blocks. The text edge
 * (`undefined`), the same kanji, and a Japanese iteration mark never block.
 */
function singleKanjiNeighbourBlocks(
  neighbour: number | undefined,
  matchedCodePoint: number
): boolean {
  if (neighbour === undefined || neighbour === matchedCodePoint) {
    return false;
  }
  if (JAPANESE_ITERATION_MARKS.has(String.fromCodePoint(neighbour))) {
    return false;
  }
  return isCjkIdeographCodePoint(neighbour);
}

function relationForForm(form: GlossaryForm): GlossarySurfaceMatchRelation {
  return form.isCanonical ? "canonical" : form.relation;
}

function warningPolicyForForm(
  form: GlossaryForm
): GlossaryWarningPolicy | null {
  return form.isCanonical ? null : form.warningPolicy;
}

function compareIndexEntries(
  left: GlossarySurfaceIndexEntry,
  right: GlossarySurfaceIndexEntry
): number {
  return (
    right.surface.length - left.surface.length ||
    left.surface.localeCompare(right.surface) ||
    relationSortRank[left.relation] - relationSortRank[right.relation] ||
    left.entryId.localeCompare(right.entryId) ||
    left.formId.localeCompare(right.formId)
  );
}

function compareCandidates(
  left: GlossarySurfaceMatchCandidate,
  right: GlossarySurfaceMatchCandidate
): number {
  return (
    relationSortRank[left.relation] - relationSortRank[right.relation] ||
    left.entryId.localeCompare(right.entryId) ||
    left.formId.localeCompare(right.formId)
  );
}

function candidateFromIndexEntry(
  entry: GlossarySurfaceIndexEntry
): GlossarySurfaceMatchCandidate {
  return {
    entryId: entry.entryId,
    formId: entry.formId,
    surface: entry.surface,
    relation: entry.relation,
    warningPolicy: entry.warningPolicy
  };
}

export function buildGlossarySurfaceIndex(
  entries: readonly GlossaryEntry[],
  options?: GlossarySurfaceMatchingOptions
): GlossarySurfaceIndex {
  const minimumSurfaceLength = normalizedMinimumSurfaceLength(options);
  const indexEntries: GlossarySurfaceIndexEntry[] = [];

  for (const entry of entries) {
    for (const form of entry.forms) {
      const surface = form.surface.trim();
      const surfaceLength = surfaceCharacterLength(surface);
      // #365: a single-code-point surface is only indexed when the form
      // explicitly opts in. 2+ code points are unaffected.
      const singleCharacterOptIn =
        surfaceLength === 1 && form.allowSingleCharacterMatch === true;

      if (
        surface.length === 0 ||
        (surfaceLength < minimumSurfaceLength && !singleCharacterOptIn)
      ) {
        continue;
      }

      indexEntries.push({
        entryId: entry.id,
        formId: form.id,
        surface,
        relation: relationForForm(form),
        warningPolicy: warningPolicyForForm(form),
        matchBoundaryStart: form.matchBoundaryStart,
        matchBoundaryEnd: form.matchBoundaryEnd,
        singleCharacterKanjiGuard:
          singleCharacterOptIn &&
          isCjkIdeographCodePoint(surface.codePointAt(0) ?? 0)
      });
    }
  }

  return {
    entries: indexEntries.sort(compareIndexEntries)
  };
}

function collectRawGlossarySurfaceMatches(
  text: string,
  index: GlossarySurfaceIndex
): RawGlossarySurfaceMatch[] {
  const rawMatches: RawGlossarySurfaceMatch[] = [];

  for (let cursor = 0; cursor < text.length; cursor += 1) {
    for (const entry of index.entries) {
      if (!text.startsWith(entry.surface, cursor)) {
        continue;
      }

      rawMatches.push({
        start: cursor,
        end: cursor + entry.surface.length,
        entry
      });
    }
  }

  return rawMatches;
}

function isBoundaryAcceptedRawMatch(
  text: string,
  rawMatch: RawGlossarySurfaceMatch
): boolean {
  return shouldAcceptGlossarySurfaceBoundary({
    text,
    start: rawMatch.start,
    end: rawMatch.end,
    matchBoundaryStart: rawMatch.entry.matchBoundaryStart,
    matchBoundaryEnd: rawMatch.entry.matchBoundaryEnd
  });
}

/**
 * #365: for an opted-in single-code-point KANJI form, reject the raw match
 * when the character immediately before or after it is a different kanji
 * (e.g. `蝕` inside `腐蝕` / `蝕牙`). The same kanji (`蝕蝕`), a Japanese
 * iteration mark (`蝕々`), kana, punctuation, or the text edge never reject.
 * Non-kanji single-character forms are unaffected (`matchBoundary*` still
 * applies to them as before).
 */
function isSingleCharacterKanjiAdjacencyAccepted(
  text: string,
  rawMatch: RawGlossarySurfaceMatch
): boolean {
  if (!rawMatch.entry.singleCharacterKanjiGuard) {
    return true;
  }

  const matchedCodePoint = rawMatch.entry.surface.codePointAt(0) ?? 0;

  return (
    !singleKanjiNeighbourBlocks(
      codePointBefore(text, rawMatch.start),
      matchedCodePoint
    ) &&
    !singleKanjiNeighbourBlocks(
      text.codePointAt(rawMatch.end),
      matchedCodePoint
    )
  );
}

function groupAcceptedRawMatches(
  rawMatches: readonly RawGlossarySurfaceMatch[]
): Map<string, RawGlossarySurfaceMatch[]> {
  const matchesByRange = new Map<string, RawGlossarySurfaceMatch[]>();

  for (const rawMatch of rawMatches) {
    const rangeKey = `${rawMatch.start}:${rawMatch.end}`;
    const rangeMatches = matchesByRange.get(rangeKey);

    if (rangeMatches) {
      rangeMatches.push(rawMatch);
    } else {
      matchesByRange.set(rangeKey, [rawMatch]);
    }
  }

  return matchesByRange;
}

export function matchGlossarySurfacesInText(
  text: string,
  index: GlossarySurfaceIndex
): GlossarySurfaceTextMatch[] {
  const matches: GlossarySurfaceTextMatch[] = [];
  const matchesByRange = groupAcceptedRawMatches(
    collectRawGlossarySurfaceMatches(text, index)
      .filter((rawMatch) => isBoundaryAcceptedRawMatch(text, rawMatch))
      .filter((rawMatch) =>
        isSingleCharacterKanjiAdjacencyAccepted(text, rawMatch)
      )
  );
  let cursor = 0;

  while (cursor < text.length) {
    let longestSurfaceLength = 0;
    let matchingEntries: GlossarySurfaceIndexEntry[] = [];

    for (const rangeMatches of matchesByRange.values()) {
      const [firstMatch] = rangeMatches;

      if (!firstMatch || firstMatch.start !== cursor) {
        continue;
      }

      const surfaceLength = firstMatch.end - firstMatch.start;

      if (surfaceLength > longestSurfaceLength) {
        longestSurfaceLength = surfaceLength;
        matchingEntries = rangeMatches.map((rawMatch) => rawMatch.entry);
      }
    }

    if (matchingEntries.length === 0) {
      cursor += 1;
      continue;
    }

    const end = cursor + longestSurfaceLength;

    matches.push({
      matchedText: text.slice(cursor, end),
      range: {
        start: cursor,
        end
      },
      candidates: matchingEntries
        .map(candidateFromIndexEntry)
        .sort(compareCandidates)
    });

    cursor = end;
  }

  return matches;
}

export function isAmbiguousGlossarySurfaceTextMatch(
  match: GlossarySurfaceTextMatch
): boolean {
  return match.candidates.length > 1;
}
