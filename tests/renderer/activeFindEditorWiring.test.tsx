// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MarkdownEditor,
  type MarkdownEditorParagraphIndentController
} from "../../src/renderer/MarkdownEditor";
import type { MarkdownEditorActiveFindConfig } from "../../src/renderer/find/activeFindKeymapExtension";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

function mount(props: Partial<React.ComponentProps<typeof MarkdownEditor>>) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      React.createElement(MarkdownEditor, {
        value: "",
        onChange: () => undefined,
        ...props
      })
    );
  });
  return {
    rerender: (next: Partial<React.ComponentProps<typeof MarkdownEditor>>) =>
      act(() => {
        root!.render(
          React.createElement(MarkdownEditor, {
            value: "",
            onChange: () => undefined,
            ...next
          })
        );
      }),
    contentDom: () => container!.querySelector(".cm-content") as HTMLElement
  };
}

function findKeydown(): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: "f",
    code: "KeyF",
    ctrlKey: true,
    isComposing: false,
    bubbles: true,
    cancelable: true
  });
}

describe("MarkdownEditor activeFind prop wiring (#424 Slice 1)", () => {
  it("routes Ctrl+F to the supplied config's requestOpen and preventDefaults it", () => {
    const requestOpen = vi.fn();
    const config: MarkdownEditorActiveFindConfig = { requestOpen };
    const { contentDom } = mount({ activeFind: config });

    const event = findKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });

  it("leaves Ctrl+F inert when no activeFind config is supplied (e.g. Glossary description field)", () => {
    const { contentDom } = mount({ contextSurface: "glossaryDescription" });

    const event = findKeydown();
    act(() => {
      contentDom().dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
  });

  it("picks up a live activeFind prop change (undefined -> config) without a remount", () => {
    const { contentDom, rerender } = mount({});

    const first = findKeydown();
    act(() => {
      contentDom().dispatchEvent(first);
    });
    expect(first.defaultPrevented).toBe(false);

    const requestOpen = vi.fn();
    rerender({ activeFind: { requestOpen } });

    const second = findKeydown();
    act(() => {
      contentDom().dispatchEvent(second);
    });
    expect(second.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledTimes(1);
  });
});

describe("MarkdownEditor activeFindHighlight prop wiring (#424 Slice 2)", () => {
  function marks(): NodeListOf<Element> {
    return container!.querySelectorAll(".cm-pergamum-findMatch");
  }

  it("paints a highlight span per range and marks the active one", () => {
    const { rerender } = mount({ value: "foo foo foo" });
    rerender({
      value: "foo foo foo",
      activeFindHighlight: {
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 },
          { from: 8, to: 11 }
        ],
        activeIndex: 1
      }
    });

    expect(marks()).toHaveLength(3);
    expect(
      container!.querySelectorAll(".cm-pergamum-findMatch-active")
    ).toHaveLength(1);
  });

  it("clears every highlight when the prop goes back to null", () => {
    const { rerender } = mount({
      value: "foo foo",
      activeFindHighlight: {
        matches: [
          { from: 0, to: 3 },
          { from: 4, to: 7 }
        ],
        activeIndex: 0
      }
    });
    expect(marks()).toHaveLength(2);

    rerender({ value: "foo foo", activeFindHighlight: null });
    expect(marks()).toHaveLength(0);
  });

  it("does not carry highlights across a document switch", () => {
    const { rerender } = mount({
      value: "foo foo",
      documentKey: "doc-a",
      activeFindHighlight: {
        matches: [{ from: 0, to: 3 }],
        activeIndex: 0
      }
    });
    expect(marks()).toHaveLength(1);

    // switch to another document; the panel would also close and drop the prop
    rerender({
      value: "bar bar",
      documentKey: "doc-b",
      activeFindHighlight: null
    });
    expect(marks()).toHaveLength(0);

    // switching back must NOT restore the stale highlight
    rerender({
      value: "foo foo",
      documentKey: "doc-a",
      activeFindHighlight: null
    });
    expect(marks()).toHaveLength(0);
  });
});

describe("EditorSurface active Find panel wiring (#424 Slice 1)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("renders the Pergamum Find panel above the MarkdownEditor when open", () => {
    const headerIndex = source.indexOf('translate("workspace.editor")');
    // the real editor element, not <MarkdownEditorSurface>
    const editorIndex = source.indexOf("<MarkdownEditor\n");
    // the JSX element, not `useState<ActiveFindPanelMode>`
    const panelIndex = source.indexOf("<ActiveFindPanel\n");
    expect(headerIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeGreaterThan(headerIndex);
    expect(panelIndex).toBeLessThan(editorIndex);
    expect(source).toContain("{findOpen ? (");
  });

  it("threads the Find config + navigation + focus-return + highlight props into MarkdownEditor", () => {
    expect(source).toContain("activeFind={activeFindConfig}");
    expect(source).toContain("extraPendingSelection={findExtraSelection}");
    expect(source).toContain(
      "onExtraPendingSelectionApplied={handleFindExtraSelectionApplied}"
    );
    expect(source).toContain("extraFocusRequest={findFocusRequest}");
    expect(source).toContain("activeFindHighlight={activeFindHighlight}");
  });

  it("searches the active buffer via the shared matcher and reuses the selection-jump path", () => {
    expect(source).toContain('from "./find/activeDocumentFind"');
    expect(source).toContain(
      "evaluateActiveDocumentFind(content, findQuery, findOptions)"
    );
    expect(source).toContain("resolveActiveFindCursor(");
    // navigation jumps must not steal focus out of the search box
    expect(source).toContain("focusEditor: false");
  });

  it("#424 Slice 2: options exclusivity, index clamp, and mark-all highlight are all local", () => {
    expect(source).toContain("toggleActiveDocumentFindOption(");
    expect(source).toContain("clampActiveFindIndex(current, findMatchCount)");
    // mark-all set is only non-null for an open panel with a valid match
    const highlightMemo = source.slice(
      source.indexOf("const activeFindHighlight = useMemo"),
      source.indexOf("const activeFindHighlight = useMemo") + 500
    );
    expect(highlightMemo).toContain("!findOpen || !findMarkAll || findMatchCount === 0");
  });

  it("closes the panel + resets inputs on a genuine tab switch and returns focus on close", () => {
    const closeEffect = source.slice(
      source.indexOf("// A genuine tab switch closes the panel"),
      source.indexOf("// A genuine tab switch closes the panel") + 400
    );
    expect(closeEffect).toContain("setFindOpen(false)");
    expect(closeEffect).toContain(
      "setFindOptions(DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS)"
    );
    expect(closeEffect).toContain("}, [documentKey]);");

    const closeHandler = source.slice(
      source.indexOf("const handleFindClose"),
      source.indexOf("const handleFindClose") + 320
    );
    expect(closeHandler).toContain("setFindOpen(false)");
    expect(closeHandler).toContain("setFindFocusRequest({");
  });

  it("does not open the project-wide Search pane", () => {
    const findRegion = source.slice(
      source.indexOf("#424: active-document Find panel"),
      source.indexOf("handleFindExtraSelectionApplied")
    );
    expect(findRegion).not.toContain("setSidebarMode");
    expect(findRegion).not.toContain("openProjectSearch");
    expect(findRegion).not.toContain("SearchSidebar");
  });
});

