// @vitest-environment happy-dom
import { EditorSelection, EditorState, type ChangeSpec } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLineChange,
  editorIndentKeymap,
  indentCommand,
  outdentCommand,
  planIndentTransaction,
  type IndentDirection
} from "../../src/renderer/indentCommands";
import { classifyLine } from "../../src/renderer/indentLineContext";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";

function stateFor(
  doc: string,
  cursor: number,
  options: { readOnly?: boolean } = {}
): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(cursor),
    extensions: [
      EditorState.allowMultipleSelections.of(true),
      ...(options.readOnly ? [EditorState.readOnly.of(true)] : [])
    ]
  });
}

describe("planIndentTransaction (#463)", () => {
  const directions: readonly IndentDirection[] = ["indent", "outdent"];

  it.each(directions)(
    "read-only editor: %s is a no-op, reason 'readonly', regardless of context",
    (direction) => {
      const state = stateFor("foo", 1, { readOnly: true });
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({ kind: "noop", reason: "readonly" });
    }
  );

  it.each(directions)(
    "blank line: %s is a no-op",
    (direction) => {
      const state = stateFor("\n\n", 1);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result.kind).toBe("noop");
    }
  );

  it.each(directions)(
    "top-level paragraph: %s is a no-op, reason 'topLevelParagraph'",
    (direction) => {
      const state = stateFor("Hello world", 3);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "topLevelParagraph"
      });
    }
  );

  it.each(directions)(
    "unsupported context (heading line): %s is a no-op, reason 'unsupportedContext'",
    (direction) => {
      const state = stateFor("# Heading", 3);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "unsupportedContext"
      });
    }
  );

  it("outermost list item: outdent is a no-op, reason 'outermostList' (T-5)", () => {
    const state = stateFor("- item", 2);
    const plan = planIndentTransaction(state, "outdent");
    expect(plan.changes).toEqual([]);
    expect(plan.result).toEqual({ kind: "noop", reason: "outermostList" });
  });

  it("outermost list item: indent is a no-op, reason 'noSupportedLines' (future sink stub)", () => {
    const state = stateFor("- item", 2);
    const plan = planIndentTransaction(state, "indent");
    expect(plan.changes).toEqual([]);
    expect(plan.result).toEqual({ kind: "noop", reason: "noSupportedLines" });
  });

  it.each(directions)(
    "nested list item: %s is a no-op, reason 'noSupportedLines' (future sink/lift stub)",
    (direction) => {
      const state = stateFor("    - item", 6);
      const plan = planIndentTransaction(state, direction);
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "noSupportedLines"
      });
    }
  );

  it("a selection with no touched lines is defensively a no-op ('noSupportedLines')", () => {
    // Not reachable through normal selection construction (a selection
    // always has at least one range/line) - exercised directly against the
    // aggregation path via an empty-document edge case instead.
    const state = stateFor("", 0);
    const plan = planIndentTransaction(state, "indent");
    expect(plan.result.kind).toBe("noop");
  });

  describe("mixed context (multiple touched lines)", () => {
    const mixedDoc = "top level paragraph\n- list item\n    - nested item\nunsupported? no: # heading";

    it("uniform reason across touched lines is reported precisely", () => {
      // Both touched lines are top-level paragraphs.
      const doc = "first paragraph\nsecond paragraph";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "topLevelParagraph"
      });
    });

    it("a genuine mix of reasons falls back to 'noSupportedLines'", () => {
      // line 1: topLevelParagraph, line 2: listItem (outermost, outdent ->
      // 'outermostList'), line 3: nestedListItem ('noSupportedLines') -
      // three DIFFERENT reasons, none of which dominates.
      const doc = "top level paragraph\n- list item\n    - nested item";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.changes).toEqual([]);
      expect(plan.result).toEqual({
        kind: "noop",
        reason: "noSupportedLines"
      });
    });

    it("classifies every line of a mixed-context document without throwing", () => {
      for (const line of mixedDoc.split("\n")) {
        expect(() => classifyLine(line)).not.toThrow();
      }
    });
  });

  describe("buildLineChange dispatcher (#463 - future extension point)", () => {
    it("returns null (no change) for every context in this issue", () => {
      const doc = "para\n- item\n    - nested\n> quote\n    code";
      const state = EditorState.create({ doc });
      for (const line of [1, 2, 3, 4, 5].map((n) => state.doc.line(n))) {
        const context = classifyLine(line.text);
        expect(buildLineChange(line, context, "indent")).toBeNull();
        expect(buildLineChange(line, context, "outdent")).toBeNull();
      }
    });
  });

  describe("the 'applied' path (proven with an injected line-change handler)", () => {
    it("aggregates one change per touched line into a single applied result", () => {
      const doc = "alpha\nbeta\ngamma";
      const state = EditorState.create({
        doc,
        selection: EditorSelection.single(0, doc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });

      const fakeHandler = (line: { from: number }): ChangeSpec => ({
        from: line.from,
        insert: ">> "
      });

      const plan = planIndentTransaction(state, "indent", fakeHandler);
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 3 });
      expect(plan.changes).toHaveLength(3);
    });

    it("dispatching the plan through a real EditorView applies every change in one transaction", () => {
      const doc = "alpha\nbeta";
      const view = new EditorView({
        state: EditorState.create({
          doc,
          selection: EditorSelection.single(0, doc.length),
          extensions: [EditorState.allowMultipleSelections.of(true)]
        })
      });
      try {
        const fakeHandler = (line: { from: number }): ChangeSpec => ({
          from: line.from,
          insert: ">> "
        });
        const plan = planIndentTransaction(view.state, "indent", fakeHandler);
        view.dispatch(
          view.state.update({ changes: plan.changes, userEvent: "input.indent" })
        );
        expect(view.state.doc.toString()).toBe(">> alpha\n>> beta");
      } finally {
        view.destroy();
      }
    });

    it("a no-op plan never calls dispatch's underlying change machinery (no changes to apply)", () => {
      const state = stateFor("Hello world", 3);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.changes).toHaveLength(0);
    });
  });
});

