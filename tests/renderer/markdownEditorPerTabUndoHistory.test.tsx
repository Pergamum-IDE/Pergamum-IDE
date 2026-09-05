// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  isolateHistory,
  redo,
  undo,
  undoDepth,
  redoDepth
} from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownEditor } from "../../src/renderer/MarkdownEditor";

/**
 * #387 PoC: per-tab EditorState so Undo/Redo history survives a Markdown
 * tab switch instead of being wiped by the whole-document replace every
 * switch previously dispatched (see markdownEditorDocumentState.ts's module
 * doc comment for the confirmed mechanism).
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

interface Harness {
  render: (props: {
    documentKey: string;
    value: string;
    openDocumentKeys?: readonly string[];
  }) => void;
  view: () => EditorView;
  onChangeCalls: Array<{ documentKey: string; content: string }>;
}

function mount(initial: {
  documentKey: string;
  value: string;
  openDocumentKeys?: readonly string[];
}): Harness {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  const onChangeCalls: Array<{ documentKey: string; content: string }> = [];
  let currentDocumentKey = initial.documentKey;

  function renderProps(props: {
    documentKey: string;
    value: string;
    openDocumentKeys?: readonly string[];
  }): void {
    currentDocumentKey = props.documentKey;
    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: props.value,
          documentKey: props.documentKey,
          openDocumentKeys: props.openDocumentKeys,
          onChange: (content: string) => {
            onChangeCalls.push({ documentKey: currentDocumentKey, content });
          }
        })
      );
    });
  }

  renderProps(initial);

  function view(): EditorView {
    const contentDom = container!.querySelector(".cm-content") as HTMLElement;
    const found = EditorView.findFromDOM(contentDom);
    if (!found) {
      throw new Error("EditorView not found from DOM");
    }
    return found;
  }

  return { render: renderProps, view, onChangeCalls };
}

function typeChange(view: EditorView, from: number, to: number, insert: string): void {
  act(() => {
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: "input.type",
      // Forces its own undo group regardless of timing, so two back-to-back
      // typeChange calls in a test never get coalesced into one undo step
      // by history()'s normal "still typing" grouping heuristic.
      annotations: isolateHistory.of("full")
    });
  });
}

describe("MarkdownEditor per-tab undo history (#387)", () => {
  it("preserves a document's undo history across a switch away and back", () => {
    const harness = mount({ documentKey: "doc:A", value: "Hello" });

    typeChange(harness.view(), 5, 5, "!");
    expect(harness.view().state.doc.toString()).toBe("Hello!");
    expect(undoDepth(harness.view().state)).toBe(1);

    // Switch away to a different document.
    harness.render({ documentKey: "doc:B", value: "World" });
    expect(harness.view().state.doc.toString()).toBe("World");
    expect(undoDepth(harness.view().state)).toBe(0);

    // Switch back to A with its latest (post-edit) content, as the real app
    // would (content flows back through onChange -> parent state -> value prop).
    harness.render({ documentKey: "doc:A", value: "Hello!" });
    expect(harness.view().state.doc.toString()).toBe("Hello!");
    expect(undoDepth(harness.view().state)).toBe(1);

    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello");
  });

  it("redo also survives the round trip", () => {
    const harness = mount({ documentKey: "doc:A", value: "Hello" });

    typeChange(harness.view(), 5, 5, "!");
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello");
    expect(redoDepth(harness.view().state)).toBe(1);

    harness.render({ documentKey: "doc:B", value: "World" });
    harness.render({ documentKey: "doc:A", value: "Hello" });

    expect(redoDepth(harness.view().state)).toBe(1);
    act(() => redo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello!");
  });

  it("keeps three or more documents' histories fully independent", () => {
    const harness = mount({ documentKey: "doc:A", value: "A" });
    typeChange(harness.view(), 1, 1, "1");
    expect(harness.view().state.doc.toString()).toBe("A1");

    harness.render({ documentKey: "doc:B", value: "B" });
    typeChange(harness.view(), 1, 1, "2");
    typeChange(harness.view(), 2, 2, "3");
    expect(harness.view().state.doc.toString()).toBe("B23");
    expect(undoDepth(harness.view().state)).toBe(2);

    harness.render({ documentKey: "doc:C", value: "C" });
    expect(undoDepth(harness.view().state)).toBe(0);

    // Back to A: exactly its own one edit.
    harness.render({ documentKey: "doc:A", value: "A1" });
    expect(harness.view().state.doc.toString()).toBe("A1");
    expect(undoDepth(harness.view().state)).toBe(1);
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("A");

    // B still has both of its own edits, untouched by A's Undo.
    harness.render({ documentKey: "doc:B", value: "B23" });
    expect(harness.view().state.doc.toString()).toBe("B23");
    expect(undoDepth(harness.view().state)).toBe(2);
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("B2");
  });

  it("never mixes content between documents while switching", () => {
    const harness = mount({ documentKey: "doc:A", value: "AAA" });
    harness.render({ documentKey: "doc:B", value: "BBB" });
    expect(harness.view().state.doc.toString()).toBe("BBB");
    harness.render({ documentKey: "doc:A", value: "AAA" });
    expect(harness.view().state.doc.toString()).toBe("AAA");
  });

  it("prunes a closed tab's cached EditorState (its history is gone if the key is ever reused)", () => {
    const harness = mount({
      documentKey: "doc:A",
      value: "Hello",
      openDocumentKeys: ["doc:A", "doc:B"]
    });

    typeChange(harness.view(), 5, 5, "!");
    expect(undoDepth(harness.view().state)).toBe(1);

    harness.render({
      documentKey: "doc:B",
      value: "World",
      openDocumentKeys: ["doc:A", "doc:B"]
    });

    // doc:A's tab is closed - only doc:B remains open.
    harness.render({
      documentKey: "doc:B",
      value: "World",
      openDocumentKeys: ["doc:B"]
    });

    // A hypothetical re-open of doc:A (e.g. the file reopened later) starts
    // clean - no leftover undo history from before it was closed.
    harness.render({
      documentKey: "doc:A",
      value: "Hello",
      openDocumentKeys: ["doc:A", "doc:B"]
    });
    expect(harness.view().state.doc.toString()).toBe("Hello");
    expect(undoDepth(harness.view().state)).toBe(0);
  });

  it("falls back to a fresh state (never reverts the edit) when an inactive document's content changed externally", () => {
    // Mirrors Open Documents Replace (#386), which writes directly into
    // openDocumentsState for any buffer that isn't the active editor - no
    // CodeMirror transaction, so a cached EditorState for that document
    // would otherwise be stale.
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");
    expect(harness.view().state.doc.toString()).toBe("Hello!");

    harness.render({ documentKey: "doc:B", value: "World" });

    // doc:A's content changed while inactive - the incoming `value` no
    // longer matches what was cached ("Hello!").
    harness.render({ documentKey: "doc:A", value: "Hello?! (replaced)" });

    expect(harness.view().state.doc.toString()).toBe("Hello?! (replaced)");
    // The external edit is never reverted back to "Hello!" - the tradeoff
    // is that this document's own undo history resets.
    expect(undoDepth(harness.view().state)).toBe(0);
  });

  it("reconciles readOnly to the current value immediately when restoring a cached document", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    function render(props: {
      documentKey: string;
      value: string;
      readOnly: boolean;
    }): void {
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: props.value,
            documentKey: props.documentKey,
            readOnly: props.readOnly,
            onChange: () => undefined
          })
        );
      });
    }

    function view(): EditorView {
      const contentDom = container!.querySelector(".cm-content") as HTMLElement;
      const found = EditorView.findFromDOM(contentDom);
      if (!found) {
        throw new Error("EditorView not found from DOM");
      }
      return found;
    }

    render({ documentKey: "doc:A", value: "A", readOnly: false });
    render({ documentKey: "doc:B", value: "B", readOnly: false });
    // A global readOnly change happens while B is active (A is cached).
    render({ documentKey: "doc:B", value: "B", readOnly: true });
    // Switching back to A must reflect the CURRENT readOnly value, not
    // whatever A's cached EditorState still had baked in.
    render({ documentKey: "doc:A", value: "A", readOnly: true });

    expect(view().state.readOnly).toBe(true);
  });
});
