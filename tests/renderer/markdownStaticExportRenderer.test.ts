// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderMarkdownStaticExport } from "../../src/renderer/export/markdownStaticExportRenderer";
import type { MermaidPreviewMessages } from "../../src/renderer/preview/markdownMermaidRendering";

const mermaidMessages: MermaidPreviewMessages = {
  emptyMessage: "empty",
  errorMessage: "mermaid failed",
  errorHint: "hint",
  showDetailsLabel: "details"
};

describe("renderMarkdownStaticExport (#577 Slice 1)", () => {
  it("renders plain Markdown to static HTML fragment with safe HTML escaping", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "# Title\n\nHello <script>alert(1)</script> world.",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.html).toContain("Title</h1>");
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.usesMath).toBe(false);
    expect(result.katexCss).toBeNull();
    expect(result.exportCss).toContain(".markdown-callout");
    expect(result.exportCss).toContain(".hljs");
    expect(result.exportCss).not.toContain(".katex");
  });

  it("converts Mermaid code blocks to static SVG", async () => {
    const mermaidRender = vi
      .fn()
      .mockResolvedValue({ svg: '<svg id="static-mermaid"></svg>' });

    const result = await renderMarkdownStaticExport({
      markdown: "```mermaid\ngraph TD\nA-->B\n```",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages,
      mermaidRender
    });

    expect(result.html).toContain('<svg id="static-mermaid"></svg>');
    expect(mermaidRender).toHaveBeenCalledOnce();
  });

  it("converts Mermaid syntax errors to static error output", async () => {
    const mermaidRender = vi.fn().mockRejectedValue(new Error("Syntax error"));

    const result = await renderMarkdownStaticExport({
      markdown: "```mermaid\ninvalid mermaid code\n```",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages,
      mermaidRender
    });

    expect(result.html).toContain('class="markdownMermaidError"');
    expect(result.html).toContain("mermaid failed");
    expect(result.html).toContain("Syntax error");
  });

  it("detects inline math and loads KaTeX export CSS", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "Mass-energy equivalence: $E = mc^2$",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.usesMath).toBe(true);
    expect(result.html).toContain('class="katex"');
    expect(typeof result.katexCss).toBe("string");
  });

  it("detects block math and loads KaTeX export CSS", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "$$\n\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}\n$$",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.usesMath).toBe(true);
    expect(result.html).toContain('class="katex-display"');
    expect(typeof result.katexCss).toBe("string");
  });

  it("includes callout markup and callout export CSS", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "> [!NOTE]\n> Important information",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.html).toContain('class="markdown-callout markdown-callout-note"');
    expect(result.exportCss).toContain(".markdown-callout");
  });

  it("includes highlighted fenced code block and syntax highlight export CSS", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "```ts\nconst x: number = 42;\n```",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.html).toContain('<pre><code class="hljs language-ts"');
    expect(result.html).toContain('class="hljs-keyword"');
    expect(result.exportCss).toContain(".hljs-keyword");
  });

  it("rewrites project-local images with projectRoot resolution context (glossary mode)", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "![Diagram](images/chart.png)",
      imageResolutionContext: { kind: "projectRoot" },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.html).toContain('src="assets/images/chart.png"');
    expect(result.imageAssets).toEqual([
      {
        sourceProjectRelativePath: "images/chart.png",
        outputRelativePath: "assets/images/chart.png"
      }
    ]);
  });

  it("rewrites project-local images with sourceFile resolution context (Slice 2 document mode)", async () => {
    const result = await renderMarkdownStaticExport({
      markdown: "![Diagram](../images/chart.png)",
      imageResolutionContext: {
        kind: "sourceFile",
        sourceMarkdownProjectRelativePath: "chapters/ch01.md"
      },
      imageAssetFolderName: "assets",
      mermaidMessages
    });

    expect(result.html).toContain('src="assets/images/chart.png"');
    expect(result.imageAssets).toEqual([
      {
        sourceProjectRelativePath: "images/chart.png",
        outputRelativePath: "assets/images/chart.png"
      }
    ]);
  });
});