describe("indentCommand / outdentCommand as CodeMirror Commands (#463)", () => {
  afterEach(() => {
    // Nothing persistent between tests - each test builds its own view.
  });

  it("indentCommand always reports the key as handled (true), applied or no-op alike", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "Hello world", selection: EditorSelection.single(3) })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      // No change: this line is a top-level paragraph, still a stub.
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("outdentCommand always reports the key as handled (true), applied or no-op alike", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "Hello world", selection: EditorSelection.single(3) })
    });
    try {
      expect(outdentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("indentCommand does not dispatch a transaction on a read-only view", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "Hello world",
        selection: EditorSelection.single(3),
        extensions: [EditorState.readOnly.of(true)]
      })
    });
    try {
      expect(indentCommand(view)).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });
});

describe("editorIndentKeymap wired into the base CodeMirror setup (#463)", () => {
  function mountView(input: { doc?: string; readOnly?: boolean } = {}): EditorView {
    return new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc: input.doc ?? "Hello world",
        selection: EditorSelection.single(3),
        extensions: [
          ...createMarkdownEditorBaseSetup({ undoHistoryMinDepth: 100 }),
          ...(input.readOnly ? [EditorState.readOnly.of(true)] : [])
        ]
      })
    });
  }

  function ctrlBracketKeydown(bracket: "[" | "]"): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: bracket,
      code: bracket === "]" ? "BracketRight" : "BracketLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("exposes exactly Mod-] -> indentCommand and Mod-[ -> outdentCommand", () => {
    expect(editorIndentKeymap).toEqual([
      { key: "Mod-]", run: indentCommand },
      { key: "Mod-[", run: outdentCommand }
    ]);
  });

  it("Mod+] (Ctrl+]) is consumed by the base setup and leaves a top-level paragraph unchanged", () => {
    const view = mountView();
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Mod+[ (Ctrl+[) is consumed by the base setup and leaves a top-level paragraph unchanged", () => {
    const view = mountView();
    try {
      const event = ctrlBracketKeydown("[");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("read-only: Mod+] is still consumed (handled) but never changes the document", () => {
    const view = mountView({ readOnly: true });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Tab is NOT bound by the base setup - no preventDefault, focus movement is left alone", () => {
    const view = mountView();
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        bubbles: true,
        cancelable: true
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });

  it("Shift+Tab is NOT bound by the base setup - no preventDefault, focus movement is left alone", () => {
    const view = mountView();
    try {
      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        code: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true
      });
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(view.state.doc.toString()).toBe("Hello world");
    } finally {
      view.destroy();
    }
  });
});
