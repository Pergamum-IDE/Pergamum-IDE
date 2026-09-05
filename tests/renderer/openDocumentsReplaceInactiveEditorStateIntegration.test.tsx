// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { isolateHistory, redo, undo, undoDepth } from "@codemirror/commands";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownEditor } from "../../src/renderer/MarkdownEditor";
import {
  applyChangesToCachedMarkdownEditorDocumentState,
  type MarkdownEditorDocumentState
} from "../../src/renderer/markdownEditorDocumentState";

/**
 * #393: Open Documents Replace applied to an INACTIVE document with a
 * cached #387/#392 EditorState, end to end through the real MarkdownEditor
 * component.
 *
 * `applyChangesToCachedMarkdownEditorDocumentState`'s own correctness (one
 * transaction / one undo step, prior history preserved, stale rejection) is
 * covered directly in markdownEditorDocumentState.test.ts. This file instead
 * verifies the OTHER half of the story: that the result App.tsx's Replace
 * apply loop writes back into the SAME `documentStates` Map MarkdownEditor
 * reads from is correctly picked up the next time the user switches back to
 * that document - i.e. the loop actually closes.
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

function mount(
  documentStates: Map<string, MarkdownEditorDocumentState>,
  initial: { documentKey: string; value: string }
) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  function render(props: { documentKey: string; value: string }): void {
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

  render(initial);

  function view(): EditorView {
    const contentDom = container!.querySelector(".cm-content") as HTMLElement;
    const found = EditorView.findFromDOM(contentDom);
    if (!found) {
      throw new Error("EditorView not found from DOM");
    }
    return found;
  }

  return { render, view };
}

describe("Open Documents Replace on an inactive cached document, end to end (#393)", () => {
  it("a Replace transaction applied while inactive is visible, and its Undo history intact, when the user switches back", () => {
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
    const harness = mount(documentStates, {
      documentKey: "doc:B",
      value: "Hello"
    });

    // 1. Ordinary editing on B.md.
    act(() => {
      harness.view().dispatch({
        changes: { from: 5, to: 5, insert: "!" },
        userEvent: "input.type",
        annotations: isolateHistory.of("full")
      });
    });
    expect(harness.view().state.doc.toString()).toBe("Hello!");

    // 2. User switches to A.md - B's live EditorState (with its one edit) is
    // captured into `documentStates` by MarkdownEditor's own switch effect.
    harness.render({ documentKey: "doc:A", value: "A content" });
    const cachedB = documentStates.get("doc:B");
    expect(cachedB?.state.doc.toString()).toBe("Hello!");

    // 3. Open Documents Replace runs while B.md is inactive - this mirrors
    // exactly what App.tsx's applyOpenDocumentsReplaceSelection does for the
    // non-active-buffer branch.
    const replaceResult = applyChangesToCachedMarkdownEditorDocumentState(
      cachedB!,
      "Hello!",
      [{ from: 0, to: 5, insert: "HELLO" }],
      "input.replace"
    );
    expect(replaceResult).not.toBeNull();
    documentStates.set("doc:B", replaceResult!.nextDocumentState);
    // This is the application-side content sync App.tsx's
    // updateCurrentDocumentContent call performs - modeled here as the next
    // `value` prop B.md's tab will show.
    const nextBContent = replaceResult!.content;
    expect(nextBContent).toBe("HELLO!");

    // 4. User switches back to B.md.
    harness.render({ documentKey: "doc:B", value: nextBContent });

    expect(harness.view().state.doc.toString()).toBe("HELLO!");
    // Both the prior typed edit AND the Replace are on the undo stack.
    expect(undoDepth(harness.view().state)).toBe(2);

    // 5. Undo once - only the Replace is reverted.
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello!");

    // 6. Undo again - the prior ordinary edit is reverted too.
    act(() => undo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello");

    // 7. Redo brings both back in order.
    act(() => redo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("Hello!");
    act(() => redo(harness.view()));
    expect(harness.view().state.doc.toString()).toBe("HELLO!");
  });

  it("A.md's own history is untouched by a Replace applied only to inactive B.md", () => {
    const documentStates = new Map<string, MarkdownEditorDocumentState>();
    const harness = mount(documentStates, {
      documentKey: "doc:A",
      value: "A"
    });
    act(() => {
      harness.view().dispatch({
        changes: { from: 1, to: 1, insert: "1" },
        userEvent: "input.type",
        annotations: isolateHistory.of("full")
      });
    });
    expect(harness.view().state.doc.toString()).toBe("A1");

    harness.render({ documentKey: "doc:B", value: "B" });
    // B has no cache entry yet (first time shown) - Replace on it here would
    // use the plain content-splice fallback, not exercised in this test.

    // Back to A: still exactly its own one edit, nothing from B leaked in.
    harness.render({ documentKey: "doc:A", value: "A1" });
    expect(harness.view().state.doc.toString()).toBe("A1");
    expect(undoDepth(harness.view().state)).toBe(1);
  });
});
