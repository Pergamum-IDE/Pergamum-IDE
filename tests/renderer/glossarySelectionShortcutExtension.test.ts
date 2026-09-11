// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGlossarySelectionShortcutKeymapExtension,
  type MarkdownEditorGlossarySelectionShortcutConfig
} from "../../src/renderer/glossarySelectionShortcutExtension";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  selection?: { anchor: number; head: number };
  config: MarkdownEditorGlossarySelectionShortcutConfig | null;
  withBaseSetup?: boolean;
}): EditorView {
  const doc = input.doc ?? "";
  view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc,
      selection: input.selection
        ? EditorSelection.single(input.selection.anchor, input.selection.head)
        : undefined,
      extensions: [
        ...(input.withBaseSetup
          ? createMarkdownEditorBaseSetup({ undoHistoryMinDepth: 100 })
          : []),
        createGlossarySelectionShortcutKeymapExtension({
          getConfig: () => input.config
        })
      ]
    })
  });
  return view;
}

function glossaryKeydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "g",
    code: "KeyG",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("createGlossarySelectionShortcutKeymapExtension (#436 Slice 12)", () => {
  it("Ctrl+G calls requestOpen with the raw selected text and preventDefaults", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "the quick brown fox",
      selection: { anchor: 4, head: 9 },
      config: { requestOpen }
    });

    const event = glossaryKeydown();
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledWith("quick");
  });

  it("also handles Cmd+G (metaKey) for macOS", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "hello",
      config: { requestOpen }
    });

    const event = glossaryKeydown({ ctrlKey: false, metaKey: true });
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("passes an EMPTY string for an empty selection — no normalization here", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "hello world",
      config: { requestOpen }
    });

    testView.contentDOM.dispatchEvent(glossaryKeydown());

    expect(requestOpen).toHaveBeenCalledWith("");
  });

  it("passes a MULTI-LINE selection through VERBATIM — normalization is the caller's job", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "line one\nline two",
      selection: { anchor: 0, head: 17 },
      config: { requestOpen }
    });

    testView.contentDOM.dispatchEvent(glossaryKeydown());

    expect(requestOpen).toHaveBeenCalledWith("line one\nline two");
  });

  it("stays inert when no config is supplied (e.g. the Glossary description field)", () => {
    const testView = createView({ config: null });

    const event = glossaryKeydown();
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not fire while an IME composition is in progress", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    const event = glossaryKeydown({ isComposing: true });
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(requestOpen).not.toHaveBeenCalled();
  });

  it("does not fire between compositionstart and compositionend", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    testView.contentDOM.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true })
    );
    const during = glossaryKeydown();
    testView.contentDOM.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(false);
    expect(requestOpen).not.toHaveBeenCalled();

    testView.contentDOM.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true })
    );
    const after = glossaryKeydown();
    testView.contentDOM.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores Ctrl+Shift+G / Ctrl+Alt+G / Ctrl+Cmd+G", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    testView.contentDOM.dispatchEvent(glossaryKeydown({ shiftKey: true }));
    testView.contentDOM.dispatchEvent(glossaryKeydown({ altKey: true }));
    testView.contentDOM.dispatchEvent(
      glossaryKeydown({ metaKey: true }) // ctrlKey AND metaKey both true
    );

    expect(requestOpen).not.toHaveBeenCalled();
  });

  it("does not conflict with the base setup's Mod-Alt-g gotoLine / Mod-g stripped from searchKeymap", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "hello world",
      config: { requestOpen },
      withBaseSetup: true
    });

    testView.contentDOM.dispatchEvent(glossaryKeydown());

    expect(requestOpen).toHaveBeenCalledTimes(1);
  });
});
