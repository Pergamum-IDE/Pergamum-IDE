import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  previewSyntaxColorTokens,
  renderHighlightedCodeBlock
} from "../../src/renderer/preview/codeHighlight";
import {
  contrastRatio,
  parseColor,
  WCAG_AA_NORMAL_TEXT
} from "../../src/shared/colorContrast";
import { builtInThemes } from "../../src/shared/colorTheme";

const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
const newline = String.fromCharCode(10);

function themeTokens(cssClassName: string): Map<string, string> {
  const start = stylesSource.indexOf(`.${cssClassName} {`);
  expect(start, `.${cssClassName} block missing`).toBeGreaterThanOrEqual(0);
  const end = stylesSource.indexOf(`${newline}}${newline}`, start);
  const tokens = new Map<string, string>();

  for (const match of stylesSource
    .slice(start, end)
    .matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(match[1] ?? "", (match[2] ?? "").trim());
  }

  return tokens;
}

function token(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name);
  expect(value, `${name} missing`).toBeDefined();
  return value ?? "";
}

// ---------------------------------------------------------------------------
// A: Theme token coverage and contract
// ---------------------------------------------------------------------------

describe("Preview syntax tokens per theme (A)", () => {
  it("defines every preview syntax token as a literal color in all built-in themes", () => {
    for (const theme of builtInThemes) {
      const tokens = themeTokens(theme.cssClassName);

      for (const name of previewSyntaxColorTokens) {
        const value = token(tokens, name);
        expect(parseColor(value), `${theme.id} ${name}=${value}`).not.toBeNull();
        expect(value, `${theme.id} ${name} must not alias`).not.toMatch(/var\(/);
      }
    }
  });

  it("has identical preview-syntax key sets across themes", () => {
    const keySets = builtInThemes.map((theme) =>
      [...themeTokens(theme.cssClassName).keys()]
        .filter((key) => key.startsWith("--pg-color-preview-syntax-"))
        .sort()
        .join(",")
    );

    expect(new Set(keySets).size).toBe(1);
    expect(keySets[0]?.split(",")).toEqual([...previewSyntaxColorTokens].sort());
  });

  it("includes all preview-syntax tokens in print media query", () => {
    const printStart = stylesSource.indexOf("@media print {");
    expect(printStart).toBeGreaterThanOrEqual(0);
    const printEnd = stylesSource.indexOf(`${newline}}`, printStart);
    const printBlock = stylesSource.slice(printStart, printEnd);

    for (const name of previewSyntaxColorTokens) {
      expect(printBlock, `${name} missing in @media print`).toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------
// B: CSS rules in styles.css
// ---------------------------------------------------------------------------

describe("Preview syntax CSS rules in styles.css (B)", () => {
  it("does not hardcode background or color on .preview pre code.hljs", () => {
    const match = /\.preview\s+pre\s+code\.hljs\s*\{([^}]*)\}/.exec(stylesSource);
    expect(match).not.toBeNull();
    const declarations = match?.[1] ?? "";

    expect(declarations).not.toMatch(/background:\s*#ffffff/i);
    expect(declarations).not.toMatch(/color:\s*#24292e/i);
  });

  it("uses var(--pg-color-preview-syntax-*) for highlight.js syntax rules", () => {
    const hljsSectionStart = stylesSource.indexOf("#707: highlight.js syntax highlighting");
    expect(hljsSectionStart).toBeGreaterThanOrEqual(0);
    const hljsSectionEnd = stylesSource.indexOf("/* #564:", hljsSectionStart);
    expect(hljsSectionEnd).toBeGreaterThanOrEqual(0);
    const searchArea = stylesSource.slice(hljsSectionStart, hljsSectionEnd);

    for (const name of previewSyntaxColorTokens) {
      expect(searchArea, `${name} must be used in preview syntax rules`).toContain(`var(${name})`);
    }
  });
});

// ---------------------------------------------------------------------------
// C: Contrast on code block background
// ---------------------------------------------------------------------------

describe("Preview syntax token contrast (C)", () => {
  const textTokens = [
    "--pg-color-preview-syntax-comment",
    "--pg-color-preview-syntax-keyword",
    "--pg-color-preview-syntax-string",
    "--pg-color-preview-syntax-number",
    "--pg-color-preview-syntax-title",
    "--pg-color-preview-syntax-tag",
    "--pg-color-preview-syntax-attribute",
    "--pg-color-preview-syntax-meta",
    "--pg-color-preview-syntax-addition",
    "--pg-color-preview-syntax-deletion"
  ] as const;

  for (const theme of builtInThemes) {
    describe(`${theme.label} (${theme.id})`, () => {
      const tokens = themeTokens(theme.cssClassName);
      const codeBg = token(tokens, "--pg-color-preview-code-block-background");
      const codeFg = token(tokens, "--pg-color-preview-code-block-foreground");

      it("plain code foreground meets WCAG AA on code block background", () => {
        const ratio = contrastRatio(codeFg, codeBg);
        expect(ratio, `plain code foreground on codeBg (${ratio.toFixed(2)})`).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
      });

      for (const tokenName of textTokens) {
        it(`${tokenName} meets WCAG AA (>= 4.5:1) on code block background`, () => {
          const color = token(tokens, tokenName);
          const ratio = contrastRatio(color, codeBg);
          expect(ratio, `${tokenName} (${color}) on codeBg (${codeBg}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
            WCAG_AA_NORMAL_TEXT
          );
        });
      }

      it("diff addition and deletion meet AA contrast on their respective backgrounds", () => {
        const addFg = token(tokens, "--pg-color-preview-syntax-addition");
        const addBg = token(tokens, "--pg-color-preview-syntax-addition-background");
        const delFg = token(tokens, "--pg-color-preview-syntax-deletion");
        const delBg = token(tokens, "--pg-color-preview-syntax-deletion-background");

        expect(contrastRatio(addFg, addBg), "addition on addition-bg").toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
        expect(contrastRatio(delFg, delBg), "deletion on deletion-bg").toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
      });
    });
  }

  describe("Ginza Night high contrast (>= 7:1)", () => {
    const tokens = themeTokens("theme-ginza-night");
    const codeBg = token(tokens, "--pg-color-preview-code-block-background");

    for (const tokenName of textTokens) {
      it(`${tokenName} meets 7:1 high contrast on Ginza Night code background`, () => {
        const color = token(tokens, tokenName);
        const ratio = contrastRatio(color, codeBg);
        expect(ratio, `${tokenName} on Ginza Night codeBg = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(
          7.0
        );
      });
    }
  });
});

// ---------------------------------------------------------------------------
// D: Real highlight.js rendering
// ---------------------------------------------------------------------------

describe("Real highlight.js fenced code rendering (D)", () => {
  it("renders TypeScript code block with expected highlight.js classes", () => {
    const code = [
      "const answer: number = 42;",
      "function greet(name: string): string {",
      "  // comment",
      "  return `hello ${name}`;",
      "}"
    ].join("\n");

    const html = renderHighlightedCodeBlock("ts", code);
    expect(html).toContain("hljs language-ts");
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-title");
    expect(html).toContain("hljs-number");
    expect(html).toContain("hljs-comment");
  });

  it("renders HTML code block with tag and attr classes", () => {
    const code = '<div class="container" id="main"><p>text</p></div>';
    const html = renderHighlightedCodeBlock("html", code);

    expect(html).toContain("hljs language-html");
    expect(html).toContain("hljs-tag");
    expect(html).toContain("hljs-name");
    expect(html).toContain("hljs-attr");
    expect(html).toContain("hljs-string");
  });

  it("renders JSON code block with attr and literal classes", () => {
    const code = '{"enabled": true, "count": 10, "items": null}';
    const html = renderHighlightedCodeBlock("json", code);

    expect(html).toContain("hljs language-json");
    expect(html).toContain("hljs-attr");
    expect(html).toContain("hljs-literal");
    expect(html).toContain("hljs-number");
  });

  it("renders Bash code block with built_in and string classes", () => {
    const code = 'echo "hello world" # a comment';
    const html = renderHighlightedCodeBlock("bash", code);

    expect(html).toContain("hljs language-bash");
    expect(html).toContain("hljs-built_in");
    expect(html).toContain("hljs-string");
    expect(html).toContain("hljs-comment");
  });

  it("renders Diff code block with addition and deletion classes", () => {
    const code = "+ added line\n- deleted line";
    const html = renderHighlightedCodeBlock("diff", code);

    expect(html).toContain("hljs language-diff");
    expect(html).toContain("hljs-addition");
    expect(html).toContain("hljs-deletion");
  });
});

// ---------------------------------------------------------------------------
// E: Unknown language and plaintext fallback
// ---------------------------------------------------------------------------

describe("Unknown language and plaintext fallback (E)", () => {
  it("renders unknown language with language class but without hljs class", () => {
    const html = renderHighlightedCodeBlock("unknown-language", "plain text");
    expect(html).toContain('<code class="language-unknown-language"');
    expect(html).not.toContain("hljs");
    expect(html).toContain("plain text");
  });

  it("renders missing language without classes or hljs", () => {
    const html = renderHighlightedCodeBlock("", "plain fenced text");
    expect(html).toBe("<pre><code>plain fenced text</code></pre>\n");
  });
});
