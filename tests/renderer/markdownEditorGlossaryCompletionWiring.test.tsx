// @vitest-environment happy-dom
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { MarkdownEditor } from "../../src/renderer/MarkdownEditor";

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
});
