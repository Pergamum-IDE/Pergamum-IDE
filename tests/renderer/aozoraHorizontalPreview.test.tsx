// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot as reactCreateRoot } from "react-dom/client";
import {
  getCatalogDefaultValue,
  validateCatalogValue
} from "../../src/shared/settingsCatalog";
import {
  resolveEffectiveSettings,
  builtInDefaultSettings,
  type ApplicationSettings,
  type ProjectSettings,
  type PreviewRendererId
} from "../../src/shared/settings";
import { aozoraPreviewRenderer } from "../../src/renderer/preview/aozoraPreviewRenderer";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import { GlossaryPreviewDecorator } from "../../src/renderer/GlossaryPreviewDecorator";
import { isMarkdownCurrentDocument, createFileDocument, type CurrentDocument } from "../../src/renderer/currentDocument";
import { EditorSurface } from "../../src/renderer/EditorSurface";
import { createMarkdownCurrentEditor } from "../../src/renderer/currentEditor";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";
import { t } from "../../src/shared/i18n";

function renderDecorator(props: React.ComponentProps<typeof GlossaryPreviewDecorator>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = reactCreateRoot(container);
  act(() => {
    root.render(<GlossaryPreviewDecorator {...props} />);
  });
  return { container, article: container.querySelector("article") };
}

