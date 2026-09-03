// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownEditor,
  type MarkdownEditorFocusRequest,
  type MarkdownEditorViewStateController
} from "../../src/renderer/MarkdownEditor";
import { computeEditorContentDigest } from "../../src/renderer/editorContentDigest";
import type { EditorViewState } from "../../src/renderer/editorViewState";

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

function mount(value: string): {
  controller: () => MarkdownEditorViewStateController | null;
} {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  let controller: MarkdownEditorViewStateController | null = null;

  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value,
        onChange: () => undefined,
        onViewStateControllerChange: (next) => {
          controller = next;
        }
      })
    );
  });

  return { controller: () => controller };
}

describe("MarkdownEditor view state controller (#272)", () => {
  it("hands the parent a controller that captures plain serializable View State", () => {
    const { controller } = mount("# Title\n\nBody text.");

    const handle = controller();
    expect(handle).not.toBeNull();

    const viewState = handle!.captureViewState();
    expect(viewState).not.toBeNull();
    expect(viewState).toMatchObject({
      contentDigest: { algorithm: "sha256" },
      selection: { anchor: expect.any(Number), head: expect.any(Number) }
    });

    // Plain data — survives a JSON round trip and carries no document body.
    expect(JSON.parse(JSON.stringify(viewState))).toEqual(viewState);
    expect(JSON.stringify(viewState)).not.toContain("Body text");
  });

  it("clears the controller on unmount", () => {
    const { controller } = mount("content");
    expect(controller()).not.toBeNull();

    act(() => root!.unmount());
    root = null;

    expect(controller()).toBeNull();
  });
});

describe("MarkdownEditor scrollToLine (#375 Document Map navigation)", () => {
  it("scrolls to a 0-based source line, focuses the editor, and never moves the caret / selection", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const { controller } = mount(
      Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n")
    );

    const before = controller()!.captureViewState();
    act(() => controller()!.scrollToLine(7));
    const after = controller()!.captureViewState();

    expect(after?.selection).toEqual(before?.selection);
    expect(focus).toHaveBeenCalled();
    focus.mockRestore();
  });

  it("clamps an out-of-range line (past the end / negative) without throwing", () => {
    const { controller } = mount("only one line");
    const before = controller()!.captureViewState();

    expect(() => act(() => controller()!.scrollToLine(999))).not.toThrow();
    expect(() => act(() => controller()!.scrollToLine(-4))).not.toThrow();
    expect(() =>
      act(() => controller()!.scrollToLine(Number.NaN))
    ).not.toThrow();

    expect(controller()!.captureViewState()?.selection).toEqual(
      before?.selection
    );
  });
});

describe("MarkdownEditor onViewStateSnapshot boundary (#272 review Blocker 3)", () => {
  interface SnapshotCall {
    key: string;
    viewState: EditorViewState | null;
  }

  function mountWithSnapshot(initialDocumentKey: string, value: string) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const calls: SnapshotCall[] = [];

    function render(documentKey: string, nextValue: string): void {
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: nextValue,
            documentKey,
            onChange: () => undefined,
            onViewStateSnapshot: (key, viewState) => {
              calls.push({ key, viewState });
            }
          })
        );
      });
    }

    render(initialDocumentKey, value);

    return { calls, render };
  }

  it("reports the OUTGOING document's View State when the active editor switches", () => {
    const { calls, render } = mountWithSnapshot("editor:A", "A body content");

    expect(calls).toHaveLength(0); // nothing on first mount

    // Switch to editor B (documentKey changes).
    render("editor:B", "B body content");

    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("editor:A"); // the outgoing key
    expect(calls[0].viewState).toMatchObject({
      contentDigest: { algorithm: "sha256" }
    });
    // Serializable, no body.
    expect(JSON.stringify(calls[0].viewState)).not.toContain("A body content");
  });

  it("does NOT report on a plain content change (never a per-keystroke path)", () => {
    const { calls, render } = mountWithSnapshot("editor:A", "hello");

    // Same documentKey, new value — i.e. a keystroke echo.
    render("editor:A", "hello world");
    render("editor:A", "hello world!!");

    expect(calls).toHaveLength(0);
  });

  it("reports the last active document's View State on unmount", () => {
    const { calls } = mountWithSnapshot("editor:A", "final content");

    act(() => root!.unmount());
    root = null;

    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("editor:A");
    expect(calls[0].viewState).not.toBeNull();
  });

  it("reports each outgoing key across a rapid A -> B -> C switch", () => {
    const { calls, render } = mountWithSnapshot("editor:A", "a");

    render("editor:B", "b");
    render("editor:C", "c");

    expect(calls.map((c) => c.key)).toEqual(["editor:A", "editor:B"]);
  });

  it("does not fire onViewStateSnapshot per keystroke while the same document stays open", () => {
    const { calls, render } = mountWithSnapshot("editor:A", "");
    for (let i = 0; i < 25; i += 1) {
      render("editor:A", "x".repeat(i));
    }
    expect(calls).toHaveLength(0);
  });
});

