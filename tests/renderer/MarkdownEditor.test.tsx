// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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

describe("MarkdownEditor EditorScrollSyncAdapter.jumpToSourceLine (#504)", () => {
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

  function mountAndCaptureAdapter() {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    let capturedAdapter: import("../../src/renderer/previewScrollSync").EditorScrollSyncAdapter | null =
      null;

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "line one\nline two\nline three\nline four\nline five",
          onChange: () => undefined,
          onScrollSyncAdapterMount: (adapter) => {
            capturedAdapter = adapter;
          }
        })
      );
    });

    if (!capturedAdapter) {
      throw new Error("expected onScrollSyncAdapterMount to fire with an adapter");
    }
    return capturedAdapter as import("../../src/renderer/previewScrollSync").EditorScrollSyncAdapter;
  }

  it("reports the document's total line count", () => {
    const adapter = mountAndCaptureAdapter();

    expect(adapter.getDocLineCount()).toBe(5);
  });

  it("places a collapsed cursor on the target line and focuses the editor", () => {
    const adapter = mountAndCaptureAdapter();

    act(() => {
      adapter.jumpToSourceLine(3);
    });

    const editorContentElement = container!.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement | null;
    expect(editorContentElement).not.toBeNull();
    expect(document.activeElement).toBe(editorContentElement);

    const domSelection = window.getSelection();
    const anchorNode = domSelection?.anchorNode ?? null;
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null;
    const activeLine = anchorElement?.closest(".cm-line") ?? null;
    expect(activeLine?.textContent).toBe("line three");
    expect(domSelection?.isCollapsed).toBe(true);
  });

  it("clamps defensively when asked to jump past the last line", () => {
    const adapter = mountAndCaptureAdapter();

    expect(() => adapter.jumpToSourceLine(999)).not.toThrow();
  });

  // jsdom/happy-dom has no real layout engine, so EditorView.scrollIntoView's
  // target scroll position can't be observed behaviorally (per #504's own
  // instructions: "do not assert scroll positions"). This is the one place
  // that still checks source text rather than behavior, specifically to
  // guard that jumpToSourceLine centers the target line (D3) and is a
  // distinct code path from #503's scrollToSourceLine (which aligns to the
  // top, for continuous scroll-sync rather than a one-shot jump).
  it("centers the target line on scroll, distinct from #503's top-aligning scrollToSourceLine", () => {
    const markdownEditorSource = readFileSync(
      "src/renderer/MarkdownEditor.tsx",
      "utf8"
    );

    expect(markdownEditorSource).toContain(
      'EditorView.scrollIntoView(line.from, { y: "center" })'
    );
    expect(markdownEditorSource).toContain(
      'EditorView.scrollIntoView(line.from, { y: "start" })'
    );
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

describe("MarkdownEditor isMarkdownDocument prop (#546)", () => {
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

  function mount(isMarkdownDocument: boolean | undefined, doc: string): EditorView {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: doc,
          onChange: () => undefined,
          isMarkdownDocument
        })
      );
    });

    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    return EditorView.findFromDOM(cmElement!)!;
  }

  it("defaults to Markdown-aware indent: Mod+] on a top-level paragraph is a no-op", () => {
    const view = mount(undefined, "Hello world");
    view.dispatch({ selection: EditorSelection.cursor(3) });
    const event = new KeyboardEvent("keydown", {
      key: "]",
      code: "BracketRight",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("Hello world");
  });

  it("isMarkdownDocument=false: Mod+] on a top-level paragraph inserts the plain text indent unit", () => {
    const view = mount(false, "Hello world");
    view.dispatch({ selection: EditorSelection.cursor(3) });
    const event = new KeyboardEvent("keydown", {
      key: "]",
      code: "BracketRight",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    // textFileIndentUnitFacet defaults to "tab" (textFiles.indentUnit's
    // catalog default).
    expect(view.state.doc.toString()).toBe("\tHello world");
  });
});

describe("MarkdownEditor textFileIndentUnit prop (#546 follow-up)", () => {
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

  function modBracketKeydown(bracket: "[" | "]"): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: bracket,
      code: bracket === "]" ? "BracketRight" : "BracketLeft",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("Ctrl+] uses the configured textFileIndentUnit for a plain text document", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "foo",
          onChange: () => undefined,
          isMarkdownDocument: false,
          textFileIndentUnit: "fourSpaces"
        })
      );
    });

    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    const view = EditorView.findFromDOM(cmElement!)!;
    view.dispatch({ selection: EditorSelection.cursor(1) });

    const event = modBracketKeydown("]");
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("    foo");
  });

  it("Ctrl+[ uses the plain text outdent strategy with the configured textFileIndentUnit", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "    foo",
          onChange: () => undefined,
          isMarkdownDocument: false,
          textFileIndentUnit: "fourSpaces"
        })
      );
    });

    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    const view = EditorView.findFromDOM(cmElement!)!;
    view.dispatch({ selection: EditorSelection.cursor(4) });

    const event = modBracketKeydown("[");
    view.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(view.state.doc.toString()).toBe("foo");
  });

  it("Tab (captureTabInEditor=true) is selection-aware for a plain text document: caret insert, then Shift+Tab line-outdents", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root!.render(
        React.createElement(MarkdownEditor, {
          value: "foobar",
          onChange: () => undefined,
          isMarkdownDocument: false,
          textFileIndentUnit: "twoSpaces",
          captureTabInEditor: true
        })
      );
    });

    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    const view = EditorView.findFromDOM(cmElement!)!;
    view.dispatch({ selection: EditorSelection.cursor(3) });

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    // No selection -> inserted at the caret, not at line start.
    expect(view.state.doc.toString()).toBe("foo  bar");

    const shiftTabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      code: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    view.contentDOM.dispatchEvent(shiftTabEvent);

    expect(shiftTabEvent.defaultPrevented).toBe(true);
    // Shift+Tab stays line-based outdent — the line has no LEADING
    // whitespace (the inserted unit landed mid-line, not at line start), so
    // this is correctly a no-op, not a removal of the mid-line unit.
    expect(view.state.doc.toString()).toBe("foo  bar");
  });

  it("dynamically reconfigures the live indent unit when textFileIndentUnit prop changes", () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const renderEditor = (
      value: string,
      textFileIndentUnit: "tab" | "twoSpaces" | "fourSpaces"
    ) => {
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value,
            onChange: () => undefined,
            isMarkdownDocument: false,
            textFileIndentUnit
          })
        );
      });
    };

    renderEditor("foo", "twoSpaces");
    const cmElement = container!.querySelector<HTMLElement>(".cm-editor");
    const view = EditorView.findFromDOM(cmElement!)!;
    view.dispatch({ selection: EditorSelection.cursor(1) });

    view.contentDOM.dispatchEvent(modBracketKeydown("]"));
    expect(view.state.doc.toString()).toBe("  foo");

    // Prop change alone (no remount) must reconfigure the live facet. `value`
    // is re-passed as the editor's own current content (matching what the
    // real App.tsx onChange round-trip would do) so this render doesn't also
    // trigger the unrelated "external content changed" replace path.
    renderEditor("  foo", "fourSpaces");
    view.dispatch({ selection: EditorSelection.cursor(0) });
    view.contentDOM.dispatchEvent(modBracketKeydown("]"));
    expect(view.state.doc.toString()).toBe("      foo");
  });
});
