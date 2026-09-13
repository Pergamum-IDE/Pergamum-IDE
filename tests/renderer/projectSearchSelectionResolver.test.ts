// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  isUsableSelectedText,
  resolveCurrentSelectedTextForProjectSearch
} from "../../src/renderer/projectSearchSelectionResolver";

function textarea(value: string, start: number, end: number): HTMLTextAreaElement {
  const element = document.createElement("textarea");
  element.value = value;
  element.selectionStart = start;
  element.selectionEnd = end;
  return element;
}

function input(value: string, start: number, end: number): HTMLInputElement {
  const element = document.createElement("input");
  element.type = "text";
  element.value = value;
  element.selectionStart = start;
  element.selectionEnd = end;
  return element;
}

/** A minimal fake `Selection` - only the members the resolver reads. */
function fakeSelection(options: {
  readonly isCollapsed: boolean;
  readonly anchorNode: Node | null;
  readonly focusNode: Node | null;
  readonly text: string;
}): Selection {
  return {
    isCollapsed: options.isCollapsed,
    anchorNode: options.anchorNode,
    focusNode: options.focusNode,
    toString: () => options.text
  } as unknown as Selection;
}

describe("resolveCurrentSelectedTextForProjectSearch (#457)", () => {
  describe("priority 1: focused input / textarea selection", () => {
    it("reads a focused textarea's selected text raw", () => {
      const element = textarea("hello world", 0, 5);
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element
      });
      expect(text).toBe("hello");
    });

    it("reads a focused input's selected text raw", () => {
      const element = input("hello world", 6, 11);
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element
      });
      expect(text).toBe("world");
    });

    it("preserves a multiline textarea selection exactly", () => {
      const value = "before\nfoo\nbar\nafter";
      const element = textarea(value, value.indexOf("foo"), value.indexOf("after"));
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element
      });
      expect(text).toBe("foo\nbar\n");
    });

    it("preserves leading/trailing spaces and newlines in the selection", () => {
      const value = "xx  foo\nbar  yy";
      const element = textarea(value, 2, 13);
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element
      });
      expect(text).toBe("  foo\nbar  ");
    });

    it("a collapsed (caret-only) selection in a textarea falls through instead of returning ''", () => {
      const element = textarea("hello", 2, 2);
      const getSelection = vi.fn(() => null);
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element,
        getSelection,
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
      // Fell through to the DOM-selection resolver rather than short-circuiting.
      expect(getSelection).toHaveBeenCalled();
    });

    it("a non-input/textarea activeElement is not treated as a form control", () => {
      const div = document.createElement("div");
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: div,
        getSelection: () => null,
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
    });
  });

  describe("priorities 2/3: DOM selection inside the Pergamum app root", () => {
    it("accepts a non-collapsed selection whose anchor/focus are both inside the app root", () => {
      const appRoot = document.createElement("div");
      const node = document.createTextNode("selected preview text");
      appRoot.appendChild(node);

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: false,
            anchorNode: node,
            focusNode: node,
            text: "selected preview text"
          })
      });
      expect(text).toBe("selected preview text");
    });

    it("ignores a DOM selection whose nodes are OUTSIDE the app root", () => {
      const appRoot = document.createElement("div");
      const outside = document.createElement("div");
      const node = document.createTextNode("not in the app");
      outside.appendChild(node);

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: false,
            anchorNode: node,
            focusNode: node,
            text: "not in the app"
          }),
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
    });

    it("ignores a collapsed DOM selection", () => {
      const appRoot = document.createElement("div");
      const node = document.createTextNode("x");
      appRoot.appendChild(node);

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: true,
            anchorNode: node,
            focusNode: node,
            text: ""
          }),
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
    });

    it("ignores a null Selection object", () => {
      const appRoot = document.createElement("div");
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () => null,
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
    });

    it("preserves a multiline DOM selection exactly, as returned by Selection.toString()", () => {
      const appRoot = document.createElement("div");
      const node = document.createTextNode("foo\nbar");
      appRoot.appendChild(node);

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: false,
            anchorNode: node,
            focusNode: node,
            text: "foo\nbar"
          })
      });
      expect(text).toBe("foo\nbar");
    });

    it("also covers a focused contenteditable region (its selection is a normal DOM Selection)", () => {
      const appRoot = document.createElement("div");
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      const node = document.createTextNode("editable text");
      editable.appendChild(node);
      appRoot.appendChild(editable);

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: editable,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: false,
            anchorNode: node,
            focusNode: node,
            text: "editable text"
          })
      });
      expect(text).toBe("editable text");
    });
  });

  describe("priority 4: active Markdown editor CodeMirror fallback", () => {
    it("falls back to the editor's selection text when nothing else is usable", () => {
      const getActiveEditorSelectionText = vi.fn(() => "editor selection");
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        getSelection: () => null,
        getActiveEditorSelectionText
      });
      expect(text).toBe("editor selection");
      expect(getActiveEditorSelectionText).toHaveBeenCalledTimes(1);
    });

    it("preserves a multiline editor selection exactly", () => {
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        getSelection: () => null,
        getActiveEditorSelectionText: () => "foo\nbar"
      });
      expect(text).toBe("foo\nbar");
    });

    it("returns '' when the editor fallback itself returns ''", () => {
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        getSelection: () => null,
        getActiveEditorSelectionText: () => ""
      });
      expect(text).toBe("");
    });
  });

  describe("priority ordering", () => {
    it("a focused form-control selection wins over a DOM selection", () => {
      const element = textarea("form control text", 0, 4);
      const getSelection = vi.fn();
      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: element,
        getSelection,
        getActiveEditorSelectionText: () => "editor text"
      });
      expect(text).toBe("form");
      expect(getSelection).not.toHaveBeenCalled();
    });

    it("a DOM selection wins over the editor fallback", () => {
      const appRoot = document.createElement("div");
      const node = document.createTextNode("dom text");
      appRoot.appendChild(node);
      const getActiveEditorSelectionText = vi.fn(() => "editor text");

      const text = resolveCurrentSelectedTextForProjectSearch({
        activeElement: null,
        appRoot,
        getSelection: () =>
          fakeSelection({
            isCollapsed: false,
            anchorNode: node,
            focusNode: node,
            text: "dom text"
          }),
        getActiveEditorSelectionText
      });
      expect(text).toBe("dom text");
      expect(getActiveEditorSelectionText).not.toHaveBeenCalled();
    });
  });

  it("returns '' when nothing anywhere is usable", () => {
    const text = resolveCurrentSelectedTextForProjectSearch({
      activeElement: null,
      getSelection: () => null,
      getActiveEditorSelectionText: () => ""
    });
    expect(text).toBe("");
  });
});

describe("isUsableSelectedText (#457)", () => {
  it("rejects empty, whitespace-only, and newline-only text", () => {
    expect(isUsableSelectedText("")).toBe(false);
    expect(isUsableSelectedText("   ")).toBe(false);
    expect(isUsableSelectedText("\n\n")).toBe(false);
    expect(isUsableSelectedText("\t\n ")).toBe(false);
  });

  it("accepts non-blank text, including with surrounding whitespace/newlines", () => {
    expect(isUsableSelectedText("foo")).toBe(true);
    expect(isUsableSelectedText(" foo\nbar ")).toBe(true);
    expect(isUsableSelectedText("\nfoo\n")).toBe(true);
  });
});
