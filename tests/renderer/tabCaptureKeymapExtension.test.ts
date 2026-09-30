// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubRuntimePlatform } from "./helpers/runtimePlatform";
import {
  createTabCaptureKeymapExtension,
  isTabCaptureBypassActive,
  isTabCaptureToggleShortcut,
  publishTabCaptureToggle,
  resetTabCaptureBypass,
  triggerTabCaptureBypass,
  unpublishTabCaptureToggle
} from "../../src/renderer/tabCaptureKeymapExtension";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";
import { documentIsMarkdownFacet } from "../../src/renderer/plainTextIndentCommands";

function mountEditor(input: {
  doc?: string;
  captureTabInEditor?: boolean;
  readOnly?: boolean;
  fencedCodeIndentUnit?: "spaces2" | "spaces4" | "spaces6" | "spaces8" | "tab";
  isMarkdownDocument?: boolean;
}): EditorView {
  const captureTabInEditor = input.captureTabInEditor ?? false;
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: input.doc ?? "- item",
      selection: EditorSelection.single(2),
      extensions: [
        ...createMarkdownEditorBaseSetup({
          undoHistoryMinDepth: 100,
          fencedCodeIndentUnit: input.fencedCodeIndentUnit ?? "spaces4"
        }),
        createTabCaptureKeymapExtension(captureTabInEditor),
        ...(input.readOnly ? [EditorState.readOnly.of(true)] : []),
        ...(input.isMarkdownDocument !== undefined
          ? [documentIsMarkdownFacet.of(input.isMarkdownDocument)]
          : [])
      ]
    })
  });
}

function keydownEvent(key: string, options: { shiftKey?: boolean; ctrlKey?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    code: key === "Tab" ? "Tab" : key === "Escape" ? "Escape" : "KeyM",
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    bubbles: true,
    cancelable: true
  });
}

