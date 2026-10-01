import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * #663 regression: the page must not get its own vertical scrollbar.
 *
 * Measured cause: `.appShell { height: 100vh }`. `100vh` includes the height
 * of a horizontal scrollbar, so whenever one showed (narrow window) the shell
 * was taller than the visible client area and the page scrolled vertically.
 * The menu bar was not the cause (it fits inside the shell's flex column).
 * Pixel layout cannot be measured in happy-dom, so the layout contract is
 * checked at the CSS / structure level.
 */
const css = readFileSync("src/renderer/styles.css", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);
const app = readFileSync("src/renderer/App.tsx", "utf8");

/** The declaration block of the first top-level rule with exactly this selector list. */
function ruleBody(selector: string): string {
  const escaped = selector
    .split(",")
    .map((part) => part.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(",\\s*");
  const match = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(
    css
  );

  if (!match) {
    throw new Error(`rule not found: ${selector}`);
  }

  return match[1];
}

describe("application shell vertical layout contract (#663)", () => {
  it("constrains the shell to the visible client area, not to 100vh", () => {
    const shell = ruleBody(".appShell");

    expect(shell).toMatch(/height:\s*100%/);
    expect(shell).not.toMatch(/(?:min-|max-)?height:\s*[^;]*vh/);
    expect(ruleBody("html, body, #root")).toMatch(/height:\s*100%/);
  });

  it("lays the shell out as a vertical flex column", () => {
    const shell = ruleBody(".appShell");

    expect(shell).toMatch(/display:\s*flex/);
    expect(shell).toMatch(/flex-direction:\s*column/);
  });

  it("does not hard-code the menu bar height anywhere else", () => {
    // The workbench gets its remaining height from flex, never from a
    // calc() that repeats the menu bar's own height.
    expect(css).not.toMatch(/calc\(\s*100(?:vh|%)\s*-\s*2[89]px\s*\)/);
    expect(ruleBody(".appShell")).not.toContain("calc(");
    expect(ruleBody(".appBody")).not.toContain("calc(");
  });

  it("puts the menu bar inside the shell, before the toolbar and workbench", () => {
    const shell = app.indexOf('className="appShell"');
    const menuBar = app.indexOf("<ApplicationMenuBar", shell);
    const toolbar = app.indexOf("<EditorToolbar", shell);
    const body = app.indexOf('<section className="appBody">', shell);

    expect(shell).toBeGreaterThan(-1);
    expect(menuBar).toBeGreaterThan(shell);
    expect(menuBar).toBeLessThan(toolbar);
    expect(toolbar).toBeLessThan(body);
  });

  it("keeps the menu bar at its own height (never shrunk by the flex column)", () => {
    const bar = ruleBody(".applicationMenuBar");

    expect(bar).toMatch(/flex:\s*0\s+0\s+auto/);
    expect(bar).toMatch(/block-size:\s*28px/);
  });

  it("lets the workbench take the remaining height and shrink vertically", () => {
    const body = ruleBody(".appBody");

    expect(body).toMatch(/flex:\s*1\b/);
    expect(body).toMatch(/min-height:\s*0/);
    expect(ruleBody(".appContent")).toMatch(/min-height:\s*0/);
  });

  it("does not hide overflow on the page / shell (horizontal overflow stays as is)", () => {
    for (const selector of ["html, body, #root", ".appShell"]) {
      expect(ruleBody(selector), selector).not.toMatch(/overflow/);
    }
    expect(css).not.toMatch(/(?:^|\})\s*(?:html|body)\s*\{[^}]*overflow/m);
  });
});
