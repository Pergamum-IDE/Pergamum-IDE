// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import {
  MarkdownEditor,
  type MarkdownEditorViewStateController
} from "../../src/renderer/MarkdownEditor";
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