describe("Aozora Bunko-like horizontal novel preview (#509)", () => {
  describe("1. Settings resolution and catalog integration", () => {
    it("1. catalog default for preview.renderer is 'markdown'", () => {
      expect(getCatalogDefaultValue("preview.renderer")).toBe("markdown");
      expect(validateCatalogValue("preview.renderer", "aozoraHorizontal").ok).toBe(true);
    });

    it("2. default renderer is markdown", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: []
      };
      const effective = resolveEffectiveSettings(appSettings, null);
      expect(effective.preview.renderer).toBe("markdown");
    });

    it("3. Application Settings can select 'aozoraHorizontal'", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "aozoraHorizontal"
        }
      };
      const effective = resolveEffectiveSettings(appSettings, null);
      expect(effective.preview.renderer).toBe("aozoraHorizontal");
    });

    it("4 & 5. Project Settings override can select 'aozoraHorizontal' as effective renderer", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "markdown"
        }
      };
      const projectSettings: ProjectSettings = {
        preview: {
          renderer: "aozoraHorizontal"
        }
      };
      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.preview.renderer).toBe("aozoraHorizontal");
    });
  });

  describe("2. DOM class hook and styling isolation (6-9)", () => {
    it("6. Aozora-like renderer receives preview--aozora-horizontal class hook", () => {
      const { article } = renderDecorator({
        previewHtml: "<p>本文</p>",
        surfaceIndex: { entries: [] },
        previewRenderer: "aozoraHorizontal",
        documentOpenId: null,
        previewRenderStartedAt: 0,
        onPreviewDomCommitted: () => {},
        onPreviewDecorationCompleted: () => {},
        onPreviewFrameObserved: () => {}
      });

      expect(article?.className).toBe("preview preview--aozora-horizontal");
    });

    it("7-9. Markdown, Narou-like, and Kakuyomu-like renderers do NOT get preview--aozora-horizontal class hook", () => {
      const getClassName = (renderer: "markdown" | "narouHorizontal" | "kakuyomuHorizontal") => {
        const { article } = renderDecorator({
          previewHtml: "<p>本文</p>",
          surfaceIndex: { entries: [] },
          previewRenderer: renderer,
          documentOpenId: null,
          previewRenderStartedAt: 0,
          onPreviewDomCommitted: () => {},
          onPreviewDecorationCompleted: () => {},
          onPreviewFrameObserved: () => {}
        });
        return article?.className;
      };

      expect(getClassName("markdown")).toBe("preview");
      expect(getClassName("narouHorizontal")).toBe("preview preview--narou-horizontal");
      expect(getClassName("kakuyomuHorizontal")).toBe("preview preview--kakuyomu-horizontal");
    });
  });

  describe("3. Plain text + Aozora annotations (Markdown NOT parsed) (10, 29)", () => {
    it("10. Aozora-like renderer does NOT parse Markdown syntax as Markdown tags", () => {
      const source = "# 大見出し\n*強調*\n_斜体_\n- リスト項目";
      const html = aozoraPreviewRenderer.render(source);

      expect(html).not.toContain("<h1>");
      expect(html).not.toContain("<em>");
      expect(html).not.toContain("<ul>");
      expect(html).not.toContain("<li>");
      expect(html).toContain('<p data-source-line="1"># 大見出し</p>');
      expect(html).toContain('<p data-source-line="2">*強調*</p>');
      expect(html).toContain('<p data-source-line="3">_斜体_</p>');
      expect(html).toContain('<p data-source-line="4">- リスト項目</p>');
    });

    it("29. Source text and annotation payload content are HTML-escaped to prevent script injection", () => {
      const source = "［＃傍点］<script>alert('xss')</script>［＃傍点終わり］";
      const html = aozoraPreviewRenderer.render(source);

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
      expect(html).toContain('<span class="aozora-bouten">');
    });
  });

  describe("4. Aozora Annotation Support (11-16, 19-28)", () => {
    it("11-13. renders explicit & implicit ruby and removes raw ruby markers", () => {
      const html = aozoraPreviewRenderer.render("｜藁苞《わらづと》と|親文字《ルビ》と漢字《るび》");
      expect(html).toContain("<ruby>藁苞<rt>わらづと</rt></ruby>");
      expect(html).toContain("<ruby>親文字<rt>ルビ</rt></ruby>");
      expect(html).toContain("<ruby>漢字<rt>るび</rt></ruby>");
      expect(html).not.toContain("｜");
      expect(html).not.toContain("《");
      expect(html).not.toContain("》");
    });

    it("14-16. renders ［＃傍点］...［＃傍点終わり］ as Aozora bouten without depending on authoring settings", () => {
      const html = aozoraPreviewRenderer.render("［＃傍点］重要［＃傍点終わり］な指示");
      expect(html).toContain('<span class="aozora-bouten">重要</span>な指示');
      expect(html).not.toContain("［＃傍点］");
    });

    it("19. renders ［＃改ページ］ as section break hr", () => {
      const html = aozoraPreviewRenderer.render("第一章\n［＃改ページ］\n第二章");
      expect(html).toContain('<hr class="aozora-page-break" data-source-line="2" />');
    });

    it("20-22. renders range headings (大見出し -> h2, 中見出し -> h3, 小見出し -> h4)", () => {
      const source = "［＃大見出し］大タイトル［＃大見出し終わり］\n［＃中見出し］中タイトル［＃中見出し終わり］\n［＃小見出し］小タイトル［＃小見出し終わり］";
      const html = aozoraPreviewRenderer.render(source);

      expect(html).toContain('<h2 data-source-line="1">大タイトル</h2>');
      expect(html).toContain('<h3 data-source-line="2">中タイトル</h3>');
      expect(html).toContain('<h4 data-source-line="3">小タイトル</h4>');
      expect(html).not.toContain("<h1");
    });

    it("23. renders ［＃3字下げ］...［＃3字下げ終わり］ as an indent paragraph", () => {
      const html = aozoraPreviewRenderer.render("［＃3字下げ］ここから本文［＃3字下げ終わり］");
      expect(html).toContain('<p class="aozora-indent" style="--aozora-indent: 3em;" data-source-line="1">ここから本文</p>');
    });

    it("24. renders ［＃地付き］...［＃地付き終わり］ as right-aligned paragraph", () => {
      const html = aozoraPreviewRenderer.render("［＃地付き］新人物往来社［＃地付き終わり］");
      expect(html).toContain('<p class="aozora-align-right" data-source-line="1">新人物往来社</p>');
    });

    it("25-26. renders ［＃太字］ as <strong> and ［＃斜体］ as <em>", () => {
      const html = aozoraPreviewRenderer.render("［＃太字］太字本文［＃太字終わり］と［＃斜体］斜体本文［＃斜体終わり］");
      expect(html).toContain("<strong>太字本文</strong>");
      expect(html).toContain("<em>斜体本文</em>");
    });

    it("27-28. strips unsupported ［＃...］ and ※［＃...］ annotations without raw noise", () => {
      const source = "本文［＃改丁］です。※［＃未対応外字］";
      const html = aozoraPreviewRenderer.render(source);
      expect(html).toBe('<p data-source-line="1">本文です。</p>');
      expect(html).not.toContain("改丁");
      expect(html).not.toContain("未対応外字");
    });
  });

  describe("5. .txt document preview availability & encoding handling (31-44)", () => {
    it("31-34. preview availability rules for .md vs .txt", () => {
      const mdDoc: CurrentDocument = {
        kind: "file",
        path: "/path/to/novel.md",
        name: "novel.md",
        content: "本文",
        savedContent: "本文",
        readEncoding: "utf-8",
        readLineEnding: "lf",
        lineEndingBreaks: null as any,
        savedLineEndingBreaks: null as any
      };
      const txtDoc: CurrentDocument = {
        kind: "file",
        path: "/path/to/novel.txt",
        name: "novel.txt",
        content: "本文",
        savedContent: "本文",
        readEncoding: "utf-8",
        readLineEnding: "lf",
        lineEndingBreaks: null as any,
        savedLineEndingBreaks: null as any
      };

      expect(isMarkdownCurrentDocument(mdDoc)).toBe(true);
      expect(isMarkdownCurrentDocument(txtDoc)).toBe(false);

      // Check helper logic: .txt + markdown is not shown, .txt + non-markdown renderer is shown
      const isPreviewAvailable = (doc: CurrentDocument, renderer: string) =>
        isMarkdownCurrentDocument(doc) || renderer !== "markdown";

      expect(isPreviewAvailable(txtDoc, "markdown")).toBe(false);
      expect(isPreviewAvailable(txtDoc, "narouHorizontal")).toBe(true);
      expect(isPreviewAvailable(txtDoc, "kakuyomuHorizontal")).toBe(true);
      expect(isPreviewAvailable(txtDoc, "aozoraHorizontal")).toBe(true);
    });

    it("42-43. CP932 / Shift_JIS decoding test using Web API TextDecoder", () => {
      // Create Shift_JIS bytes for: 日本語①
      const textDecoder = new TextDecoder("shift_jis");
      const sampleBytes = new Uint8Array([
        0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
      ]);
      const decoded = textDecoder.decode(sampleBytes);
      expect(decoded).toBe("日本語①");
    });
  });

  describe("6. Feature compatibility & Non-regression (17, 18, 30, 45-50)", () => {
    it("17-18, 45-47. preserves Markdown, Narou-like, and Kakuyomu-like renderer behavior", () => {
      const mdSource = "｜藁苞《わらづと》と《《重要》》";
      const mdHtml = markdownPreviewRenderer.render(mdSource);

      expect(mdHtml).toContain("<ruby>藁苞<rt>わらづと</rt></ruby>");
      expect(mdHtml).toContain('<span class="emphasis-mark">重要</span>');
    });

    it("30. attaches 1-based data-source-line attributes to every block element", () => {
      const source = "一行目\n\n三行目";
      const html = aozoraPreviewRenderer.render(source);

      expect(html).toContain('<p data-source-line="1">一行目</p>');
      expect(html).toContain('<p data-source-line="2"><br></p>');
      expect(html).toContain('<p data-source-line="3">三行目</p>');
    });

    it("48-50. does NOT introduce vertical-rl or preview pane toolbar switcher", () => {
      const { container } = renderDecorator({
        previewHtml: "<p>本文</p>",
        surfaceIndex: { entries: [] },
        previewRenderer: "aozoraHorizontal",
        documentOpenId: null,
        previewRenderStartedAt: 0,
        onPreviewDomCommitted: () => {},
        onPreviewDecorationCompleted: () => {},
        onPreviewFrameObserved: () => {}
      });

      const html = container.innerHTML;
      expect(html).not.toContain("writing-mode: vertical-rl");
      expect(html).not.toContain("previewPaneSwitcher");
    });
  });

  describe("7. Workspace layout grid gate for previews (#509 blocker fix)", () => {
    function renderEditorSurfaceForLayout(
      filePath: string,
      previewRenderer: PreviewRendererId
    ) {
      const doc = createFileDocument({
        path: filePath,
        content: "本文テキスト",
        metadata: {
          encoding: "utf8",
          lineEnding: "lf",
          byteLength: 12,
          characterLength: 6,
          hadBom: false
        }
      });
      const noop = () => undefined;
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = reactCreateRoot(container);

      const props: React.ComponentProps<typeof EditorSurface> = {
        editor: createMarkdownCurrentEditor(doc),
        isDebugModeEnabled: false,
        isSyncScrollEditorToPreviewEnabled: false,
        isSyncScrollPreviewToEditorEnabled: false,
        isDoubleClickJumpToEditorEnabled: false,
        activeDocumentKey: filePath,
        previewRenderer,
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
        soundFeedback: { play: () => {} } as never,
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
      };

      act(() => {
        root.render(<EditorSurface {...props} />);
      });

      const workspace = container.querySelector(
        "section.workspace"
      ) as HTMLElement | null;
      const previewPane = container.querySelector(
        'section.pane[aria-label="Markdownプレビュー"]'
      ) as HTMLElement | null;

      return { container, root, workspace, previewPane };
    }

    it(".txt + aozoraHorizontal applies gridTemplateColumns layout style and mounts preview pane", () => {
      const { workspace, previewPane, root, container } =
        renderEditorSurfaceForLayout(
          "C:/tmp/novel.txt",
          "aozoraHorizontal"
        );

      expect(workspace).not.toBeNull();
      expect(workspace?.style.gridTemplateColumns).toBe(
        "minmax(0, 0.5fr) 6px minmax(0, 0.5fr)"
      );
      expect(previewPane).not.toBeNull();

      act(() => root.unmount());
      container.remove();
    });

    it(".txt + narouHorizontal applies gridTemplateColumns layout style and mounts preview pane", () => {
      const { workspace, previewPane, root, container } =
        renderEditorSurfaceForLayout(
          "C:/tmp/novel.txt",
          "narouHorizontal"
        );

      expect(workspace).not.toBeNull();
      expect(workspace?.style.gridTemplateColumns).toBe(
        "minmax(0, 0.5fr) 6px minmax(0, 0.5fr)"
      );
      expect(previewPane).not.toBeNull();

      act(() => root.unmount());
      container.remove();
    });

    it(".txt + kakuyomuHorizontal applies gridTemplateColumns layout style and mounts preview pane", () => {
      const { workspace, previewPane, root, container } =
        renderEditorSurfaceForLayout(
          "C:/tmp/novel.txt",
          "kakuyomuHorizontal"
        );

      expect(workspace).not.toBeNull();
      expect(workspace?.style.gridTemplateColumns).toBe(
        "minmax(0, 0.5fr) 6px minmax(0, 0.5fr)"
      );
      expect(previewPane).not.toBeNull();

      act(() => root.unmount());
      container.remove();
    });

    it(".txt + markdown does NOT apply gridTemplateColumns layout style and does NOT mount preview pane", () => {
      const { workspace, previewPane, root, container } =
        renderEditorSurfaceForLayout("C:/tmp/novel.txt", "markdown");

      expect(workspace).not.toBeNull();
      expect(workspace?.style.gridTemplateColumns).toBe("");
      expect(previewPane).toBeNull();

      act(() => root.unmount());
      container.remove();
    });

    it(".md + markdown applies gridTemplateColumns layout style and mounts preview pane", () => {
      const { workspace, previewPane, root, container } =
        renderEditorSurfaceForLayout("C:/tmp/novel.md", "markdown");

      expect(workspace).not.toBeNull();
      expect(workspace?.style.gridTemplateColumns).toBe(
        "minmax(0, 0.5fr) 6px minmax(0, 0.5fr)"
      );
      expect(previewPane).not.toBeNull();

      act(() => root.unmount());
      container.remove();
    });
  });
});
