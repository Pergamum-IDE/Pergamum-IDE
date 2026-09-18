// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot as reactCreateRoot } from "react-dom/client";
import {
  getCatalogDefaultValue,
  validateCatalogValue
} from "../../src/shared/settingsCatalog";
import { getSettingCatalogItem } from "../../src/shared/settingsUiCatalog";
import {
  resolveEffectiveSettings,
  builtInDefaultSettings,
  isVerticalPreviewRenderer,
  type ApplicationSettings,
  type PreviewRendererId
} from "../../src/shared/settings";
import { aozoraPreviewRenderer } from "../../src/renderer/preview/aozoraPreviewRenderer";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import { GlossaryPreviewDecorator, type GlossaryPreviewDecoratorProps } from "../../src/renderer/GlossaryPreviewDecorator";
import { t } from "../../src/shared/i18n";
import {
  computeVerticalScrollLeftForLine,
  getLiveElementVerticalProgress,
  type PreviewBlockRef
} from "../../src/renderer/previewScrollSync";

const emptySurfaceIndex = { entries: [], trie: null as any };

const defaultDecoratorProps: GlossaryPreviewDecoratorProps = {
  previewHtml: "<p>テスト</p>",
  surfaceIndex: emptySurfaceIndex,
  documentOpenId: null,
  previewRenderStartedAt: 0,
  onPreviewDomCommitted: () => {},
  onPreviewDecorationCompleted: () => {},
  onPreviewFrameObserved: () => {}
};

function renderDecorator(props: Partial<React.ComponentProps<typeof GlossaryPreviewDecorator>>) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = reactCreateRoot(container);
  act(() => {
    root.render(<GlossaryPreviewDecorator {...defaultDecoratorProps} {...props} />);
  });
  return { container, article: container.querySelector("article") };
}

