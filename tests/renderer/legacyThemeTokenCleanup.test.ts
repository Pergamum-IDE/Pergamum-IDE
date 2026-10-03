import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../../src/shared/colorContrast";
import { builtInThemes } from "../../src/shared/colorTheme";

// #706: leftover undefined / legacy / renamed theme tokens (#698 audit) were
// replaced with existing semantic tokens. This pins the cleaned-up selectors;
// it is deliberately NOT a generic custom-property linter (runtime-supplied and
// intentional fallback-only variables would need an allowlist).

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

function ruleBody(selector: string): string {
  const start = stylesSource.indexOf(`${newline}${selector} {`);
  expect(start, `${selector} rule missing`).toBeGreaterThanOrEqual(0);
  const end = stylesSource.indexOf("}", start);
  return stylesSource.slice(start, end);
}

// A: tokens removed from renderer CSS. (Runtime-supplied --document-map-viewport-fill
// and the intentional fallback-only --document-map-viewport-* / --app-monospace-font-family
// are not listed.)
const removedTokens = [
  "--color-border",
  "--color-bg-input",
  "--color-text-main",
  "--color-text-danger",
  "--color-text-muted",
  "--border-color",
  "--focus-ring",
  "--workspace-sidebar-muted",
  "--workspace-sidebar-foreground",
  "--workspace-sidebar-hover-background",
  "--workspace-sidebar-selected-background",
  "--app-accent",
  "--app-dialog-secondary-foreground",
  "--app-dialog-inset-background",
  "--app-dialog-button-bg",
  "--app-dialog-text",
  "--app-dialog-button-hover-bg",
  "--app-dialog-button-hover-background",
  "--app-dialog-button-border-hover",
  "--app-dialog-warning-foreground",
  "--app-dialog-hover"
];

describe("legacy theme token cleanup (#706)", () => {
  it.each(removedTokens)("%s is no longer referenced", (name) => {
    expect(stylesSource).not.toMatch(new RegExp(`var\\(${name}[,)]`));
  });

  // B + C: replacement tokens are defined in every built-in theme (registry-derived).
  const replacements = [
    "--pg-color-input-border",
    "--pg-color-input-background",
    "--pg-color-input-foreground",
    "--pg-color-status-error-text",
    "--pg-color-status-warning-text",
    "--pg-color-surface-muted",
    "--pg-color-surface-inset",
    "--pg-color-surface-hover",
    "--pg-color-preview-border",
    "--pg-color-preview-code-block-background",
    "--pg-color-focus-ring",
    "--pg-color-accent-primary",
    "--pg-color-accent-foreground",
    "--pg-color-button-hover-background",
    "--app-dialog-border",
    "--app-dialog-button-background",
    "--app-dialog-button-foreground",
    "--app-dialog-button-border",
    "--workspace-sidebar-hover",
    "--workspace-sidebar-item-foreground",
    "--workspace-sidebar-muted-foreground",
    "--workspace-sidebar-active-background",
    "--workspace-sidebar-active-foreground"
  ];

  it("defines every replacement token in all built-in themes", () => {
    expect(builtInThemes.length).toBeGreaterThanOrEqual(11);

    for (const theme of builtInThemes) {
      const tokens = themeTokens(theme.cssClassName);

      for (const name of replacements) {
        expect(tokens.has(name), `${theme.id}: ${name}`).toBe(true);
      }
    }
  });

  // D + E: focused selector contracts, with no light literal fallback left.
  it.each([
    [".textImportDestinationPickerName.isSelected", ["--pg-color-accent-primary", "--pg-color-accent-foreground"]],
    [".textImportDestinationPickerFailed", ["--pg-color-surface-muted"]],
    [".glossaryExportInput", ["--pg-color-input-border", "--pg-color-input-background", "--pg-color-input-foreground"]],
    [".documentMapPngExportInput", ["--pg-color-input-border", "--pg-color-input-background", "--pg-color-input-foreground"]],
    [".exportConfirmationDialogInput", ["--pg-color-input-border", "--pg-color-input-background", "--pg-color-input-foreground"]],
    [".glossaryExportError", ["--pg-color-status-error-text"]],
    [".documentMapPngExportError", ["--pg-color-status-error-text"]],
    [".exportConfirmationDialogLastExportPath", ["--pg-color-surface-muted"]],
    [".preview .markdownMermaidErrorSource", ["--pg-color-preview-code-block-background"]],
    [".saveDestinationDialogRiskyNotice", ["--pg-color-status-warning-text"]],
    [".rubyGraphemeCounter", ["--pg-color-surface-muted"]],
    [".documentMetricsChartTypeButton:hover", ["--workspace-sidebar-hover", "--workspace-sidebar-item-foreground"]],
    [".markdownOutlinePaneEmpty", ["--workspace-sidebar-muted-foreground"]]
  ])("%s uses semantic tokens without literal fallback", (selector, tokens) => {
    const body = ruleBody(selector);

    for (const token of tokens) {
      expect(body, token).toContain(`var(${token})`);
    }
    expect(body).not.toMatch(/var\(--[a-z0-9-]+\s*,\s*(#|rgba?\()/);
  });

  // Contrast of the replaced foreground/background pairs (existing helper).
  describe.each(builtInThemes.map((theme) => [theme.id, theme.cssClassName] as const))(
    "contrast in %s",
    (_id, cssClassName) => {
      const tokens = themeTokens(cssClassName);
      const get = (name: string): string => tokens.get(name) ?? "";

      it.each([
        ["picker selected row", "--pg-color-accent-foreground", "--pg-color-accent-primary"],
        ["picker / hint muted text", "--pg-color-surface-muted", "--app-dialog-background"],
        ["muted text on inset", "--pg-color-surface-muted", "--pg-color-surface-inset"],
        ["input text", "--pg-color-input-foreground", "--pg-color-input-background"],
        ["error text on dialog", "--pg-color-status-error-text", "--app-dialog-background"],
        ["warning text on dialog", "--pg-color-status-warning-text", "--app-dialog-background"],
        ["button text on hover", "--app-dialog-button-foreground", "--pg-color-button-hover-background"],
        ["sidebar item hover text", "--workspace-sidebar-item-foreground", "--workspace-sidebar-hover"],
        ["sidebar active text", "--workspace-sidebar-active-foreground", "--workspace-sidebar-active-background"]
      ])("%s is AA", (_label, foreground, background) => {
        expect(contrastRatio(get(foreground), get(background))).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
      });
    }
  );
});
