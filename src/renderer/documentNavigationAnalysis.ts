/**
 * #360 Phase 2 — pure analysis helpers for the Document Navigation (文書ナビ)
 * left pane's "in numbers" sections:
 *
 *   - Glossary Entry occurrence counts (per Entry, all its Atoms summed)
 *   - first-tag occurrence counts (each Entry's PRIMARY tag only)
 *   - narration / dialogue character split + ratio
 *
 * Everything here is pure and Canvas-free so it can be unit-tested directly.
 * It deliberately reuses the SAME shared building blocks as the Text Map /
 * Sidebar occurrence jump — `matchGlossarySurfacesInText` for hit detection
 * (so `matchFlags`, boundary policy and the single-character opt-in all
 * behave identically) and `collectDocumentMapDialogueRanges` for dialogue
 * spans — without pulling in the Text Map RENDERER. The counts always cover
 * the WHOLE active document; there is no tag-selector / render-tag filter.
 */
import {
  primaryGlossaryTag,
  representativeGlossaryAtom,
  type GlossaryEntry
} from "../shared/glossary";
import type { DocumentMapDialogueDelimiterPair } from "../shared/documentMapSettings";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesInText
} from "../shared/glossarySurfaceMatching";
import { collectDocumentMapDialogueRanges } from "./glossaryTextMap";

export interface DocumentNavigationGlossaryCount {
  readonly entryId: string;
  /** The Entry's representative (`sortOrder = 0`) atom value. */
  readonly label: string;
  readonly count: number;
}

export interface DocumentNavigationTagCount {
  readonly tagId: string;
  readonly label: string;
  /** The tag's STORED `#rrggbb` colours (no Document Map visibility
   *  correction) — the Document Navigation tag chip renders them verbatim. */
  readonly backgroundRgb: string;
  readonly foregroundRgb: string;
  readonly count: number;
}

export interface DocumentNavigationDialogueRatio {
  readonly narrationCharacters: number;
  readonly dialogueCharacters: number;
  /** `narrationCharacters + dialogueCharacters` (never off by rounding). */
  readonly totalCharacters: number;
  /** 0..100, integer. `narrationPercent + dialoguePercent === 100` unless total is 0. */
  readonly narrationPercent: number;
  readonly dialoguePercent: number;
}

export interface DocumentNavigationAnalysis {
  readonly glossaryCounts: readonly DocumentNavigationGlossaryCount[];
  readonly tagCounts: readonly DocumentNavigationTagCount[];
  readonly dialogueRatio: DocumentNavigationDialogueRatio;
}

const EMPTY_DIALOGUE_RATIO: DocumentNavigationDialogueRatio = {
  narrationCharacters: 0,
  dialogueCharacters: 0,
  totalCharacters: 0,
  narrationPercent: 0,
  dialoguePercent: 0
};

/**
 * Per-Entry hit tally for `text`: every non-overlapping glossary surface
 * match, attributed to `candidates[0].entryId` (the shared matcher's
 * deterministic primary candidate — the same choice the Text Map makes).
 * Atoms are not distinguished; a hit on any of an Entry's Atoms adds 1 to
 * that Entry.
 */
export function tallyGlossaryEntryHits(
  text: string,
  entries: readonly GlossaryEntry[]
): Map<string, number> {
  const counts = new Map<string, number>();

  if (text.length === 0 || entries.length === 0) {
    return counts;
  }

  const index = buildGlossarySurfaceIndex(entries);

  for (const match of matchGlossarySurfacesInText(text, index)) {
    const entryId = match.candidates[0]?.entryId;
    if (entryId === undefined) {
      continue;
    }
    counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
  }

  return counts;
}

function glossaryCountRowsFromTally(
  entryHitCounts: ReadonlyMap<string, number>,
  entries: readonly GlossaryEntry[]
): DocumentNavigationGlossaryCount[] {
  const entryOrder = new Map(entries.map((entry, order) => [entry.id, order]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const rows: DocumentNavigationGlossaryCount[] = [];
  for (const [entryId, count] of entryHitCounts) {
    if (count <= 0) {
      continue;
    }
    const entry = entryById.get(entryId);
    if (!entry) {
      continue;
    }
    rows.push({
      entryId,
      label: representativeGlossaryAtom(entry)?.value ?? entryId,
      count
    });
  }

  return rows.sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    const byLabel = left.label.localeCompare(right.label);
    if (byLabel !== 0) {
      return byLabel;
    }
    return (
      (entryOrder.get(left.entryId) ?? 0) - (entryOrder.get(right.entryId) ?? 0)
    );
  });
}

