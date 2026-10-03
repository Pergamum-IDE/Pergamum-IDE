// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { createUntitledDocument } from "../../src/renderer/currentDocument";
import { resolveColorTheme, type BuiltInThemeId } from "../../src/shared/colorTheme";
import { t, type Translate } from "../../src/shared/i18n";

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

const INITIAL_CONTENT = Array.from({ length: 150 }, (_, i) => `Paragraph ${i + 1} with text content.`).join("\n\n");

function createTestProps(content: string, documentKey: string, themeId: BuiltInThemeId, isPreviewAvailable = true) {
  const doc = {
    ...createUntitledDocument(() => documentKey),
    content,
    savedContent: content
  };
  const noop = () => undefined;
  const themeKind = resolveColorTheme(themeId).kind;

  return {
    editor: createMarkdownCurrentEditor(doc),
    isDebugModeEnabled: true,
    isSyncScrollEditorToPreviewEnabled: true,
    isSyncScrollPreviewToEditorEnabled: true,
    isDoubleClickJumpToEditorEnabled: true,
    activeDocumentKey: documentKey,
    previewUpdateDelayMs: 0,
    newFileLineEndingFallback: "lf" as const,
    expectedLineEnding: "lf" as const,
    markerGlyph: "none" as const,
    undoHistoryMinDepth: 100,
    selectionHighlightMode: "default" as const,
    findGutterMarkers: false,
    whitespaceSettings: {
      renderIdeographicSpace: false,
      renderAsciiSpace: false,
      renderTab: false,
      renderOtherUnicodeSpace: false
    },
    normalizeUnicodeToNfcMatching: false,
    glossaryNearbySearchSettings: {
      unit: "paragraphs" as const,
      characterDistance: 500,
      paragraphDistance: 2
    },
    projectRootPath: null,
    glossaryRefreshToken: 0,
    translate: ((key, values) => t("ja", key, values)) as Translate,
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
    previewVisible: isPreviewAvailable,
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
    onViewportChanged: noop,
    themeKind
  };
}

