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
import type { MarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";

/**
 * #387/#392: per-document EditorState so Undo/Redo history survives a
 * Markdown tab switch instead of being wiped by the whole-document replace
 * every switch previously dispatched (see markdownEditorDocumentState.ts's
 * module doc comment for the confirmed mechanism).
 *
 * #392 moved cache OWNERSHIP from a MarkdownEditor-local ref (#387) to the
 * caller (App.tsx in production) — this file's harness models that by
 * creating the `documentStates` Map itself and passing the SAME reference
 * across every render, including across an explicit unmount/remount (which
 * is exactly what navigating to Settings / a Manager tab / a Glossary Entry
 * editor and back does to the real EditorSurface / MarkdownEditor tree).
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
  render: (props: { documentKey: string; value: string }) => void;
  /** Tears down this MarkdownEditor instance WITHOUT creating a new one -
   *  models leaving to a non-Markdown tab. The shared `documentStates` Map
   *  is untouched (it is owned by the caller, not this component). */
  unmount: () => void;
  /** Mounts a FRESH MarkdownEditor instance (new container/root - a
   *  genuinely different component instance, matching what React does when
   *  EditorSurface itself is unmounted/remounted) reusing the SAME
   *  `documentStates` Map - models returning to a Markdown tab. */
  remount: (props: { documentKey: string; value: string }) => void;
  view: () => EditorView;
  documentStates: Map<string, MarkdownEditorDocumentState>;
}

function mount(
  initial: { documentKey: string; value: string },
  documentStates: Map<string, MarkdownEditorDocumentState> = new Map()
): Harness {
  function renderProps(props: { documentKey: string; value: string }): void {
    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: props.value,
          documentKey: props.documentKey,
          documentStates,
          onChange: () => undefined
        })
      );
    });
  }

  function freshRoot(): void {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  freshRoot();
  renderProps(initial);

  function view(): EditorView {
    const contentDom = container!.querySelector(".cm-content") as HTMLElement;
    const found = EditorView.findFromDOM(contentDom);
    if (!found) {
      throw new Error("EditorView not found from DOM");
    }
    return found;
  }

  function unmount(): void {
    act(() => root!.unmount());
    container?.remove();
  }

  function remount(props: { documentKey: string; value: string }): void {
    freshRoot();
    renderProps(props);
  }

  return { render: renderProps, unmount, remount, view, documentStates };
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

  it("respects the cache owner's pruning: a deleted cache entry never resurfaces stale history", () => {
    // #392: pruning a closed tab's entry is the owner's job (App.tsx), not
    // MarkdownEditor's own. This models the owner having already pruned
    // "doc:A" (its tab was closed) by deleting it from the shared Map
    // directly, then reopening a document under that same key.
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");
    expect(undoDepth(harness.view().state)).toBe(1);

    harness.render({ documentKey: "doc:B", value: "World" });
    expect(harness.documentStates.has("doc:A")).toBe(true);

    // The owner prunes doc:A's entry (its tab was closed).
    harness.documentStates.delete("doc:A");

    // A hypothetical re-open of doc:A (e.g. the file reopened later) starts
    // clean - no leftover undo history from before it was closed.
    harness.render({ documentKey: "doc:A", value: "Hello" });
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
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
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
            documentStates,
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

describe("MarkdownEditor EditorState cache survives unmount/remount (#392)", () => {
  it("preserves undo history across an actual unmount and remount of MarkdownEditor itself", () => {
    // Models: A.md open, edit it, navigate to Settings (MarkdownEditor
    // unmounts entirely), come back to A.md (a brand new MarkdownEditor
    // component instance mounts). Only possible because `documentStates` is
    // a Map owned OUTSIDE this component (App.tsx in production).
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");
    expect(harness.view().state.doc.toString()).toBe("Hello!");
    expect(undoDepth(harness.view().state)).toBe(1);

    harness.unmount();
    harness.remount({ documentKey: "doc:A", value: "Hello!" });

    expect(harness.view().state.doc.toString()).toBe("Hello!");
    expect(undoDepth(harness.view().state)).toBe(1);

    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello");
  });

  it("captures the LATEST edit into the shared cache on unmount, even with no prior switch-away", () => {
    // Regression guard for the specific fix #392 needed: before it, only a
    // document SWITCH captured the outgoing EditorState into the cache - a
    // plain unmount (no switch first) did not, so edits made right before
    // leaving to a non-Markdown tab would have been lost even with an
    // externally-owned Map.
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");
    typeChange(harness.view(), 6, 6, "!");
    expect(harness.view().state.doc.toString()).toBe("Hello!!");

    harness.unmount();

    const cached = harness.documentStates.get("doc:A");
    expect(cached?.state.doc.toString()).toBe("Hello!!");

    harness.remount({ documentKey: "doc:A", value: "Hello!!" });
    expect(harness.view().state.doc.toString()).toBe("Hello!!");
    expect(undoDepth(harness.view().state)).toBe(2);
  });

  it("keeps redo history across unmount/remount too", () => {
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello");
    expect(redoDepth(harness.view().state)).toBe(1);

    harness.unmount();
    harness.remount({ documentKey: "doc:A", value: "Hello" });

    expect(redoDepth(harness.view().state)).toBe(1);
    act(() => redo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello!");
  });

  it("still falls back to a fresh state across unmount/remount when content changed externally while gone", () => {
    const harness = mount({ documentKey: "doc:A", value: "Hello" });
    typeChange(harness.view(), 5, 5, "!");

    harness.unmount();
    // While away, something external (e.g. Open Documents Replace, or a
    // Recovery restore) changed doc:A's content without going through
    // CodeMirror - the cache entry is now stale relative to the new value.
    harness.remount({ documentKey: "doc:A", value: "Replaced externally" });

    expect(harness.view().state.doc.toString()).toBe("Replaced externally");
    expect(undoDepth(harness.view().state)).toBe(0);
  });

  it("a second independent document is unaffected by the first's unmount/remount", () => {
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
    const a = mount({ documentKey: "doc:A", value: "A" }, documentStates);
    typeChange(a.view(), 1, 1, "1");
    a.unmount();

    // doc:B opens fresh in what is, from React's perspective, a brand new
    // MarkdownEditor instance sharing the same owner-level cache.
    const b = mount({ documentKey: "doc:B", value: "B" }, documentStates);
    expect(b.view().state.doc.toString()).toBe("B");
    expect(undoDepth(b.view().state)).toBe(0);
    b.unmount();

    // Returning to doc:A still has its own edit.
    a.remount({ documentKey: "doc:A", value: "A1" });
    expect(a.view().state.doc.toString()).toBe("A1");
    expect(undoDepth(a.view().state)).toBe(1);
  });
});
