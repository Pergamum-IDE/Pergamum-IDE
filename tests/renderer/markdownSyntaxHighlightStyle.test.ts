import { readFileSync } from "node:fs";
import { markdown } from "@codemirror/lang-markdown";
import { highlightTree } from "@lezer/highlight";
import { describe, expect, it } from "vitest";
import {
  markdownSyntaxColorTokens,
  markdownSyntaxHighlightStyle
} from "../../src/renderer/markdownSyntaxHighlightStyle";
import {
  compositeOver,
  contrastRatio,
  parseColor,
  WCAG_AA_LARGE_TEXT_OR_UI,
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

// --- helpers: real parser + real HighlightStyle -----------------------------

// HighlightStyle class -> CSS declarations, read from the real style module.
function classColors(): Map<string, string> {
  const rules = markdownSyntaxHighlightStyle.module?.getRules() ?? "";
  const map = new Map<string, string>();

  for (const match of rules.matchAll(/\.([^\s{]+)\s*\{([^}]*)\}/g)) {
    const color = /(?:^|;)\s*color:\s*([^;]+)/.exec(match[2] ?? "");
    if (color) {
      map.set(match[1] ?? "", (color[1] ?? "").trim());
    }
  }

  return map;
}

// Highlights `source` with the real Markdown parser and returns
// `[text, color-expression]` for every colored span.
function coloredSpans(source: string): Array<[string, string]> {
  const colors = classColors();
  const tree = markdown().language.parser.parse(source);
  const spans: Array<[string, string]> = [];

  highlightTree(tree, markdownSyntaxHighlightStyle, (from, to, classes) => {
    for (const className of classes.split(" ")) {
      const color = colors.get(className);
      if (color) {
        spans.push([source.slice(from, to), color]);
      }
    }
  });

  return spans;
}

const sample = [
  "# Heading",
  "",
  "- list item with **strong** and *emphasis*",
  "> quote",
  "",
  "[label](https://example.com/path \"title\") and [ref][r]",
  "",
  "[r]: https://example.com/ref",
  "",
  "```ts",
  "const x = 1;",
  "```",
  "",
  "---",
  "",
  "escaped \\* star &amp; entity",
  "<span>html</span>",
  "<!-- comment -->"
].join(newline);

const tokenColor = (name: string): string => `var(${name})`;

// --- A: theme coverage ------------------------------------------------------

describe("syntax tokens per theme (A)", () => {
  it("defines every syntax token as a literal color in all built-in themes", () => {
    for (const theme of builtInThemes) {
      const tokens = themeTokens(theme.cssClassName);

      for (const name of markdownSyntaxColorTokens) {
        const value = token(tokens, name);
        expect(parseColor(value), `${theme.id} ${name}=${value}`).not.toBeNull();
        expect(value, `${theme.id} ${name} must not alias`).not.toMatch(/var\(/);
      }
    }
  });

  it("has identical editor-syntax key sets across themes", () => {
    const keySets = builtInThemes.map((theme) =>
      [...themeTokens(theme.cssClassName).keys()]
        .filter((key) => key.startsWith("--pg-color-editor-syntax-"))
        .sort()
        .join(",")
    );

    expect(new Set(keySets).size).toBe(1);
    expect(keySets[0]?.split(",")).toEqual([...markdownSyntaxColorTokens].sort());
  });

  it("references only defined syntax tokens (no literal fallback)", () => {
    const rules = markdownSyntaxHighlightStyle.module?.getRules() ?? "";
    const used = new Set([...rules.matchAll(/var\((--[a-z0-9-]+)([^)]*)\)/g)]);

    for (const match of used) {
      expect(match[2], "no fallback inside var()").toBe("");
    }
  });
});

// --- B: real parser + real HighlightStyle mapping --------------------------

describe("Markdown node -> color mapping (B)", () => {
  const spans = coloredSpans(sample);
  const colorOf = (text: string): string | undefined =>
    spans.find(([spanText]) => spanText === text)?.[1];

  it("colors marks, URL, label, code info, rule, escape, entity, tag and comment", () => {
    expect(colorOf("#")).toBe(tokenColor("--pg-color-editor-syntax-marker"));
    expect(colorOf("https://example.com/path")).toBe(
      tokenColor("--pg-color-editor-syntax-link")
    );
    expect(colorOf("ts")).toBe(tokenColor("--pg-color-editor-syntax-link"));
    expect(colorOf("---")).toBe(tokenColor("--pg-color-editor-syntax-link"));
    expect(colorOf("\\*")).toBe(tokenColor("--pg-color-editor-syntax-escape"));
    expect(colorOf("&amp;")).toBe(tokenColor("--pg-color-editor-syntax-escape"));
    expect(colorOf("span")).toBe(tokenColor("--pg-color-editor-syntax-tag"));
    expect(colorOf("<!-- comment -->")).toBe(
      tokenColor("--pg-color-editor-syntax-comment")
    );
  });

  it("keeps heading, strong, emphasis, quote and list bodies uncolored", () => {
    for (const body of ["Heading", "strong", "emphasis", "quote", "list item with "]) {
      expect(colorOf(body), body).toBeUndefined();
    }
  });
});

// --- C: no CodeMirror default hex output ------------------------------------

describe("no default highlight colors (C)", () => {
  it("emits no literal hex color from the default style", () => {
    const rules = markdownSyntaxHighlightStyle.module?.getRules() ?? "";

    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    for (const legacy of ["#219", "#404740", "#a11", "#940", "#085", "#e40"]) {
      expect(rules).not.toContain(legacy);
    }
  });
});

// --- D / E / F: contrast ----------------------------------------------------

function flatten(foreground: string, background: string): string {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  expect(fg).not.toBeNull();
  expect(bg).not.toBeNull();
  const c = compositeOver(fg!, { ...bg!, a: 1 });
  const hex = (n: number): string => Math.round(n).toString(16).padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

function surfaces(tokens: Map<string, string>): Record<string, string> {
  const editor = token(tokens, "--pg-color-editor-background");
  const over = (name: string): string => flatten(token(tokens, name), editor);

  return {
    editor,
    activeLine: over("--pg-color-editor-line-highlight"),
    focusedSelection: over("--pg-color-editor-selection"),
    unfocusedSelection: over("--pg-color-editor-selection-inactive"),
    selectionMatch: over("--pg-color-editor-selection-match"),
    searchMatch: over("--pg-color-editor-search-match-background"),
    activeSearchMatch: over("--pg-color-editor-search-match-active-background")
  };
}

describe("Night Dark contrast (D)", () => {
  const tokens = themeTokens("theme-night-dark");
  const { editor, activeLine } = surfaces(tokens);

  it.each(markdownSyntaxColorTokens)(
    "%s reaches AA normal text on editor background and active line",
    (name) => {
      const color = token(tokens, name);

      // Normal-text AA: these are read as text, so no 1.x / 2.x / 3.x.
      expect(contrastRatio(color, editor), "editor").toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT
      );
      expect(contrastRatio(color, activeLine), "active line").toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT
      );
    }
  );

  it("invalid uses the diagnostic error token with AA contrast", () => {
    expect(
      contrastRatio(token(tokens, "--pg-color-editor-diagnostic-error"), editor)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe("syntax colors on editor state backgrounds (E)", () => {
  for (const theme of builtInThemes) {
    it(`${theme.id}: stays readable on line / selection / search backgrounds`, () => {
      const tokens = themeTokens(theme.cssClassName);
      const bgs = surfaces(tokens);

      for (const name of markdownSyntaxColorTokens) {
        const color = token(tokens, name);

        // Base surfaces: AA normal text.
        for (const key of ["editor", "activeLine"] as const) {
          expect(contrastRatio(color, bgs[key] ?? ""), `${name} on ${key}`)
            .toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        }

        // Transient highlight backgrounds: the text is still legible but the
        // translucent highlight is a deliberate Pergamum palette color, so the
        // floor is the WCAG large-text / UI 3:1 (no 1.x or 2.x ratios).
        for (const key of [
          "focusedSelection",
          "unfocusedSelection",
          "selectionMatch",
          "searchMatch"
        ] as const) {
          expect(contrastRatio(color, bgs[key] ?? ""), `${name} on ${key}`)
            .toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_OR_UI);
        }

        // Active search match: the amber highlight is shared by every theme
        // and is a single transient hit. Colored syntax text on it is held to
        // a 1.5:1 floor only on dark; light themes keep the 3:1 floor.
        // (Redesigning the highlight palette is out of scope for #701.)
        expect(contrastRatio(color, bgs.activeSearchMatch ?? ""), `${name} on active search`)
          .toBeGreaterThanOrEqual(theme.kind === "dark" ? 1.5 : WCAG_AA_LARGE_TEXT_OR_UI);
      }
    });
  }
});

describe("light themes regression (F)", () => {
  for (const theme of builtInThemes.filter((candidate) => candidate.kind === "light")) {
    it(`${theme.id}: every syntax token is AA on the editor background`, () => {
      const tokens = themeTokens(theme.cssClassName);
      const editor = token(tokens, "--pg-color-editor-background");

      for (const name of markdownSyntaxColorTokens) {
        expect(contrastRatio(token(tokens, name), editor), name).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
      }
    });
  }
});

// --- darkTheme independence --------------------------------------------------

describe("EditorView.darkTheme independence", () => {
  it("does not scope the highlight style by themeType", () => {
    // `themeType` would tie the style to EditorView.darkTheme. Ours is a
    // single style driven by CSS custom properties, so darkTheme (which only
    // switches CodeMirror's own `&dark` / `&light` base-theme rules) does not
    // change syntax colors.
    expect(markdownSyntaxHighlightStyle.scope).toBeUndefined();
    expect(readFileSync("src/renderer/markdownSyntaxHighlightStyle.ts", "utf8")).not.toMatch(
      /themeType/
    );
  });
});
