// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
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
  collectPreviewAnchors
} from "../../src/renderer/previewScrollSync";

describe("Kakuyomu-like horizontal novel preview (#508)", () => {
  describe("1. Setting catalog & effective settings", () => {
    it("has catalog default 'markdown' for preview.renderer", () => {
      expect(getCatalogDefaultValue("preview.renderer")).toBe("markdown");
    });

    it("accepts 'kakuyomuHorizontal' as a valid preview.renderer value", () => {
      expect(validateCatalogValue("preview.renderer", "kakuyomuHorizontal").ok).toBe(true);
      expect(validateCatalogValue("preview.renderer", "narouHorizontal").ok).toBe(true);
      expect(validateCatalogValue("preview.renderer", "markdown").ok).toBe(true);
    });

    it("resolves Application Settings default when no project setting override exists", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "kakuyomuHorizontal"
        }
      };

      const effective = resolveEffectiveSettings(appSettings, null);
      expect(effective.preview.renderer).toBe("kakuyomuHorizontal");
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
          renderer: "kakuyomuHorizontal"
        }
      };

      const effective = resolveEffectiveSettings(appSettings, projectSettings);
      expect(effective.preview.renderer).toBe("kakuyomuHorizontal");
    });

    it("prioritizes Project Settings over Application Settings 'kakuyomuHorizontal'", () => {
      const appSettings: ApplicationSettings = {
        ...builtInDefaultSettings,
        recentProjects: [],
        preview: {
          ...builtInDefaultSettings.preview,
          renderer: "kakuyomuHorizontal"
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
  });

  describe("2. DOM class hook and styling isolation", () => {
    it("renders <article class='preview preview--kakuyomu-horizontal'> when previewRenderer is 'kakuyomuHorizontal'", () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);

      act(() => {
        root.render(
          <GlossaryPreviewDecorator
            previewHtml="<p>　吾輩は猫である。</p>"
            surfaceIndex={{ entries: [] }}
            previewRenderer="kakuyomuHorizontal"
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
      expect(article?.classList.contains("preview--kakuyomu-horizontal")).toBe(true);

      act(() => {
        root.unmount();
      });
      container.remove();
    });

    it("keeps Markdown and Narou-like renderer classes unchanged", () => {
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

      let article = container.querySelector("article");
      expect(article?.className).toBe("preview");
      expect(article?.classList.contains("preview--kakuyomu-horizontal")).toBe(false);
      expect(article?.classList.contains("preview--narou-horizontal")).toBe(false);

      act(() => {
        root.render(
          <GlossaryPreviewDecorator
            previewHtml="<p>Test</p>"
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

      article = container.querySelector("article");
      expect(article?.classList.contains("preview--narou-horizontal")).toBe(true);
      expect(article?.classList.contains("preview--kakuyomu-horizontal")).toBe(false);

      act(() => {
        root.unmount();
      });
      container.remove();
    });
  });

  describe("3. Feature compatibility: data-source-line, double-click jump, scroll sync", () => {
    it("preserves data-source-line attributes on rendered blocks", () => {
      const html = markdownPreviewRenderer.render("　第一章　始まりの街");
      expect(html).toContain('data-source-line="1"');
    });

    it("renders ruby tags without breaking block mapping or jump resolution", () => {
      const html = markdownPreviewRenderer.render("｜親文字《ルビ》");
      const container = document.createElement("article");
      container.className = "preview preview--kakuyomu-horizontal";
      container.innerHTML = `<p data-source-line="10">${html.replace(/<\/?p[^>]*>/g, "")}</p>`;

      const ruby = container.querySelector("ruby")!;
      expect(ruby).not.toBeNull();
      const resolution = resolvePreviewJumpTarget(ruby, container);
      expect(resolution).toEqual({ kind: "line", sourceLine: 10 });

      const blockResult = collectPreviewBlockRefs(container, "htmlRegenerated");
      expect(blockResult.blocks.length).toBe(1);
      expect(blockResult.blocks[0].line).toBe(10);
    });

    it("renders Kakuyomu emphasis marks 《《...》》 into <span class='emphasis-mark'> elements and removes raw markers", () => {
      const result = markdownPreviewRenderer.render("これは《《重要》》な言葉だ。");
      expect(result).toContain("これは<span class=\"emphasis-mark\">重要</span>な言葉だ。");
      expect(result).not.toContain("《《");
      expect(result).not.toContain("》》");
    });

    it("distinguishes ruby syntax and Kakuyomu emphasis syntax in the same sentence", () => {
      const result = markdownPreviewRenderer.render("これは《《重要》》な｜藁苞《わらづと》だ。");
      expect(result).toContain("<span class=\"emphasis-mark\">重要</span>");
      expect(result).toContain("<ruby>藁苞<rt>わらづと</rt></ruby>");
      expect(result).not.toContain("《《");
      expect(result).not.toContain("》》");
    });

    it("preserves shared Aozora/Narou ruby notation in Kakuyomu-like mode", () => {
      const explicitFull = markdownPreviewRenderer.render("｜藁苞《わらづと》");
      expect(explicitFull).toContain("<ruby>藁苞<rt>わらづと</rt></ruby>");

      const explicitHalf = markdownPreviewRenderer.render("|藁苞《わらづと》");
      expect(explicitHalf).toContain("<ruby>藁苞<rt>わらづと</rt></ruby>");

      const implicitKanji = markdownPreviewRenderer.render("寝床の藁苞《わらづと》を調べる");
      expect(implicitKanji).toContain("寝床の<ruby>藁苞<rt>わらづと</rt></ruby>を調べる");
    });

    it("preserves negative ruby/emphasis cases as plain text", () => {
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
  });

  describe("4. Out of scope boundaries", () => {
    it("does not define any vertical writing mode or vertical renderer option", () => {
      const enumValue = getCatalogDefaultValue("preview.renderer");
      expect(enumValue).not.toBe("vertical");
      expect(enumValue).not.toBe("writing-mode: vertical-rl");
    });
  });
});
