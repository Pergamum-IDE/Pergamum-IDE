// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/shared/i18n";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";
import type { PreviewRendererId } from "../../src/shared/settings";

const CONTENT = "プレビュー切替オーバーレイのテスト本文です。";

interface MountedSurface {
  container: HTMLDivElement;
  previewPane: () => HTMLElement;
  busyOverlay: () => HTMLElement | null;
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

function mountSurface(
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
    previewPane: () => {
      const article = container.querySelector<HTMLElement>("article.preview");
      const el = article ? article.closest<HTMLElement>("section.pane") : null;
      if (!el) {
        throw new Error("expected mounted preview pane");
      }
      return el;
    },
    busyOverlay: () => {
      return container.querySelector<HTMLElement>(".previewBusyOverlay");
    },
    rerender: (nextOverrides) => {
      currentProps = { ...currentProps, ...nextOverrides };
      act(() => {
        root.render(<EditorSurface {...currentProps} />);
      });
    }
  };
}

describe("Issue #680: Preview renderer switching busy overlay & multi-operation guard", () => {
  it("renders busy overlay with aria-busy and status text on EditorSurface preview pane when isPreviewRendererSwitching is true", () => {
    const surface = mountSurface(CONTENT, "doc-680-busy", {
      previewRenderer: "markdown",
      isPreviewRendererSwitching: true
    });

    const pane = surface.previewPane();
    expect(pane.getAttribute("aria-busy")).toBe("true");
    expect(pane.className).toContain("pane--busy");

    const overlay = surface.busyOverlay();
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute("role")).toBe("status");
    expect(overlay?.textContent).toContain("プレビューを切り替えています…");

    // Spinner svg exists with aria-hidden
    const spinner = overlay?.querySelector(".previewBusySpinner");
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
  });

  it("does not render busy overlay when isPreviewRendererSwitching is false or omitted", () => {
    const surface = mountSurface(CONTENT, "doc-680-idle", {
      previewRenderer: "markdown",
      isPreviewRendererSwitching: false
    });

    const pane = surface.previewPane();
    expect(pane.getAttribute("aria-busy")).toBeNull();
    expect(pane.className).not.toContain("pane--busy");
    expect(surface.busyOverlay()).toBeNull();
  });
});
