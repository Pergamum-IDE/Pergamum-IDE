import { editorIdEquals, type EditorId } from "../shared/editorId";
import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import { currentDocumentContent } from "./currentDocument";
import {
  findGlossaryEntryOccurrences,
  type GlossaryOccurrenceDirection,
  type GlossaryOccurrenceRange
} from "./glossaryOccurrenceNavigation";
import {
  findOpenDocument,
  type OpenDocumentsState
} from "./openDocuments";

export type { GlossaryOccurrenceDirection, GlossaryOccurrenceRange };

export interface GlossaryOccurrenceTrackingActiveState {
  kind: "active";
  entryId: GlossaryEntryId;
  entryLabel: string;
  entrySnapshot: GlossaryEntry;
  targetMarkdownEditorId: EditorId;
  ranges: GlossaryOccurrenceRange[];
  currentIndex: number;
}

export interface GlossaryOccurrenceTrackingInactiveState {
  kind: "inactive";
}

export type GlossaryOccurrenceTrackingState =
  | GlossaryOccurrenceTrackingInactiveState
  | GlossaryOccurrenceTrackingActiveState;

export const inactiveGlossaryOccurrenceTrackingState: GlossaryOccurrenceTrackingState =
  { kind: "inactive" };

export interface GlossaryOccurrenceTrackingTargetDocument {
  editorId: EditorId;
  content: string;
}

/**
 * Picks the range to select after a recompute, anchored on the start
 * offset of the previously-selected range rather than its numeric index.
 * This keeps navigation stable across edits: `next` selects the first
 * range that now starts after the anchor (wrapping to the first range if
 * none remain), `previous` selects the last range that now starts before
 * the anchor (wrapping to the last range if none remain). With no anchor
 * (a fresh tracking start), `next` starts at the first range and
 * `previous` starts at the last one.
 */
export function recomputeGlossaryOccurrenceIndex(
  previousRanges: readonly GlossaryOccurrenceRange[],
  previousIndex: number,
  nextRanges: readonly GlossaryOccurrenceRange[],
  direction: GlossaryOccurrenceDirection
): number {
  const anchor = previousRanges[previousIndex]?.start;

  if (anchor === undefined) {
    return direction === "next" ? 0 : nextRanges.length - 1;
  }

  if (direction === "next") {
    const index = nextRanges.findIndex((range) => range.start > anchor);
    return index === -1 ? 0 : index;
  }

  for (let index = nextRanges.length - 1; index >= 0; index -= 1) {
    if (nextRanges[index].start < anchor) {
      return index;
    }
  }

  return nextRanges.length - 1;
}

export type GlossaryOccurrenceTrackingOutcome =
  | { kind: "noTargetDocument" }
  | { kind: "noOccurrences" }
  | {
      kind: "tracking";
      session: GlossaryOccurrenceTrackingActiveState;
      range: GlossaryOccurrenceRange;
    };

export interface StartGlossaryOccurrenceTrackingInput {
  currentSession: GlossaryOccurrenceTrackingState;
  entry: GlossaryEntry;
  entryLabel: string;
  targetDocument: GlossaryOccurrenceTrackingTargetDocument | null;
  direction: GlossaryOccurrenceDirection;
}

/**
 * Starts (or continues) an occurrence tracking session from the Glossary
 * Editor's previous/next occurrence buttons.
 *
 * Session replacement rules:
 *  - inactive, different entry, or different target -> fresh session,
 *    `next` selects the first range and `previous` the last
 *  - same entry and same target as the current active session -> the
 *    session continues; the range is recomputed against the current
 *    `targetDocument` content and the next/previous index is resolved
 *    from the current session's anchor (see recomputeGlossaryOccurrenceIndex)
 */
