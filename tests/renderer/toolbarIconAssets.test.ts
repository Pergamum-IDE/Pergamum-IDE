import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const themeableToolbarIconPaths = [
  "assets/icons/pergamum/toolbar/strike.svg",
  "assets/icons/pergamum/toolbar/ruby.svg",
  "assets/icons/pergamum/toolbar/emphasis.svg"
];

describe("toolbar icon assets", () => {
  it("keeps custom toolbar icons themeable through currentColor", () => {
    for (const iconPath of themeableToolbarIconPaths) {
      const svg = readFileSync(iconPath, "utf8");

      expect(svg).toContain("currentColor");
      expect(svg).not.toMatch(/\b(?:fill|stroke)=["'](?:#000000|black)["']/i);
    }
  });

  it("keeps the strikethrough icon stroke-based", () => {
    const svg = readFileSync(
      "assets/icons/pergamum/toolbar/strike.svg",
      "utf8"
    );

    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).not.toMatch(/\bfill=["']currentColor["']/i);
  });
});
