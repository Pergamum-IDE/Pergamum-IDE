// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMarkdownToolbarShortcutKeymapExtension,
  type MarkdownEditorToolbarShortcutConfig
} from "../../src/renderer/editorMarkdownToolbarShortcuts";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  selection?: { anchor: number; head?: number };
  readOnly?: boolean;
  config: MarkdownEditorToolbarShortcutConfig | null;
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
        createMarkdownToolbarShortcutKeymapExtension({
          getConfig: () => input.config
        })
      ]
    })
  });
  return view;
}

function createConfig(
  overrides: Partial<MarkdownEditorToolbarShortcutConfig> = {}
): MarkdownEditorToolbarShortcutConfig {
  return {
    isEnabled: true,
    applyBold: vi.fn(),
    applyItalic: vi.fn(),
    applyStrikethrough: vi.fn(),
    requestOpenHeadingSelector: vi.fn(),
    requestOpenLinkDialog: vi.fn(),
    insertHorizontalRule: vi.fn(),
    insertCodeBlock: vi.fn(),
    ...overrides
  };
}

function keydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("createMarkdownToolbarShortcutKeymapExtension", () => {
  it("does nothing when config is null", () => {
    const v = createView({ config: null });
    const event = keydown({ key: "b" });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("does nothing when disabled (e.g. non-Markdown document)", () => {
    const config = createConfig({ isEnabled: false });
    const v = createView({ config });
    const event = keydown({ key: "b" });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(config.applyBold).not.toHaveBeenCalled();
  });

  it("does nothing on a read-only document", () => {
    const config = createConfig();
    const v = createView({ config, readOnly: true });
    const event = keydown({ key: "b" });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(config.applyBold).not.toHaveBeenCalled();
  });

  it("Ctrl+B calls applyBold", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "b" });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyBold).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+I calls applyItalic", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "i" });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyItalic).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+X calls applyStrikethrough", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "x", shiftKey: true });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyStrikethrough).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+X (without Shift) does not call applyStrikethrough", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "x" });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyStrikethrough).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("Ctrl+L calls requestOpenHeadingSelector", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "l" });
    v.contentDOM.dispatchEvent(event);
    expect(config.requestOpenHeadingSelector).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+L calls insertHorizontalRule", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "l", shiftKey: true });
    v.contentDOM.dispatchEvent(event);
    expect(config.insertHorizontalRule).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+Shift+B calls insertCodeBlock", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "b", shiftKey: true });
    v.contentDOM.dispatchEvent(event);
    expect(config.insertCodeBlock).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("Ctrl+L (without Shift) still calls requestOpenHeadingSelector, not insertHorizontalRule", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "l" });
    v.contentDOM.dispatchEvent(event);
    expect(config.requestOpenHeadingSelector).toHaveBeenCalledOnce();
    expect(config.insertHorizontalRule).not.toHaveBeenCalled();
  });

  it("Ctrl+B (without Shift) still calls applyBold, not insertCodeBlock", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "b" });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyBold).toHaveBeenCalledOnce();
    expect(config.insertCodeBlock).not.toHaveBeenCalled();
  });

  it("Ctrl+K calls requestOpenLinkDialog with the current selection text", () => {
    const config = createConfig();
    const v = createView({
      doc: "Hello world",
      config,
      selection: { anchor: 0, head: 5 }
    });
    const event = keydown({ key: "k" });
    v.contentDOM.dispatchEvent(event);
    expect(config.requestOpenLinkDialog).toHaveBeenCalledWith(
      "Hello",
      v.contentDOM
    );
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing when composing (isComposing is true)", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "b", isComposing: true });
    v.contentDOM.dispatchEvent(event);
    expect(config.applyBold).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores unrelated Ctrl+<key> combinations", () => {
    const config = createConfig();
    const v = createView({ config });
    const event = keydown({ key: "z" });
    v.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