export function startGlossaryOccurrenceTracking(
  input: StartGlossaryOccurrenceTrackingInput
): GlossaryOccurrenceTrackingOutcome {
  const { currentSession, entry, entryLabel, targetDocument, direction } =
    input;

  if (!targetDocument) {
    return { kind: "noTargetDocument" };
  }

  const ranges = findGlossaryEntryOccurrences(targetDocument.content, entry);

  if (ranges.length === 0) {
    return { kind: "noOccurrences" };
  }

  const continuingSession =
    currentSession.kind === "active" &&
    currentSession.entryId === entry.id &&
    editorIdEquals(currentSession.targetMarkdownEditorId, targetDocument.editorId)
      ? currentSession
      : null;

  const currentIndex = recomputeGlossaryOccurrenceIndex(
    continuingSession?.ranges ?? [],
    continuingSession?.currentIndex ?? -1,
    ranges,
    direction
  );

  const session: GlossaryOccurrenceTrackingActiveState = {
    kind: "active",
    entryId: entry.id,
    entryLabel,
    entrySnapshot: entry,
    targetMarkdownEditorId: targetDocument.editorId,
    ranges,
    currentIndex
  };

  return { kind: "tracking", session, range: ranges[currentIndex] };
}

export interface NavigateGlossaryOccurrenceTrackingInput {
  session: GlossaryOccurrenceTrackingActiveState;
  content: string;
  direction: GlossaryOccurrenceDirection;
}

export type NavigateGlossaryOccurrenceTrackingOutcome =
  | { kind: "noOccurrences" }
  | {
      kind: "tracking";
      session: GlossaryOccurrenceTrackingActiveState;
      range: GlossaryOccurrenceRange;
    };

/**
 * Continues an active tracking session (from the Utility Window's
 * previous/next buttons, or any other caller that already has a resolved
 * target). Ranges are always lazily recomputed from the current Markdown
 * content, using the session's `entrySnapshot` as the match source -
 * never the live unsaved Glossary draft.
 */
export function navigateGlossaryOccurrenceTracking(
  input: NavigateGlossaryOccurrenceTrackingInput
): NavigateGlossaryOccurrenceTrackingOutcome {
  const { session, content, direction } = input;
  const ranges = findGlossaryEntryOccurrences(content, session.entrySnapshot);

  if (ranges.length === 0) {
    return { kind: "noOccurrences" };
  }

  const currentIndex = recomputeGlossaryOccurrenceIndex(
    session.ranges,
    session.currentIndex,
    ranges,
    direction
  );
  const nextSession: GlossaryOccurrenceTrackingActiveState = {
    ...session,
    ranges,
    currentIndex
  };

  return { kind: "tracking", session: nextSession, range: ranges[currentIndex] };
}

export type ResolveGlossaryOccurrenceTrackingSessionResult =
  | { kind: "inactive" }
  | { kind: "targetMissing" }
  | { kind: "entryMissing" }
  | {
      kind: "resolved";
      session: GlossaryOccurrenceTrackingActiveState;
      targetContent: string;
    };

export interface ResolveGlossaryOccurrenceTrackingSessionContext {
  openDocumentsState: OpenDocumentsState;
  getGlossaryEntryById: (
    entryId: GlossaryEntryId
  ) => Promise<GlossaryEntry | null>;
}

/**
 * Resolves an occurrence tracking session against the current
 * `OpenDocumentsState` and the glossary store before any Utility Window
 * operation (previous/next/openEntry) acts on it. Every operation goes
 * through this resolver rather than trusting the in-memory session by
 * itself, so a closed target document or a deleted entry is always caught
 * here even if a proactive side effect (Project switch, document close,
 * the delete command) failed to clear the session first.
 */
export async function resolveGlossaryOccurrenceTrackingSession(
  session: GlossaryOccurrenceTrackingState,
  context: ResolveGlossaryOccurrenceTrackingSessionContext
): Promise<ResolveGlossaryOccurrenceTrackingSessionResult> {
  if (session.kind !== "active") {
    return { kind: "inactive" };
  }

  const targetOpenDocument = findOpenDocument(
    context.openDocumentsState,
    session.targetMarkdownEditorId
  );

  if (!targetOpenDocument) {
    return { kind: "targetMissing" };
  }

  const entry = await context.getGlossaryEntryById(session.entryId);

  if (!entry) {
    return { kind: "entryMissing" };
  }

  return {
    kind: "resolved",
    session,
    targetContent: currentDocumentContent(targetOpenDocument.editor.document)
  };
}
