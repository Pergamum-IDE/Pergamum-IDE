import { Compartment } from "@codemirror/state";
import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { describe, expect, it } from "vitest";
import {
  applyChangesToCachedMarkdownEditorDocumentState,
  createMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "../../src/renderer/markdownEditorDocumentState";

function ref<T>(value: T): { current: T } {
  return { current: value };
}

function baseOptions(overrides: Partial<Parameters<typeof createMarkdownEditorDocumentState>[0]> = {}) {
  return {
    doc: "hello",
    initialLineEndingBreaks: [],
    newFileLineEndingFallbackRef: ref<"lf" | "crlf" | "cr">("lf"),
    readOnlyCompartment: new Compartment(),
    readOnlyRef: ref(false),
    visibilityCompartment: new Compartment(),
    markerGlyph: "⏎" as const,
    expectedLineEndingRef: ref<"lf" | "crlf" | "cr">("lf"),
    markerGlyphRef: ref("⏎" as const),
    whitespaceCompartment: new Compartment(),
    whitespaceSettingsRef: ref({
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    }),
    glossaryCompletionRef: ref(null),
    createUpdateListenerExtension: () => [],
    ...overrides
  };
}

describe("createMarkdownEditorDocumentState (#387)", () => {
  it("builds an EditorState whose document is exactly the given content", () => {
    const { state } = createMarkdownEditorDocumentState(baseOptions({ doc: "hello world" }));
    expect(state.doc.toString()).toBe("hello world");
  });

  it("bakes the current readOnlyRef value into the built state", () => {
    const readOnly = createMarkdownEditorDocumentState(
      baseOptions({ readOnlyRef: ref(true) })
    );
    expect(readOnly.state.readOnly).toBe(true);

    const editable = createMarkdownEditorDocumentState(
      baseOptions({ readOnlyRef: ref(false) })
    );
    expect(editable.state.readOnly).toBe(false);
  });

  it("gives each call its own fresh lineEndingField, seeded from initialLineEndingBreaks", () => {
    const a = createMarkdownEditorDocumentState(baseOptions({ doc: "a\nb" }));
    const b = createMarkdownEditorDocumentState(baseOptions({ doc: "c\nd" }));

    expect(a.lineEndingField).not.toBe(b.lineEndingField);
    // Each state can only be read through its OWN field instance.
    expect(a.state.field(a.lineEndingField)).toBeDefined();
    expect(b.state.field(b.lineEndingField)).toBeDefined();
  });

  it("passes its own lineEndingField through to createUpdateListenerExtension", () => {
    let received: unknown = null;
    createMarkdownEditorDocumentState(
      baseOptions({
        createUpdateListenerExtension: (lineEndingField) => {
          received = lineEndingField;
          return [];
        }
      })
    );
    expect(received).not.toBeNull();
  });
});

describe("applyChangesToCachedMarkdownEditorDocumentState (#393)", () => {
  it("applies multiple candidates as ONE transaction - one undo step regardless of candidate count", () => {
    const initial = createMarkdownEditorDocumentState(
      baseOptions({ doc: "aaa bbb ccc" })
    );

    const result = applyChangesToCachedMarkdownEditorDocumentState(
      initial,
      "aaa bbb ccc",
      [
        { from: 0, to: 3, insert: "AAA" },
        { from: 8, to: 11, insert: "CCC" }
      ],
      "input.replace"
    );

    expect(result).not.toBeNull();
    expect(result!.content).toBe("AAA bbb CCC");
    expect(result!.nextDocumentState.state.doc.toString()).toBe(
      "AAA bbb CCC"
    );
    expect(undoDepth(result!.nextDocumentState.state)).toBe(1);
  });

  it("preserves history from edits made BEFORE the replace, as a separate earlier undo step", () => {
    const initial = createMarkdownEditorDocumentState(
      baseOptions({ doc: "hello" })
    );
    // A prior, ordinary edit - as if the user had typed into this document
    // before switching away from it.
    const priorEditTransaction = initial.state.update({
      changes: { from: 5, to: 5, insert: " world" },
      userEvent: "input.type"
    });
    const cached: MarkdownEditorDocumentState = {
      state: priorEditTransaction.state,
      lineEndingField: initial.lineEndingField
    };
    expect(cached.state.doc.toString()).toBe("hello world");

    const result = applyChangesToCachedMarkdownEditorDocumentState(
      cached,
      "hello world",
      [{ from: 0, to: 5, insert: "HELLO" }],
      "input.replace"
    );

    expect(result).not.toBeNull();
    expect(result!.content).toBe("HELLO world");
    expect(undoDepth(result!.nextDocumentState.state)).toBe(2);

    const afterUndoingReplace = undoOnce(result!.nextDocumentState.state);
    expect(afterUndoingReplace?.doc.toString()).toBe("hello world");
    expect(undoDepth(afterUndoingReplace!)).toBe(1);

    const afterUndoingPriorEdit = undoOnce(afterUndoingReplace!);
    expect(afterUndoingPriorEdit?.doc.toString()).toBe("hello");
    expect(undoDepth(afterUndoingPriorEdit!)).toBe(0);
  });

  it("redo restores the replace transaction", () => {
    const initial = createMarkdownEditorDocumentState(
      baseOptions({ doc: "hello" })
    );
    const result = applyChangesToCachedMarkdownEditorDocumentState(
      initial,
      "hello",
      [{ from: 0, to: 5, insert: "HELLO" }],
      "input.replace"
    );

    const afterUndo = undoOnce(result!.nextDocumentState.state);
    expect(afterUndo?.doc.toString()).toBe("hello");
    expect(redoDepth(afterUndo!)).toBe(1);

    const afterRedo = redoOnce(afterUndo!);
    expect(afterRedo?.doc.toString()).toBe("HELLO");
  });

  it("returns null (stale) instead of applying when currentContent no longer matches the cached doc", () => {
    const initial = createMarkdownEditorDocumentState(
      baseOptions({ doc: "hello" })
    );

    const result = applyChangesToCachedMarkdownEditorDocumentState(
      initial,
      "hello, but something else changed this document meanwhile",
      [{ from: 0, to: 5, insert: "HELLO" }],
      "input.replace"
    );

    expect(result).toBeNull();
    // The cached state itself is untouched - EditorState is immutable, and
    // the caller's documented fallback (plain content-string swap, no undo
    // history) never even sees this cached entry.
    expect(initial.state.doc.toString()).toBe("hello");
  });

  it("keeps two independent documents' cached states fully independent", () => {
    const a = createMarkdownEditorDocumentState(baseOptions({ doc: "A" }));
    const b = createMarkdownEditorDocumentState(baseOptions({ doc: "B" }));

    const resultA = applyChangesToCachedMarkdownEditorDocumentState(
      a,
      "A",
      [{ from: 0, to: 1, insert: "AA" }],
      "input.replace"
    );

    expect(resultA!.content).toBe("AA");
    // b's own state was never touched by a's replace.
    expect(b.state.doc.toString()).toBe("B");
    expect(undoDepth(b.state)).toBe(0);
  });

  it("the result's content and lineEndingBreaks are read from the SAME advanced state it returns", () => {
    const initial = createMarkdownEditorDocumentState(
      baseOptions({ doc: "line one" })
    );
    const result = applyChangesToCachedMarkdownEditorDocumentState(
      initial,
      "line one",
      [{ from: 4, to: 4, insert: "\nline two" }],
      "input.replace"
    );

    expect(result!.content).toBe(
      result!.nextDocumentState.state.doc.toString()
    );
    expect(result!.lineEndingBreaks).toBe(
      result!.nextDocumentState.state.field(
        result!.nextDocumentState.lineEndingField
      )
    );
  });
});

function undoOnce(state: MarkdownEditorDocumentState["state"]) {
  // `undo`/`redo` are EditorView commands (they take a `{state, dispatch}`
  // pair), but this module works on bare `EditorState` - this tiny adapter
  // lets the tests drive Undo/Redo the same way `@codemirror/commands`
  // expects without constructing a real EditorView.
  let next: typeof state | null = null;
  undo({
    state,
    dispatch: (tr) => {
      next = tr.state;
    }
  });
  return next;
}

function redoOnce(state: MarkdownEditorDocumentState["state"]) {
  let next: typeof state | null = null;
  redo({
    state,
    dispatch: (tr) => {
      next = tr.state;
    }
  });
  return next;
}
