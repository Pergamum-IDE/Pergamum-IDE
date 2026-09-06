/**
 * #360 Phase 2 — pure analysis helpers for the Document Metrics (文書統計)
 * left pane's "in numbers" sections:
 *
 *   - Glossary Entry occurrence counts (per Entry, all its Atoms summed)
 *   - first-tag occurrence counts (each Entry's PRIMARY tag only)
 *   - narration / dialogue character split + ratio
 *
 * Everything here is pure and Canvas-free so it can be unit-tested directly.
 * It deliberately reuses the SAME shared building blocks as the Document Map /
 * Sidebar occurrence jump — `matchGlossarySurfacesInText` for hit detection
 * (so `matchFlags`, boundary policy and the single-character opt-in all
 * behave identically) and `collectDocumentMapDialogueRanges` for dialogue
 * spans — without pulling in the Document Map RENDERER. The counts always cover
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
import { collectDocumentMapDialogueRanges } from "./glossaryDocumentMap";

export interface DocumentMetricsGlossaryCount {
  readonly entryId: string;
  /** The Entry's representative (`sortOrder = 0`) atom value. */
  readonly label: string;
  readonly count: number;
}

export interface DocumentMetricsTagCount {
  readonly tagId: string;
  readonly label: string;
  /** The tag's STORED `#rrggbb` colours (no Document Map visibility
   *  correction) — the Document Metrics tag chip renders them verbatim. */
  readonly backgroundRgb: string;
  readonly foregroundRgb: string;
  readonly count: number;
}

export interface DocumentMetricsDialoguePairCount {
  readonly pairIndex: number;
  readonly open: string;
  readonly close: string;
  readonly color: string;
  readonly characters: number;
  readonly percent: number;
}

export interface DocumentMetricsDialogueRatio {
  readonly narrationCharacters: number;
  readonly pairs: readonly DocumentMetricsDialoguePairCount[];
  /** `narrationCharacters + sum(pairs.characters)` (never off by rounding). */
  readonly totalCharacters: number;
  /** 0..100, integer. */
  readonly narrationPercent: number;
  /** Aggregate dialogue characters across all pairs. */
  readonly dialogueCharacters: number;
  /** Aggregate dialogue percentage across all pairs. */
  readonly dialoguePercent: number;
}

export interface DocumentMetricsAnalysis {
  readonly glossaryCounts: readonly DocumentMetricsGlossaryCount[];
  readonly tagCounts: readonly DocumentMetricsTagCount[];
  readonly dialogueRatio: DocumentMetricsDialogueRatio;
}

export function emptyDocumentMetricsDialogueRatio(
  dialoguePairs: readonly DocumentMapDialogueDelimiterPair[] = []
): DocumentMetricsDialogueRatio {
  return {
    narrationCharacters: 0,
    pairs: dialoguePairs.map((pair, pairIndex) => ({
      pairIndex,
      open: pair.open,
      close: pair.close,
      color: pair.color,
      characters: 0,
      percent: 0
    })),
    totalCharacters: 0,
    narrationPercent: 0,
    dialogueCharacters: 0,
    dialoguePercent: 0
  };
}

/**
 * Per-Entry hit tally for `text`: every non-overlapping glossary surface
 * match, attributed to `candidates[0].entryId` (the shared matcher's
 * deterministic primary candidate — the same choice the Document Map makes).
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
): DocumentMetricsGlossaryCount[] {
  const entryOrder = new Map(entries.map((entry, order) => [entry.id, order]));
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  const rows: DocumentMetricsGlossaryCount[] = [];
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
): DocumentMetricsTagCount[] {
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

export function collectDocumentMetricsGlossaryCounts(
  text: string,
  entries: readonly GlossaryEntry[]
): DocumentMetricsGlossaryCount[] {
  return glossaryCountRowsFromTally(
    tallyGlossaryEntryHits(text, entries),
    entries
  );
}

export function collectDocumentMetricsTagCounts(
  text: string,
  entries: readonly GlossaryEntry[]
): DocumentMetricsTagCount[] {
  return tagCountRowsFromTally(tallyGlossaryEntryHits(text, entries), entries);
}

interface DialogueSweepEvent {
  readonly offset: number;
  readonly type: 1 | -1; // 1 = start, -1 = end
  readonly pairIndex: number;
}

/**
 * Narration / dialogue character split for `text`, using the same
 * `documentMap.dialogueDelimiterPairs` policy as the Document Map (delimiters
 * INCLUDED in the dialogue span; an unclosed `open` runs to end-of-text;
 * later pair wins on overlap, never double-counted).
 *
 * Approximate by design — no Markdown AST. Characters are counted as Unicode
 * code points, and `narration + sum(pairs.characters) === total` always holds. An empty
 * document, an unclosed delimiter and multiple pairs are all safe.
 *
 * Complexity breakdown:
 *   - Range collection: O(P · N) via collectDocumentMapDialogueRanges
 *   - Event sorting: O(R log R)
 *   - Forward sweep: O(N + R · P)
 * where N = document length, R = dialogue range count, P = configured dialogue-pair count.
 * Winner lookup walks down activePairCounts at most P steps on deactivation.
 * Since P is typically very small, this avoids the prior O(N × R) regression
 * of per-character point queries across all ranges.
 */