describe("MarkdownEditor onViewStateDirty signal (#272 review Blocker 4)", () => {
  const source = readFileSync("src/renderer/MarkdownEditor.tsx", "utf8");

  it("accepts a cheap onViewStateDirty prop kept fresh through a ref", () => {
    expect(source).toMatch(/onViewStateDirty\?:\s*\(\)\s*=>\s*void/);
    expect(source).toContain("onViewStateDirtyRef");
    expect(source).toMatch(
      /onViewStateDirtyRef\.current\s*=\s*onViewStateDirty/
    );
  });

  it("fires only on a selection/viewport change WITHOUT a document edit (docChanged stays on the React path)", () => {
    // The signal lives inside the CodeMirror updateListener, gated on
    // `!update.docChanged && (update.selectionSet || update.viewportChanged)`.
    const listenerCall = source.slice(
      source.indexOf("EditorView.updateListener.of")
    );
    expect(listenerCall).toMatch(
      /!update\.docChanged\s*&&\s*\(\s*update\.selectionSet\s*\|\|\s*update\.viewportChanged\s*\)/
    );
    // And the branch invokes only the cheap ref — no capture/hash/serialize.
    const dirtyBranch = listenerCall.slice(
      listenerCall.indexOf("update.viewportChanged")
    );
    const branchBody = dirtyBranch.slice(0, dirtyBranch.indexOf("}") + 1);
    expect(branchBody).toContain("onViewStateDirtyRef.current?.()");
    expect(branchBody).not.toMatch(
      /captureEditorViewState|sha256|JSON\.stringify|invoke\(/
    );
  });

  it("mounts without an onViewStateDirty prop (it is optional)", () => {
    const { controller } = mount("no dirty handler wired");
    expect(controller()).not.toBeNull();
  });
});

describe("MarkdownEditor cold-start focus request seam (#280)", () => {
  function mountWithFocusRequest(props: {
    readonly documentKey: string;
    readonly focusRequest: MarkdownEditorFocusRequest | null;
    readonly restoreViewState?: EditorViewState | null;
    readonly onRestoreViewStateApplied?: (key: string) => void;
    readonly onFocusRequestApplied?: (requestId: number) => void;
  }) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let controller: MarkdownEditorViewStateController | null = null;

    function render(next: {
      readonly documentKey: string;
      readonly focusRequest: MarkdownEditorFocusRequest | null;
      readonly restoreViewState?: EditorViewState | null;
    }): void {
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: "content",
            documentKey: next.documentKey,
            onChange: () => undefined,
            onViewStateControllerChange: (nextController) => {
              controller = nextController;
            },
            restoreViewState: next.restoreViewState
              ? {
                  key: next.documentKey,
                  viewState: next.restoreViewState
                }
              : null,
            onRestoreViewStateApplied: props.onRestoreViewStateApplied,
            focusRequest: next.focusRequest,
            onFocusRequestApplied: props.onFocusRequestApplied
          })
        );
      });
    }

    render(props);

    return { controller: () => controller, render };
  }

  it("focuses exactly once when the request documentKey matches the current editor", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const applied: number[] = [];
    const request = { id: 1, documentKey: "editor:A" };
    const { render } = mountWithFocusRequest({
      documentKey: "editor:A",
      focusRequest: request,
      onFocusRequestApplied: (requestId) => {
        applied.push(requestId);
      }
    });

    expect(focus).toHaveBeenCalledTimes(1);
    expect(applied).toEqual([1]);

    render({ documentKey: "editor:A", focusRequest: request });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(applied).toEqual([1]);

    focus.mockRestore();
  });

  it("does not focus or consume a stale request for another documentKey", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const applied: number[] = [];

    mountWithFocusRequest({
      documentKey: "editor:B",
      focusRequest: { id: 2, documentKey: "editor:A" },
      onFocusRequestApplied: (requestId) => {
        applied.push(requestId);
      }
    });

    expect(focus).not.toHaveBeenCalled();
    expect(applied).toEqual([]);

    focus.mockRestore();
  });

  it("does not change the current selection when restoring focus", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    const restoredState: EditorViewState = {
      contentDigest: computeEditorContentDigest("content"),
      selection: { anchor: 2, head: 5 },
      scroll: { top: 0, left: 0 }
    };
    const { controller, render } = mountWithFocusRequest({
      documentKey: "editor:A",
      focusRequest: null,
      restoreViewState: restoredState
    });
    const beforeFocus = controller()?.captureViewState();

    render({
      documentKey: "editor:A",
      focusRequest: { id: 3, documentKey: "editor:A" }
    });

    const afterFocus = controller()?.captureViewState();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(afterFocus?.selection).toEqual(beforeFocus?.selection);
    expect(afterFocus?.selection).toEqual({ anchor: 2, head: 5 });

    focus.mockRestore();
  });
});
