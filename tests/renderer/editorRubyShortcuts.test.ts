// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRubyKeymapExtension,
  isRubyShortcutTrigger,
  type MarkdownEditorRubyShortcutConfig
} from "../../src/renderer/editorRubyShortcuts";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  selection?: { anchor: number; head?: number };
  readOnly?: boolean;
  config: MarkdownEditorRubyShortcutConfig | null;
}): EditorView {
  const doc = input.doc ?? "Hello world";
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: input.selection
        ? EditorSelection.single(
            input.selection.anchor,
            input.selection.head ?? input.selection.anchor
          )
        : undefined,
      extensions: [
        EditorState.readOnly.of(input.readOnly ?? false),
        createRubyKeymapExtension({ getConfig: () => input.config })
      ]
    })
  });
  return view;
}

function rKeydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "r",
    code: "KeyR",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("isRubyShortcutTrigger", () => {
  it("returns true for Ctrl+R", () => {
    expect(isRubyShortcutTrigger(rKeydown({ ctrlKey: true }))).toBe(true);
  });

  it("returns true for Cmd+R", () => {
    expect(isRubyShortcutTrigger(rKeydown({ ctrlKey: false, metaKey: true }))).toBe(true);
  });

  it("returns true for uppercase R", () => {
    expect(isRubyShortcutTrigger(rKeydown({ key: "R", ctrlKey: true }))).toBe(true);
  });

  it("returns false if Alt or Shift is pressed", () => {
    expect(isRubyShortcutTrigger(rKeydown({ altKey: true }))).toBe(false);
    expect(isRubyShortcutTrigger(rKeydown({ shiftKey: true }))).toBe(false);
  });

  it("returns false for non-R keys", () => {
    const keyEvent = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      ctrlKey: true
    });
    expect(isRubyShortcutTrigger(keyEvent)).toBe(false);
  });
});

describe("createRubyKeymapExtension", () => {
  it("does nothing when config is null", () => {
    const v = createView({ config: null, selection: { anchor: 0, head: 5 } });
    const event = rKeydown();
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("triggers notifyReadOnly on read-only document", () => {
    const notifyReadOnly = vi.fn();
    const config: MarkdownEditorRubyShortcutConfig = {
      requestOpenRubyDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly,
      notifyMultiLine: vi.fn()
    };
    const v = createView({ config, readOnly: true, selection: { anchor: 0, head: 5 } });
    const event = rKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyReadOnly).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers notifyNoSelection on empty selection", () => {
    const notifyNoSelection = vi.fn();
    const config: MarkdownEditorRubyShortcutConfig = {
      requestOpenRubyDialog: vi.fn(),
      notifyNoSelection,
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
    const v = createView({ config, selection: { anchor: 2, head: 2 } });
    const event = rKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyNoSelection).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers notifyMultiLine when selection spans multiple lines", () => {
    const notifyMultiLine = vi.fn();
    const config: MarkdownEditorRubyShortcutConfig = {
      requestOpenRubyDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine
    };
    const v = createView({
      doc: "Line 1\nLine 2",
      config,
      selection: { anchor: 2, head: 10 }
    });
    const event = rKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyMultiLine).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers requestOpenRubyDialog on valid single-line selection", () => {
    const requestOpenRubyDialog = vi.fn();
    const config: MarkdownEditorRubyShortcutConfig = {
      requestOpenRubyDialog,
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
    const v = createView({
      doc: "漢字テスト",
      config,
      selection: { anchor: 0, head: 2 }
    });
    const event = rKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(requestOpenRubyDialog).toHaveBeenCalledWith({
      selectedText: "漢字",
      selection: { from: 0, to: 2 }
    });
    expect(event.defaultPrevented).toBe(true);
  });
});