describe("tabCaptureKeymapExtension (#467)", () => {
  describe("default OFF (captureTabInEditor = false)", () => {
    it("installs only the toggle shortcut handler (no Tab capture) when false", () => {
      const view = mountEditor({ doc: "- item", captureTabInEditor: false });
      try {
        const tabEvent = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(tabEvent);
        expect(tabEvent.defaultPrevented).toBe(false);
        expect(view.state.doc.toString()).toBe("- item");
      } finally {
        view.destroy();
      }
    });

    it("does NOT intercept Tab key, leaving default focus behavior", () => {
      const view = mountEditor({ doc: "- item", captureTabInEditor: false });
      try {
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(view.state.doc.toString()).toBe("- item");
      } finally {
        view.destroy();
      }
    });

    it("does NOT intercept Shift+Tab key, leaving default focus behavior", () => {
      const view = mountEditor({ doc: "  - item", captureTabInEditor: false });
      try {
        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(view.state.doc.toString()).toBe("  - item");
      } finally {
        view.destroy();
      }
    });
  });

  describe("ON (captureTabInEditor = true)", () => {
    it("Tab key indents sinkable unordered list item by 2 spaces", () => {
      const doc = "- parent\n- item";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(doc.indexOf("- item")),
        });

        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("- parent\n  - item");
      } finally {
        view.destroy();
      }
    });

    it("Tab key captures first unordered list item but leaves it unchanged", () => {
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });

      try {
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("- item");
      } finally {
        view.destroy();
      }
    });

    it("Shift+Tab key outdents nested list item", () => {
      const view = mountEditor({ doc: "  - item", captureTabInEditor: true });
      try {
        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("- item");
      } finally {
        view.destroy();
      }
    });

    it("Tab key indents sinkable ordered list item by parent content column and renumbers it to 1", () => {
      const doc = "1. parent\n2. item";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(doc.indexOf("2. item")),
        });

        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("1. parent\n   1. item");
      } finally {
        view.destroy();
      }
    });

    it("Shift+Tab key outdents nested ordered list item and renumbers it at parent level", () => {
      const doc = "1. parent\n   1. item";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(doc.indexOf("   1. item")),
        });

        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("1. parent\n2. item");
      } finally {
        view.destroy();
      }
    });

    it("Tab key indents blockquote line when captureTabInEditor is true", () => {
      const doc = "> quote";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(2),
        });

        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("> > quote");
      } finally {
        view.destroy();
      }
    });

    it("Shift+Tab key outdents nested blockquote line when captureTabInEditor is true", () => {
      const doc = "> > quote";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(3),
        });

        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("> quote");
      } finally {
        view.destroy();
      }
    });

    it("Tab key indents fenced code block code text line when captureTabInEditor is true (#474)", () => {
      const doc = "```ts\nconst x = 1;\n```";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(doc.indexOf("const")),
        });

        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("```ts\n    const x = 1;\n```");
      } finally {
        view.destroy();
      }
    });

    it("Shift+Tab key outdents fenced code block code text line when captureTabInEditor is true (#474)", () => {
      const doc = "```ts\n    const x = 1;\n```";
      const view = mountEditor({ doc, captureTabInEditor: true });

      try {
        view.dispatch({
          selection: EditorSelection.cursor(doc.indexOf("const")),
        });

        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("```ts\nconst x = 1;\n```");
      } finally {
        view.destroy();
      }
    });

    it("read-only editor: Tab key is consumed but produces NO document changes", () => {
      const view = mountEditor({
        doc: "- item",
        captureTabInEditor: true,
        readOnly: true
      });
      try {
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(view.state.doc.toString()).toBe("- item");
      } finally {
        view.destroy();
      }
    });

    describe("table cell navigation (#476)", () => {
      const tableDoc = "| A | B |\n| --- | --- |\n| C | D |";

      it("Tab key navigates to next table cell without document modification", () => {
        const view = mountEditor({ doc: tableDoc, captureTabInEditor: true });
        try {
          view.dispatch({ selection: EditorSelection.cursor(2) }); // 'A'
          const event = keydownEvent("Tab");
          view.contentDOM.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(view.state.selection.main.head).toBe(6); // 'B'
          expect(view.state.doc.toString()).toBe(tableDoc);
        } finally {
          view.destroy();
        }
      });

      it("Shift+Tab key navigates to previous table cell without document modification", () => {
        const view = mountEditor({ doc: tableDoc, captureTabInEditor: true });
        try {
          view.dispatch({ selection: EditorSelection.cursor(6) }); // 'B'
          const event = keydownEvent("Tab", { shiftKey: true });
          view.contentDOM.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(view.state.selection.main.head).toBe(2); // 'A'
          expect(view.state.doc.toString()).toBe(tableDoc);
        } finally {
          view.destroy();
        }
      });

      it("Tab key across row boundary skips delimiter row", () => {
        const view = mountEditor({ doc: tableDoc, captureTabInEditor: true });
        try {
          view.dispatch({ selection: EditorSelection.cursor(6) }); // 'B'
          const event = keydownEvent("Tab");
          view.contentDOM.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(view.state.selection.main.head).toBe(26); // 'C'
          expect(view.state.doc.toString()).toBe(tableDoc);
        } finally {
          view.destroy();
        }
      });

      it("read-only editor: Tab navigates table cell cursor without changing document", () => {
        const view = mountEditor({ doc: tableDoc, captureTabInEditor: true, readOnly: true });
        try {
          view.dispatch({ selection: EditorSelection.cursor(2) }); // 'A'
          const event = keydownEvent("Tab");
          view.contentDOM.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(view.state.selection.main.head).toBe(6); // 'B'
          expect(view.state.doc.toString()).toBe(tableDoc);
        } finally {
          view.destroy();
        }
      });
    });

    describe("Repro matrix (#476 / #474 integration)", () => {
      it("captureTabInEditor=true + fencedCodeIndentUnit='tab': Tab inside fenced code inserts tab, Tab in table moves cell", () => {
        const doc = "```ts\nconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| C | D |";
        const view = mountEditor({
          doc,
          captureTabInEditor: true,
          fencedCodeIndentUnit: "tab"
        });
        try {
          // 1. Fenced code Tab -> indents with '\t'
          view.dispatch({ selection: EditorSelection.cursor(doc.indexOf("const")) });
          const fencedTabEvent = keydownEvent("Tab");
          view.contentDOM.dispatchEvent(fencedTabEvent);
          expect(fencedTabEvent.defaultPrevented).toBe(true);
          expect(view.state.doc.toString()).toBe(
            "```ts\n\tconst x = 1;\n```\n\n| A | B |\n| --- | --- |\n| C | D |"
          );

          // 2. Table cell Tab -> navigates to next cell
          const currentDoc = view.state.doc.toString();
          const cellAPos = currentDoc.indexOf("| A | B |") + 2; // 'A'
          const cellBPos = currentDoc.indexOf("| A | B |") + 6; // 'B'
          view.dispatch({ selection: EditorSelection.cursor(cellAPos) });
          const tableTabEvent = keydownEvent("Tab");
          view.contentDOM.dispatchEvent(tableTabEvent);
          expect(tableTabEvent.defaultPrevented).toBe(true);
          expect(view.state.selection.main.head).toBe(cellBPos);
        } finally {
          view.destroy();
        }
      });
    });
  });

  describe("plain text documents (#546, documentIsMarkdownFacet=false)", () => {
    it("Tab key with no selection inserts the plain text indent unit at the caret (not a Markdown no-op, not line-start)", () => {
      const view = mountEditor({
        doc: "foo",
        captureTabInEditor: true,
        isMarkdownDocument: false
      });
      try {
        // Caret mid-word — the indent unit lands at the caret, not the
        // start of the line (#546 follow-up "Refine Tab behavior").
        view.dispatch({ selection: EditorSelection.cursor(1) });
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        // textFileIndentUnitFacet defaults to "tab" (textFiles.indentUnit's
        // catalog default).
        expect(view.state.doc.toString()).toBe("f\too");
      } finally {
        view.destroy();
      }
    });

    it("Tab key with a partial single-line selection replaces the selection with the indent unit", () => {
      const view = mountEditor({
        doc: "foobarbaz",
        captureTabInEditor: true,
        isMarkdownDocument: false
      });
      try {
        view.dispatch({ selection: EditorSelection.range(3, 6) }); // "bar"
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("foo\tbaz");
      } finally {
        view.destroy();
      }
    });

    it("Tab key with a multi-line selection indents every selected line at line start", () => {
      const doc = "foo\nbar";
      const view = mountEditor({
        doc,
        captureTabInEditor: true,
        isMarkdownDocument: false
      });
      try {
        view.dispatch({ selection: EditorSelection.range(0, doc.length) });
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("\tfoo\n\tbar");
      } finally {
        view.destroy();
      }
    });

    it("Shift+Tab key removes one indent unit of leading whitespace", () => {
      const view = mountEditor({
        doc: "  foo",
        captureTabInEditor: true,
        isMarkdownDocument: false
      });
      try {
        view.dispatch({ selection: EditorSelection.cursor(3) });
        const event = keydownEvent("Tab", { shiftKey: true });
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(view.state.doc.toString()).toBe("foo");
      } finally {
        view.destroy();
      }
    });

    it("Tab is not captured when editor.captureTabInEditor is false, even for a plain text document", () => {
      const view = mountEditor({
        doc: "foo",
        captureTabInEditor: false,
        isMarkdownDocument: false
      });
      try {
        const event = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(false);
        expect(view.state.doc.toString()).toBe("foo");
      } finally {
        view.destroy();
      }
    });
  });

  describe("accessibility escape hatches (Escape -> Tab / Ctrl+M)", () => {
    it("Escape sets bypassNextTab flag, allowing next Tab to bypass editor capture", () => {
      resetTabCaptureBypass();
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });
      try {
        // Press Escape
        const escapeEvent = keydownEvent("Escape");
        view.contentDOM.dispatchEvent(escapeEvent);
        expect(isTabCaptureBypassActive()).toBe(true);

        // Next Tab bypasses capture
        const tabEvent = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(tabEvent);
        expect(tabEvent.defaultPrevented).toBe(false);
        expect(view.state.doc.toString()).toBe("- item");
        expect(isTabCaptureBypassActive()).toBe(false);
      } finally {
        view.destroy();
      }
    });

    it("Ctrl+M no longer arms the one-shot bypass (#636: it toggles the setting)", () => {
      resetTabCaptureBypass();
      const toggle = vi.fn();
      publishTabCaptureToggle(toggle);
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });
      try {
        view.contentDOM.dispatchEvent(keydownEvent("m", { ctrlKey: true }));
        expect(isTabCaptureBypassActive()).toBe(false);
      } finally {
        unpublishTabCaptureToggle(toggle);
        view.destroy();
      }
    });
  });

  describe("editor.tabCapture.toggle (#636)", () => {
    let restorePlatform: (() => void) | null = null;
    afterEach(() => {
      restorePlatform?.();
      restorePlatform = null;
    });

    function keyM(init: KeyboardEventInit): KeyboardEvent {
      return new KeyboardEvent("keydown", {
        key: "m",
        code: "KeyM",
        bubbles: true,
        cancelable: true,
        ...init
      });
    }

    it("recognizes Ctrl+M on win32 / linux and Shift+Option+M on darwin only", () => {
      const ctrlM = keyM({ ctrlKey: true });
      const shiftAltM = keyM({ shiftKey: true, altKey: true });
      const cmdM = keyM({ metaKey: true });
      for (const platform of ["win32", "linux"] as const) {
        expect(isTabCaptureToggleShortcut(ctrlM, platform)).toBe(true);
        expect(isTabCaptureToggleShortcut(shiftAltM, platform)).toBe(false);
        expect(isTabCaptureToggleShortcut(cmdM, platform)).toBe(false);
      }
      expect(isTabCaptureToggleShortcut(shiftAltM, "darwin")).toBe(true);
      expect(isTabCaptureToggleShortcut(ctrlM, "darwin")).toBe(false);
      // Cmd+M minimizes the window on macOS: never a Pergamum shortcut.
      expect(isTabCaptureToggleShortcut(cmdM, "darwin")).toBe(false);
    });

    it.each([true, false])(
      "Ctrl+M calls the published toggle on win32 (capture %s)",
      (capture) => {
        restorePlatform = stubRuntimePlatform("windows");
        const toggle = vi.fn();
        publishTabCaptureToggle(toggle);
        const view = mountEditor({ doc: "- item", captureTabInEditor: capture });
        try {
          const event = keyM({ ctrlKey: true });
          view.contentDOM.dispatchEvent(event);
          expect(event.defaultPrevented).toBe(true);
          expect(toggle).toHaveBeenCalledTimes(1);
        } finally {
          unpublishTabCaptureToggle(toggle);
          view.destroy();
        }
      }
    );

    it("Shift+Option+M calls the published toggle on darwin; Ctrl+M / Cmd+M do not", () => {
      restorePlatform = stubRuntimePlatform("macos");
      const toggle = vi.fn();
      publishTabCaptureToggle(toggle);
      const view = mountEditor({ doc: "- item", captureTabInEditor: false });
      try {
        view.contentDOM.dispatchEvent(keyM({ ctrlKey: true }));
        view.contentDOM.dispatchEvent(keyM({ metaKey: true }));
        expect(toggle).not.toHaveBeenCalled();
        const event = keyM({ shiftKey: true, altKey: true });
        view.contentDOM.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(toggle).toHaveBeenCalledTimes(1);
      } finally {
        unpublishTabCaptureToggle(toggle);
        view.destroy();
      }
    });

    it("does nothing during IME composition or without a published toggle", () => {
      restorePlatform = stubRuntimePlatform("windows");
      const toggle = vi.fn();
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });
      try {
        view.contentDOM.dispatchEvent(keyM({ ctrlKey: true }));
        publishTabCaptureToggle(toggle);
        view.contentDOM.dispatchEvent(keyM({ ctrlKey: true, isComposing: true }));
        expect(toggle).not.toHaveBeenCalled();
      } finally {
        unpublishTabCaptureToggle(toggle);
        view.destroy();
      }
    });

    it("Escape still arms the one-shot bypass without touching the toggle", () => {
      resetTabCaptureBypass();
      const toggle = vi.fn();
      publishTabCaptureToggle(toggle);
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });
      try {
        view.contentDOM.dispatchEvent(keydownEvent("Escape"));
        expect(isTabCaptureBypassActive()).toBe(true);
        expect(toggle).not.toHaveBeenCalled();
        const tabEvent = keydownEvent("Tab");
        view.contentDOM.dispatchEvent(tabEvent);
        expect(tabEvent.defaultPrevented).toBe(false);
        expect(isTabCaptureBypassActive()).toBe(false);
      } finally {
        unpublishTabCaptureToggle(toggle);
        view.destroy();
      }
    });
  });
});
