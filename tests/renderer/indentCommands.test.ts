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

  it.each(["- item", "+ item", "* item", "- [ ] task", "- [x] task", "- [X] task"])(
    "outermost list item ('%s'): indent adds 2 spaces",
    (lineText) => {
      const state = stateFor(lineText, 2);
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, insert: "  " }]);
    }
  );

  it.each(["  - item", "  + item", "  * item", "  - [ ] task", "  - [x] task", "  - [X] task"])(
    "indented list item ('%s'): outdent removes up to 2 spaces",
    (lineText) => {
      const state = stateFor(lineText, 4);
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, to: 2, insert: "" }]);
    }
  );

  it("indented list item with 1 space: outdent removes 1 space", () => {
    const state = stateFor(" - item", 3);
    const plan = planIndentTransaction(state, "outdent");
    expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
    expect(plan.changes).toEqual([{ from: 0, to: 1, insert: "" }]);
  });

  it("a selection with no touched lines is defensively a no-op ('noSupportedLines')", () => {
    // Not reachable through normal selection construction (a selection
    // always has at least one range/line) - exercised directly against the
    // aggregation path via an empty-document edge case instead.
    const state = stateFor("", 0);
    const plan = planIndentTransaction(state, "indent");
    expect(plan.result.kind).toBe("noop");
  });

  describe("mixed context (multiple touched lines)", () => {
    const mixedDoc = "top level paragraph\n- item\n- - -\n  - nested item";

    it("uniform reason across touched non-list lines is reported precisely", () => {
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

    it("mixed selection: indent modifies ONLY list lines, skipping paragraph and thematic break", () => {
      const state = EditorState.create({
        doc: mixedDoc,
        selection: EditorSelection.single(0, mixedDoc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 2 });
      // Line 2 ("- item", offset 20) and Line 4 ("  - nested item", offset 33)
      expect(plan.changes).toEqual([
        { from: 20, insert: "  " },
        { from: 33, insert: "  " }
      ]);
    });

    it("mixed selection: outdent modifies ONLY nested list line, skipping paragraph, thematic break, and outermost list line", () => {
      const state = EditorState.create({
        doc: mixedDoc,
        selection: EditorSelection.single(0, mixedDoc.length),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "outdent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      // Line 4 ("  - nested item", offset 33) -> removes 2 spaces at 33
      expect(plan.changes).toEqual([
        { from: 33, to: 35, insert: "" }
      ]);
    });

    it("classifies every line of a mixed-context document without throwing", () => {
      for (const line of mixedDoc.split("\n")) {
        expect(() => classifyLine(line)).not.toThrow();
      }
    });
  });

  describe("multi-cursor and multiple ranges", () => {
    it("deduplicates overlapping touched lines across multiple selection ranges", () => {
      const doc = "- item 1\n- item 2\n- item 3";
      // Two cursors on the same line (line 1)
      const state = EditorState.create({
        doc,
        selection: EditorSelection.create([
          EditorSelection.cursor(1),
          EditorSelection.cursor(5)
        ]),
        extensions: [EditorState.allowMultipleSelections.of(true)]
      });
      const plan = planIndentTransaction(state, "indent");
      expect(plan.result).toEqual({ kind: "applied", changedLineCount: 1 });
      expect(plan.changes).toEqual([{ from: 0, insert: "  " }]);
    });
  });

  describe("buildLineChange dispatcher (#465 list support)", () => {
    it("returns ChangeSpec for list items on indent, and null for non-list contexts", () => {
      const doc = "para\n- item\n  - nested\n> quote\n    code";
      const state = EditorState.create({ doc });
      const line1 = state.doc.line(1); // para
      const line2 = state.doc.line(2); // - item
      const line3 = state.doc.line(3); //   - nested
      const line4 = state.doc.line(4); // > quote
      const line5 = state.doc.line(5); //     code

      expect(buildLineChange(line1, classifyLine(line1.text), "indent")).toBeNull();
      expect(buildLineChange(line2, classifyLine(line2.text), "indent")).toEqual({ from: line2.from, insert: "  " });
      expect(buildLineChange(line3, classifyLine(line3.text), "indent")).toEqual({ from: line3.from, insert: "  " });
      expect(buildLineChange(line4, classifyLine(line4.text), "indent")).toBeNull();
      expect(buildLineChange(line5, classifyLine(line5.text), "indent")).toBeNull();
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

  it("Mod+] (Ctrl+]) indents a list item line", () => {
    const view = mountView({ doc: "- item" });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("  - item");
    } finally {
      view.destroy();
    }
  });

  it("Mod+[ (Ctrl+[) outdents an indented list item line", () => {
    const view = mountView({ doc: "  - item" });
    try {
      const event = ctrlBracketKeydown("[");
      view.contentDOM.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(view.state.doc.toString()).toBe("- item");
    } finally {
      view.destroy();
    }
  });

  it("read-only: Mod+] on a list item is consumed but leaves document unchanged", () => {
    const view = mountView({ doc: "- item", readOnly: true });
    try {
      const event = ctrlBracketKeydown("]");
      view.contentDOM.dispatchEvent(event);
      expect(view.state.doc.toString()).toBe("- item");
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
