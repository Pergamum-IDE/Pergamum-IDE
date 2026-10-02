// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";

const CONTENT = "縦書きテストの本文テキストです。\n\n二段落目です。";

interface MountedSurface {
  container: HTMLDivElement;
  view: () => EditorView;
  editorScroller: () => HTMLElement;
  preview: () => HTMLElement;
  rerender: (
    overrides: Partial<React.ComponentProps<typeof EditorSurface>>
  ) => void;
}

let containers: HTMLDivElement[] = [];
let roots: Root[] = [];

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  containers = [];
  roots = [];
  vi.restoreAllMocks();
});

function baseProps(
  content: string,
  documentKey: string
): React.ComponentProps<typeof EditorSurface> {
  const doc = {
    ...createUntitledDocument(() => documentKey),
    content,
    savedContent: content
  };
  const noop = () => undefined;

  return {
    editor: createMarkdownCurrentEditor(doc),
    isDebugModeEnabled: true,
    isSyncScrollEditorToPreviewEnabled: true,
    isSyncScrollPreviewToEditorEnabled: true,
    isDoubleClickJumpToEditorEnabled: true,
    activeDocumentKey: documentKey,
    previewUpdateDelayMs: 0,
    newFileLineEndingFallback: "lf",
    expectedLineEnding: "lf",
    markerGlyph: "none",
    undoHistoryMinDepth: 100,
    selectionHighlightMode: "default",
    findGutterMarkers: false,
    whitespaceSettings: {
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    },
    normalizeUnicodeToNfcMatching: false,
    glossaryNearbySearchSettings: {
      unit: "paragraphs",
      characterDistance: 500,
      paragraphDistance: 2
    },
    projectRootPath: null,
    glossaryRefreshToken: 0,
    translate: (key, values) => t("ja", key, values),
    soundFeedback: { play: vi.fn() } as never,
    soundSettings: {
      enabled: false,
      dialog: { enabled: false },
      newline: { enabled: false },
      keypress: { enabled: false }
    },
    isProjectOwnedReadOnly: false,
    markdownEditorPreviewRatio: 0.5,
    onChangeMarkdownEditorPreviewRatio: noop,
    previewVisible: true,
    onChangeMarkdownContent: noop,
    onGlossarySelectionShortcut: noop,
    onParagraphIndentControllerChange: noop,
    onViewStateControllerChange: noop,
    onViewStateSnapshot: noop,
    onViewStateDirty: noop,
    restoreActiveEditorViewState: null,
    onRestoreActiveEditorViewStateApplied: noop,
    markdownEditorFocusRequest: null,
    onMarkdownEditorFocusRequestApplied: noop,
    pendingMarkdownSelection: null,
    onPendingMarkdownSelectionApplied: noop,
    documentOpenId: null,
    onDocumentOpenPreviewRenderStarted: noop,
    onDocumentOpenPreviewRendered: noop,
    onDocumentOpenPreviewDomCommitted: noop,
    onDocumentOpenPreviewDecorationCompleted: noop,
    onDocumentOpenPreviewFrameObserved: noop,
    onViewportChanged: noop
  } as React.ComponentProps<typeof EditorSurface>;
}

function mount(
  content: string,
  documentKey: string,
  overrides: Partial<React.ComponentProps<typeof EditorSurface>> = {}
): MountedSurface {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  containers.push(container);
  roots.push(root);

  let currentProps: React.ComponentProps<typeof EditorSurface> = {
    ...baseProps(content, documentKey),
    ...overrides
  };

  act(() => {
    root.render(<EditorSurface {...currentProps} />);
  });

  return {
    container,
    view: () => {
      const cmContent = container.querySelector<HTMLElement>(".cm-content");
      const view = cmContent ? EditorView.findFromDOM(cmContent) : null;
      if (!view) {
        throw new Error("expected a mounted CodeMirror EditorView");
      }
      return view;
    },
    editorScroller: () => {
      const el = container.querySelector<HTMLElement>(".cm-scroller");
      if (!el) {
        throw new Error("expected a mounted .cm-scroller element");
      }
      return el;
    },
    preview: () => {
      const el = container.querySelector<HTMLElement>("article.preview");
      if (!el) {
        throw new Error("expected a mounted article.preview container");
      }
      return el;
    },
    rerender: (nextOverrides) => {
      currentProps = { ...currentProps, ...nextOverrides };
      act(() => {
        root.render(<EditorSurface {...currentProps} />);
      });
    }
  };
}

function stubPreviewScrollLeftLayout(
  surface: MountedSurface,
  options: { scrollWidth?: number; clientWidth?: number; clientHeight?: number } = {}
): void {
  const preview = surface.preview();
  const scrollWidth = options.scrollWidth ?? 2000;
  const clientWidth = options.clientWidth ?? 500;

  let currentScrollLeft = 0;
  Object.defineProperty(preview, "scrollLeft", {
    get() {
      return currentScrollLeft;
    },
    set(v: number) {
      currentScrollLeft = v;
    },
    configurable: true
  });
  Object.defineProperty(preview, "scrollWidth", {
    value: scrollWidth,
    configurable: true
  });
  Object.defineProperty(preview, "clientWidth", {
    value: clientWidth,
    configurable: true
  });
}

