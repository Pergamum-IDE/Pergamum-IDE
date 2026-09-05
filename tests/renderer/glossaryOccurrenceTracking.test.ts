import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import {
  createUntitledEditorId,
  type EditorId
} from "../../src/shared/editorId";
import {
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";
import { buildLineEndingBreakSet } from "../../src/renderer/editorLineEndingField";
import {
  createGlossaryEntryCurrentEditor,
  createMarkdownCurrentEditor
} from "../../src/renderer/currentEditor";
import type { OpenDocumentsState } from "../../src/renderer/openDocuments";
import {
  findGlossaryEntryOccurrences,
  type GlossaryOccurrenceRange
} from "../../src/renderer/glossaryOccurrenceNavigation";
import {
  inactiveGlossaryOccurrenceTrackingState,
  navigateGlossaryOccurrenceTracking,
  recomputeGlossaryOccurrenceIndex,
  resolveGlossaryOccurrenceTrackingSession,
  startGlossaryOccurrenceTracking,
  type GlossaryOccurrenceTrackingActiveState
} from "../../src/renderer/glossaryOccurrenceTracking";

const timestamp = "2026-08-14T00:00:00.000Z";
const maidEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const otherEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000002";

const CHECK_BOTH = setGlossaryAtomBoundaryEndPolicy(
  setGlossaryAtomBoundaryStartPolicy(0, GlossaryBoundaryPolicy.Auto),
  GlossaryBoundaryPolicy.Auto
);

function glossaryEntry(
  id: string,
  values: string[],
  matchFlags: number = CHECK_BOTH
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: values.map((value, index) => ({
      id: `${id}-atom-${index}`,
      entryId: id,
      sortOrder: index,
      value,
      matchFlags,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

const maidEntry = glossaryEntry(maidEntryId, ["メイド"]);
const otherEntry = glossaryEntry(otherEntryId, ["騎士"]);

const documentEditorId: EditorId = createUntitledEditorId(1);
const otherDocumentEditorId: EditorId = createUntitledEditorId(2);

function markdownOpenDocumentsState(
  editorId: EditorId,
  content: string
): OpenDocumentsState {
  const document = updateCurrentDocumentContent(
    createUntitledDocument(),
    content,
    buildLineEndingBreakSet(analyzeLineEndings(content))
  );

  return {
    documents: [{ id: editorId, editor: createMarkdownCurrentEditor(document) }],
    activeDocumentId: editorId,
    nextUntitledId: 1
  };
}

function glossaryEntryOpenDocumentsState(
  editorId: EditorId,
  entry: GlossaryEntry
): OpenDocumentsState {
  return {
    documents: [
      { id: editorId, editor: createGlossaryEntryCurrentEditor(entry) }
    ],
    activeDocumentId: editorId,
    nextUntitledId: 1
  };
}

const emptyOpenDocumentsState: OpenDocumentsState = {
  documents: [],
  activeDocumentId: createUntitledEditorId(1),
  nextUntitledId: 1
};

describe("recomputeGlossaryOccurrenceIndex", () => {
  const previousRanges: GlossaryOccurrenceRange[] = [
    { start: 10, end: 15 },
    { start: 20, end: 25 },
    { start: 30, end: 35 }
  ];

  it("without an anchor, next resolves to the first range and previous to the last", () => {
    expect(
      recomputeGlossaryOccurrenceIndex([], -1, previousRanges, "next")
    ).toBe(0);
    expect(
      recomputeGlossaryOccurrenceIndex([], -1, previousRanges, "previous")
    ).toBe(2);
  });

  it("wraps forward across three ranges and back again", () => {
    const ranges: GlossaryOccurrenceRange[] = [
      { start: 0, end: 1 },
      { start: 10, end: 11 },
      { start: 20, end: 21 }
    ];

    let index = recomputeGlossaryOccurrenceIndex(ranges, 0, ranges, "next");
    expect(index).toBe(1);
    index = recomputeGlossaryOccurrenceIndex(ranges, index, ranges, "next");
    expect(index).toBe(2);
    index = recomputeGlossaryOccurrenceIndex(ranges, index, ranges, "next");
    expect(index).toBe(0);
    index = recomputeGlossaryOccurrenceIndex(
      ranges,
      index,
      ranges,
      "previous"
    );
    expect(index).toBe(2);
  });

  it("re-anchors on the previous range's start offset after ranges shift from an edit", () => {
    const nextRanges: GlossaryOccurrenceRange[] = [
      { start: 12, end: 17 },
      { start: 28, end: 33 },
      { start: 40, end: 45 }
    ];

    expect(
      recomputeGlossaryOccurrenceIndex(previousRanges, 1, nextRanges, "next")
    ).toBe(1);
    expect(
      recomputeGlossaryOccurrenceIndex(
        previousRanges,
        1,
        nextRanges,
        "previous"
      )
    ).toBe(0);
  });
});

describe("startGlossaryOccurrenceTracking", () => {
  it("reports noTargetDocument when there is no target", () => {
    const outcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: null,
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noTargetDocument" });
  });

  it("reports noOccurrences when the target has no matches", () => {
    const outcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: { editorId: documentEditorId, content: "誰もいない。" },
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });

  it("starts fresh at the first range for next and the last range for previous", () => {
    const text = "メイドが来た。もう一人のメイドも来た。もう一人来た、メイドだ。";
    const targetDocument = { editorId: documentEditorId, content: text };

    const nextOutcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument,
      direction: "next"
    });
    const previousOutcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument,
      direction: "previous"
    });

    if (
      nextOutcome.kind !== "tracking" ||
      previousOutcome.kind !== "tracking"
    ) {
      throw new Error("expected tracking outcomes");
    }

    expect(nextOutcome.session.currentIndex).toBe(0);
    expect(previousOutcome.session.currentIndex).toBe(2);
    expect(nextOutcome.session.ranges).toHaveLength(3);
    expect(nextOutcome.session.entrySnapshot).toBe(maidEntry);
    expect(nextOutcome.session.entryLabel).toBe("メイド");
    expect(nextOutcome.session.targetMarkdownEditorId).toBe(documentEditorId);
  });

  it("replaces the session outright when starting a different entry", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const targetDocument = { editorId: documentEditorId, content: text };

    const firstOutcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument,
      direction: "next"
    });

    if (firstOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    const otherText = "騎士が来た。";
    const secondOutcome = startGlossaryOccurrenceTracking({
      currentSession: firstOutcome.session,
      entry: otherEntry,
      entryLabel: "騎士",
      targetDocument: { editorId: documentEditorId, content: otherText },
      direction: "next"
    });

    if (secondOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    expect(secondOutcome.session.entryId).toBe(otherEntryId);
    expect(secondOutcome.session.currentIndex).toBe(0);
  });

  it("replaces the session outright when starting the same entry against a different target", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";

    const firstOutcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: { editorId: documentEditorId, content: text },
      direction: "next"
    });

    if (firstOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    const secondOutcome = startGlossaryOccurrenceTracking({
      currentSession: firstOutcome.session,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: { editorId: otherDocumentEditorId, content: text },
      direction: "previous"
    });

    if (secondOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    expect(secondOutcome.session.targetMarkdownEditorId).toBe(
      otherDocumentEditorId
    );
    expect(secondOutcome.session.currentIndex).toBe(1);
  });

  it("continues the same session for the same entry and target, anchored on the current range", () => {
    const text = "メイドが来た。もう一人のメイドも来た。もう一人来た、メイドだ。";
    const targetDocument = { editorId: documentEditorId, content: text };

    const firstOutcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument,
      direction: "next"
    });

    if (firstOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    const secondOutcome = startGlossaryOccurrenceTracking({
      currentSession: firstOutcome.session,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument,
      direction: "next"
    });

    if (secondOutcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    expect(secondOutcome.session.currentIndex).toBe(1);
  });

  it("finds occurrences from every atom value, matching #81 semantics", () => {
    const entry = glossaryEntry(maidEntryId, ["メイド", "女中"]);
    const outcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry,
      entryLabel: "メイド",
      targetDocument: {
        editorId: documentEditorId,
        content: "女中が控えている。"
      },
      direction: "next"
    });

    expect(outcome.kind).toBe("tracking");
  });

  it("excludes surrounding Markdown syntax such as **, matching #81 semantics", () => {
    const outcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: {
        editorId: documentEditorId,
        content: "**メイド**が控えている"
      },
      direction: "next"
    });

    if (outcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    expect(
      "**メイド**が控えている".slice(outcome.range.start, outcome.range.end)
    ).toBe("メイド");
  });

  it("does not match across an auto boundary, matching #81 semantics", () => {
    const outcome = startGlossaryOccurrenceTracking({
      currentSession: inactiveGlossaryOccurrenceTrackingState,
      entry: maidEntry,
      entryLabel: "メイド",
      targetDocument: {
        editorId: documentEditorId,
        content: "オーダーメイドの品を受け取った。"
      },
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });
});

