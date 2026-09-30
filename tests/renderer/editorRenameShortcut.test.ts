// @vitest-environment happy-dom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRenameKeybindingHandlers,
  type MarkdownEditorRenameShortcutConfig
} from "../../src/renderer/editorRenameShortcut";
import { handlerFires, keymapFor } from "./helpers/editorKeymapHarness";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  config: MarkdownEditorRenameShortcutConfig | null;
}): EditorView {
  const doc = input.doc ?? "Hello world";
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      extensions: [
        keymapFor({
          handlers: createRenameKeybindingHandlers(() => input.config),
          commandIds: ["editor.document.rename"],
          stopPropagationCommandIds: ["editor.document.rename"]
        })
      ]
    })
  });
  return view;
}

function f2Keydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "F2",
    code: "F2",
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

const RENAME_COMMAND = "editor.document.rename";
const isRenameShortcutTrigger = (event: KeyboardEvent): boolean =>
  handlerFires(RENAME_COMMAND, event);

describe("F2 rename trigger (catalog key)", () => {
  it("returns true for plain F2", () => {
    expect(isRenameShortcutTrigger(f2Keydown())).toBe(true);
  });

  it("returns false if Ctrl, Alt, Meta, or Shift is pressed", () => {
    expect(isRenameShortcutTrigger(f2Keydown({ ctrlKey: true }))).toBe(false);
    expect(isRenameShortcutTrigger(f2Keydown({ altKey: true }))).toBe(false);
    expect(isRenameShortcutTrigger(f2Keydown({ metaKey: true }))).toBe(false);
    expect(isRenameShortcutTrigger(f2Keydown({ shiftKey: true }))).toBe(false);
  });

  it("returns false for non-F2 keys", () => {
    expect(isRenameShortcutTrigger(new KeyboardEvent("keydown", { key: "F3" }))).toBe(false);
    expect(isRenameShortcutTrigger(new KeyboardEvent("keydown", { key: "a" }))).toBe(false);
  });
});

describe("Rename shortcut via the catalog-derived editor keymap", () => {
  it("triggers requestRenameActiveDocument when enabled and F2 is pressed", () => {
    const requestRenameActiveDocument = vi.fn();
    const editorView = createView({
      config: {
        isEnabled: true,
        requestRenameActiveDocument
      }
    });

    const event = f2Keydown();
    editorView.contentDOM.dispatchEvent(event);

    expect(requestRenameActiveDocument).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not trigger when isEnabled is false", () => {
    const requestRenameActiveDocument = vi.fn();
    const editorView = createView({
      config: {
        isEnabled: false,
        requestRenameActiveDocument
      }
    });

    const event = f2Keydown();
    editorView.contentDOM.dispatchEvent(event);

    expect(requestRenameActiveDocument).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not trigger when config is null", () => {
    const editorView = createView({ config: null });

    const event = f2Keydown();
    editorView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not trigger during IME composition", () => {
    const requestRenameActiveDocument = vi.fn();
    const editorView = createView({
      config: {
        isEnabled: true,
        requestRenameActiveDocument
      }
    });

    editorView.contentDOM.dispatchEvent(new CompositionEvent("compositionstart"));
    const event = f2Keydown({ isComposing: true });
    editorView.contentDOM.dispatchEvent(event);

    expect(requestRenameActiveDocument).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