function tagCountRowsFromTally(
  entryHitCounts: ReadonlyMap<string, number>,
  entries: readonly GlossaryEntry[]
): DocumentNavigationTagCount[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const tagCounts = new Map<
    string,
    {
      label: string;
      backgroundRgb: string;
      foregroundRgb: string;
      sortOrder: number;
      count: number;
    }
  >();

  for (const [entryId, count] of entryHitCounts) {
    if (count <= 0) {
      continue;
    }
    const entry = entryById.get(entryId);
    if (!entry) {
      continue;
    }
    // v1: only the Entry's FIRST assigned tag is credited; second and later
    // tags get nothing, and a tagless Entry is left out of tag counts.
    const primaryTag = primaryGlossaryTag(entry);
    if (!primaryTag) {
      continue;
    }
    const existing = tagCounts.get(primaryTag.id);
    if (existing) {
      existing.count += count;
    } else {
      tagCounts.set(primaryTag.id, {
        label: primaryTag.label,
        backgroundRgb: primaryTag.backgroundRgb,
        foregroundRgb: primaryTag.foregroundRgb,
        sortOrder: primaryTag.sortOrder,
        count
      });
    }
  }

  return [...tagCounts.entries()]
    .map(([tagId, value]) => ({
      tagId,
      label: value.label,
      backgroundRgb: value.backgroundRgb,
      foregroundRgb: value.foregroundRgb,
      count: value.count
    }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      const leftSort = tagCounts.get(left.tagId)?.sortOrder ?? 0;
      const rightSort = tagCounts.get(right.tagId)?.sortOrder ?? 0;
      if (leftSort !== rightSort) {
        return leftSort - rightSort;
      }
      return left.label.localeCompare(right.label);
    });
}

export function collectDocumentNavigationGlossaryCounts(
  text: string,
  entries: readonly GlossaryEntry[]
): DocumentNavigationGlossaryCount[] {
  return glossaryCountRowsFromTally(
    tallyGlossaryEntryHits(text, entries),
    entries
  );
}

export function collectDocumentNavigationTagCounts(
  text: string,
  entries: readonly GlossaryEntry[]
): DocumentNavigationTagCount[] {
  return tagCountRowsFromTally(tallyGlossaryEntryHits(text, entries), entries);
}

/** Sorted, non-overlapping `[start, end)` spans from possibly-overlapping ranges. */
function mergeOffsetRanges(
  ranges: readonly { startOffset: number; endOffset: number }[]
): { startOffset: number; endOffset: number }[] {
  const sorted = [...ranges]
    .filter((range) => range.endOffset > range.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);
  const merged: { startOffset: number; endOffset: number }[] = [];

  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.startOffset <= previous.endOffset) {
      previous.endOffset = Math.max(previous.endOffset, range.endOffset);
      continue;
    }
    merged.push({ startOffset: range.startOffset, endOffset: range.endOffset });
  }

  return merged;
}

/**
 * Narration / dialogue character split for `text`, using the same
 * `documentMap.dialogueDelimiterPairs` policy as the Document Map (delimiters
 * INCLUDED in the dialogue span; an unclosed `open` runs to end-of-text;
 * overlapping pairs are unioned, never double-counted).
 *
 * Approximate by design — no Markdown AST. Characters are counted as Unicode
 * code points, and `narration + dialogue === total` always holds. An empty
 * document, an unclosed delimiter and multiple pairs are all safe.
 */
export function analyzeDocumentNavigationDialogueRatio(
  text: string,
  dialoguePairs: readonly DocumentMapDialogueDelimiterPair[]
): DocumentNavigationDialogueRatio {
  if (text.length === 0) {
    return EMPTY_DIALOGUE_RATIO;
  }

  const ranges = mergeOffsetRanges(
    collectDocumentMapDialogueRanges(text, dialoguePairs)
  );

  let dialogueCharacters = 0;
  let narrationCharacters = 0;
  let rangeIndex = 0;

  for (let offset = 0; offset < text.length; ) {
    const codePoint = text.codePointAt(offset) ?? 0;
    const charLength = codePoint > 0xffff ? 2 : 1;

    while (
      rangeIndex < ranges.length &&
      ranges[rangeIndex].endOffset <= offset
    ) {
      rangeIndex += 1;
    }
    const current = ranges[rangeIndex];
    const inDialogue =
      current !== undefined &&
      offset >= current.startOffset &&
      offset < current.endOffset;

    if (inDialogue) {
      dialogueCharacters += 1;
    } else {
      narrationCharacters += 1;
    }

    offset += charLength;
  }

  const totalCharacters = narrationCharacters + dialogueCharacters;
  const dialoguePercent =
    totalCharacters === 0
      ? 0
      : Math.round((dialogueCharacters / totalCharacters) * 100);
  const narrationPercent = totalCharacters === 0 ? 0 : 100 - dialoguePercent;

  return {
    narrationCharacters,
    dialogueCharacters,
    totalCharacters,
    narrationPercent,
    dialoguePercent
  };
}

/**
 * The full Document Navigation Phase 2 analysis in one pass over the glossary
 * matcher (glossary + tag counts share the single scan) plus one pass for the
 * dialogue split. Never throws — a malformed input yields empty sections.
 */
export function analyzeDocumentNavigationDocument(
  text: string,
  entries: readonly GlossaryEntry[],
  dialoguePairs: readonly DocumentMapDialogueDelimiterPair[]
): DocumentNavigationAnalysis {
  const entryHitCounts = tallyGlossaryEntryHits(text, entries);

  return {
    glossaryCounts: glossaryCountRowsFromTally(entryHitCounts, entries),
    tagCounts: tagCountRowsFromTally(entryHitCounts, entries),
    dialogueRatio: analyzeDocumentNavigationDialogueRatio(text, dialoguePairs)
  };
}
