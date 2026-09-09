// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "../../src/renderer/MarkdownEditor";
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

describe("EditorSurface active Find panel wiring (#424 Slice 1)", () => {
  const source = readFileSync("src/renderer/EditorSurface.tsx", "utf8");

  it("renders the Pergamum Find panel above the MarkdownEditor when open", () => {
    const headerIndex = source.indexOf('translate("workspace.editor")');
    // the real editor element, not <MarkdownEditorSurface>
    const editorIndex = source.indexOf("<MarkdownEditor\n");
    const panelIndex = source.indexOf("<ActiveFindPanel");
    expect(headerIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeGreaterThan(headerIndex);
    expect(panelIndex).toBeLessThan(editorIndex);
    expect(source).toContain("{findOpen ? (");
  });

  it("threads the Find config + navigation + focus-return props into MarkdownEditor", () => {
    expect(source).toContain("activeFind={activeFindConfig}");
    expect(source).toContain("extraPendingSelection={findExtraSelection}");
    expect(source).toContain(
      "onExtraPendingSelectionApplied={handleFindExtraSelectionApplied}"
    );
    expect(source).toContain("extraFocusRequest={findFocusRequest}");
  });

  it("searches the active buffer via the shared matcher and reuses the selection-jump path", () => {
    expect(source).toContain(
      'from "./find/activeDocumentFind"'
    );
    expect(source).toContain("runActiveDocumentFind(content, findQuery)");
    expect(source).toContain("resolveActiveFindCursor(");
    // navigation jumps must not steal focus out of the search box
    expect(source).toContain("focusEditor: false");
  });

  it("closes the panel on a genuine tab switch and returns focus on close", () => {
    const closeEffect = source.slice(
      source.indexOf("// A genuine tab switch closes the panel"),
      source.indexOf("// A genuine tab switch closes the panel") + 320
    );
    expect(closeEffect).toContain("setFindOpen(false)");
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
      source.indexOf("#424 Slice 1: active-document Find panel"),
      source.indexOf("handleFindExtraSelectionApplied")
    );
    expect(findRegion).not.toContain("setSidebarMode");
    expect(findRegion).not.toContain("openProjectSearch");
    expect(findRegion).not.toContain("SearchSidebar");
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
