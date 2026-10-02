import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { builtInThemes } from "../../src/shared/colorTheme";

/**
 * #663: the Renderer menu follows the Application Color Theme purely through
 * the existing semantic --pg-color-* custom properties: no theme ids, no
 * color literals, no menu-specific tokens, no re-mount needed on a switch.
 */
const css = readFileSync("src/renderer/styles.css", "utf8");
const start = css.indexOf("/* #663: Renderer application menu bar");
const menuCss = css.slice(start);
const componentSources = [
  "src/renderer/ApplicationMenuBar.tsx",
  "src/renderer/applicationMenuProjection.ts",
  "src/renderer/applicationMenuPopupPosition.ts"
].map((path) => readFileSync(path, "utf8"));

describe("Renderer application menu theme contract (#663)", () => {
  it("has its own CSS section", () => {
    expect(start).toBeGreaterThan(-1);
    expect(menuCss).toContain(".applicationMenuBar");
  });

  it("uses only semantic --pg-color-* variables for color (no literals)", () => {
    const declarations = menuCss
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .match(/(?:background|color|border[\w-]*|outline|box-shadow)\s*:[^;]+;/g);

    expect(declarations?.length).toBeGreaterThan(10);
    for (const declaration of declarations ?? []) {
      // Colors only come through var(--pg-color-*). The shadow's rgba() is the
      // same neutral shadow every other dropdown uses.
      const withoutShadow = declaration.startsWith("box-shadow")
        ? ""
        : declaration;
      expect(withoutShadow, declaration).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(withoutShadow, declaration).not.toMatch(/\b(rgb|hsl)a?\(/);
    }
  });

  it("uses the expected semantic tokens", () => {
    for (const token of [
      "--pg-color-panel-header-background",
      "--pg-color-panel-foreground",
      "--pg-color-panel-border",
      "--pg-color-surface-background",
      "--pg-color-surface-foreground",
      "--pg-color-border-default",
      "--pg-color-surface-hover",
      "--pg-color-surface-active",
      "--pg-color-surface-muted",
      "--pg-color-text-disabled",
      "--pg-color-focus-ring"
    ]) {
      expect(menuCss, token).toContain(`var(${token})`);
    }
  });

  it("adds no menu-specific tokens and no per-theme selectors", () => {
    expect(css).not.toContain("--pg-color-menu");
    for (const theme of builtInThemes) {
      expect(menuCss).not.toContain(`.${theme.cssClassName}`);
      expect(menuCss).not.toContain(theme.id);
    }
    expect(menuCss).not.toMatch(/data-theme/);
  });

  it("inherits the workbench font (no menu-specific font-family)", () => {
    expect(menuCss).not.toMatch(/font-family\s*:/);
  });

  it("the components know nothing about themes (so a switch needs no re-mount)", () => {
    for (const source of componentSources) {
      expect(source).not.toMatch(/colorTheme|applyColorTheme|data-theme|dataset\.theme/);
      for (const theme of builtInThemes) {
        expect(source).not.toContain(theme.id);
      }
      expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });

  it("uses logical properties for direction-sensitive layout", () => {
    const withoutComments = menuCss.replace(/\/\*[\s\S]*?\*\//g, "");

    expect(withoutComments).not.toMatch(
      /(?:^|[;{\s])(?:margin|padding)-(?:left|right)\s*:/
    );
    expect(withoutComments).not.toMatch(/(?:^|[;{\s])(?:left|right)\s*:/);
  });
});
