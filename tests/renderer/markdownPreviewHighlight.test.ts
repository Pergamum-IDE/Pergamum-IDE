import { describe, expect, it } from "vitest";
import { renderHighlightedCodeBlock } from "../../src/renderer/preview/codeHighlight";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

// ---------------------------------------------------------------------------
// renderHighlightedCodeBlock — unit tests
// ---------------------------------------------------------------------------

describe("renderHighlightedCodeBlock (#536)", () => {
  describe("known language — highlights code", () => {
    it("wraps output in <pre><code class='hljs language-*'>", () => {
      const result = renderHighlightedCodeBlock("javascript", "const x = 1;");
      expect(result).toMatch(/^<pre><code class="hljs language-javascript">/);
      expect(result).toContain("</code></pre>");
    });

    it("produces highlight.js span markup for a known language (javascript)", () => {
      const result = renderHighlightedCodeBlock("javascript", "const x = 1;");
      expect(result).toContain("hljs-keyword");
    });

    it("produces highlight.js span markup for TypeScript", () => {
      const result = renderHighlightedCodeBlock("typescript", "interface Foo { bar: string; }");
      expect(result).toContain("hljs-");
    });

    it("produces highlight.js span markup for Python", () => {
      const result = renderHighlightedCodeBlock("python", "def hello(): pass");
      expect(result).toContain("hljs-");
    });

    it("does not double-escape HTML entities in highlighted output", () => {
      // highlight.js already escapes < and > in its output.
      // We must not re-escape them.
      const result = renderHighlightedCodeBlock(
        "javascript",
        "const a = x < y && y > z;"
      );
      // The rendered HTML must NOT contain &amp;lt; or &amp;gt; (double-escaped forms)
      expect(result).not.toContain("&amp;lt;");
      expect(result).not.toContain("&amp;gt;");
      // It must still contain properly escaped single-level entities
      expect(result).toContain("&lt;");
      expect(result).toContain("&gt;");
    });
  });

  describe("alias language support", () => {
    it("resolves 'js' alias to javascript", () => {
      const result = renderHighlightedCodeBlock("js", "const x = 1;");
      expect(result).toContain("hljs language-js");
      expect(result).toContain("hljs-keyword");
    });

    it("resolves 'ts' alias to typescript", () => {
      const result = renderHighlightedCodeBlock("ts", "const x: number = 1;");
      expect(result).toContain("hljs language-ts");
      expect(result).toContain("hljs-");
    });

    it("resolves 'py' alias to python", () => {
      const result = renderHighlightedCodeBlock("py", "x = 1");
      expect(result).toContain("hljs language-py");
    });

    it("resolves 'sh' alias to shell", () => {
      const result = renderHighlightedCodeBlock("sh", "echo hello");
      expect(result).toContain("hljs language-sh");
    });
  });

  describe("unknown language — plaintext fallback", () => {
    it("falls back to plain <pre><code> for an unrecognized language", () => {
      const result = renderHighlightedCodeBlock("unknownlang999", "some code");
      expect(result).not.toContain("hljs-keyword");
      expect(result).toContain("<pre><code");
      expect(result).toContain("some code");
    });

    it("preserves the language class in the fallback", () => {
      const result = renderHighlightedCodeBlock("unknownlang999", "some code");
      expect(result).toContain('class="language-unknownlang999"');
    });

    it("escapes HTML in the plaintext fallback for unknown language", () => {
      const result = renderHighlightedCodeBlock(
        "unknownlang999",
        "<script>alert('xss')</script>"
      );
      expect(result).not.toContain("<script>");
      expect(result).toContain("&lt;script&gt;");
      expect(result).toContain("&#39;");
    });
  });

  describe("missing language — plaintext fallback", () => {
    it("falls back to plain <pre><code> when info is empty string", () => {
      const result = renderHighlightedCodeBlock("", "some code");
      expect(result).not.toContain("hljs-");
      expect(result).toContain("<pre><code>");
      expect(result).toContain("some code");
    });

    it("falls back to plain <pre><code> when info is only whitespace", () => {
      const result = renderHighlightedCodeBlock("   ", "some code");
      expect(result).not.toContain("hljs-");
      expect(result).toContain("<pre><code>");
    });

    it("escapes HTML in the plaintext fallback for missing language", () => {
      const result = renderHighlightedCodeBlock("", "<b>bold</b> & 'quotes'");
      expect(result).not.toContain("<b>");
      expect(result).toContain("&lt;b&gt;");
      expect(result).toContain("&amp;");
      expect(result).toContain("&#39;");
    });
  });

  describe("info string parsing — first token only", () => {
    it("uses only the first whitespace-separated token from the info string", () => {
      // 'javascript filename.js' → language is 'javascript'
      const result = renderHighlightedCodeBlock("javascript filename.js", "const x = 1;");
      expect(result).toContain("hljs language-javascript");
      expect(result).toContain("hljs-keyword");
    });

    it("handles info string with tab-separated tokens", () => {
      const result = renderHighlightedCodeBlock("python\tsomefile.py", "x = 1");
      expect(result).toContain("hljs language-python");
    });

    it("unknown first token falls back even when rest of info is non-empty", () => {
      const result = renderHighlightedCodeBlock("unknownlang999 filename.txt", "code");
      expect(result).not.toContain("hljs-keyword");
      expect(result).toContain("language-unknownlang999");
    });
  });
});

// ---------------------------------------------------------------------------
// markdownPreviewRenderer — integration tests for fenced code blocks
// ---------------------------------------------------------------------------

describe("markdownPreviewRenderer fenced code block rendering (#536)", () => {
  it("renders a known-language fenced block with hljs markup", () => {
    const md = "```javascript\nconst x = 1;\n```";
    const html = markdownPreviewRenderer.render(md);
    expect(html).toContain('class="hljs language-javascript"');
    expect(html).toContain("hljs-keyword");
  });

  it("renders a missing-language fenced block as escaped plaintext", () => {
    const md = "```\nplain text here\n```";
    const html = markdownPreviewRenderer.render(md);
    expect(html).not.toContain("hljs-");
    expect(html).toContain("plain text here");
    // data-source-line is attached by source_line_anchors, so expect <code
    // with data-source-line rather than a bare <pre><code>
    expect(html).toContain("<pre><code");
    expect(html).not.toContain('class="hljs');
  });

  it("renders an unknown-language fenced block as escaped plaintext", () => {
    const md = "```unknownlang999\nsome code\n```";
    const html = markdownPreviewRenderer.render(md);
    expect(html).not.toContain("hljs-keyword");
    expect(html).toContain("some code");
  });

  it("escapes HTML in a missing-language fenced block", () => {
    const md = "```\n<script>alert('xss')</script>\n```";
    const html = markdownPreviewRenderer.render(md);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("does not double-escape highlighted output", () => {
    const md = "```javascript\nconst a = x < y && y > z;\n```";
    const html = markdownPreviewRenderer.render(md);
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;gt;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });

  it("does not affect non-code Markdown (heading, paragraph)", () => {
    const md = "# Title\n\nSome paragraph text.";
    const html = markdownPreviewRenderer.render(md);
    expect(html).toMatch(/<h1[^>]*>Title<\/h1>/);
    expect(html).toContain("Some paragraph text.");
    expect(html).not.toContain("hljs-");
  });

  it("does not affect inline code (backtick)", () => {
    const md = "This is `inline code` in a paragraph.";
    const html = markdownPreviewRenderer.render(md);
    expect(html).toContain("<code>inline code</code>");
    expect(html).not.toContain("hljs-");
  });
});
