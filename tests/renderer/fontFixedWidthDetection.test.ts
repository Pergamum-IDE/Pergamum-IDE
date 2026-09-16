// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  createCanvasMeasureTextWidth,
  detectFixedWidth,
  measureFixedWidthForFamilies,
  type MeasureTextWidth
} from "../../src/renderer/fontFixedWidthDetection";
import type { CachedFontFamily } from "../../src/shared/fontCache";

/**
 * Builds a mocked `MeasureTextWidth` from a map of `{ text: width }`, used
 * identically for every generic-fallback probe (i.e. the family resolves
 * consistently — the common "measurement is trustworthy" case).
 */
function stableMeasurer(widths: Record<string, number>): MeasureTextWidth {
  return (_fontCss: string, text: string) => widths[text] ?? NaN;
}

/**
 * Builds a mocked `MeasureTextWidth` that returns different widths
 * depending on which generic fallback is embedded in `fontCss` — simulating
 * a family that did NOT resolve, so the browser silently substituted the
 * generic fallback instead.
 */
function fallbackDependentMeasurer(
  widthsByGeneric: Record<string, Record<string, number>>
): MeasureTextWidth {
  return (fontCss: string, text: string) => {
    const generic = fontCss.includes("monospace")
      ? "monospace"
      : fontCss.includes("serif")
        ? "serif"
        : "unknown";
    return widthsByGeneric[generic]?.[text] ?? NaN;
  };
}