type PreviewScrollSyncLogInput = {
  level: string;
  event: string;
  details?: Record<string, unknown>;
};

function dispatch(target: EventTarget, event: Event): void {
  act(() => {
    target.dispatchEvent(event);
  });
}

async function flushAnimationFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

function scrollEvent(): Event {
  return new Event("scroll", { bubbles: false, cancelable: false });
}

function dispatchWheel(target: EventTarget, deltaY: number): WheelEvent {
  const event = new WheelEvent("wheel", {
    deltaY,
    deltaMode: 0,
    bubbles: true,
    cancelable: true
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe("Issue #677: vertical preview wheel scroll restoration", () => {
  it("restores vertical wheel scrollLeft handler when switching previewRenderer from horizontal (markdown) to narouVertical", () => {
    // 1. Mount with horizontal renderer ("markdown")
    const surface = mount(CONTENT, "doc-wheel-677", {
      previewRenderer: "markdown"
    });
    stubPreviewScrollLeftLayout(surface);

    expect(surface.preview().scrollLeft).toBe(0);

    // 2. Switch to vertical renderer ("narouVertical") without unmounting preview container
    surface.rerender({
      previewRenderer: "narouVertical"
    });

    // 3. Dispatch vertical wheel event on preview container (rotate wheel forward, deltaY = 100)
    dispatchWheel(surface.preview(), 100);

    // 4. In vertical preview, scrolling down (deltaY = 100) moves scrollLeft leftwards (-100)
    // On current un-fixed code: stale closure in handlePreviewVerticalWheel holds previewRenderer="markdown",
    // so isVerticalPreviewRenderer returns false and scrollLeft stays 0!
    expect(surface.preview().scrollLeft).not.toBe(0);
    expect(surface.preview().scrollLeft).toBe(-100);
  });

  describe("Additional regression cases", () => {
    it.each(["narouVertical", "kakuyomuVertical", "aozoraVertical"] as const)(
      "A. converts wheel events to scrollLeft when switching to vertical renderer: %s",
      (renderer) => {
        const surface = mount(CONTENT, "doc-wheel-switch-vertical", {
          previewRenderer: "markdown"
        });
        stubPreviewScrollLeftLayout(surface);

        surface.rerender({
          previewRenderer: renderer
        });

        dispatchWheel(surface.preview(), 100);
        expect(surface.preview().scrollLeft).toBe(-100);
      }
    );

    it("B. restores default horizontal wheel behavior when switching from vertical back to horizontal", () => {
      // 1. Start on vertical
      const surface = mount(CONTENT, "doc-wheel-vert-to-horiz", {
        previewRenderer: "narouVertical"
      });
      stubPreviewScrollLeftLayout(surface);

      dispatchWheel(surface.preview(), 100);
      expect(surface.preview().scrollLeft).toBe(-100);

      // 2. Reset scrollLeft and switch back to horizontal ("markdown")
      (surface.preview() as unknown as { scrollLeft: number }).scrollLeft = 0;
      surface.rerender({
        previewRenderer: "markdown"
      });

      // 3. Dispatch wheel event
      const event = dispatchWheel(surface.preview(), 100);

      // Vertical wheel scrollLeft override should NOT trigger for horizontal renderer
      expect(surface.preview().scrollLeft).toBe(0);
      expect(event.defaultPrevented).toBe(false);
    });

    it("C. supports vertical wheel scrollLeft when mounted directly with vertical renderer from the start", () => {
      const surface = mount(CONTENT, "doc-wheel-direct-vertical", {
        previewRenderer: "kakuyomuVertical"
      });
      stubPreviewScrollLeftLayout(surface);

      dispatchWheel(surface.preview(), 100);
      expect(surface.preview().scrollLeft).toBe(-100);
    });

    it.each(["narouVertical", "kakuyomuVertical", "aozoraVertical"] as const)(
      "D. triggers vertical preview -> editor sync after renderer switch: %s",
      async (renderer) => {
        const events: PreviewScrollSyncLogInput[] = [];
        const surface = mount(CONTENT, `doc-sync-switch-${renderer}`, {
          previewRenderer: "markdown",
          onPreviewScrollSyncEvent: (input) => events.push(input)
        });
        stubPreviewScrollLeftLayout(surface, { scrollWidth: 2000, clientHeight: 500 });

        // Switch to vertical renderer without unmounting container
        surface.rerender({ previewRenderer: renderer });

        // User wheels on preview pane -> leader becomes "preview", scrollLeft becomes -500
        dispatchWheel(surface.preview(), 500);
        dispatch(surface.preview(), scrollEvent());
        await flushAnimationFrame();

        // Check previewToEditor.sampled log
        const sampled = events.find(
          (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
        );
        expect(sampled).toBeDefined();
        // On fixed code, vertical computeSourceLineForVerticalScrollLeft runs and previewScrollTop detail is scrollLeft (-500)
        expect(sampled?.details?.previewScrollTop).toBe(-500);
      }
    );
  });
});