describe("EditorSurface replace-current wiring (#424 Slice 3)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("captures the active editor's replace controller by wrapping the bubble-up callback", () => {
    expect(source).toContain("handleParagraphIndentControllerChange");
    expect(source).toContain("findReplaceControllerRef.current = controller");
    expect(source).toContain("onParagraphIndentControllerChange(controller)");
    expect(source).toContain(
      "onParagraphIndentControllerChange={\n            handleParagraphIndentControllerChange\n          }"
    );
  });

  it("replace-current re-evaluates against the LIVE buffer and dispatches ONE input.replace transaction", () => {
    const handler = source.slice(
      source.indexOf("const handleFindReplaceCurrent"),
      source.indexOf("const handleFindClose")
    );
    expect(handler).toContain("controller.getBufferText() ?? content");
    expect(handler).toContain("evaluateActiveDocumentFind(");
    expect(handler).toContain("buildActiveDocumentReplacement(");
    expect(handler).toContain("controller.applyReplaceInBufferChanges([");
    expect(handler).toContain("resolveActiveFindIndexAfterReplacement(");
    // no disk save, no project-wide replace
    expect(handler).not.toContain("saveProjectDocument");
    expect(handler).not.toContain("writeMarkdown");
    expect(handler).not.toContain("applyProjectReplace");
  });

  it("gates replace-current on read-only / regex / template / controller / a live match", () => {
    const gate = source.slice(
      source.indexOf("const findReplaceCurrentEnabled ="),
      source.indexOf("const findReplaceCurrentEnabled =") + 400
    );
    expect(gate).toContain('findMode === "replace"');
    expect(gate).toContain("!readOnly");
    expect(gate).toContain("findControllerReady");
    expect(gate).toContain("findRegexError === null");
    expect(gate).toContain("findTemplateError === null");
    expect(gate).toContain("findMatchCount > 0");
    expect(gate).toContain("findActiveIndex !== null");
  });
});

