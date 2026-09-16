import { describe, expect, it } from "vitest";
import {
  aggregateFontFamilies,
  isValidFontCache,
  FONT_CACHE_CURRENT_VERSION,
  type FontCache,
  type RawFontData
} from "../../src/shared/fontCache";

describe("Font Cache Domain & Aggregation (#491)", () => {
  it("empty raw scan result produces empty family list", () => {
    const raw: RawFontData[] = [];
    const result = aggregateFontFamilies(raw);
    expect(result).toEqual([]);
  });

  it("multiple faces with same family produce one cached family", () => {
    const raw: RawFontData[] = [
      { family: "Yu Mincho", fullName: "Yu Mincho Regular", style: "Regular" },
      { family: "Yu Mincho", fullName: "Yu Mincho Bold", style: "Bold" },
      { family: "Yu Mincho", fullName: "Yu Mincho Italic", style: "Italic" }
    ];
    const result = aggregateFontFamilies(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      family: "Yu Mincho",
      displayName: "Yu Mincho",
      fixedWidth: "unknown"
    });
  });

  it("explicitly proves FontData.fullName is ignored and not used for displayName or family", () => {
    const raw: RawFontData[] = [
      { family: "Family A", fullName: "Should Not Be Used", postscriptName: "FamilyA-Reg" }
    ];
    const result = aggregateFontFamilies(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      family: "Family A",
      displayName: "Family A",
      fixedWidth: "unknown"
    });
    expect(result[0]).not.toHaveProperty("fullName");
    expect(result[0].displayName).not.toBe("Should Not Be Used");
  });

  it("preserves family names as returned without Unicode normalization or trimming case", () => {
    const raw: RawFontData[] = [
      { family: "　My Custom Font　" }
    ];
    const result = aggregateFontFamilies(raw);
    expect(result[0].family).toBe("　My Custom Font　");
  });

  it("does not exclude families without Regular face", () => {
    const raw: RawFontData[] = [
      { family: "BIZ UD Gothic", style: "Bold" }
    ];
    const result = aggregateFontFamilies(raw);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe("BIZ UD Gothic");
  });

  it("validates FontCache structure correctly", () => {
    const validCache: FontCache = {
      version: 1,
      scannedAt: "2026-09-16T14:30:00.000Z",
      uiLanguage: "ja",
      families: [
        { family: "Consolas", displayName: "Consolas", fixedWidth: "unknown" }
      ]
    };
    expect(isValidFontCache(validCache)).toBe(true);

    expect(isValidFontCache(null)).toBe(false);
    expect(isValidFontCache({})).toBe(false);
    expect(isValidFontCache({ ...validCache, version: 2 })).toBe(false);
    expect(isValidFontCache({ ...validCache, families: "invalid" })).toBe(false);
    expect(
      isValidFontCache({
        ...validCache,
        families: [{ family: "A", displayName: "A", fixedWidth: "invalid" }]
      })
    ).toBe(false);
  });

  // #495: fixedWidth is a 3-value enum ("unknown" | "fixed" | "proportional")
  // once local font scans start classifying families with Canvas
  // measurement; validation must accept all three and reject anything else.
  it("accepts every valid fixedWidth value and rejects anything else", () => {
    const cacheWith = (fixedWidth: unknown): unknown => ({
      version: 1,
      scannedAt: "2026-09-16T14:30:00.000Z",
      uiLanguage: "ja",
      families: [{ family: "Cascadia Code", displayName: "Cascadia Code", fixedWidth }]
    });

    expect(isValidFontCache(cacheWith("unknown"))).toBe(true);
    expect(isValidFontCache(cacheWith("fixed"))).toBe(true);
    expect(isValidFontCache(cacheWith("proportional"))).toBe(true);

    expect(isValidFontCache(cacheWith("Fixed"))).toBe(false);
    expect(isValidFontCache(cacheWith("monospace"))).toBe(false);
    expect(isValidFontCache(cacheWith(""))).toBe(false);
    expect(isValidFontCache(cacheWith(null))).toBe(false);
    expect(isValidFontCache(cacheWith(undefined))).toBe(false);
    expect(isValidFontCache(cacheWith(1))).toBe(false);
  });
});