describe("fontFixedWidthDetection (#495)", () => {
  describe("detectFixedWidth", () => {
    it("returns \"fixed\" when W==i and WW==Ｗ, stable across generic fallbacks", () => {
      const measure = stableMeasurer({ W: 10, i: 10, WW: 20, Ｗ: 20 });
      expect(detectFixedWidth("Cascadia Code", measure)).toBe("fixed");
    });

    it("returns \"proportional\" when W!=i (stable across fallbacks)", () => {
      const measure = stableMeasurer({ W: 12, i: 4, WW: 24, Ｗ: 24 });
      expect(detectFixedWidth("Arial", measure)).toBe("proportional");
    });

    it("returns \"proportional\" when only the second condition fails (WW != Ｗ)", () => {
      const measure = stableMeasurer({ W: 10, i: 10, WW: 20, Ｗ: 24 });
      expect(detectFixedWidth("Weird Font", measure)).toBe("proportional");
    });

    it("applies the epsilon consistently: near-equal widths within 0.01 still count as equal", () => {
      const measure = stableMeasurer({ W: 10, i: 10.005, WW: 20, Ｗ: 20.008 });
      expect(detectFixedWidth("Cascadia Code", measure)).toBe("fixed");
    });

    it("epsilon does not mask a real difference just outside its tolerance", () => {
      const measure = stableMeasurer({ W: 10, i: 10.02, WW: 20, Ｗ: 20 });
      expect(detectFixedWidth("Cascadia Code", measure)).toBe("proportional");
    });

    it("returns \"unknown\" when a measurement is non-finite", () => {
      const measure = stableMeasurer({ W: 10, i: NaN, WW: 20, Ｗ: 20 });
      expect(detectFixedWidth("Broken Font", measure)).toBe("unknown");
    });

    it("returns \"unknown\" when there is no canvas context (measurer is null)", () => {
      expect(detectFixedWidth("Any Font", null)).toBe("unknown");
    });

    it("returns \"unknown\" when the measurer throws", () => {
      const measure: MeasureTextWidth = () => {
        throw new Error("boom");
      };
      expect(detectFixedWidth("Explodes", measure)).toBe("unknown");
    });

    it("returns \"unknown\" for an empty family name", () => {
      const measure = stableMeasurer({ W: 10, i: 10, WW: 20, Ｗ: 20 });
      expect(detectFixedWidth("", measure)).toBe("unknown");
      expect(detectFixedWidth("   ", measure)).toBe("unknown");
    });

    it("fallback guard: returns \"unknown\" when measurements differ across generic fallbacks (the family didn't actually resolve)", () => {
      const measure = fallbackDependentMeasurer({
        monospace: { W: 10, i: 10, WW: 20, Ｗ: 20 },
        serif: { W: 12, i: 5, WW: 24, Ｗ: 24 }
      });
      expect(detectFixedWidth("GhostFont", measure)).toBe("unknown");
    });

    it("fallback guard: a family that genuinely resolves measures identically under both generic fallbacks and is classified normally", () => {
      const measure = fallbackDependentMeasurer({
        monospace: { W: 10, i: 10, WW: 20, Ｗ: 20 },
        serif: { W: 10, i: 10, WW: 20, Ｗ: 20 }
      });
      expect(detectFixedWidth("Cascadia Code", measure)).toBe("fixed");
    });
  });

  describe("measureFixedWidthForFamilies", () => {
    const baseFamilies: CachedFontFamily[] = [
      { family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth: "unknown" },
      { family: "Arial", displayName: "Arial", fixedWidth: "unknown" },
      { family: "BrokenFont", displayName: "BrokenFont", fixedWidth: "unknown" }
    ];

    it("assigns the measured fixedWidth to each aggregated family", () => {
      const measure: MeasureTextWidth = (fontCss, text) => {
        if (fontCss.includes("Cascadia")) {
          return { W: 10, i: 10, WW: 20, Ｗ: 20 }[text] ?? NaN;
        }
        return { W: 12, i: 4, WW: 24, Ｗ: 24 }[text] ?? NaN;
      };
      const result = measureFixedWidthForFamilies(baseFamilies.slice(0, 2), measure);
      expect(result[0]).toEqual({
        family: "Cascadia Code",
        displayName: "Cascadia Code",
        fixedWidth: "fixed"
      });
      expect(result[1]).toEqual({
        family: "Arial",
        displayName: "Arial",
        fixedWidth: "proportional"
      });
    });

    it("isolates one family's measurement failure as \"unknown\" without aborting the rest", () => {
      const measure: MeasureTextWidth = (fontCss, text) => {
        if (fontCss.includes("BrokenFont")) {
          throw new Error("measurement exploded");
        }
        if (fontCss.includes("Cascadia")) {
          return { W: 10, i: 10, WW: 20, Ｗ: 20 }[text] ?? NaN;
        }
        return { W: 12, i: 4, WW: 24, Ｗ: 24 }[text] ?? NaN;
      };
      const result = measureFixedWidthForFamilies(baseFamilies, measure);
      expect(result.map((f) => f.fixedWidth)).toEqual(["fixed", "proportional", "unknown"]);
      // The other two families' results are unaffected by the failure.
      expect(result[0].fixedWidth).toBe("fixed");
      expect(result[1].fixedWidth).toBe("proportional");
    });

    it("preserves displayName = family and does not mutate the input array", () => {
      const snapshot = baseFamilies.map((f) => ({ ...f }));
      const measure = stableMeasurer({ W: 10, i: 10, WW: 20, Ｗ: 20 });
      const result = measureFixedWidthForFamilies(baseFamilies, measure);
      expect(baseFamilies).toEqual(snapshot);
      for (let i = 0; i < result.length; i++) {
        expect(result[i].displayName).toBe(result[i].family);
        expect(result[i].family).toBe(baseFamilies[i].family);
      }
    });

    it("returns \"unknown\" for every family when there is no measurer", () => {
      const result = measureFixedWidthForFamilies(baseFamilies, null);
      expect(result.every((f) => f.fixedWidth === "unknown")).toBe(true);
    });
  });

  describe("createCanvasMeasureTextWidth", () => {
    it("returns null when Canvas 2D context is unavailable (happy-dom has no canvas backend)", () => {
      // happy-dom's canvas.getContext('2d') returns null (no canvas
      // renderer backend), which is exactly the "cannot measure" case this
      // function is meant to surface as null.
      expect(createCanvasMeasureTextWidth()).toBeNull();
    });

    it("returns null when document is undefined (defensive; not expected in the renderer)", () => {
      const originalDocument = globalThis.document;
      // @ts-expect-error -- intentionally simulating a non-DOM environment.
      delete globalThis.document;
      try {
        expect(createCanvasMeasureTextWidth()).toBeNull();
      } finally {
        globalThis.document = originalDocument;
      }
    });
  });
});
