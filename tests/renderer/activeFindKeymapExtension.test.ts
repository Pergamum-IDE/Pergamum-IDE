// @vitest-environment happy-dom
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { searchPanelOpen } from "@codemirror/search";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createActiveFindKeymapExtension,
  type MarkdownEditorActiveFindConfig
} from "../../src/renderer/find/activeFindKeymapExtension";
import { createMarkdownEditorBaseSetup } from "../../src/renderer/markdownEditorCodeMirrorSetup";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function createView(input: {
  doc?: string;
  selection?: { anchor: number; head: number };
  config: MarkdownEditorActiveFindConfig | null;
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
        createActiveFindKeymapExtension({ getConfig: () => input.config })
      ]
    })
  });
  return view;
}

function findKeydown(overrides: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    code: "KeyF",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true,
    ...overrides
  });
}

describe("createActiveFindKeymapExtension (#424 Slice 1)", () => {
  it("calls requestOpen and preventDefaults Ctrl+F when a config is supplied", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    const event = findKeydown();
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("also handles Cmd+F (metaKey) for macOS", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    const event = findKeydown({ ctrlKey: false, metaKey: true });
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("stays inert when no config is supplied", () => {
    const testView = createView({ config: null });

    const event = findKeydown();
    testView.contentDOM.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("does not fire while an IME composition is in progress", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    const event = findKeydown({ isComposing: true });
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
    const during = findKeydown();
    testView.contentDOM.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(false);
    expect(requestOpen).not.toHaveBeenCalled();

    testView.contentDOM.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true })
    );
    const after = findKeydown();
    testView.contentDOM.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores Ctrl+Shift+F and Ctrl+Alt+F", () => {
    const requestOpen = vi.fn();
    const testView = createView({ config: { requestOpen } });

    testView.contentDOM.dispatchEvent(findKeydown({ shiftKey: true }));
    testView.contentDOM.dispatchEvent(findKeydown({ altKey: true }));

    expect(requestOpen).not.toHaveBeenCalled();
  });

  it("seeds the search box with a single-line selection", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "the quick brown fox",
      selection: { anchor: 4, head: 9 },
      config: { requestOpen }
    });

    testView.contentDOM.dispatchEvent(findKeydown());

    expect(requestOpen).toHaveBeenCalledWith("quick");
  });

  it("passes an empty seed for an empty or multi-line selection", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "line one\nline two",
      selection: { anchor: 0, head: 12 },
      config: { requestOpen }
    });

    testView.contentDOM.dispatchEvent(findKeydown());

    expect(requestOpen).toHaveBeenCalledWith("");
  });
});

describe("Ctrl+F no longer opens the native CodeMirror search panel (#424)", () => {
  it("leaves searchPanelOpen false and routes to the Pergamum panel", () => {
    const requestOpen = vi.fn();
    const testView = createView({
      doc: "hello world",
      config: { requestOpen },
      withBaseSetup: true
    });

    testView.contentDOM.dispatchEvent(findKeydown());

    expect(searchPanelOpen(testView.state)).toBe(false);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("the base setup alone never opens the native panel from Ctrl+F", () => {
    const testView = createView({
      doc: "hello world",
      config: null,
      withBaseSetup: true
    });

    testView.contentDOM.dispatchEvent(findKeydown());

    expect(searchPanelOpen(testView.state)).toBe(false);
  });

  it("keeps unrelated searchKeymap bindings (Mod-d selectNextOccurrence)", () => {
    const testView = createView({
      doc: "foo foo foo",
      selection: { anchor: 0, head: 3 },
      config: null,
      withBaseSetup: true
    });

    testView.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "d",
        code: "KeyD",
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    );

    expect(testView.state.selection.ranges.length).toBe(2);
  });
});
