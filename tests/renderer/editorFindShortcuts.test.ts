// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  isExcludedInputTargetForActiveFind,
  shouldHandleActiveFindShortcut
} from "../../src/renderer/editorFindShortcuts";

describe("editorFindShortcuts (#482)", () => {
  describe("isExcludedInputTargetForActiveFind", () => {
    it("allows non-input elements such as div", () => {
      const div = document.createElement("div");
      expect(isExcludedInputTargetForActiveFind(div)).toBe(false);
    });

    it("allows elements inside .activeFindPanel", () => {
      const panel = document.createElement("div");
      panel.className = "activeFindPanel";
      const input = document.createElement("textarea");
      input.className = "activeFindPanelInput";
      panel.appendChild(input);
      document.body.appendChild(panel);

      expect(isExcludedInputTargetForActiveFind(input)).toBe(false);

      document.body.removeChild(panel);
    });

    it("allows elements inside .cm-editor or with .cm-content", () => {
      const editor = document.createElement("div");
      editor.className = "cm-editor";
      const content = document.createElement("div");
      content.className = "cm-content";
      content.contentEditable = "true";
      editor.appendChild(content);
      document.body.appendChild(editor);

      expect(isExcludedInputTargetForActiveFind(content)).toBe(false);

      document.body.removeChild(editor);
    });

    it("excludes generic input elements outside activeFindPanel and cm-editor", () => {
      const input = document.createElement("input");
      const textarea = document.createElement("textarea");
      const select = document.createElement("select");

      expect(isExcludedInputTargetForActiveFind(input)).toBe(true);
      expect(isExcludedInputTargetForActiveFind(textarea)).toBe(true);
      expect(isExcludedInputTargetForActiveFind(select)).toBe(true);
    });

    it("excludes non-CodeMirror contenteditable elements outside activeFindPanel and cm-editor", () => {
      const editable = document.createElement("div");
      editable.contentEditable = "true";
      expect(isExcludedInputTargetForActiveFind(editable)).toBe(true);
    });
  });

  describe("shouldHandleActiveFindShortcut", () => {
    it("returns 'next' for unmodified F3", () => {
      const result = shouldHandleActiveFindShortcut({
        key: "F3",
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: document.createElement("div")
      });
      expect(result).toBe("next");
    });

    it("returns 'previous' for Shift+F3", () => {
      const result = shouldHandleActiveFindShortcut({
        key: "F3",
        shiftKey: true,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: document.createElement("div")
      });
      expect(result).toBe("previous");
    });

    it("returns null when Ctrl, Alt, or Meta are pressed", () => {
      const target = document.createElement("div");
      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: true,
          altKey: false,
          metaKey: false,
          target
        })
      ).toBeNull();

      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: false,
          altKey: true,
          metaKey: false,
          target
        })
      ).toBeNull();

      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: true,
          target
        })
      ).toBeNull();
    });

    it("returns null for non-F3 keys", () => {
      expect(
        shouldHandleActiveFindShortcut({
          key: "F2",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          target: document.createElement("div")
        })
      ).toBeNull();
    });

    it("returns null when default is prevented or composing", () => {
      const target = document.createElement("div");
      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          defaultPrevented: true,
          target
        })
      ).toBeNull();

      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          isComposing: true,
          target
        })
      ).toBeNull();
    });

    it("returns null when inside active modal dialog", () => {
      expect(
        shouldHandleActiveFindShortcut(
          {
            key: "F3",
            shiftKey: false,
            ctrlKey: false,
            altKey: false,
            metaKey: false,
            target: document.createElement("div")
          },
          true
        )
      ).toBeNull();
    });

    it("returns null when focused in an excluded generic input element", () => {
      const input = document.createElement("input");
      expect(
        shouldHandleActiveFindShortcut({
          key: "F3",
          shiftKey: false,
          ctrlKey: false,
          altKey: false,
          metaKey: false,
          target: input
        })
      ).toBeNull();
    });

    it("returns 'next' when focused inside Active Find panel textarea", () => {
      const panel = document.createElement("div");
      panel.className = "activeFindPanel";
      const textarea = document.createElement("textarea");
      textarea.className = "activeFindPanelInput";
      panel.appendChild(textarea);
      document.body.appendChild(panel);

      const result = shouldHandleActiveFindShortcut({
        key: "F3",
        shiftKey: false,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: textarea
      });

      expect(result).toBe("next");

      document.body.removeChild(panel);
    });
  });
});