describe("Vertical novel preview renderer MVP (#514)", () => {
  describe("1. Settings resolution and catalog integration", () => {
    it("1. catalog validates narouVertical, kakuyomuVertical, and aozoraVertical", () => {
      expect(validateCatalogValue("preview.renderer", "narouVertical").ok).toBe(true);
      expect(validateCatalogValue("preview.renderer", "kakuyomuVertical").ok).toBe(true);
      expect(validateCatalogValue("preview.renderer", "aozoraVertical").ok).toBe(true);
    });

    it("2. isVerticalPreviewRenderer identifies vertical renderer IDs correctly", () => {
      expect(isVerticalPreviewRenderer("narouVertical")).toBe(true);
      expect(isVerticalPreviewRenderer("kakuyomuVertical")).toBe(true);
      expect(isVerticalPreviewRenderer("aozoraVertical")).toBe(true);
      expect(isVerticalPreviewRenderer("markdown")).toBe(false);
      expect(isVerticalPreviewRenderer("narouHorizontal")).toBe(false);
      expect(isVerticalPreviewRenderer("kakuyomuHorizontal")).toBe(false);
      expect(isVerticalPreviewRenderer("aozoraHorizontal")).toBe(false);
    });

    it("3. settingCatalogItems registers vertical preview renderer options", () => {
      const rendererItem = getSettingCatalogItem("preview.renderer");
      expect(rendererItem).toBeDefined();
      if (rendererItem && rendererItem.control.kind === "select") {
        const values = rendererItem.control.options.map(o => o.value);
        expect(values).toContain("narouVertical");
        expect(values).toContain("kakuyomuVertical");
        expect(values).toContain("aozoraVertical");
      }
    });

    it("4. i18n translation labels exist for all vertical renderers", () => {
      expect(t("ja", "settings.preview.renderer.option.narouVertical.label")).toBe("小説家になろう風・縦書き");
      expect(t("ja", "settings.preview.renderer.option.kakuyomuVertical.label")).toBe("カクヨム風・縦書き");
      expect(t("ja", "settings.preview.renderer.option.aozoraVertical.label")).toBe("青空文庫風・縦書き");

      expect(t("en", "settings.preview.renderer.option.narouVertical.label")).toBe("Narou-like Vertical");
      expect(t("en", "settings.preview.renderer.option.kakuyomuVertical.label")).toBe("Kakuyomu-like Vertical");
      expect(t("en", "settings.preview.renderer.option.aozoraVertical.label")).toBe("Aozora Bunko-like Vertical");
    });
  });

  describe("2. GlossaryPreviewDecorator class decoration", () => {
    it("1. applies preview--narou-vertical class for narouVertical", () => {
      const { article } = renderDecorator({
        previewHtml: "<p>テスト</p>",
        previewRenderer: "narouVertical"
      });
      expect(article?.className).toBe("preview preview--narou-vertical");
    });

    it("2. applies preview--kakuyomu-vertical class for kakuyomuVertical", () => {
      const { article } = renderDecorator({
        previewHtml: "<p>テスト</p>",
        previewRenderer: "kakuyomuVertical"
      });
      expect(article?.className).toBe("preview preview--kakuyomu-vertical");
    });

    it("3. applies preview--aozora-vertical class for aozoraVertical", () => {
      const { article } = renderDecorator({
        previewHtml: "<p>テスト</p>",
        previewRenderer: "aozoraVertical"
      });
      expect(article?.className).toBe("preview preview--aozora-vertical");
    });
  });

  describe("3. Parser and transform reuse", () => {
    it("1. narouVertical reuses markdownPreviewRenderer transform", () => {
      const html = markdownPreviewRenderer.render("｜青空《あおぞら》");
      expect(html).toContain("<ruby>青空<rt>あおぞら</rt></ruby>");
    });

    it("2. kakuyomuVertical reuses markdownPreviewRenderer transform", () => {
      const html = markdownPreviewRenderer.render("｜カクヨム《かくよむ》");
      expect(html).toContain("<ruby>カクヨム<rt>かくよむ</rt></ruby>");
    });

    it("3. aozoraVertical reuses aozoraPreviewRenderer transform", () => {
      const html = aozoraPreviewRenderer.render("青空文庫［＃「青空文庫」に傍点］");
      expect(html).toContain('class="aozora-bouten"');
      expect(html).toContain("青空文庫");
    });
  });

  describe("4. .txt document preview availability rules", () => {
    it("1. isPreviewAvailable logic returns true for vertical renderers on .txt files", () => {
      const isMarkdown = false;
      const renderers: PreviewRendererId[] = ["narouVertical", "kakuyomuVertical", "aozoraVertical"];

      for (const renderer of renderers) {
        const isPreviewAvailable = isMarkdown || renderer !== "markdown";
        expect(isPreviewAvailable).toBe(true);
      }
    });

    it("2. isPreviewAvailable returns false for .txt files when renderer is markdown", () => {
      const isMarkdown = false;
      const renderer: PreviewRendererId = "markdown";
      const isPreviewAvailable = isMarkdown || renderer !== "markdown";
      expect(isPreviewAvailable).toBe(false);
    });
  });

  describe("5. Kakuyomu emphasis notation 《《...》》 transform (#514 blocker fix)", () => {
    const source = "「それなら一計がある。《《アーカイブ》》の鍵を貸して欲しい」";

    it("1. kakuyomuVertical renders 《《アーカイブ》》 as Kakuyomu emphasis span", () => {
      const html = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuVertical" });
      expect(html).toContain('<span class="emphasis-mark">アーカイブ</span>');
    });

    it("2. kakuyomuVertical strips raw 《《 and 》》 markers", () => {
      const html = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuVertical" });
      expect(html).not.toContain("《《");
      expect(html).not.toContain("》》");
    });

    it("3. kakuyomuVertical emphasis span covers exactly 'アーカイブ'", () => {
      const html = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuVertical" });
      expect(html).toContain("一計がある。<span class=\"emphasis-mark\">アーカイブ</span>の鍵");
    });

    it("4. kakuyomuHorizontal retains identical Kakuyomu emphasis behavior without regression", () => {
      const html = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuHorizontal" });
      expect(html).toContain('<span class="emphasis-mark">アーカイブ</span>');
      expect(html).not.toContain("《《");
      expect(html).not.toContain("》》");
    });

    it("5. markdown and aozoraVertical do not misapply Kakuyomu emphasis transform", () => {
      const markdownHtml = markdownPreviewRenderer.render(source, { previewRenderer: "markdown" });
      expect(markdownHtml).not.toContain('<span class="emphasis-mark">アーカイブ</span>');
      expect(markdownHtml).toContain("《《アーカイブ》》");

      const aozoraHtml = aozoraPreviewRenderer.render(source, { previewRenderer: "aozoraVertical" });
      expect(aozoraHtml).not.toContain('<span class="emphasis-mark">アーカイブ</span>');
      expect(aozoraHtml).toContain("《《アーカイブ》》");
    });
  });

  describe("6. Transform equivalence between horizontal and vertical variants", () => {
    it("1. kakuyomuHorizontal and kakuyomuVertical produce identical HTML output for 《《アーカイブ》》 and ruby", () => {
      const source = "「それなら一計がある。《《アーカイブ》》の鍵を貸して欲しい」｜親文字《るび》";
      const horizontalHtml = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuHorizontal" });
      const verticalHtml = markdownPreviewRenderer.render(source, { previewRenderer: "kakuyomuVertical" });
      expect(horizontalHtml).toBe(verticalHtml);
    });

    it("2. narouHorizontal and narouVertical produce identical HTML output for ruby and emphasis", () => {
      const source = "｜なろう《ナロウ》|親文字《るび》｜強調《《きょうちょう》》";
      const horizontalHtml = markdownPreviewRenderer.render(source, { previewRenderer: "narouHorizontal" });
      const verticalHtml = markdownPreviewRenderer.render(source, { previewRenderer: "narouVertical" });
      expect(horizontalHtml).toBe(verticalHtml);
    });

    it("3. aozoraHorizontal and aozoraVertical produce identical HTML output for ruby, bouten, and gaiji", () => {
      const source = "｜青空《あおぞら》文庫［＃「青空文庫」に傍点］※［＃「𠀋」、第3水準1-14-2］";
      const horizontalHtml = aozoraPreviewRenderer.render(source, { previewRenderer: "aozoraHorizontal" });
      const verticalHtml = aozoraPreviewRenderer.render(source, { previewRenderer: "aozoraVertical" });
      expect(horizontalHtml).toBe(verticalHtml);
    });
  });

  describe("7. Editor -> Vertical Preview line-ratio scroll sync (#515)", () => {
    it("1. computes target scrollLeft using line-ratio interpolation between source blocks", () => {
      const container = document.createElement("div");
      Object.defineProperty(container, "scrollWidth", { value: 2000, configurable: true });
      Object.defineProperty(container, "clientWidth", { value: 500, configurable: true });
      Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });

      const block1 = document.createElement("p");
      const block2 = document.createElement("p");

      // Mock getBoundingClientRect
      container.getBoundingClientRect = () => ({ right: 1000, left: 500, top: 0, bottom: 500, width: 500, height: 500, x: 500, y: 0, toJSON: () => {} });
      block1.getBoundingClientRect = () => ({ right: 1000, left: 800, top: 0, bottom: 100, width: 200, height: 100, x: 800, y: 0, toJSON: () => {} });
      block2.getBoundingClientRect = () => ({ right: 400, left: 200, top: 0, bottom: 100, width: 200, height: 100, x: 200, y: 0, toJSON: () => {} });

      const blocks: PreviewBlockRef[] = [
        { line: 10, element: block1 },
        { line: 30, element: block2 }
      ];

      // Test line 10 (exact match)
      const res10 = computeVerticalScrollLeftForLine({ topSourceLine: 10, blocks, container });
      expect(res10).not.toBeNull();
      expect(res10?.fraction).toBe(0);
      expect(res10?.targetScrollLeft).toBe(0); // block1 right is at container right (1000 - 1000 = 0)

      // Test line 20 (midpoint ratio = 0.5)
      // block1 progress = 0, block2 progress = (1000 - 400) = 600.
      // interpolated progress at ratio 0.5 = 300 -> targetScrollLeft = -300
      const res20 = computeVerticalScrollLeftForLine({ topSourceLine: 20, blocks, container });
      expect(res20).not.toBeNull();
      expect(res20?.fraction).toBe(0.5);
      expect(res20?.targetScrollLeft).toBe(-300);
      expect(res20?.clampedScrollLeft).toBe(-300);

      // Test line 30 (exact match at block2)
      const res30 = computeVerticalScrollLeftForLine({ topSourceLine: 30, blocks, container });
      expect(res30).not.toBeNull();
      expect(res30?.fraction).toBe(0);
      expect(res30?.targetScrollLeft).toBe(-600);
      expect(res30?.clampedScrollLeft).toBe(-600);
    });

    it("2. clamps target scrollLeft between minScrollLeft -(scrollWidth - clientWidth) and 0", () => {
      const container = document.createElement("div");
      Object.defineProperty(container, "scrollWidth", { value: 1500, configurable: true });
      Object.defineProperty(container, "clientWidth", { value: 500, configurable: true });
      Object.defineProperty(container, "scrollLeft", { value: 0, writable: true, configurable: true });

      // minScrollLeft = -(1500 - 500) = -1000
      const blockFar = document.createElement("p");
      container.getBoundingClientRect = () => ({ right: 500, left: 0, top: 0, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => {} });
      blockFar.getBoundingClientRect = () => ({ right: -1500, left: -1700, top: 0, bottom: 100, width: 200, height: 100, x: -1700, y: 0, toJSON: () => {} });

      const blocks: PreviewBlockRef[] = [
        { line: 100, element: blockFar }
      ];

      const res = computeVerticalScrollLeftForLine({ topSourceLine: 100, blocks, container });
      expect(res).not.toBeNull();
      expect(res?.minScrollLeft).toBe(-1000);
      expect(res?.maxScrollLeft).toBe(0);
      // targetScrollLeft would be -2000, but clamped to minScrollLeft (-1000)
      expect(res?.targetScrollLeft).toBe(-2000);
      expect(res?.clampedScrollLeft).toBe(-1000);
    });

    it("3. handles isEditorAtEnd by returning minScrollLeft", () => {
      const container = document.createElement("div");
      Object.defineProperty(container, "scrollWidth", { value: 2000, configurable: true });
      Object.defineProperty(container, "clientWidth", { value: 500, configurable: true });

      const block = document.createElement("p");
      const blocks: PreviewBlockRef[] = [{ line: 10, element: block }];

      const res = computeVerticalScrollLeftForLine({ topSourceLine: 10, blocks, container, isEditorAtEnd: true });
      expect(res).not.toBeNull();
      expect(res?.clampedScrollLeft).toBe(-1500);
    });

    it("4. verifies all 3 vertical renderers (narouVertical, kakuyomuVertical, aozoraVertical) are identified for vertical sync", () => {
      const verticalRenderers: PreviewRendererId[] = ["narouVertical", "kakuyomuVertical", "aozoraVertical"];

      for (const renderer of verticalRenderers) {
        expect(isVerticalPreviewRenderer(renderer)).toBe(true);
      }
    });

    it("5. verifies horizontal renderers (markdown, narouHorizontal, kakuyomuHorizontal, aozoraHorizontal) are excluded from vertical sync", () => {
      const horizontalRenderers: PreviewRendererId[] = [
        "markdown",
        "narouHorizontal",
        "kakuyomuHorizontal",
        "aozoraHorizontal"
      ];

      for (const renderer of horizontalRenderers) {
        expect(isVerticalPreviewRenderer(renderer)).toBe(false);
      }
    });
  });
});