describe("viewport preservation on theme change (#710)", () => {
  // ---------------------------------------------------------------------------
  // Structural layout contracts
  // ---------------------------------------------------------------------------
  describe("structural layout contracts", () => {
    it("defines .editorSurfaceHost as a flex container matching .editorAreaContent", () => {
      const css = readFileSync("src/renderer/styles.css", "utf8");
      expect(css).toContain(".editorSurfaceHost {");
      const hostRuleStart = css.indexOf(".editorSurfaceHost {");
      const hostRuleEnd = css.indexOf("}", hostRuleStart);
      const hostRule = css.slice(hostRuleStart, hostRuleEnd);

      expect(hostRule).toContain("display: flex;");
      expect(hostRule).toContain("min-width: 0;");
      expect(hostRule).toContain("min-height: 0;");
      expect(hostRule).toContain("flex: 1;");
      expect(hostRule).toContain("flex-direction: column;");
    });

    it("wraps EditorSurface inside .editorSurfaceHost with display:none when isEditorAreaSpecialTabActive is true", () => {
      const appSource = readFileSync("src/renderer/App.tsx", "utf8");
      const hostIndex = appSource.indexOf('className="editorSurfaceHost"');
      expect(hostIndex).toBeGreaterThan(-1);

      const styleSlice = appSource.slice(hostIndex, hostIndex + 400);
      expect(styleSlice).toContain("isEditorAreaSpecialTabActive");
      expect(styleSlice).toContain('? { display: "none" }');
      expect(styleSlice).toContain(": undefined");
      expect(styleSlice).toContain("<EditorSurface");
    });
  });

  // ---------------------------------------------------------------------------
  // Root cause verification: remount suppression
  // ---------------------------------------------------------------------------
  describe("remount suppression and identity preservation", () => {
    it("keeps EditorView and Preview container identities identical across Settings tab switch", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      containers.push(container);
      roots.push(root);

      function WorkspaceShell({ isSpecialTabActive, themeId }: { isSpecialTabActive: boolean; themeId: BuiltInThemeId }) {
        const props = createTestProps(INITIAL_CONTENT, "doc-key-1", themeId);
        return (
          <div className="editorAreaContent">
            {isSpecialTabActive ? <div className="settingsPanel">Settings</div> : null}
            <div
              className="editorSurfaceHost"
              style={isSpecialTabActive ? { display: "none" } : undefined}
            >
              <EditorSurface {...props} />
            </div>
          </div>
        );
      }

      // Initial render in editor
      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={false} themeId="pergamum-light" />);
      });

      const scrollerBefore = container.querySelector(".cm-scroller") as HTMLElement;
      const previewBefore = container.querySelector(".preview") as HTMLElement;
      expect(scrollerBefore).not.toBeNull();
      expect(previewBefore).not.toBeNull();

      scrollerBefore.scrollTop = 320;
      previewBefore.scrollTop = 480;

      // Navigate to Settings tab and change theme to Night Dark
      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={true} themeId="night-dark" />);
      });

      // Navigate back to editor
      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={false} themeId="night-dark" />);
      });

      const scrollerAfter = container.querySelector(".cm-scroller") as HTMLElement;
      const previewAfter = container.querySelector(".preview") as HTMLElement;

      // DOM node identity preserved
      expect(scrollerAfter).toBe(scrollerBefore);
      expect(previewAfter).toBe(previewBefore);

      // Viewports preserved (not reset to 0)
      expect(scrollerAfter.scrollTop).toBe(320);
      expect(previewAfter.scrollTop).toBe(480);
    });
  });

  // ---------------------------------------------------------------------------
  // Theme switch matrix (same-kind and cross-kind)
  // ---------------------------------------------------------------------------
  describe("theme switch matrix", () => {
    const testCases: Array<{ from: BuiltInThemeId; to: BuiltInThemeId; label: string }> = [
      { from: "pergamum-light", to: "resistance-blue", label: "light -> light (Pergamum Light -> Resistance Blue)" },
      { from: "night-dark", to: "shine-moon", label: "dark -> dark (Night Dark -> Shine Moon)" },
      { from: "shine-moon", to: "ginza-night", label: "dark -> dark (Shine Moon -> Ginza Night)" },
      { from: "pergamum-light", to: "night-dark", label: "light -> dark (Pergamum Light -> Night Dark)" },
      { from: "ginza-night", to: "pergamum-light", label: "dark -> light (Ginza Night -> Pergamum Light)" }
    ];

    for (const { from, to, label } of testCases) {
      it(`preserves Editor and Preview viewports across ${label}`, () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        containers.push(container);
        roots.push(root);

        function WorkspaceShell({ isSpecialTabActive, themeId }: { isSpecialTabActive: boolean; themeId: BuiltInThemeId }) {
          const props = createTestProps(INITIAL_CONTENT, "doc-matrix", themeId);
          return (
            <div className="editorAreaContent">
              {isSpecialTabActive ? <div className="settingsPanel">Settings</div> : null}
              <div
                className="editorSurfaceHost"
                style={isSpecialTabActive ? { display: "none" } : undefined}
              >
                <EditorSurface {...props} />
              </div>
            </div>
          );
        }

        act(() => {
          root.render(<WorkspaceShell isSpecialTabActive={false} themeId={from} />);
        });

        const scroller = container.querySelector(".cm-scroller") as HTMLElement;
        const preview = container.querySelector(".preview") as HTMLElement;

        scroller.scrollTop = 275;
        preview.scrollTop = 390;

        // Switch to Settings
        act(() => {
          root.render(<WorkspaceShell isSpecialTabActive={true} themeId={to} />);
        });

        // Switch back
        act(() => {
          root.render(<WorkspaceShell isSpecialTabActive={false} themeId={to} />);
        });

        expect(scroller.scrollTop).toBe(275);
        expect(preview.scrollTop).toBe(390);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Repeated switching: zero drift guarantee
  // ---------------------------------------------------------------------------
  describe("repeated switching zero drift guarantee", () => {
    it("does not accumulate any scroll drift across repeated multi-theme switches", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      containers.push(container);
      roots.push(root);

      function WorkspaceShell({ isSpecialTabActive, themeId }: { isSpecialTabActive: boolean; themeId: BuiltInThemeId }) {
        const props = createTestProps(INITIAL_CONTENT, "doc-drift", themeId);
        return (
          <div className="editorAreaContent">
            {isSpecialTabActive ? <div className="settingsPanel">Settings</div> : null}
            <div
              className="editorSurfaceHost"
              style={isSpecialTabActive ? { display: "none" } : undefined}
            >
              <EditorSurface {...props} />
            </div>
          </div>
        );
      }

      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={false} themeId="pergamum-light" />);
      });

      const scroller = container.querySelector(".cm-scroller") as HTMLElement;
      const preview = container.querySelector(".preview") as HTMLElement;

      const initialEditorScroll = 410;
      const initialPreviewScroll = 530;
      scroller.scrollTop = initialEditorScroll;
      preview.scrollTop = initialPreviewScroll;

      const sequence: BuiltInThemeId[] = [
        "night-dark",
        "shine-moon",
        "ginza-night",
        "resistance-blue",
        "enlightened-green",
        "pergamum-light",
        "night-dark"
      ];

      for (const nextTheme of sequence) {
        // Go to settings and apply next theme
        act(() => {
          root.render(<WorkspaceShell isSpecialTabActive={true} themeId={nextTheme} />);
        });
        // Return to editor
        act(() => {
          root.render(<WorkspaceShell isSpecialTabActive={false} themeId={nextTheme} />);
        });

        // Exact match: 0 drift
        expect(scroller.scrollTop).toBe(initialEditorScroll);
        expect(preview.scrollTop).toBe(initialPreviewScroll);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Vertical preview mode (Aozora vertical)
  // ---------------------------------------------------------------------------
  describe("vertical preview preservation", () => {
    it("preserves vertical preview scrollLeft across theme changes", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      containers.push(container);
      roots.push(root);

      function WorkspaceShell({ isSpecialTabActive, themeId }: { isSpecialTabActive: boolean; themeId: BuiltInThemeId }) {
        const base = createTestProps(INITIAL_CONTENT, "doc-vert", themeId);
        const props = {
          ...base,
          previewRenderer: "aozoraVertical" as const
        };
        return (
          <div className="editorAreaContent">
            {isSpecialTabActive ? <div className="settingsPanel">Settings</div> : null}
            <div
              className="editorSurfaceHost"
              style={isSpecialTabActive ? { display: "none" } : undefined}
            >
              <EditorSurface {...props} />
            </div>
          </div>
        );
      }

      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={false} themeId="pergamum-light" />);
      });

      const scroller = container.querySelector(".cm-scroller") as HTMLElement;
      const preview = container.querySelector(".preview") as HTMLElement;

      scroller.scrollTop = 300;
      preview.scrollLeft = -220; // vertical scroll in RTL/vertical writing container

      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={true} themeId="night-dark" />);
      });

      act(() => {
        root.render(<WorkspaceShell isSpecialTabActive={false} themeId="night-dark" />);
      });

      expect(scroller.scrollTop).toBe(300);
      expect(preview.scrollLeft).toBe(-220);
    });
  });
});
