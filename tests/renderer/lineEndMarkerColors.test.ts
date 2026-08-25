import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cssRuleBlock(styles: string, selector: string): string {
  const start = styles.indexOf(`${selector} {`);

  expect(start).toBeGreaterThan(-1);

  const end = styles.indexOf("}", start);

  expect(end).toBeGreaterThan(start);

  return styles.slice(start, end + 1);
}

describe("line-ending marker colors (#252 follow-up: visual priority)", () => {
  it("gives the expected marker a muted/secondary foreground token, not the same weight as body text", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const rule = cssRuleBlock(styles, ".pergamum-line-end-marker");

    expect(rule).toContain(
      "color: var(--workspace-sidebar-muted-foreground)"
    );
    expect(rule).toContain("opacity: 0.7");
    // Not a bespoke hardcoded hex — reuses an existing semantic token so it
    // moves with the rest of the UI if theming changes.
    expect(rule).not.toMatch(/color:\s*#[0-9a-fA-F]{3,6}/);
  });

  it("gives the unexpected marker the warning accent color, not the error color, at full opacity so it stands out from the expected marker", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const rule = cssRuleBlock(
      styles,
      ".pergamum-line-end-marker-unexpected"
    );

    expect(rule).toContain("color: var(--app-dialog-icon-warning)");
    expect(rule).not.toContain("--app-dialog-icon-error");
    expect(rule).toContain("opacity: 1");
  });

  it("does not declare glyph, font-size, or positioning differences between expected and unexpected — only color/opacity vary", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");
    const unexpectedRule = cssRuleBlock(
      styles,
      ".pergamum-line-end-marker-unexpected"
    );

    for (const property of [
      "font-size",
      "content:",
      "transform",
      "position:",
      "top:",
      "left:"
    ]) {
      expect(unexpectedRule).not.toContain(property);
    }
  });
});
