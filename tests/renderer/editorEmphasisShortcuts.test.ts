// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmphasisMarkKeymapExtension,
  isEmphasisMarkShortcutTrigger,
  type MarkdownEditorEmphasisMarkShortcutConfig
} from "../../src/renderer/editorEmphasisShortcuts";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  selection?: { anchor: number; head?: number };
  readOnly?: boolean;
  config: MarkdownEditorEmphasisMarkShortcutConfig | null;
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
        createEmphasisMarkKeymapExtension({ getConfig: () => input.config })
      ]
    })
  });
  return view;
}

function periodKeydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: ".",
    code: "Period",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("isEmphasisMarkShortcutTrigger", () => {
  it("returns true for Ctrl+.", () => {
    expect(periodKeydown({ ctrlKey: true })).satisfies(isEmphasisMarkShortcutTrigger);
  });

  it("returns true for Cmd+.", () => {
    expect(periodKeydown({ ctrlKey: false, metaKey: true })).satisfies(isEmphasisMarkShortcutTrigger);
  });

  it("returns false if Alt or Shift is pressed", () => {
    expect(isEmphasisMarkShortcutTrigger(periodKeydown({ altKey: true }))).toBe(false);
    expect(isEmphasisMarkShortcutTrigger(periodKeydown({ shiftKey: true }))).toBe(false);
  });

  it("returns false for non-period keys", () => {
    const keyEvent = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      ctrlKey: true
    });
    expect(isEmphasisMarkShortcutTrigger(keyEvent)).toBe(false);
  });
});

describe("createEmphasisMarkKeymapExtension", () => {
  it("does nothing when config is null", () => {
    const v = createView({ config: null, selection: { anchor: 0, head: 5 } });
    const event = periodKeydown();
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("triggers notifyReadOnly on read-only document", () => {
    const notifyReadOnly = vi.fn();
    const config: MarkdownEditorEmphasisMarkShortcutConfig = {
      requestOpenEmphasisMarkDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly,
      notifyMultiLine: vi.fn()
    };
    const v = createView({ config, readOnly: true, selection: { anchor: 0, head: 5 } });
    const event = periodKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyReadOnly).toHaveBeenCalledOnce();
    expect(config.requestOpenEmphasisMarkDialog).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers notifyNoSelection on empty selection", () => {
    const notifyNoSelection = vi.fn();
    const config: MarkdownEditorEmphasisMarkShortcutConfig = {
      requestOpenEmphasisMarkDialog: vi.fn(),
      notifyNoSelection,
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
    const v = createView({ config, selection: { anchor: 2, head: 2 } });
    const event = periodKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyNoSelection).toHaveBeenCalledOnce();
    expect(config.requestOpenEmphasisMarkDialog).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers notifyMultiLine on multi-line selection", () => {
    const notifyMultiLine = vi.fn();
    const config: MarkdownEditorEmphasisMarkShortcutConfig = {
      requestOpenEmphasisMarkDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine
    };
    const v = createView({
      doc: "Line 1\nLine 2",
      config,
      selection: { anchor: 0, head: 10 }
    });
    const event = periodKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(notifyMultiLine).toHaveBeenCalledOnce();
    expect(config.requestOpenEmphasisMarkDialog).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("triggers requestOpenEmphasisMarkDialog for single-line selection", () => {
    const requestOpenEmphasisMarkDialog = vi.fn();
    const config: MarkdownEditorEmphasisMarkShortcutConfig = {
      requestOpenEmphasisMarkDialog,
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
    const v = createView({
      doc: "Hello world",
      config,
      selection: { anchor: 0, head: 5 }
    });
    const event = periodKeydown();
    v.contentDOM.dispatchEvent(event);

    expect(requestOpenEmphasisMarkDialog).toHaveBeenCalledWith({
      selectedText: "Hello",
      selection: { from: 0, to: 5 }
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing when composing (isComposing is true)", () => {
    const config: MarkdownEditorEmphasisMarkShortcutConfig = {
      requestOpenEmphasisMarkDialog: vi.fn(),
      notifyNoSelection: vi.fn(),
      notifyReadOnly: vi.fn(),
      notifyMultiLine: vi.fn()
    };
    const v = createView({ config, selection: { anchor: 0, head: 5 } });
    const event = periodKeydown({ isComposing: true });
    v.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(config.requestOpenEmphasisMarkDialog).not.toHaveBeenCalled();
  });
});