describe("navigateGlossaryOccurrenceTracking", () => {
  function activeSession(
    overrides: Partial<GlossaryOccurrenceTrackingActiveState> = {}
  ): GlossaryOccurrenceTrackingActiveState {
    return {
      kind: "active",
      entryId: maidEntryId,
      entryLabel: "メイド",
      entrySnapshot: maidEntry,
      targetMarkdownEditorId: documentEditorId,
      ranges: [],
      currentIndex: -1,
      ...overrides
    };
  }

  it("recomputes ranges from the current content and reports noOccurrences when none remain", () => {
    const outcome = navigateGlossaryOccurrenceTracking({
      session: activeSession(),
      content: "誰もいない部屋。",
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });

  it("steps to the next occurrence using the current session as the anchor", () => {
    const text = "メイドが来た。もう一人のメイドも来た。";
    const session = activeSession({
      ranges: [
        { start: 0, end: 3 },
        { start: 11, end: 14 }
      ],
      currentIndex: 0
    });

    const outcome = navigateGlossaryOccurrenceTracking({
      session,
      content: text,
      direction: "next"
    });

    if (outcome.kind !== "tracking") {
      throw new Error("expected tracking outcome");
    }

    expect(outcome.session.currentIndex).toBe(1);
    expect(text.slice(outcome.range.start, outcome.range.end)).toBe("メイド");
  });

  it("uses the entrySnapshot as the match source, matching #81 semantics", () => {
    const text = "メイドが来た。";
    const outcome = navigateGlossaryOccurrenceTracking({
      session: activeSession({ entrySnapshot: otherEntry }),
      content: text,
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });

  it("keeps the anchor's raw offset stable across a recompute, so an insertion earlier in the document shifts which range it lands on", () => {
    const before = "メイドが来た。もう一人のメイドも来た。もう一人来た、メイドだ。";
    const beforeRanges = findGlossaryEntryOccurrences(before, maidEntry);
    const session = activeSession({
      ranges: beforeRanges,
      currentIndex: 1
    });
    // Insert text before the whole document. This shifts every occurrence
    // later by the inserted length, but the anchor captured from the old
    // session (`beforeRanges[1].start`) is not shifted along with it - by
    // design, recompute re-derives the anchor's meaning purely from raw
    // offset comparison against the freshly computed ranges.
    const inserted = "追記した。";
    const after = `${inserted}${before}`;
    const expectedAfterRanges = findGlossaryEntryOccurrences(after, maidEntry);

    expect(expectedAfterRanges).toEqual(
      beforeRanges.map((range) => ({
        start: range.start + inserted.length,
        end: range.end + inserted.length
      }))
    );

    const anchor = beforeRanges[1].start;
    const expectedNextIndex = expectedAfterRanges.findIndex(
      (range) => range.start > anchor
    );
    const expectedPreviousIndex =
      expectedAfterRanges
        .map((range, index) => ({ range, index }))
        .filter(({ range }) => range.start < anchor)
        .at(-1)?.index ?? expectedAfterRanges.length - 1;

    const nextOutcome = navigateGlossaryOccurrenceTracking({
      session,
      content: after,
      direction: "next"
    });
    const previousOutcome = navigateGlossaryOccurrenceTracking({
      session,
      content: after,
      direction: "previous"
    });

    if (
      nextOutcome.kind !== "tracking" ||
      previousOutcome.kind !== "tracking"
    ) {
      throw new Error("expected tracking outcomes");
    }

    expect(nextOutcome.range).toEqual(expectedAfterRanges[expectedNextIndex]);
    expect(previousOutcome.range).toEqual(
      expectedAfterRanges[expectedPreviousIndex]
    );
  });

  it("becomes inactive-worthy (noOccurrences) once an edit removes every match", () => {
    const before = "メイドが来た。";
    const session = activeSession({
      ranges: findGlossaryEntryOccurrences(before, maidEntry),
      currentIndex: 0
    });

    const outcome = navigateGlossaryOccurrenceTracking({
      session,
      content: "誰もいなくなった。",
      direction: "next"
    });

    expect(outcome).toEqual({ kind: "noOccurrences" });
  });
});

describe("resolveGlossaryOccurrenceTrackingSession", () => {
  const activeSession: GlossaryOccurrenceTrackingActiveState = {
    kind: "active",
    entryId: maidEntryId,
    entryLabel: "メイド",
    entrySnapshot: maidEntry,
    targetMarkdownEditorId: documentEditorId,
    ranges: [{ start: 0, end: 3 }],
    currentIndex: 0
  };

  it("resolves to inactive without checking anything else when the session is inactive", async () => {
    const result = await resolveGlossaryOccurrenceTrackingSession(
      inactiveGlossaryOccurrenceTrackingState,
      {
        openDocumentsState: emptyOpenDocumentsState,
        getGlossaryEntryById: async () => {
          throw new Error("should not be called");
        }
      }
    );

    expect(result).toEqual({ kind: "inactive" });
  });

  it("resolves to targetMissing when the target editor is not open", async () => {
    const result = await resolveGlossaryOccurrenceTrackingSession(
      activeSession,
      {
        openDocumentsState: emptyOpenDocumentsState,
        getGlossaryEntryById: async () => maidEntry
      }
    );

    expect(result).toEqual({ kind: "targetMissing" });
  });

  it("resolves to targetNotMarkdown when the target editor is now a Glossary Editor", async () => {
    const result = await resolveGlossaryOccurrenceTrackingSession(
      activeSession,
      {
        openDocumentsState: glossaryEntryOpenDocumentsState(
          documentEditorId,
          maidEntry
        ),
        getGlossaryEntryById: async () => maidEntry
      }
    );

    expect(result).toEqual({ kind: "targetNotMarkdown" });
  });

  it("resolves to entryMissing when the entry has been deleted", async () => {
    const result = await resolveGlossaryOccurrenceTrackingSession(
      activeSession,
      {
        openDocumentsState: markdownOpenDocumentsState(
          documentEditorId,
          "メイドが来た。"
        ),
        getGlossaryEntryById: async () => null
      }
    );

    expect(result).toEqual({ kind: "entryMissing" });
  });

  it("resolves with the current target content when everything is valid", async () => {
    const result = await resolveGlossaryOccurrenceTrackingSession(
      activeSession,
      {
        openDocumentsState: markdownOpenDocumentsState(
          documentEditorId,
          "メイドが来た。"
        ),
        getGlossaryEntryById: async () => maidEntry
      }
    );

    expect(result).toEqual({
      kind: "resolved",
      session: activeSession,
      targetContent: "メイドが来た。"
    });
  });
});
