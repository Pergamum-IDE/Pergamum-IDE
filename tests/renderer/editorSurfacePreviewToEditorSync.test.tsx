// @vitest-environment happy-dom
//
// #505 Phase 1, issue Design §2-§5 — real end-to-end behavior tests for the
// NEW preview -> editor scroll sync direction, wired into the actual
// EditorSurface component tree. happy-dom has no real layout engine, so
// `getBoundingClientRect()` / `scrollHeight` / `clientHeight` are stubbed on
// the REAL mounted preview container and its REAL rendered block elements —
// same technique as tests/renderer/previewToEditorTargetLine.test.ts, just
// exercised through the full component wiring here instead of the pure
// function directly.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";

// 9 paragraphs, lines 1, 3, 5, 7, 9, 11, 13, 15, 17 (blank line between each).
const DOC_CONTENT = Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join(
  "\n\n"
);

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

function wheelEvent(): Event {
  return new Event("wheel", { bubbles: true, cancelable: true });
}

function scrollEvent(): Event {
  return new Event("scroll", { bubbles: false, cancelable: false });
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

/**
 * Stubs the real mounted preview container + its 9 real paragraph blocks
 * (lines 1,3,5,...,17) at absolute content offsets `0, 100, 200, ..., 800`,
 * and sets `scrollTop`/`scrollHeight`/`clientHeight` for a given scroll
 * position, matching the getLiveElementOffset stubbing convention.
 */
function stubPreviewLayout(
  surface: MountedSurface,
  scrollTop: number,
  options: { scrollHeight?: number; clientHeight?: number } = {}
): void {
  const preview = surface.preview();
  const scrollHeight = options.scrollHeight ?? 820;
  const clientHeight = options.clientHeight ?? 400;

  Object.defineProperty(preview, "scrollTop", {
    value: scrollTop,
    writable: true,
    configurable: true
  });
  Object.defineProperty(preview, "scrollHeight", {
    value: scrollHeight,
    configurable: true
  });
  Object.defineProperty(preview, "clientHeight", {
    value: clientHeight,
    configurable: true
  });
  vi.spyOn(preview, "getBoundingClientRect").mockReturnValue(rect(0));

  const blocks = Array.from(preview.querySelectorAll("p[data-source-line]"));
  blocks.forEach((el, index) => {
    const absoluteOffset = index * 100;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue(
      rect(absoluteOffset - scrollTop)
    );
  });
}

describe("EditorSurface preview -> editor scroll sync (#505 Phase 1, issue Design §2-§5)", () => {
  it("scrolling the preview (as leader) moves the editor to the target block's line", async () => {
    const surface = mount(DOC_CONTENT, "doc-basic-sync");
    dispatch(surface.preview(), wheelEvent()); // preview becomes leader
    stubPreviewLayout(surface, 250); // between line-5 block (200) and line-7 block (300)

    dispatch(surface.preview(), scrollEvent());
    await flushAnimationFrame();

    expect(surface.view().state.selection.main.head).toBeDefined();
    const topLine = surface.view().lineBlockAtHeight(0);
    // The adapter writes via scrollToSourceLine -> EditorView.scrollIntoView,
    // which does not change the DOM scrollDOM.scrollTop in happy-dom (no
    // real layout) — assert via the diagnostic instead, which reads the
    // adapter's own getTopSourceLine() before/after the write.
    const sampled = surface.events.filter(
      (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
    );
    expect(sampled.at(-1)).toMatchObject({
      details: {
        targetBlockLine: 5,
        previewToEditorSkippedReason: null
      }
    });
    void topLine;
  });

  it("does not write when the target line already equals the editor's current top line (sameLine)", async () => {
    const surface = mount(DOC_CONTENT, "doc-same-line");
    dispatch(surface.preview(), wheelEvent());
    // scrollTop 0 resolves to line 1 (issue Design §5's top-clamp), which is
    // already the editor's initial top line.
    stubPreviewLayout(surface, 0);

    dispatch(surface.preview(), scrollEvent());
    await flushAnimationFrame();

    const sampled = surface.events.filter(
      (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
    );
    expect(sampled.at(-1)).toMatchObject({
      details: {
        targetBlockLine: 1,
        editorTopSourceLineBefore: 1,
        editorTopSourceLineAfter: 1,
        previewToEditorSkippedReason: "sameLine"
      }
    });
  });

  it("preview at max scroll sends the editor to the last line (issue Design §5)", async () => {
    const surface = mount(DOC_CONTENT, "doc-end-clamp");
    dispatch(surface.preview(), wheelEvent());
    // scrollHeight 820, clientHeight 400 -> max scroll 420. At-or-past max.
    stubPreviewLayout(surface, 420, { scrollHeight: 820, clientHeight: 400 });

    dispatch(surface.preview(), scrollEvent());
    await flushAnimationFrame();

    const totalLines = surface.view().state.doc.lines;
    const sampled = surface.events.filter(
      (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
    );
    expect(sampled.at(-1)).toMatchObject({
      details: { targetBlockLine: totalLines }
    });
  });

  it("preview at the very top resolves the editor's target to line 1 (symmetric with the end clamp)", async () => {
    // happy-dom has no real layout, so EditorView.scrollIntoView's effect on
    // scrollDOM.scrollTop is not observable here (see #504's own tests for
    // the same limitation) — this asserts the computed TARGET line via the
    // diagnostic, which is what issue Design §5's top-clamp is actually
    // about. "sameLine" is the CORRECT outcome here: a freshly mounted
    // editor already starts at line 1, so scrollTop=0 legitimately resolves
    // to no-op — see the dedicated sameLine test above for the write-skip
    // behavior itself.
    const surface = mount(DOC_CONTENT, "doc-start-clamp");
    dispatch(surface.preview(), wheelEvent());
    stubPreviewLayout(surface, 0);

    dispatch(surface.preview(), scrollEvent());
    await flushAnimationFrame();

    const sampled = surface.events.filter(
      (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
    );
    expect(sampled.at(-1)).toMatchObject({
      details: { targetBlockLine: 1 }
    });
  });

  describe("gating", () => {
    it("a follower preview scroll (editor is leader) never moves the editor, even with the setting on", async () => {
      const surface = mount(DOC_CONTENT, "doc-follower-no-write");
      // Editor is the default leader — do NOT give preview any input.
      stubPreviewLayout(surface, 250);

      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(
        surface.events.some(
          (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
        )
      ).toBe(false);
    });

    it("does nothing when preview.syncScrollPreviewToEditor is disabled, even though preview leads", async () => {
      const surface = mount(DOC_CONTENT, "doc-direction-disabled", {
        isSyncScrollPreviewToEditorEnabled: false
      });
      dispatch(surface.preview(), wheelEvent());
      stubPreviewLayout(surface, 250);

      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(
        surface.events.some(
          (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
        )
      ).toBe(false);
      // The classification diagnostic still explains why.
      const classified = surface.events.filter(
        (e) => e.event === "preview.scrollSync.scrollEvent.classified"
      );
      expect(classified.at(-1)).toMatchObject({
        details: { previewScrollEventReason: "disabledBySetting" }
      });
    });

    it("toggling the setting live (no remount) takes effect on the very next scroll", async () => {
      const surface = mount(DOC_CONTENT, "doc-live-toggle", {
        isSyncScrollPreviewToEditorEnabled: true
      });
      dispatch(surface.preview(), wheelEvent());
      stubPreviewLayout(surface, 250);
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();
      const countWhileEnabled = surface.events.filter(
        (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
      ).length;
      expect(countWhileEnabled).toBeGreaterThan(0);

      surface.rerender({ isSyncScrollPreviewToEditorEnabled: false });
      stubPreviewLayout(surface, 100);
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      const countAfterDisabling = surface.events.filter(
        (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
      ).length;
      expect(countAfterDisabling).toBe(countWhileEnabled); // no new sample

      surface.rerender({ isSyncScrollPreviewToEditorEnabled: true });
      stubPreviewLayout(surface, 300);
      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      const countAfterReenabling = surface.events.filter(
        (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
      ).length;
      expect(countAfterReenabling).toBeGreaterThan(countAfterDisabling);
    });

    it("disabling preview.syncScrollEditorToPreview does not affect the OTHER direction", async () => {
      const surface = mount(DOC_CONTENT, "doc-other-direction-unaffected", {
        isSyncScrollEditorToPreviewEnabled: false
      });
      dispatch(surface.preview(), wheelEvent());
      stubPreviewLayout(surface, 250);

      dispatch(surface.preview(), scrollEvent());
      await flushAnimationFrame();

      expect(
        surface.events.some(
          (e) => e.event === "preview.scrollSync.previewToEditor.sampled"
        )
      ).toBe(true);
    });
  });
});
