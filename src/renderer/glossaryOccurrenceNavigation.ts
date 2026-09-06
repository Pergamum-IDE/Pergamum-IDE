import { editorIdEquals, type EditorId } from "../shared/editorId";
import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesPerEntry
} from "../shared/glossarySurfaceMatching";

export interface GlossaryOccurrenceRange {
  start: number;
  end: number;
}

/**
 * Build occurrence ranges for all entries in a single pass over text (#403).
 *
 * Each entry's occurrences are resolved independently using greedy longest match,
 * so shorter entries contained within longer entries (e.g. 信長 inside 織田信長)
 * are never shadowed, strictly preserving per-entry occurrence semantics.
 */
export function buildGlossaryEntryOccurrenceMap(
  text: string | null,
  entries: readonly GlossaryEntry[]
): Map<GlossaryEntryId, GlossaryOccurrenceRange[]> {
  const result = new Map<GlossaryEntryId, GlossaryOccurrenceRange[]>();
  for (const entry of entries) {
    result.set(entry.id, []);
  }

  if (text === null || text.length === 0 || entries.length === 0) {
    return result;
  }

  const index = buildGlossarySurfaceIndex(entries);
  const perEntryMatches = matchGlossarySurfacesPerEntry(text, index);

  for (const entry of entries) {
    const occurrences = perEntryMatches.get(entry.id);
    if (occurrences) {
      result.set(entry.id, occurrences);
    }
  }

  return result;
}

export function findGlossaryEntryOccurrences(
  text: string,
  entry: GlossaryEntry
): GlossaryOccurrenceRange[] {
  return buildGlossaryEntryOccurrenceMap(text, [entry]).get(entry.id) ?? [];
}

export function tallyGlossaryEntryHits(
  text: string | null,
  entries: readonly GlossaryEntry[]
): Map<string, number> {
  const counts = new Map<string, number>();
  if (text === null || text.length === 0 || entries.length === 0) {
    return counts;
  }

  const occurrenceMap = buildGlossaryEntryOccurrenceMap(text, entries);
  for (const [entryId, occurrences] of occurrenceMap) {
    if (occurrences.length > 0) {
      counts.set(entryId, occurrences.length);
    }
  }
  return counts;
}

export type GlossaryOccurrenceDirection = "previous" | "next";

export interface GlossaryOccurrenceCursor {
  entryId: GlossaryEntryId;
  documentEditorId: EditorId;
  index: number;
}

export type GlossaryOccurrenceNavigationOutcome =
  | { kind: "noTargetDocument" }
  | { kind: "noOccurrences" }
  | {
      kind: "navigated";
      range: GlossaryOccurrenceRange;
      cursor: GlossaryOccurrenceCursor;
    };

export interface GlossaryOccurrenceTargetDocument {
  editorId: EditorId;
  content: string;
}

export interface PlanGlossaryOccurrenceNavigationInput {
  entry: GlossaryEntry;
  targetDocument: GlossaryOccurrenceTargetDocument | null;
  direction: GlossaryOccurrenceDirection;
  currentCursor: GlossaryOccurrenceCursor | null;
  occurrences?: readonly GlossaryOccurrenceRange[];
}

function anchorIndex(
  currentCursor: GlossaryOccurrenceCursor | null,
  entryId: GlossaryEntryId,
  documentEditorId: EditorId,
  occurrenceCount: number
): number | null {
  if (
    !currentCursor ||
    currentCursor.entryId !== entryId ||
    !editorIdEquals(currentCursor.documentEditorId, documentEditorId) ||
    currentCursor.index < 0 ||
    currentCursor.index >= occurrenceCount
  ) {
    return null;
  }

  return currentCursor.index;
}

function resolveOccurrenceIndex(
  direction: GlossaryOccurrenceDirection,
  anchor: number | null,
  occurrenceCount: number
): number {
  if (anchor === null) {
    return direction === "next" ? 0 : occurrenceCount - 1;
  }

  return direction === "next"
    ? (anchor + 1) % occurrenceCount
    : (anchor - 1 + occurrenceCount) % occurrenceCount;
}

export function planGlossaryOccurrenceNavigation(
  input: PlanGlossaryOccurrenceNavigationInput
): GlossaryOccurrenceNavigationOutcome {
  const { entry, targetDocument, direction, currentCursor } = input;

  if (!targetDocument) {
    return { kind: "noTargetDocument" };
  }

  const occurrences =
    input.occurrences ??
    findGlossaryEntryOccurrences(targetDocument.content, entry);

  if (occurrences.length === 0) {
    return { kind: "noOccurrences" };
  }

  const anchor = anchorIndex(
    currentCursor,
    entry.id,
    targetDocument.editorId,
    occurrences.length
  );
  const nextIndex = resolveOccurrenceIndex(
    direction,
    anchor,
    occurrences.length
  );

  return {
    kind: "navigated",
    range: occurrences[nextIndex],
    cursor: {
      entryId: entry.id,
      documentEditorId: targetDocument.editorId,
      index: nextIndex
    }
  };
}
