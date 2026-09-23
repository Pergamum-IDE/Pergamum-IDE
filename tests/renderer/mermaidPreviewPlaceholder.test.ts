// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
  MERMAID_BLOCK_CLASS,
  MERMAID_SOURCE_CLASS,
  isMermaidFenceInfo,
  renderMermaidPlaceholder
} from "../../src/renderer/preview/mermaidPreviewPlaceholder";

describe("isMermaidFenceInfo (#564)", () => {
  it("matches an exact 'mermaid' info string", () => {
    expect(isMermaidFenceInfo("mermaid")).toBe(true);
  });

  it("matches when the info string has trailing tokens", () => {
    expect(isMermaidFenceInfo("mermaid extra tokens")).toBe(true);
  });

  it("matches with surrounding whitespace / tabs", () => {
    expect(isMermaidFenceInfo("  mermaid  ")).toBe(true);
    expect(isMermaidFenceInfo("mermaid\tfoo")).toBe(true);
  });

  it("does not match the 'mmd' alias", () => {
    expect(isMermaidFenceInfo("mmd")).toBe(false);
  });

  it("does not match an unrelated language", () => {
    expect(isMermaidFenceInfo("typescript")).toBe(false);
    expect(isMermaidFenceInfo("")).toBe(false);
  });

  it("matches case-insensitively — a mismatched case must not silently fall back to a code block", () => {
    expect(isMermaidFenceInfo("Mermaid")).toBe(true);
    expect(isMermaidFenceInfo("MERMAID")).toBe(true);
    expect(isMermaidFenceInfo("MeRmAiD")).toBe(true);
  });
});

describe("renderMermaidPlaceholder (#564)", () => {
  it("wraps the block in the expected container/source classes", () => {
    const html = renderMermaidPlaceholder("graph TD\n  A --> B");
    expect(html).toContain(`class="${MERMAID_BLOCK_CLASS}"`);
    expect(html).toContain(`class="${MERMAID_SOURCE_CLASS}"`);
    expect(html).toContain("hidden");
  });

  it("escapes HTML-special characters in the source instead of injecting raw HTML", () => {
    const html = renderMermaidPlaceholder(
      "graph TD\n  A[<img src=x onerror=alert(1)>] --> B"
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror=alert(1)>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&gt;");
  });

  it("escapes quotes and ampersands in the source", () => {
    const html = renderMermaidPlaceholder(`A["He said ""hi"" & left"] --> B`);
    expect(html).toContain("&quot;");
    expect(html).toContain("&amp;");
  });

  it("round-trips the exact original source through HTML entity decoding", () => {
    const source = 'graph TD\n  A["<tag> & \'quote\' \\"x\\""] --> B';
    const html = renderMermaidPlaceholder(source);

    const container = document.createElement("div");
    container.innerHTML = html;
    const pre = container.querySelector(`.${MERMAID_SOURCE_CLASS}`);

    expect(pre?.textContent).toBe(source);
  });

  it("places data-source-line on the container when provided", () => {
    const html = renderMermaidPlaceholder("graph TD\n  A --> B", "12");
    expect(html).toContain('data-source-line="12"');
  });

  it("omits data-source-line when not provided", () => {
    const html = renderMermaidPlaceholder("graph TD\n  A --> B");
    expect(html).not.toContain("data-source-line");
  });
});
