import { describe, expect, it } from "vitest";
import { editorCommandIds } from "../../src/shared/commandIds";
import {
  canDelegateNativeEditCommand,
  isNormalUiTextInput,
  type ElementLike
} from "../../src/renderer/nativeEditCommandEnablement";

describe("nativeEditCommandEnablement", () => {
  describe("isNormalUiTextInput", () => {
    it("returns false for null or non-object targets", () => {
      expect(isNormalUiTextInput(null)).toBe(false);
    });

    it("returns true for standard editable input and textarea elements", () => {
      const inputEl: ElementLike = {
        tagName: "INPUT",
        disabled: false,
        readOnly: false,
        closest: () => null
      };
      const textareaEl: ElementLike = {
        tagName: "TEXTAREA",
        disabled: false,
        readOnly: false,
        closest: () => null
      };
      expect(isNormalUiTextInput(inputEl)).toBe(true);
      expect(isNormalUiTextInput(textareaEl)).toBe(true);
    });

    it("returns false for disabled or readOnly input elements", () => {
      const disabledEl: ElementLike = {
        tagName: "INPUT",
        disabled: true,
        readOnly: false,
        closest: () => null
      };
      const readOnlyEl: ElementLike = {
        tagName: "INPUT",
        disabled: false,
        readOnly: true,
        closest: () => null
      };
      expect(isNormalUiTextInput(disabledEl)).toBe(false);
      expect(isNormalUiTextInput(readOnlyEl)).toBe(false);
    });

    it("returns false for inputs inside document editors (.cm-editor or data-pergamum-context-surface)", () => {
      const editorChildEl: ElementLike = {
        tagName: "INPUT",
        closest: (selector) =>
          selector === ".cm-editor" ? ({ tagName: "DIV" } as ElementLike) : null
      };
      expect(isNormalUiTextInput(editorChildEl)).toBe(false);
    });

    it("returns false for inputs inside Command Palette", () => {
      const paletteInputEl: ElementLike = {
        tagName: "INPUT",
        closest: (selector) =>
          selector === ".commandPaletteInput"
            ? ({ tagName: "INPUT" } as ElementLike)
            : null
      };
      expect(isNormalUiTextInput(paletteInputEl)).toBe(false);
    });
  });

  describe("canDelegateNativeEditCommand", () => {
    it("always enables Copy and Select All regardless of read-only editor state", () => {
      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.copySelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(true);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.selectAllSelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(true);
    });

    it("disables Cut and Paste on read-only document editor", () => {
      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.cutSelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(false);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.pasteSelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(false);
    });

    it("enables Cut and Paste on read-write document editor", () => {
      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.cutSelection,
          isReadOnlyProjectOwnedEditor: false,
          activeElement: null
        })
      ).toBe(true);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.pasteSelection,
          isReadOnlyProjectOwnedEditor: false,
          activeElement: null
        })
      ).toBe(true);
    });

    it("enables Cut and Paste when focus is in a normal UI text input even during read-only project mode", () => {
      const settingsInputEl: ElementLike = {
        tagName: "INPUT",
        disabled: false,
        readOnly: false,
        closest: () => null
      };

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.cutSelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: settingsInputEl
        })
      ).toBe(true);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.pasteSelection,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: settingsInputEl
        })
      ).toBe(true);
    });

    it("disables Undo and Redo on read-only document editor", () => {
      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.undo,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(false);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.redo,
          isReadOnlyProjectOwnedEditor: true,
          activeElement: null
        })
      ).toBe(false);
    });

    it("enables Undo and Redo on read-write document editor", () => {
      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.undo,
          isReadOnlyProjectOwnedEditor: false,
          activeElement: null
        })
      ).toBe(true);

      expect(
        canDelegateNativeEditCommand({
          commandId: editorCommandIds.redo,
          isReadOnlyProjectOwnedEditor: false,
          activeElement: null
        })
      ).toBe(true);
    });
  });
});
