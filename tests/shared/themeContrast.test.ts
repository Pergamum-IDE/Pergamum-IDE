import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInThemes } from "../../src/shared/colorTheme";
import {
  contrastRatio,
  parseColor,
  WCAG_AA_LARGE_TEXT_OR_UI,
  WCAG_AA_NORMAL_TEXT,
  WCAG_AAA_NORMAL_TEXT
} from "../../src/shared/colorContrast";

describe("contrastRatio (WCAG 2.x)", () => {
  it("matches the reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // #767676 on white is the well-known 4.54:1 AA boundary gray.
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });

  it("is symmetric and understands #rgb, rgb() and rgba()", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 5);
    expect(contrastRatio("rgb(255, 255, 255)", "#000000")).toBeCloseTo(21, 5);
    expect(parseColor("rgba(0, 0, 0, 0.5)")?.a).toBe(0.5);
  });

  it("composites a translucent foreground over the background", () => {
    // 50% black over white is #808080-ish: far below 21:1.
    expect(contrastRatio("rgba(0, 0, 0, 0.5)", "#ffffff")).toBeLessThan(6);
  });

  it("throws on an unsupported color so bad tokens fail loudly", () => {
    expect(() => contrastRatio("hotpink", "#fff")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Theme token contrast. Tokens are read straight from styles.css, one block
// per registered built-in theme, so adding a theme to the registry (and its
// `.theme-<id>` block) automatically puts it under these checks.
// ---------------------------------------------------------------------------

const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
const newline = String.fromCharCode(10);

function themeTokens(cssClassName: string): Map<string, string> {
  const opener = `.${cssClassName} {`;
  const start = stylesSource.indexOf(opener);
  expect(start, `${opener} block missing in styles.css`).toBeGreaterThanOrEqual(
    0
  );
  const end = stylesSource.indexOf(`${newline}}${newline}`, start);
  const tokens = new Map<string, string>();

  for (const match of stylesSource
    .slice(start, end)
    .matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
    tokens.set(match[1] ?? "", (match[2] ?? "").trim());
  }

  return tokens;
}

interface ContrastPair {
  readonly label: string;
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

const text = WCAG_AA_NORMAL_TEXT;
const ui = WCAG_AA_LARGE_TEXT_OR_UI;

// Pairs every theme must satisfy. Token names are the semantic
// `--pg-color-*` tokens; add a pair here when a new readable surface appears.
const requiredPairs: readonly ContrastPair[] = [
  pair("app text", "app-foreground", "app-background", text),
  pair("surface text", "surface-foreground", "surface-background", text),
  pair("surface muted text", "surface-muted", "surface-background", text),
  pair("panel text", "panel-foreground", "panel-background", text),
  pair("body text", "text-body", "surface-background", text),
  pair("strong text", "text-strong", "surface-background", text),
  pair("preview text", "preview-foreground", "preview-background", text),
  pair("preview muted text", "preview-muted", "preview-background", text),
  pair("preview link", "preview-link", "preview-background", text),
  pair("preview visited link", "preview-link-visited", "preview-background", text),
  pair("preview code", "preview-code-foreground", "preview-code-background", text),
  pair(
    "preview code block",
    "preview-code-block-foreground",
    "preview-code-block-background",
    text
  ),
  pair(
    "preview table header",
    "preview-table-header-foreground",
    "preview-table-header-background",
    text
  ),
  pair("preview table border", "preview-table-border", "preview-background", 1.2),
  // A 3px decorative accent bar next to text that carries the meaning, so
  // WCAG 1.4.11 (3:1) does not strictly apply; still must not vanish.
  pair(
    "preview blockquote border",
    "preview-blockquote-border",
    "preview-background",
    2
  ),
  pair("editor text", "editor-foreground", "editor-background", text),
  pair("editor caret", "editor-caret", "editor-background", ui),
  pair("editor gutter text", "editor-gutter-foreground", "editor-gutter-background", 3.5),
  pair(
    "editor gutter marker",
    "editor-gutter-marker",
    "editor-gutter-background",
    ui
  ),
  pair("editor tooltip text", "editor-tooltip-foreground", "editor-tooltip-background", text),
  pair("button text", "button-foreground", "button-background", text),
  pair(
    "toolbar button text",
    "toolbar-button-foreground",
    "panel-background",
    text
  ),
  pair(
    "toolbar button hover text",
    "toolbar-button-foreground",
    "toolbar-button-hover-background",
    text
  ),
  pair(
    "toolbar pressed button text",
    "toolbar-button-pressed-foreground",
    "toolbar-button-pressed-background",
    ui
  ),
  pair("tab text", "tab-foreground", "tab-bar-background", text),
  pair("active tab text", "tab-active-foreground", "tab-active-background", text),
  pair("activity bar icon", "activitybar-foreground", "activitybar-background", ui),
  pair("icon", "icon-foreground", "surface-background", ui),
  pair("welcome card title", "welcome-card-foreground", "welcome-card-background", text),
  pair("welcome card muted text", "welcome-card-muted", "welcome-card-background", text),
  pair("welcome tip icon", "welcome-tip-icon", "welcome-card-background", ui),
  pair("welcome card link", "welcome-card-link", "welcome-card-background", text),
  pair(
    "welcome card button text",
    "welcome-card-button-foreground",
    "welcome-card-button-background",
    text
  ),
  pair("logo", "logo-foreground", "app-background", ui),
  pair(
    "callout text (note)",
    "preview-callout-foreground",
    "preview-callout-note-background",
    text
  ),
  pair(
    "callout text (tip)",
    "preview-callout-foreground",
    "preview-callout-tip-background",
    text
  ),
  pair(
    "callout text (important)",
    "preview-callout-foreground",
    "preview-callout-important-background",
    text
  ),
  pair(
    "callout text (warning)",
    "preview-callout-foreground",
    "preview-callout-warning-background",
    text
  ),
  pair(
    "callout text (caution)",
    "preview-callout-foreground",
    "preview-callout-caution-background",
    text
  )
];

// Pairs that are readable in the current Pergamum Light palette only by
// convention, or that a newer theme is not required to meet yet. Keep this
// list short and justified; a new theme must NOT be added here to pass.
const knownLightExceptions: ReadonlyMap<string, string> = new Map([
  // Light values are frozen ("do not change the existing look" in #621/#623);
  // add an entry with the measured reason only if a Light pair is below its
  // threshold today.
]);

function pair(
  label: string,
  foreground: string,
  background: string,
  minimum: number
): ContrastPair {
  return {
    label,
    foreground: `--pg-color-${foreground}`,
    background: `--pg-color-${background}`,
    minimum
  };
}

describe("built-in theme token contrast (WCAG)", () => {
  for (const theme of builtInThemes) {
    describe(`${theme.label} (${theme.id})`, () => {
      const tokens = themeTokens(theme.cssClassName);

      for (const item of requiredPairs) {
        const exception =
          theme.id === "pergamum-light"
            ? knownLightExceptions.get(item.label)
            : undefined;
        const run = exception === undefined ? it : it.skip;

        run(`${item.label}: ${item.foreground} on ${item.background} >= ${item.minimum}:1`, () => {
          const foreground = tokens.get(item.foreground);
          const background = tokens.get(item.background);

          expect(foreground, `${item.foreground} undefined`).toBeDefined();
          expect(background, `${item.background} undefined`).toBeDefined();

          const ratio = contrastRatio(foreground ?? "", background ?? "");

          expect(
            ratio,
            `${item.label}: ${foreground} on ${background} = ${ratio.toFixed(2)}`
          ).toBeGreaterThanOrEqual(item.minimum);
        });
      }
    });
  }

  for (const theme of builtInThemes) {
    it(`${theme.label}: a disabled toolbar button is inactive-looking but never vanishes (>= 1.5:1 after opacity)`, () => {
      const tokens = themeTokens(theme.cssClassName);
      const foreground = parseColor(
        tokens.get("--pg-color-toolbar-button-disabled-foreground") ?? ""
      );
      const background = tokens.get("--pg-color-panel-background") ?? "";
      const opacity = Number(tokens.get("--pg-opacity-disabled"));

      expect(foreground).not.toBeNull();
      expect(Number.isFinite(opacity)).toBe(true);

      const ratio = contrastRatio(
        `rgba(${foreground?.r}, ${foreground?.g}, ${foreground?.b}, ${opacity})`,
        background
      );

      expect(ratio).toBeGreaterThanOrEqual(1.5);
    });
  }

  for (const theme of builtInThemes) {
    describe(`${theme.label}: selector preview colors`, () => {
      const tokens = themeTokens(theme.cssClassName);

      it("stay in sync with the theme's own CSS tokens", () => {
        expect([
          tokens.get("--pg-color-surface-background"),
          tokens.get("--pg-color-app-background")
        ]).toContain(theme.preview.background);
        expect(theme.preview.foreground).toBe(
          tokens.get("--pg-color-surface-foreground")
        );
        expect(theme.preview.border).toBe(
          tokens.get("--pg-color-border-default")
        );
        expect(theme.preview.accent).toBe(
          tokens.get("--pg-color-accent-primary")
        );
      });

      it("keep the option text readable (>= 4.5:1) and the accent/border visible", () => {
        expect(
          contrastRatio(theme.preview.foreground, theme.preview.background)
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        expect(
          contrastRatio(theme.preview.accent, theme.preview.background)
        ).toBeGreaterThanOrEqual(WCAG_AA_LARGE_TEXT_OR_UI);
      });
    });
  }

  it("covers every built-in theme (a theme added to the registry is tested automatically)", () => {
    expect(builtInThemes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Ginza Night high contrast properties (#703)", () => {
  const tokens = themeTokens("theme-ginza-night");

  it("satisfies WCAG AAA (>= 7:1) for primary text surfaces", () => {
    const editorBg = tokens.get("--pg-color-editor-background") ?? "";
    const surfaceBg = tokens.get("--pg-color-surface-background") ?? "";
    const appBg = tokens.get("--pg-color-app-background") ?? "";

    expect(
      contrastRatio(tokens.get("--pg-color-editor-foreground") ?? "", editorBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-surface-foreground") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-app-foreground") ?? "", appBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-text-body") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
  });

  it("satisfies WCAG AA (>= 4.5:1) for secondary / muted text and panel text", () => {
    const surfaceBg = tokens.get("--pg-color-surface-background") ?? "";
    const panelBg = tokens.get("--pg-color-panel-background") ?? "";

    expect(
      contrastRatio(tokens.get("--pg-color-surface-muted") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-text-secondary") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-panel-foreground") ?? "", panelBg)
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("has high-visibility accent and focus ring (>= 7:1 against background)", () => {
    const surfaceBg = tokens.get("--pg-color-surface-background") ?? "";
    expect(
      contrastRatio(tokens.get("--pg-color-accent-primary") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
    expect(
      contrastRatio(tokens.get("--pg-color-focus-ring") ?? "", surfaceBg)
    ).toBeGreaterThanOrEqual(WCAG_AAA_NORMAL_TEXT);
  });
});
