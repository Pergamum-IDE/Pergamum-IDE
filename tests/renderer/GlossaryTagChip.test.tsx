import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlossaryTagChip } from "../../src/renderer/GlossaryTagChip";

const tag = {
  label: "武将",
  backgroundRgb: "#1f77b4",
  foregroundRgb: "#ffffff"
};

describe("GlossaryTagChip (#375)", () => {
  it("renders the label with the stored colors", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag })
    );

    expect(markup).toContain("武将");
    expect(markup).toContain("background-color:#1f77b4");
    expect(markup).toContain("color:#ffffff");
    expect(markup).toContain('data-muted="false"');
  });

  it("dims a muted chip", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag, muted: true })
    );

    expect(markup).toContain('data-muted="true"');
    expect(markup).toMatch(/opacity:0?\.55/);
  });
});
