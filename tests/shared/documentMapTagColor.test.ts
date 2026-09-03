import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAP_TAG_COLOR_SATURATION,
  adjustDocumentMapTagColorForVisibility,
  buildDocumentMapTagColorCache
} from "../../src/shared/documentMapTagColor";

/** `#rrggbb` → { h (0..360), s (0..1), l (0..1) }. */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) {
    return { h: 0, s: 0, l };
  }
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) {
    h = ((g - b) / delta) % 6;
  } else if (max === g) {
    h = (b - r) / delta + 2;
  } else {
    h = (r - g) / delta + 4;
  }
  h *= 60;
  if (h < 0) {
    h += 360;
  }
  return { h, s, l };
}

describe("adjustDocumentMapTagColorForVisibility (#375)", () => {
  it("keeps hue and lightness but forces saturation to the fixed value", () => {
    const input = "#3a7bd5"; // a muted blue
    const before = hexToHsl(input);
    const out = adjustDocumentMapTagColorForVisibility(input);

    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    const after = hexToHsl(out);

    expect(after.h).toBeCloseTo(before.h, 0);
    expect(after.l).toBeCloseTo(before.l, 2);
    expect(after.s).toBeCloseTo(DOCUMENT_MAP_TAG_COLOR_SATURATION, 2);
  });

  it("raises the saturation of a washed-out colour", () => {
    const washedOut = "#8f9aa8"; // low-saturation grey-blue
    const out = adjustDocumentMapTagColorForVisibility(washedOut);
    expect(hexToHsl(out).s).toBeGreaterThan(hexToHsl(washedOut).s);
    expect(hexToHsl(out).s).toBeCloseTo(DOCUMENT_MAP_TAG_COLOR_SATURATION, 2);
  });

  it("accepts #rgb and any case, returning lowercase #rrggbb", () => {
    expect(adjustDocumentMapTagColorForVisibility("#ABC")).toMatch(
      /^#[0-9a-f]{6}$/
    );
    expect(adjustDocumentMapTagColorForVisibility("#7C3AED")).toMatch(
      /^#[0-9a-f]{6}$/
    );
  });

  it("returns an invalid colour unchanged instead of throwing", () => {
    for (const bad of ["", "red", "#12", "not-a-color", "#1234567"]) {
      expect(adjustDocumentMapTagColorForVisibility(bad)).toBe(bad);
    }
  });

  it("does not mutate a tag object's backgroundRgb", () => {
    const tag = { id: "t1", backgroundRgb: "#3a7bd5" };
    const snapshot = { ...tag };
    adjustDocumentMapTagColorForVisibility(tag.backgroundRgb);
    expect(tag).toEqual(snapshot);
  });

  it("honours a custom saturation argument", () => {
    const out = adjustDocumentMapTagColorForVisibility("#3a7bd5", 0.2);
    expect(hexToHsl(out).s).toBeCloseTo(0.2, 2);
  });
});

describe("buildDocumentMapTagColorCache (#375)", () => {
  const tags = [
    { id: "blue", backgroundRgb: "#3a7bd5" },
    { id: "red", backgroundRgb: "#d53a3a" }
  ];

  it("adjusts every tag once when adjustTagColorsForVisibility is on", () => {
    const cache = buildDocumentMapTagColorCache({
      tags,
      adjustTagColorsForVisibility: true
    });
    expect(cache.size).toBe(2);
    expect(cache.get("blue")).toBe(
      adjustDocumentMapTagColorForVisibility("#3a7bd5")
    );
    expect(cache.get("red")).toBe(
      adjustDocumentMapTagColorForVisibility("#d53a3a")
    );
  });

  it("passes tag colours through untouched when the flag is off", () => {
    const cache = buildDocumentMapTagColorCache({
      tags,
      adjustTagColorsForVisibility: false
    });
    expect(cache.get("blue")).toBe("#3a7bd5");
    expect(cache.get("red")).toBe("#d53a3a");
  });

  it("keeps the first colour seen for a duplicated tag id", () => {
    const cache = buildDocumentMapTagColorCache({
      tags: [
        { id: "dup", backgroundRgb: "#111111" },
        { id: "dup", backgroundRgb: "#222222" }
      ],
      adjustTagColorsForVisibility: false
    });
    expect(cache.get("dup")).toBe("#111111");
  });

  it("never mutates the input tags", () => {
    const input = [{ id: "blue", backgroundRgb: "#3a7bd5" }];
    const snapshot = input.map((tag) => ({ ...tag }));
    buildDocumentMapTagColorCache({
      tags: input,
      adjustTagColorsForVisibility: true
    });
    expect(input).toEqual(snapshot);
  });
});
