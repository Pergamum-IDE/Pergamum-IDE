// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import {
  getCatalogDefaultValue,
  validateCatalogValue
} from "../../src/shared/settingsCatalog";
import {
  resolveEffectiveSettings,
  builtInDefaultSettings,
  type ApplicationSettings,
  type ProjectSettings
} from "../../src/shared/settings";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import { GlossaryPreviewDecorator } from "../../src/renderer/GlossaryPreviewDecorator";
import { resolvePreviewJumpTarget } from "../../src/renderer/previewJumpToSource";
import {
  collectPreviewBlockRefs,
  collectPreviewAnchors,
  findTargetLineForScrollTop
} from "../../src/renderer/previewScrollSync";

describe("Narou-like horizontal novel preview (#507)", () => {
  describe("1. Setting catalog & effective settings", () => {
    it("has catalog default 'markdown' for preview.renderer", () => {
      expect(getCatalogDefaultValue("preview.renderer")).toBe("markdown");
    });

    it("accepts 'narouHorizontal' as a valid preview.renderer value", () => {
      expect(validateCatalogValue("preview.renderer", "narouHorizontal").ok).toBe(true);
      expect(validateCatalogValue("preview.renderer", "markdown").ok).toBe(true);
    });

    it("rejects unknown renderers such as 'vertical' or 'kakuyomu'", () => {
      expect(validateCatalogValue("preview.renderer", "vertical").ok).toBe(false);
      expect(validateCatalogValue("preview.renderer", "kakuyomu").ok).toBe(false);
    });

    it("resolves Application Settings default when no project setting override exists", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "narouHorizontal"
        }
      };

      const effective = resolveEffectiveSettings(appSettings, null);
      expect(effective.preview.renderer).toBe("narouHorizontal");
    });

    it("allows Project Settings to override Application Settings", () => {
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
          renderer: "narouHorizontal"
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.preview.renderer).toBe("narouHorizontal");
    });

    it("prioritizes Project Settings 'markdown' over Application Settings 'narouHorizontal'", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "narouHorizontal"
        }
      };
      const projectSettings: ProjectSettings = {
        preview: {
          renderer: "markdown"
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.preview.renderer).toBe("markdown");
    });
  });

  describe("2. DOM class hook and styling isolation", () => {
    it("renders <article class='preview'> when previewRenderer is 'markdown'", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <GlossaryPreviewDecorator
            previewHtml="<p>Test</p>"
            surfaceIndex={{ entries: [] }}
            previewRenderer="markdown"
            documentOpenId={null}
            previewRenderStartedAt={performance.now()}
            onPreviewDomCommitted={() => {}}
            onPreviewDecorationCompleted={() => {}}
            onPreviewFrameObserved={() => {}}
          />
        );
      });

      const article = container.querySelector("article");
      expect(article).not.toBeNull();
      expect(article?.className).toBe("preview");
      expect(article?.classList.contains("preview--narou-horizontal")).toBe(false);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("renders <article class='preview preview--narou-horizontal'> when previewRenderer is 'narouHorizontal'", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <GlossaryPreviewDecorator
            previewHtml="<p>　吾輩は猫である。</p>"
            surfaceIndex={{ entries: [] }}
            previewRenderer="narouHorizontal"
            documentOpenId={null}
            previewRenderStartedAt={performance.now()}
            onPreviewDomCommitted={() => {}}
            onPreviewDecorationCompleted={() => {}}
            onPreviewFrameObserved={() => {}}
          />
        );
      });

      const article = container.querySelector("article");
      expect(article).not.toBeNull();
      expect(article?.classList.contains("preview")).toBe(true);
      expect(article?.classList.contains("preview--narou-horizontal")).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("3. Feature compatibility: data-source-line, double-click jump, scroll sync", () => {
    it("preserves data-source-line attributes in rendered HTML", () => {
      const markdown = "　第一章\n\n　吾輩は猫である。名前はまだ無い。";
      const html = markdownPreviewRenderer.render(markdown);

      expect(html).toContain('data-source-line="1"');
      expect(html).toContain('data-source-line="3"');
    });

    it("supports double-click jump on elements within a preview--narou-horizontal container", () => {
      const container = document.createElement("article");
      container.className = "preview preview--narou-horizontal";
      container.innerHTML =
        '<p data-source-line="1">　第一章</p><p data-source-line="3">　吾輩は<ruby>猫<rt>ねこ</rt></ruby>である。</p>';

      const rt = container.querySelector("rt")!;
      const resolution = resolvePreviewJumpTarget(rt, container);
      expect(resolution).toEqual({ kind: "line", sourceLine: 3 });
    });

    it("supports collectPreviewBlockRefs and collectPreviewAnchors on preview--narou-horizontal container", () => {
      const container = document.createElement("article");
      container.className = "preview preview--narou-horizontal";
      container.innerHTML =
        '<h1 data-source-line="1">タイトル</h1><p data-source-line="3">　本文段落</p>';

      const blockResult = collectPreviewBlockRefs(container, "htmlRegenerated");
      expect(blockResult.blocks.length).toBe(2);
      expect(blockResult.blocks[0].line).toBe(1);
      expect(blockResult.blocks[1].line).toBe(3);

      const anchors = collectPreviewAnchors(container, "vertical");
      expect(anchors.length).toBe(2);
      expect(anchors[0].line).toBe(1);
      expect(anchors[1].line).toBe(3);
    });

    it("supports findTargetLineForScrollTop on preview--narou-horizontal container", () => {
      const container = document.createElement("article");
      container.className = "preview preview--narou-horizontal";
      vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 1000, right: 800, width: 800, height: 1000, x: 0, y: 0, toJSON: () => undefined
      } as DOMRect);

      const p1 = document.createElement("p");
      p1.setAttribute("data-source-line", "1");
      vi.spyOn(p1, "getBoundingClientRect").mockReturnValue({
        top: 0, left: 0, bottom: 100, right: 800, width: 800, height: 100, x: 0, y: 0, toJSON: () => undefined
      } as DOMRect);

      const p2 = document.createElement("p");
      p2.setAttribute("data-source-line", "5");
      vi.spyOn(p2, "getBoundingClientRect").mockReturnValue({
        top: 100, left: 0, bottom: 200, right: 800, width: 800, height: 100, x: 0, y: 100, toJSON: () => undefined
      } as DOMRect);

      container.appendChild(p1);
      container.appendChild(p2);

      const blockResult = collectPreviewBlockRefs(container, "htmlRegenerated");
      const targetResult = findTargetLineForScrollTop(blockResult.blocks, container, 50, "vertical");
      expect(targetResult.targetLine).toBe(1);
    });

    it("renders Aozora/Narou ruby notation into HTML <ruby> tags", () => {
      const explicitFull = markdownPreviewRenderer.render("｜菖苔《わらづと》");
      expect(explicitFull).toContain("<ruby>菖苔<rt>わらづと</rt></ruby>");
      expect(explicitFull).not.toContain("｜");
      expect(explicitFull).not.toContain("《");

      const explicitHalf = markdownPreviewRenderer.render("|菖苔《わらづと》");
      expect(explicitHalf).toContain("<ruby>菖苔<rt>わらづto</rt></ruby>".replace("to", "と"));
      expect(explicitHalf).not.toContain("|");

      const implicitKanji = markdownPreviewRenderer.render("菖苔《わらづと》");
      expect(implicitKanji).toContain("<ruby>菖苔<rt>わらづと</rt></ruby>");

      const contextualKanji = markdownPreviewRenderer.render("寝床の菖苔《わらづと》を調べる");
      expect(contextualKanji).toContain("寝床の<ruby>菖苔<rt>わらづと</rt></ruby>を調べる");
    });

    it("does not render implicit ruby for non-Kanji base text", () => {
      const kana = markdownPreviewRenderer.render("かな《かな》");
      expect(kana).not.toContain("<ruby>");
      expect(kana).toContain("かな《かな》");

      const abc = markdownPreviewRenderer.render("abc《えーびーしー》");
      expect(abc).not.toContain("<ruby>");
      expect(abc).toContain("abc《えーびーしー》");

      const rubyOnly = markdownPreviewRenderer.render("《ルビだけ》");
      expect(rubyOnly).not.toContain("<ruby>");
      expect(rubyOnly).toContain("《ルビだけ》");
    });

    it("renders ruby tags without breaking block mapping or jump resolution", () => {
      const html = markdownPreviewRenderer.render("｜親文字《ルビ》");
      const container = document.createElement("article");
      container.className = "preview preview--narou-horizontal";
      container.innerHTML = `<p data-source-line="10">${html.replace(/<\/?p[^>]*>/g, "")}</p>`;

      const ruby = container.querySelector("ruby")!;
      expect(ruby).not.toBeNull();
      const resolution = resolvePreviewJumpTarget(ruby, container);
      expect(resolution).toEqual({ kind: "line", sourceLine: 10 });

      const blockResult = collectPreviewBlockRefs(container, "htmlRegenerated");
      expect(blockResult.blocks.length).toBe(1);
      expect(blockResult.blocks[0].line).toBe(10);
    });

    it("renders emphasis mark tags without breaking block mapping or jump resolution", () => {
      const container = document.createElement("article");
      container.className = "preview preview--narou-horizontal";
      container.innerHTML =
        '<p data-source-line="12">ここが<span style="text-emphasis-style: filled sesame;">強調</span>箇所です。</p>';

      const span = container.querySelector("span")!;
      const resolution = resolvePreviewJumpTarget(span, container);
      expect(resolution).toEqual({ kind: "line", sourceLine: 12 });
    });

    it("preserves leading full-width spaces and empty line structures", () => {
      const proseWithSpaces = "　行頭全角スペースのある段落。\n\n　二段落目の本文。";
      const html = markdownPreviewRenderer.render(proseWithSpaces);

      expect(html).toContain("　行頭全角スペースのある段落。");
      expect(html).toContain("　二段落目の本文。");
    });
  });

  describe("4. Out of scope boundaries", () => {
    it("does not define any vertical writing mode or vertical renderer option", () => {
      const enumValue = getCatalogDefaultValue("preview.renderer");
      expect(enumValue).not.toBe("vertical");
      expect(enumValue).not.toBe("writing-mode: vertical-rl");
    });
  });
});
