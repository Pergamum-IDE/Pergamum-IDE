import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, WCAG_AA_NORMAL_TEXT } from "../../src/shared/colorContrast";
import { builtInThemes } from "../../src/shared/colorTheme";

// #699: the Bulk Text Import Dialog used undefined `--app-*` custom properties
// with light literal fallbacks, so Night Dark rendered white inner surfaces.
// These tests pin the dialog's CSS to defined, theme-aware tokens.

const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
const newline = String.fromCharCode(10);

const blockStart = stylesSource.indexOf(".appDialog.bulkTextImportDialog {");
// The destination-picker dialog is a separate dialog (out of #699 scope).
const blockEnd = stylesSource.indexOf(".appDialog.textImportDestinationPickerDialog {");
const dialogCss = stylesSource.slice(blockStart, blockEnd);

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

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const code = stripComments(dialogCss);
const referencedTokens = [...new Set([...code.matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1] ?? ""))];

describe("Bulk Text Import Dialog theme tokens (#699)", () => {
  it("locates the dialog CSS block", () => {
    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(blockEnd).toBeGreaterThan(blockStart);
  });

  // A: old undefined tokens are gone.
  it("does not reference the former undefined --app-* tokens", () => {
    for (const legacy of [
      "--app-dialog-inset-background",
      "--app-dialog-secondary-foreground",
      "--app-dialog-accent-inset-background",
      "--app-accent",
      "--app-success-",
      "--app-warning-",
      "--app-danger-"
    ]) {
      expect(code, legacy).not.toContain(legacy);
    }
  });

  // B: every referenced token is defined in every built-in theme.
  it("references only tokens defined in all built-in themes", () => {
    expect(referencedTokens.length).toBeGreaterThan(0);

    for (const theme of builtInThemes) {
      const tokens = themeTokens(theme.cssClassName);

      for (const name of referencedTokens) {
        expect(tokens.has(name), `${theme.id}: ${name}`).toBe(true);
      }
    }
  });

  // C: major surfaces are wired to theme-aware tokens.
  it.each([
    ["status banner border", /bulkTextImportDialogExecutionBanner\.isCompleted[^{]*\{[^}]*var\(--pg-color-status-success\)/],
    ["drop area surface", /bulkTextImportDialogDropArea \{[^}]*background: var\(--pg-color-surface-inset\)/],
    ["drop area drag-active", /bulkTextImportDialogDropArea\.isDragActive[^{]*\{[^}]*var\(--pg-color-status-info-background\)/],
    ["destination value surface", /bulkTextImportDialogDestinationValue \{[^}]*var\(--pg-color-surface-inset\)/],
    ["batch encoding select", /bulkTextImportDialogBatchEncodingSelect,[^{]*\{[^}]*var\(--pg-color-input-background\)[^}]*var\(--pg-color-input-foreground\)/],
    ["file encoding select", /bulkTextImportDialogFileEncodingSelect \{[^}]*var\(--pg-color-input-background\)[^}]*var\(--pg-color-input-foreground\)/]
  ])("%s uses theme-aware tokens", (_label, pattern) => {
    expect(code).toMatch(pattern);
  });

  // D: no light-only literal color fallback on semantic colors. The one
  // allowed literal is the toggle knob's decorative box-shadow.
  it("has no literal color fallbacks outside the knob shadow", () => {
    const withoutShadow = code.replace(/box-shadow:[^;]*;/g, "");

    expect(withoutShadow).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(withoutShadow).not.toMatch(/rgba?\(/);
    expect(withoutShadow).not.toMatch(/var\(--[a-z0-9-]+\s*,/);
  });

  // Contrast of the text/surface pairs this dialog uses (existing helper).
  describe.each(builtInThemes.map((theme) => [theme.id, theme.cssClassName] as const))(
    "contrast in %s",
    (_id, cssClassName) => {
      const tokens = themeTokens(cssClassName);
      const get = (name: string): string => tokens.get(name) ?? "";

      it.each([
        ["muted text on dialog", "--pg-color-surface-muted", "--app-dialog-background"],
        ["muted text on inset", "--pg-color-surface-muted", "--pg-color-surface-inset"],
        ["dialog text on inset", "--app-dialog-foreground", "--pg-color-surface-inset"],
        ["dialog text on drag-active", "--app-dialog-foreground", "--pg-color-status-info-background"],
        ["input text", "--pg-color-input-foreground", "--pg-color-input-background"],
        ["success text", "--pg-color-status-success", "--pg-color-status-success-background"],
        ["warning text", "--pg-color-status-warning-text", "--pg-color-status-warning-background"],
        ["error text", "--pg-color-status-error-text", "--pg-color-status-error-background"]
      ])("%s is AA", (_label, foreground, background) => {
        expect(contrastRatio(get(foreground), get(background))).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT
        );
      });
    }
  );
});
