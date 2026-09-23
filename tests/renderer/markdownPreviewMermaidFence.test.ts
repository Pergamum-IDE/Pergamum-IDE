import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";
import {
  MERMAID_BLOCK_CLASS,
  MERMAID_SOURCE_CLASS
} from "../../src/renderer/preview/mermaidPreviewPlaceholder";

const mermaidMd = "```mermaid\ngraph TD\n  A --> B\n```";

describe("markdownPreviewRenderer Mermaid fence handling (#564)", () => {
  it("emits a Mermaid placeholder for a mermaid fence in Markdown horizontal preview", () => {
    const html = markdownPreviewRenderer.render(mermaidMd, {
      previewRenderer: "markdown"
    });

    expect(html).toContain(MERMAID_BLOCK_CLASS);
    expect(html).toContain(MERMAID_SOURCE_CLASS);
    expect(html).not.toContain("<pre><code");
  });

  it("still uses the existing syntax-highlight code block path for a ts fence", () => {
    const md = "```ts\nconst x: number = 1;\n```";
    const html = markdownPreviewRenderer.render(md, {
      previewRenderer: "markdown"
    });

    expect(html).toContain("hljs language-ts");
    expect(html).not.toContain(MERMAID_BLOCK_CLASS);
  });

  it("does not treat 'mmd' as Mermaid — it remains a normal code block", () => {
    const md = "```mmd\ngraph TD\n  A --> B\n```";
    const html = markdownPreviewRenderer.render(md, {
      previewRenderer: "markdown"
    });

    expect(html).not.toContain(MERMAID_BLOCK_CLASS);
    expect(html).toContain("<pre><code");
    expect(html).toContain("language-mmd");
  });

  it.each(["mermaid", "Mermaid", "MERMAID"])(
    "emits a Mermaid placeholder regardless of fence info casing ('%s')",
    (info) => {
      const md = `\`\`\`${info}\ngraph TD\n  A --> B\n\`\`\``;
      const html = markdownPreviewRenderer.render(md, {
        previewRenderer: "markdown"
      });

      expect(html).toContain(MERMAID_BLOCK_CLASS);
      expect(html).toContain(MERMAID_SOURCE_CLASS);
      expect(html).not.toContain("<pre><code");
    }
  );

  it("still does not treat 'mmd' as Mermaid regardless of casing", () => {
    const md = "```MMD\ngraph TD\n  A --> B\n```";
    const html = markdownPreviewRenderer.render(md, {
      previewRenderer: "markdown"
    });

    expect(html).not.toContain(MERMAID_BLOCK_CLASS);
    expect(html).toContain("<pre><code");
  });

  it("does not inject raw Mermaid source as unescaped HTML", () => {
    const md =
      "```mermaid\nA[<img src=x onerror=alert(1)>] --> B\n```";
    const html = markdownPreviewRenderer.render(md, {
      previewRenderer: "markdown"
    });

    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html).toContain("&lt;img");
  });

  it("never sends a mermaid fence through highlight.js", () => {
    const html = markdownPreviewRenderer.render(mermaidMd, {
      previewRenderer: "markdown"
    });

    expect(html).not.toContain("hljs");
  });

  it("carries data-source-line on the Mermaid placeholder for scroll-sync", () => {
    const md = "# Title\n\n```mermaid\ngraph TD\n  A --> B\n```";
    const html = markdownPreviewRenderer.render(md, {
      previewRenderer: "markdown"
    });

    expect(html).toMatch(
      new RegExp(`class="${MERMAID_BLOCK_CLASS}" data-source-line="\\d+"`)
    );
  });

  // ---------------------------------------------------------------------
  // Scope regression: Mermaid must never activate outside Markdown
  // horizontal preview, even though narouHorizontal / kakuyomuHorizontal /
  // narouVertical / kakuyomuVertical share this SAME markdown-it instance.
  // ---------------------------------------------------------------------
  it.each([
    "narouHorizontal",
    "kakuyomuHorizontal",
    "narouVertical",
    "kakuyomuVertical"
  ] as const)(
    "does not emit a Mermaid placeholder for previewRenderer=%s",
    (previewRenderer) => {
      const html = markdownPreviewRenderer.render(mermaidMd, {
        previewRenderer
      });

      expect(html).not.toContain(MERMAID_BLOCK_CLASS);
      expect(html).toContain("<pre><code");
    }
  );

  it("does not emit a Mermaid placeholder when previewRenderer is omitted (e.g. Glossary preview)", () => {
    const html = markdownPreviewRenderer.render(mermaidMd);

    expect(html).not.toContain(MERMAID_BLOCK_CLASS);
    expect(html).toContain("<pre><code");
  });
});
