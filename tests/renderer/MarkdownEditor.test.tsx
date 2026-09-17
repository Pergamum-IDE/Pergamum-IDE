// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EditorSelection, Transaction, type AnnotationType } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { pergamumContextSurfaceAttribute } from "../../src/shared/editContextMenu";
import {
  MarkdownEditor,
  markdownEditorInputSoundEventFromTransactions
} from "../../src/renderer/MarkdownEditor";
import {
  lineEndMarkerClassName,
  lineEndMarkerUnexpectedClassName
} from "../../src/renderer/editorVisibility/lineEndMarkerFeature";
import { analyzeLineEndings } from "../../src/renderer/lineEndingTracking";

interface FakeTransactionInput {
  docChanged?: boolean;
  userEvent?: string;
  insertedTexts: readonly string[];
}

function fakeTransaction(input: FakeTransactionInput) {
  return {
    docChanged: input.docChanged ?? true,
    annotation: <T,>(type: AnnotationType<T>) =>
      type === Transaction.userEvent ? (input.userEvent as T) : undefined,
    changes: {
      iterChanges: (
        callback: (
          fromA: number,
          toA: number,
          fromB: number,
          toB: number,
          inserted: { toString: () => string }
        ) => void
      ) => {
        for (const insertedText of input.insertedTexts) {
          callback(0, 0, 0, insertedText.length, {
            toString: () => insertedText
          });
        }
      }
    }
  };
}

describe("MarkdownEditor", () => {
  it("marks the editable host with the explicit context menu surface", () => {
    const markup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined,
        contextSurface: "markdownEditor"
      })
    );

    expect(markup).toContain(
      `${pergamumContextSurfaceAttribute}="markdownEditor"`
    );
  });

  it("marks read-only instances so project-owned editors can be non-editable", () => {
    const readOnlyMarkup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined,
        readOnly: true
      })
    );
    const readWriteMarkup = renderToStaticMarkup(
      React.createElement(MarkdownEditor, {
        value: "body",
        onChange: () => undefined
      })
    );

    expect(readOnlyMarkup).toContain("editorHost-readOnly");
    expect(readWriteMarkup).not.toContain("editorHost-readOnly");
  });
});

describe("MarkdownEditor line-ending rendering settings", () => {
  let container: HTMLDivElement | null = null;
  let root: import("react-dom/client").Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  function renderEditor(
    expectedLineEnding: "lf" | "crlf" | "cr",
    markerGlyph: "none" | "⏎" | "↵" | "↓"
  ): void {
    const raw = "alpha\r\nbeta\r\ngamma";

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: raw.replace(/\r\n|\r/g, "\n"),
          documentKey: "line-ending-settings.md",
          initialLineEndingBreaks: analyzeLineEndings(raw),
          expectedLineEnding,
          markerGlyph,
          onChange: () => undefined
        })
      );
    });
  }

  function markerText(): string[] {
    return Array.from(
      container!.querySelectorAll(`.${lineEndMarkerClassName}`)
    ).map((element) => element.textContent ?? "");
  }

  function unexpectedMarkerCount(): number {
    return container!.querySelectorAll(`.${lineEndMarkerUnexpectedClassName}`)
      .length;
  }

  it("updates the active editor's line-ending markers when rendering settings change without remounting", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    renderEditor("lf", "⏎");
    expect(markerText()).toEqual(["⏎", "⏎"]);
    expect(unexpectedMarkerCount()).toBe(2);

    renderEditor("crlf", "↵");

    expect(markerText()).toEqual(["↵", "↵"]);
    expect(unexpectedMarkerCount()).toBe(0);
  });
});

describe("MarkdownEditor sound input classification (#200)", () => {
  it("classifies CR, CRLF, and LF typed newline input as newline sound events", () => {
    for (const insertedText of ["\r", "\r\n", "\n"]) {
      expect(
        markdownEditorInputSoundEventFromTransactions([
          fakeTransaction({
            userEvent: "input.type",
            insertedTexts: [insertedText]
          })
        ])
      ).toBe("newline");
    }
  });

  it('classifies CodeMirror Enter command transactions with userEvent "input" as newline sound events', () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input",
          insertedTexts: ["\n- "]
        })
      ])
    ).toBe("newline");
  });

  it("classifies ordinary user typed text as a keypress sound event", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type",
          insertedTexts: ["a"]
        })
      ])
    ).toBe("keypress");
  });

  it("classifies IME composition text as a keypress sound event on input confirmation", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type.compose",
          insertedTexts: ["あ"]
        })
      ])
    ).toBe("keypress");
  });

  it("prioritizes newline sound over keypress sound when the inserted text contains a line break", () => {
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type.compose",
          insertedTexts: ["あ\n"]
        })
      ])
    ).toBe("newline");
    expect(
      markdownEditorInputSoundEventFromTransactions([
        fakeTransaction({
          userEvent: "input.type",
          insertedTexts: ["a"]
        }),
        fakeTransaction({
          userEvent: "input",
          insertedTexts: ["\n"]
        })
      ])
    ).toBe("newline");
  });

  it("does not classify paste, deletion-only, generic non-newline input, or programmatic changes as editor sound input", () => {
    for (const transaction of [
      fakeTransaction({ userEvent: "input.paste", insertedTexts: ["a\n"] }),
      fakeTransaction({ userEvent: "input.type", insertedTexts: [""] }),
      fakeTransaction({ userEvent: "input", insertedTexts: ["a"] }),
      fakeTransaction({
        docChanged: false,
        userEvent: "input.type",
        insertedTexts: ["a"]
      })
    ]) {
      expect(markdownEditorInputSoundEventFromTransactions([transaction])).toBe(
        null
      );
    }
  });
});

describe("MarkdownEditor dynamic tab capture configuration (#476)", () => {
  let container: HTMLDivElement | null = null;
  let root: import("react-dom/client").Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    container = null;
  });

  it("dynamically enables Tab capture when captureTabInEditor prop changes from false to true", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const doc = "```ts\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| C | D |";
    const renderEditor = (captureTabInEditor: boolean) => {
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: doc,
            onChange: () => undefined,
            captureTabInEditor,
            fencedCodeIndentUnit: "spaces4"
          })
        );
      });
    };

    // 1. Initial render with captureTabInEditor = false
    renderEditor(false);
    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    expect(cmElement).not.toBeNull();
    const view = EditorView.findFromDOM(cmElement!)!;
    expect(view).not.toBeNull();

    // Focus table cell A
    const cellAPos = doc.indexOf("| A | B |") + 2; // 'A'
    view.dispatch({ selection: EditorSelection.cursor(cellAPos) });

    const keydownTab = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(keydownTab);

    // Should NOT be intercepted when captureTabInEditor is false
    expect(keydownTab.defaultPrevented).toBe(false);

    // 2. Dynamic prop change to captureTabInEditor = true
    renderEditor(true);

    // Test table cell navigation with Tab
    const tableTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(tableTabEvent);

    expect(tableTabEvent.defaultPrevented).toBe(true);
    const cellBPos = doc.indexOf("| A | B |") + 6; // 'B'
    expect(view.state.selection.main.head).toBe(cellBPos);

    // Test fenced code indentation with Tab
    const codePos = doc.indexOf("const");
    view.dispatch({ selection: EditorSelection.cursor(codePos) });
    const fencedTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(fencedTabEvent);

    expect(fencedTabEvent.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe(
      "```ts\n    const x = 1;\n```\n\n| A | B |\n| --- | --- |\n| C | D |"
    );
  });
});
