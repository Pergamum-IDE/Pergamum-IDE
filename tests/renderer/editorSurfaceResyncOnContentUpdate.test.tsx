// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";

const INITIAL_CONTENT = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n");

// Insert 10 extra paragraphs at the top of INITIAL_CONTENT
const ADDED_TOP_CONTENT = Array.from({ length: 10 }, (_, i) => `Added Top ${i + 1}.`).join("\n\n") + "\n\n" + INITIAL_CONTENT;

type PreviewScrollSyncLogInput = {
  level: string;
  event: string;
  details?: Record<string, unknown>;
};

interface MountedSurface {
  container: HTMLDivElement;
  events: PreviewScrollSyncLogInput[];
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

  const events: PreviewScrollSyncLogInput[] = [];
  let currentProps: React.ComponentProps<typeof EditorSurface> = {
    ...baseProps(content, documentKey),
    onPreviewScrollSyncEvent: (input) => events.push(input),
    ...overrides
  };

  act(() => {
    root.render(<EditorSurface {...currentProps} />);
  });

  return {
    container,
    events,
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

function rect(top: number): DOMRect {
  return {
    top,
    left: 0,
    bottom: top + 20,
    right: 800,
    width: 800,
    height: 20,
    x: 0,
    y: top,
    toJSON: () => undefined
  } as DOMRect;
}

function stubPreviewLayout(
  surface: MountedSurface,
  blockOffsetStep: number = 100
): void {
  const preview = surface.preview();

  Object.defineProperty(preview, "scrollTop", {
    get() {
      return (this as unknown as { _scrollTop?: number })._scrollTop ?? 0;
    },
    set(v: number) {
      (this as unknown as { _scrollTop?: number })._scrollTop = v;
    },
    configurable: true
  });
  Object.defineProperty(preview, "scrollHeight", {
    get() {
      const blocks = preview.querySelectorAll("[data-source-line]");
      return blocks.length * blockOffsetStep + 100;
    },
    configurable: true
  });
  Object.defineProperty(preview, "clientHeight", {
    value: 400,
    configurable: true
  });

  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this === preview) {
      return rect(0);
    }
    if (preview.contains(this) && this.hasAttribute("data-source-line")) {
      const blocks = Array.from(preview.querySelectorAll("[data-source-line]"));
      const index = blocks.indexOf(this);
      if (index >= 0) {
        const absoluteOffset = index * blockOffsetStep;
        const currentScroll = (preview as unknown as { _scrollTop?: number })._scrollTop ?? 0;
        return rect(absoluteOffset - currentScroll);
      }
    }
    return rect(0);
  });
}

function stubEditorScroller(surface: MountedSurface, scrollTop: number = 500): void {
  const scroller = surface.editorScroller();
  Object.defineProperty(scroller, "scrollTop", { value: scrollTop, writable: true, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: 5000, configurable: true });
  Object.defineProperty(scroller, "clientHeight", { value: 500, configurable: true });
}

function mockTopSourceLine(surface: MountedSurface, getLine: () => number): void {
  const v = surface.view();
  vi.spyOn(v, "lineBlockAtHeight").mockImplementation(() => {
    const targetLine = getLine();
    const line = v.state.doc.line(Math.min(targetLine, v.state.doc.lines));
    return {
      from: line.from,
      to: line.to,
      top: 0,
      height: 20
    } as never;
  });
}

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

describe("Issue #676: resync preview scroll position after preview content/HTML regeneration", () => {
  it("resynchronizes preview scrollTop to current editor line after inserting content above current viewport without editor scroll event", async () => {
    let currentTargetLine = 21; // Line 21 corresponds to Paragraph 11 (index 10 in DOM -> offset 1000)

    const surface = mount(INITIAL_CONTENT, "doc-resync-676");
    stubEditorScroller(surface, 500);
    stubPreviewLayout(surface);
    mockTopSourceLine(surface, () => currentTargetLine);

    // Initial editor scroll sync moves preview scrollTop to 1000 (matching line 21 / Paragraph 11)
    dispatch(surface.editorScroller(), new Event("wheel", { bubbles: true }));
    dispatch(surface.editorScroller(), scrollEvent());
    await flushAnimationFrame();

    expect(surface.preview().scrollTop).toBe(1000);

    // 2. Insert 10 paragraphs at top of editor content (20 new lines added above line 21).
    // In new document, line 21 of old content becomes line 41 (Paragraph 21, block index 20 in new DOM -> offset 2000).
    currentTargetLine = 41;

    const docWithAddedTop = {
      ...createUntitledDocument(() => "doc-resync-676"),
      content: ADDED_TOP_CONTENT,
      savedContent: ADDED_TOP_CONTENT
    };

    // Re-render EditorSurface with new content (triggers previewHtml update and onPreviewContentCommitted)
    surface.rerender({
      editor: createMarkdownCurrentEditor(docWithAddedTop)
    });
    mockTopSourceLine(surface, () => currentTargetLine);

    await flushAnimationFrame();

    // Verify preview layout resynced after htmlRegenerated: scrollTop should now be 2000 (matching line 41)
    // On current code: NO resync pass runs on htmlRegenerated, so preview.scrollTop remains old offset 1000!
    expect(surface.preview().scrollTop).toBe(2000);
  });
});
