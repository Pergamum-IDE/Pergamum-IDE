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

  it("marks a compact chip and omits the attribute otherwise (#360)", () => {
    const compactMarkup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag, compact: true })
    );
    const defaultMarkup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag })
    );

    expect(compactMarkup).toContain('data-compact="true"');
    expect(compactMarkup).toContain("武将");
    expect(compactMarkup).toContain("background-color:#1f77b4");
    expect(defaultMarkup).not.toContain("data-compact");
  });

  it("#400: a primary chip gets the flag glyph and the primary shadow hook, and keeps the label text intact", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, {
        tag,
        isPrimary: true,
        primaryLabel: "Primary"
      })
    );

    expect(markup).toContain('data-primary="true"');
    // The feather flag icon (assets/icons/feather/tag/flag.svg) is inlined.
    expect(markup).toContain("feather-flag");
    // The label text itself is unchanged — no extra visible "Primary" text.
    expect(markup).toContain("武将");
    expect(markup).not.toMatch(/>Primary</);
  });

  it("#400: a non-primary chip (the default) has neither the flag nor the primary shadow hook", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag })
    );

    expect(markup).not.toContain("data-primary");
    expect(markup).not.toContain("feather-flag");
  });

  it("#400: the primary chip's accessible name/tooltip states it is the primary tag; the flag glyph is decorative", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, {
        tag,
        isPrimary: true,
        primaryLabel: "Primary"
      })
    );

    expect(markup).toContain('aria-label="Primary: 武将"');
    expect(markup).toContain('title="Primary: 武将"');
    // The flag SVG carries no meaning of its own — the chip's aria-label
    // above is the sole source of the "primary" semantics for assistive tech.
    expect(markup).toMatch(/glossaryTagChipFlag[^>]*aria-hidden="true"/);
  });

  it("#400: isPrimary without a primaryLabel leaves the chip's accessible name/tooltip as the plain tag label", () => {
    const markup = renderToStaticMarkup(
      React.createElement(GlossaryTagChip, { tag, isPrimary: true })
    );

    expect(markup).toContain('title="武将"');
    expect(markup).not.toContain("aria-label");
  });
});
