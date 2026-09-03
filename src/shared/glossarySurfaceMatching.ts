/**
 * #375: build a glossary surface index from `GlossaryAtom` values and match it
 * against manuscript text.
 *
 * The former alias / variant / canonical relation and warning-policy metadata
 * are gone — an atom is just a value plus a `matchFlags` bitmask. A candidate
 * now carries only its `entryId` / `atomId` / `surface`.
 */

import type { GlossaryEntry, GlossaryEntryId, GlossaryAtomId } from "./glossary";
import {
  GlossaryAtomFlags,
  getGlossaryAtomBoundaryEndPolicy,
  getGlossaryAtomBoundaryStartPolicy,
  glossaryBoundaryPolicyChecksBoundary,
  hasGlossaryAtomFlag
} from "./glossaryAtomFlags";
import { shouldAcceptGlossarySurfaceBoundary } from "./glossarySurfaceBoundary";

export interface GlossarySurfaceMatchingOptions {
  minimumSurfaceLength?: number;
}

export interface GlossarySurfaceIndexEntry {
  entryId: GlossaryEntryId;
  atomId: GlossaryAtomId;
  surface: string;
  checkStartBoundary: boolean;
  checkEndBoundary: boolean;
  /**
   * #365 carry-over: `true` for an opted-in single-code-point atom whose
   * value is a CJK ideograph. Such a match is additionally rejected when the
   * character immediately before or after it is a DIFFERENT kanji
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
  atomId: GlossaryAtomId;
  surface: string;
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
 * #365: Japanese iteration / repetition marks. Explicit allowlist (not a
 * Unicode category), so widening the ideograph ranges later never silently
 * changes iteration-mark behaviour.
 *   々 U+3005 · ゝ U+309D · ゞ U+309E · ヽ U+30FD · ヾ U+30FE
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

function compareIndexEntries(
  left: GlossarySurfaceIndexEntry,
  right: GlossarySurfaceIndexEntry
): number {
  return (
    right.surface.length - left.surface.length ||
    left.surface.localeCompare(right.surface) ||
    left.entryId.localeCompare(right.entryId) ||
    left.atomId.localeCompare(right.atomId)
  );
}

function compareCandidates(
  left: GlossarySurfaceMatchCandidate,
  right: GlossarySurfaceMatchCandidate
): number {
  return (
    left.entryId.localeCompare(right.entryId) ||
    left.atomId.localeCompare(right.atomId)
  );
}

function candidateFromIndexEntry(
  entry: GlossarySurfaceIndexEntry
): GlossarySurfaceMatchCandidate {
  return {
    entryId: entry.entryId,
    atomId: entry.atomId,
    surface: entry.surface
  };
}

export function buildGlossarySurfaceIndex(
  entries: readonly GlossaryEntry[],
  options?: GlossarySurfaceMatchingOptions
): GlossarySurfaceIndex {
  const minimumSurfaceLength = normalizedMinimumSurfaceLength(options);
  const indexEntries: GlossarySurfaceIndexEntry[] = [];

  for (const entry of entries) {
    for (const atom of entry.atoms) {
      const surface = atom.value.trim();
      const surfaceLength = surfaceCharacterLength(surface);
      // #365: a single-code-point value is only indexed when the atom
      // explicitly opts in. 2+ code points are unaffected.
      const singleCharacterOptIn =
        surfaceLength === 1 &&
        hasGlossaryAtomFlag(
          atom.matchFlags,
          GlossaryAtomFlags.AllowSingleCharacterMatch
        );

      if (
        surface.length === 0 ||
        (surfaceLength < minimumSurfaceLength && !singleCharacterOptIn)
      ) {
        continue;
      }

      indexEntries.push({
        entryId: entry.id,
        atomId: atom.id,
        surface,
        checkStartBoundary: glossaryBoundaryPolicyChecksBoundary(
          getGlossaryAtomBoundaryStartPolicy(atom.matchFlags)
        ),
        checkEndBoundary: glossaryBoundaryPolicyChecksBoundary(
          getGlossaryAtomBoundaryEndPolicy(atom.matchFlags)
        ),
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
    checkStartBoundary: rawMatch.entry.checkStartBoundary,
    checkEndBoundary: rawMatch.entry.checkEndBoundary
  });
}

/**
 * #365: for an opted-in single-code-point KANJI atom, reject the raw match
 * when the character immediately before or after it is a different kanji
 * (e.g. `蝕` inside `腐蝕` / `蝕牙`). The same kanji (`蝕蝕`), a Japanese
 * iteration mark (`蝕々`), kana, punctuation, or the text edge never reject.
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