describe("MarkdownEditor replace controller for #424 Slice 3", () => {
  function captureController() {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    const { contentDom } = mount({
      value: "alpha beta alpha",
      onParagraphIndentControllerChange: (next) => {
        controller = next;
      }
    });
    return { controller: () => controller!, contentDom };
  }

  function ctrlZ(): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
  }

  it("getBufferText returns the live document text", () => {
    const { controller } = captureController();
    expect(controller().getBufferText()).toBe("alpha beta alpha");
  });

  it("applyReplaceInBufferChanges replaces one range and Undo restores it (one step)", () => {
    const { controller, contentDom } = captureController();

    act(() => {
      controller().applyReplaceInBufferChanges([
        { from: 0, to: 5, insert: "OMEGA" }
      ]);
    });
    expect(controller().getBufferText()).toBe("OMEGA beta alpha");

    act(() => {
      contentDom().dispatchEvent(ctrlZ());
    });
    expect(controller().getBufferText()).toBe("alpha beta alpha");
  });
});

describe("read-only active editor Find shortcuts (#424 Slice 3 dogfood)", () => {
  function findKeydownOn(): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      ctrlKey: true,
      isComposing: false,
      bubbles: true,
      cancelable: true
    });
  }

  it("makes the read-only editor content focusable (tabindex) so its keymap can fire", () => {
    const { contentDom } = mount({ value: "text", readOnly: true });
    expect(contentDom().getAttribute("tabindex")).toBe("0");
    expect(contentDom().getAttribute("contenteditable")).toBe("false");
  });

  it("a writable editor is unchanged (CodeMirror manages focusability)", () => {
    const { contentDom } = mount({ value: "text", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
    expect(contentDom().getAttribute("contenteditable")).toBe("true");
  });

  it("reconfigures the tabindex when readOnly flips at runtime", () => {
    const { contentDom, rerender } = mount({ value: "t", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
    rerender({ value: "t", readOnly: true });
    expect(contentDom().getAttribute("tabindex")).toBe("0");
    rerender({ value: "t", readOnly: false });
    expect(contentDom().getAttribute("tabindex")).not.toBe("0");
  });

  it("Ctrl+F still opens the Find panel on a read-only editor (no mutation possible)", () => {
    const requestOpen = vi.fn();
    const { contentDom } = mount({
      value: "text",
      readOnly: true,
      activeFind: { requestOpen }
    });
    const event = findKeydownOn();
    act(() => {
      contentDom().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(requestOpen).toHaveBeenCalledWith("search", "");
  });

  it("applyReplaceInBufferChanges does not mutate a read-only buffer", () => {
    let controller: MarkdownEditorParagraphIndentController | null = null;
    mount({
      value: "keep this",
      readOnly: true,
      onParagraphIndentControllerChange: (c) => {
        controller = c;
      }
    });
    const applied = controller!.applyReplaceInBufferChanges([
      { from: 0, to: 4, insert: "NOPE" }
    ]);
    expect(applied).toBe(false);
    expect(controller!.getBufferText()).toBe("keep this");
  });
});

describe("Ctrl+F native search panel suppression wiring (#424 Slice 1)", () => {
  const setupSource = readFileSync(
    "src/renderer/markdownEditorCodeMirrorSetup.ts",
    "utf8"
  );

  it("filters the panel-opener keys out of searchKeymap but keeps the rest", () => {
    expect(setupSource).toContain('"Mod-f"');
    expect(setupSource).toContain('"F3"');
    expect(setupSource).toContain('"Mod-g"');
    expect(setupSource).toContain("searchKeymapWithoutPanelOpeners");
    expect(setupSource).toContain("...searchKeymapWithoutPanelOpeners");
    // the raw spread is gone
    expect(setupSource).not.toContain("...searchKeymap,");
  });
});
