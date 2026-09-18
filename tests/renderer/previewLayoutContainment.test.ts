import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("preview layout containment mitigation (#160)", () => {
  const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
  const glossaryPreviewDecoratorSource = readFileSync(
    "src/renderer/GlossaryPreviewDecorator.tsx",
    "utf8"
  );
  const markdownPreviewRendererSource = readFileSync(
    "src/renderer/preview/markdownPreviewRenderer.ts",
    "utf8"
  );

  function ruleBody(selector: string): string {
    const selectorIndex = stylesSource.indexOf(`${selector} {`);
    const closeIndex = stylesSource.indexOf("}", selectorIndex);

    expect(selectorIndex).toBeGreaterThan(-1);

    return stylesSource.slice(selectorIndex, closeIndex);
  }

  it("scopes the preview container's own layout/paint with CSS containment, without touching how its flex parent sizes it (no `size`/`inline-size` containment)", () => {
    const previewRule = ruleBody(".preview");

    expect(previewRule).toContain("contain: layout paint;");
    expect(previewRule).not.toContain("content-visibility");
  });

  it("applies content-visibility: auto to every top-level block element markdown-it can emit, each with an `auto`-form contain-intrinsic-size placeholder", () => {
    const blockSelectorGroups = [
      ".preview h1,\n.preview h2,\n.preview h3,\n.preview h4,\n.preview h5,\n.preview h6",
      ".preview p,\n.preview ul,\n.preview ol,\n.preview blockquote,\n.preview pre"
    ];

    for (const group of blockSelectorGroups) {
      const groupIndex = stylesSource.indexOf(group);
      const closeIndex = stylesSource.indexOf("}", groupIndex);

      expect(groupIndex).toBeGreaterThan(-1);

      const groupBody = stylesSource.slice(groupIndex, closeIndex);

      expect(groupBody).toContain("content-visibility: auto;");
      expect(groupBody).toMatch(/contain-intrinsic-size:\s*auto\s+\d+px;/);
    }
  });

  it("does not apply content-visibility to inline-level preview elements (code, links, emphasis) — only block-level containment boxes", () => {
    const codeRule = ruleBody(".preview code");
    const preCodeRule = ruleBody(".preview pre code");

    expect(codeRule).not.toContain("content-visibility");
    expect(preCodeRule).not.toContain("content-visibility");
  });

  it("does not change markdown-it configuration (parser options untouched by the layout mitigation)", () => {
    expect(markdownPreviewRendererSource).toContain(
      "new MarkdownIt({\n  html: false,\n  linkify: true\n});"
    );
  });

  it("does not change the preview container's element/class or GlossaryPreviewDecorator's DOM-writing logic — mitigation is CSS-only", () => {
    expect(glossaryPreviewDecoratorSource).toContain(
      '<article className={className} ref={previewRef} />'
    );
    expect(glossaryPreviewDecoratorSource).toContain(
      "previewElement.innerHTML = previewHtml;"
    );
    // decoratePreviewContainer still walks the live DOM via TreeWalker,
    // which visits nodes regardless of content-visibility's render-skip —
    // glossary decoration coverage is unaffected by the CSS change.
    expect(glossaryPreviewDecoratorSource).toContain(
      "document.createTreeWalker("
    );
  });

  it("does not add any new debug log event or touch existing document.open measurement event names", () => {
    expect(stylesSource).not.toContain("document.open");
    expect(stylesSource).not.toContain("logRendererDebugEvent");
  });
});
