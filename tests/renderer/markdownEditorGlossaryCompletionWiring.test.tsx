// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { currentCompletions } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { GlossaryEntry } from "../../src/shared/glossary";

import { MarkdownEditor } from "../../src/renderer/MarkdownEditor";
import type { MarkdownEditorDocumentState } from "../../src/renderer/markdownEditorDocumentState";

/**
 * #390 PoC: confirms the `glossaryCompletion` PROP actually reaches the
 * CodeMirror extension inside MarkdownEditor (component wiring). The
 * extension's own candidate/prefix/IME logic is covered directly against a
 * bare EditorView in glossaryCompletionExtension.test.ts - this file only
 * checks that MarkdownEditor threads the prop through correctly, and that
 * omitting it (as GlossaryEditor's description field does) leaves Ctrl+Space
 * inert, same as before #390.
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

function glossaryEntry(value: string): GlossaryEntry {
  return {
    id: "entry-1",
    description: "",
    atoms: [
      {
        id: "atom-1",
        entryId: "entry-1",
        sortOrder: 0,
        value,
        matchFlags: 0,
        createdAt: "",
        updatedAt: ""
      }
    ],
    tags: [],
    createdAt: "",
    updatedAt: ""
  };
}

function mount(props: Partial<React.ComponentProps<typeof MarkdownEditor>>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value: "",
        onChange: () => undefined,
        ...props
      })
    );
  });

  return {
    contentDom: () => container!.querySelector(".cm-content") as HTMLElement
  };
}

function ctrlSpaceKeydown(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: " ",
    code: "Space",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true
  });
}

describe("MarkdownEditor glossaryCompletion prop wiring (#390)", () => {
  it("Ctrl+Space is handled (preventDefault) when a glossaryCompletion config is supplied", () => {
    const { contentDom } = mount({
      glossaryCompletion: { entries: [glossaryEntry("オーダー")] }
    });

    const event = ctrlSpaceKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Space stays inert when glossaryCompletion is omitted - GlossaryEditor's description field never passes it", () => {
    const { contentDom } = mount({ contextSurface: "glossaryDescription" });

    const event = ctrlSpaceKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("Ctrl+Space stays inert on a read-only Markdown editor even with a glossaryCompletion config", () => {
    const { contentDom } = mount({
      readOnly: true,
      glossaryCompletion: { entries: [glossaryEntry("オーダー")] }
    });

    const event = ctrlSpaceKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("a live glossaryCompletion prop change (undefined -> config) is picked up without remounting", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "",
          onChange: () => undefined
        })
      );
    });

    const contentDom = () => container!.querySelector(".cm-content") as HTMLElement;

    const firstAttempt = ctrlSpaceKeydown();
    act(() => {
      contentDom().dispatchEvent(firstAttempt);
    });
    expect(firstAttempt.defaultPrevented).toBe(false);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "",
          onChange: () => undefined,
          glossaryCompletion: { entries: [glossaryEntry("オーダー")] }
        })
      );
    });

    const secondAttempt = ctrlSpaceKeydown();
    act(() => {
      contentDom().dispatchEvent(secondAttempt);
    });
    expect(secondAttempt.defaultPrevented).toBe(true);
  });

  it("cached EditorState restored after a remount sees live glossary updates added after its initial build (#673)", async () => {
    const documentStates = new Map();


    // 1. Initial mount: build cached EditorState for "doc-1" with entry "旧語彙"
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          documentKey: "doc-1",
          documentStates,
          value: "新",
          onChange: () => undefined,
          glossaryCompletion: { entries: [glossaryEntry("旧語彙")] }
        })
      );
    });

    // 2. Unmount (simulating tab switch or navigating away and back)
    act(() => {
      root!.unmount();
      root = null;
    });
    container.remove();
    container = null;

    // Verify state was cached in documentStates Map
    expect(documentStates.has("doc-1")).toBe(true);

    // 3. Remount for "doc-1" with UPDATED glossary entries including "新語彙", restoring cached EditorState
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          documentKey: "doc-1",
          documentStates,
          value: "新",
          onChange: () => undefined,
          glossaryCompletion: {
            entries: [glossaryEntry("旧語彙"), glossaryEntry("新語彙")]
          }
        })
      );
    });

    const contentDom = container.querySelector(".cm-content") as HTMLElement;

    // Trigger Ctrl+Space on "新" prefix
    const event = ctrlSpaceKeydown();
    act(() => {
      contentDom.dispatchEvent(event);
    });

    // Wait for completion to settle and verify that completion becomes active with candidate "新語彙"
    await new Promise((resolve) => setTimeout(resolve, 150));

    // The restored cached EditorState dynamically resolves live config, containing both "旧語彙" and newly added "新語彙"
    const activeView = EditorView.findFromDOM(contentDom)!;
    expect(currentCompletions(activeView.state).map((c) => c.label)).toContain("新語彙");
  });
});




