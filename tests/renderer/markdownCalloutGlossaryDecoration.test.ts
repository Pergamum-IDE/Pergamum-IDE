// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { shouldSkipGlossarySurfaceDecorationTextNode } from "../../src/renderer/glossarySurfaceDecoration";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

/**
 * #568: against the real rendered callout DOM, the Glossary preview
 * decoration skips the callout title row (icon + label) but still decorates
 * the callout body and normal text.
 */
function decoratableTexts(html: string): string[] {
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim() ?? "";
    if (text.length > 0 && !shouldSkipGlossarySurfaceDecorationTextNode(node.parentElement)) {
      texts.push(text);
    }
  }
  return texts;
}

describe("Glossary decoration vs. callouts (#568)", () => {
  it("excludes the callout label but keeps the body and following text decoratable", () => {
    const html = markdownPreviewRenderer.render(
      "> [!CAUTION]\n> 注意して読むこと。\n\n本文の注意。",
      { previewRenderer: "markdown" }
    );

    const texts = decoratableTexts(html);
    expect(html).toContain('<span class="markdown-callout-label">注意</span>');
    expect(texts).not.toContain("注意");
    expect(texts).toContain("注意して読むこと。");
    expect(texts).toContain("本文の注意。");
  });
});
