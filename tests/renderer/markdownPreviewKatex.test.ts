import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import { aozoraPreviewRenderer } from "../../src/renderer/preview/aozoraPreviewRenderer";

describe("markdownPreviewRenderer KaTeX math rendering (#566)", () => {
  describe("Markdown horizontal preview (previewRenderer: 'markdown')", () => {
    it("renders inline math ($...$) as KaTeX", () => {
      const html = markdownPreviewRenderer.render(
        "これは $E = mc^2$ の例です。",
        { previewRenderer: "markdown" }
      );

      expect(html).toContain('class="katex"');
      expect(html).toContain("katex-mathml");
      expect(html).toContain("katex-html");
      // The literal "$" delimiters must not survive into the output.
      expect(html).not.toContain("$E = mc^2$");
    });

    it("renders single-line display math ($$...$$) as KaTeX display math", () => {
      const html = markdownPreviewRenderer.render("$$ E = mc^2 $$", {
        previewRenderer: "markdown"
      });

      expect(html).toContain("katex-block");
      expect(html).toContain("katex-display");
    });

    it("renders multiline display math as KaTeX display math", () => {
      const md = "$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toContain("katex-block");
      expect(html).toContain("katex-display");
      expect(html).toContain("int_0^1"); // present in the MathML annotation
    });

    it("renders multiple math expressions in one document", () => {
      const md =
        "$a = 1$ and $b = 2$\n\n$$\nc = 3\n$$\n\n$$\nd = 4\n$$";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      // Every inline/display expression contains its own `class="katex"`
      // span (display math nests one inside `katex-display`), so this is
      // 2 inline + 2 display = 4.
      const katexSpanCount = (html.match(/class="katex"/g) ?? []).length;
      const displayBlockCount = (html.match(/katex-block/g) ?? []).length;
      expect(katexSpanCount).toBe(4);
      expect(displayBlockCount).toBe(2);
    });

    it("carries data-source-line on a display math block for scroll-sync", () => {
      const md = "# Title\n\n$$\nE = mc^2\n$$";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toMatch(/<div data-source-line="\d+"><p class="katex-block"/);
    });

    it("does not throw and keeps the rest of the preview intact when math is invalid", () => {
      const md = "前置き\n\n$\\invalidcmd{$\n\n後書き";

      expect(() =>
        markdownPreviewRenderer.render(md, { previewRenderer: "markdown" })
      ).not.toThrow();

      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });
      expect(html).toContain("前置き");
      expect(html).toContain("後書き");
      expect(html).toContain("katex-error");
    });

    it("does not inject raw math source or error text as unescaped HTML", () => {
      const md = "$\\text{<img src=x onerror=alert(1)>}$";

      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).not.toContain("<img src=x onerror=alert(1)>");
      expect(html).not.toContain("onerror=alert(1)>");
    });

    it("keeps ordinary dollar-sign prose as plain text (matches the plugin's own delimiter behavior)", () => {
      const html = markdownPreviewRenderer.render(
        "これは通常のドル表記です: $100 and $200",
        { previewRenderer: "markdown" }
      );

      expect(html).toContain("$100 and $200");
      expect(html).not.toContain('class="katex"');
    });
  });

  // ---------------------------------------------------------------------
  // Scope guard: KaTeX must never activate outside Markdown horizontal
  // preview, even though narouHorizontal / kakuyomuHorizontal /
  // narouVertical / kakuyomuVertical share this SAME markdown-it instance.
  // ---------------------------------------------------------------------
  describe("scope guard — math stays literal text outside Markdown horizontal preview", () => {
    const mathMd = "これは $E = mc^2$ の例です。";

    it.each([
      "narouHorizontal",
      "kakuyomuHorizontal",
      "narouVertical",
      "kakuyomuVertical"
    ] as const)("does not render math for previewRenderer=%s", (previewRenderer) => {
      const html = markdownPreviewRenderer.render(mathMd, { previewRenderer });

      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$E = mc^2$");
    });

    it("does not render math when previewRenderer is omitted (e.g. Glossary preview)", () => {
      const html = markdownPreviewRenderer.render(mathMd);

      expect(html).not.toContain('class="katex"');
      expect(html).toContain("$E = mc^2$");
    });

    it("does not affect Aozora preview (separate rendering pipeline)", () => {
      const html = aozoraPreviewRenderer.render(mathMd, {
        previewRenderer: "aozoraHorizontal"
      });

      expect(html).not.toContain('class="katex"');
    });

    it("re-enables math on a subsequent Markdown horizontal render after a non-math render", () => {
      // Guards against the enable/disable toggle leaking stale state between
      // calls — Narou first, then Markdown, on the SAME shared instance.
      markdownPreviewRenderer.render(mathMd, {
        previewRenderer: "narouHorizontal"
      });
      const html = markdownPreviewRenderer.render(mathMd, {
        previewRenderer: "markdown"
      });

      expect(html).toContain('class="katex"');
    });
  });

  // ---------------------------------------------------------------------
  // Regression: existing fence handling (#536 highlight.js, #564 Mermaid)
  // and ordinary Markdown must be unaffected by KaTeX.
  // ---------------------------------------------------------------------
  describe("regression — existing fence / rendering behavior unchanged", () => {
    it("still highlights a ts fenced code block via highlight.js", () => {
      const md = "```ts\nconst x: number = 1;\n```";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toContain("hljs language-ts");
    });

    it("still renders a mermaid fenced code block as a Mermaid placeholder", () => {
      const md = "```mermaid\ngraph TD\n  A --> B\n```";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toContain("markdownMermaidBlock");
      expect(html).not.toContain('class="katex"');
    });

    it("does not affect ordinary Markdown rendering", () => {
      const md = "# Title\n\nSome paragraph text.";
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
      expect(html).toContain("Some paragraph text.");
      expect(html).not.toContain('class="katex"');
    });
  });
});
