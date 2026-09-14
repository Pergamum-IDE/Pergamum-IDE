// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  createTabCaptureKeymapExtension,
  isTabCaptureBypassActive,
  resetTabCaptureBypass,
  triggerTabCaptureBypass
} from "../../src/renderer/tabCaptureKeymapExtension";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";

function mountEditor(input: {
  doc?: string;
  captureTabInEditor?: boolean;
  readOnly?: boolean;
}): EditorView {
  const captureTabInEditor = input.captureTabInEditor ?? false;
  return new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: input.doc ?? "- item",
      selection: EditorSelection.single(2),
      extensions: [
        ...createMarkdownEditorBaseSetup({ undoHistoryMinDepth: 100 }),
        createTabCaptureKeymapExtension(captureTabInEditor),
        ...(input.readOnly ? [EditorState.readOnly.of(true)] : [])
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
    it("returns empty extension array when false", () => {
      expect(createTabCaptureKeymapExtension(false)).toEqual([]);
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

    it("Ctrl+M sets bypassNextTab flag, allowing next Tab to bypass editor capture", () => {
      resetTabCaptureBypass();
      const view = mountEditor({ doc: "- item", captureTabInEditor: true });
      try {
        // Press Ctrl+M
        const ctrlMEvent = keydownEvent("m", { ctrlKey: true });
        view.contentDOM.dispatchEvent(ctrlMEvent);
        expect(ctrlMEvent.defaultPrevented).toBe(true);
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
  });
});