export function analyzeDocumentMetricsDialogueRatio(
  text: string,
  dialoguePairs: readonly DocumentMapDialogueDelimiterPair[]
): DocumentMetricsDialogueRatio {
  if (text.length === 0) {
    return emptyDocumentMetricsDialogueRatio(dialoguePairs);
  }

  const ranges = collectDocumentMapDialogueRanges(text, dialoguePairs);
  const pairCounts = dialoguePairs.map(() => 0);
  let narrationCharacters = 0;

  if (ranges.length === 0) {
    for (let offset = 0; offset < text.length; ) {
      const codePoint = text.codePointAt(offset) ?? 0;
      narrationCharacters += 1;
      offset += codePoint > 0xffff ? 2 : 1;
    }
  } else {
    const events: DialogueSweepEvent[] = [];
    for (const range of ranges) {
      events.push({
        offset: range.startOffset,
        type: 1,
        pairIndex: range.pairIndex
      });
      events.push({
        offset: range.endOffset,
        type: -1,
        pairIndex: range.pairIndex
      });
    }

    events.sort((a, b) => {
      if (a.offset !== b.offset) {
        return a.offset - b.offset;
      }
      return a.type - b.type; // end (-1) before start (1)
    });

    const activePairCounts = new Int32Array(dialoguePairs.length);
    let currentMaxPairIndex = -1;
    let eventIndex = 0;

    for (let offset = 0; offset < text.length; ) {
      while (
        eventIndex < events.length &&
        events[eventIndex].offset <= offset
      ) {
        const ev = events[eventIndex];
        if (ev.type === 1) {
          activePairCounts[ev.pairIndex] += 1;
          if (ev.pairIndex > currentMaxPairIndex) {
            currentMaxPairIndex = ev.pairIndex;
          }
        } else {
          activePairCounts[ev.pairIndex] -= 1;
          if (
            activePairCounts[ev.pairIndex] === 0 &&
            ev.pairIndex === currentMaxPairIndex
          ) {
            while (
              currentMaxPairIndex >= 0 &&
              activePairCounts[currentMaxPairIndex] === 0
            ) {
              currentMaxPairIndex -= 1;
            }
          }
        }
        eventIndex += 1;
      }

      if (currentMaxPairIndex === -1) {
        narrationCharacters += 1;
      } else {
        pairCounts[currentMaxPairIndex] += 1;
      }

      const codePoint = text.codePointAt(offset) ?? 0;
      offset += codePoint > 0xffff ? 2 : 1;
    }
  }

  const dialogueCharacters = pairCounts.reduce((sum, count) => sum + count, 0);
  const totalCharacters = narrationCharacters + dialogueCharacters;
  const dialoguePercent =
    totalCharacters === 0
      ? 0
      : Math.round((dialogueCharacters / totalCharacters) * 100);
  const narrationPercent = totalCharacters === 0 ? 0 : 100 - dialoguePercent;

  const pairs: DocumentMetricsDialoguePairCount[] = dialoguePairs.map(
    (pair, pairIndex) => {
      const characters = pairCounts[pairIndex] ?? 0;
      const percent =
        totalCharacters === 0
          ? 0
          : Math.round((characters / totalCharacters) * 100);
      return {
        pairIndex,
        open: pair.open,
        close: pair.close,
        color: pair.color,
        characters,
        percent
      };
    }
  );

  return {
    narrationCharacters,
    pairs,
    totalCharacters,
    narrationPercent,
    dialogueCharacters,
    dialoguePercent
  };
}

/**
 * The full Document Metrics Phase 2 analysis in one pass over the glossary
 * matcher (glossary + tag counts share the single scan) plus one pass for the
 * dialogue split. Never throws — a malformed input yields empty sections.
 */
export function analyzeDocumentMetricsDocument(
  text: string,
  entries: readonly GlossaryEntry[],
  dialoguePairs: readonly DocumentMapDialogueDelimiterPair[]
): DocumentMetricsAnalysis {
  const entryHitCounts = tallyGlossaryEntryHits(text, entries);

  return {
    glossaryCounts: glossaryCountRowsFromTally(entryHitCounts, entries),
    tagCounts: tagCountRowsFromTally(entryHitCounts, entries),
    dialogueRatio: analyzeDocumentMetricsDialogueRatio(text, dialoguePairs)
  };
}
