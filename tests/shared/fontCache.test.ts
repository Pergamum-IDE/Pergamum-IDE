import { describe, expect, it } from "vitest";
import {
  aggregateFontFamilies,
  aggregateFontFamiliesWithDisplayNames,
  isValidFontCache,
  FONT_CACHE_CURRENT_VERSION,
  type FontCache,
  type RawFontData,
  type RawFontDataWithDisplayName
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

  // #496: cache validation must reject an empty displayName — the resolver
  // always falls back to a non-empty `family`, so a legitimately-produced
  // cache can never have one; an empty string signals a corrupt payload.
  it("cache validation accepts a localized displayName and rejects an empty one", () => {
    const cacheWith = (displayName: unknown): unknown => ({
      version: 1,
      scannedAt: "2026-09-16T14:30:00.000Z",
      uiLanguage: "ja",
      families: [{ family: "Yu Gothic", displayName, fixedWidth: "unknown" }]
    });

    expect(isValidFontCache(cacheWith("游ゴシック"))).toBe(true);
    expect(isValidFontCache(cacheWith("Yu Gothic"))).toBe(true);
    expect(isValidFontCache(cacheWith(""))).toBe(false);
    expect(isValidFontCache(cacheWith("   "))).toBe(false);
  });
});

describe("aggregateFontFamiliesWithDisplayNames (#496)", () => {
  it("assigns the resolved displayName to the aggregated family", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Yu Gothic", resolvedDisplayName: "游ゴシック" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toEqual([
      { family: "Yu Gothic", displayName: "游ゴシック", fixedWidth: "unknown" }
    ]);
  });

  it("falls back to family when a face's resolution failed (no resolvedDisplayName)", () => {
    const raw: RawFontDataWithDisplayName[] = [{ family: "Obscure Font" }];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toEqual([
      { family: "Obscure Font", displayName: "Obscure Font", fixedWidth: "unknown" }
    ]);
  });

  it("upgrades from the family fallback the moment a later face resolves a real name", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Yu Gothic", style: "Regular" }, // resolution failed for this face
      { family: "Yu Gothic", style: "Bold", resolvedDisplayName: "游ゴシック" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("游ゴシック");
  });

  it("never downgrades an already-resolved name back to the family fallback", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Yu Gothic", resolvedDisplayName: "游ゴシック" },
      { family: "Yu Gothic", style: "Bold" } // this face's resolution failed
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result[0].displayName).toBe("游ゴシック");
  });

  it("does not create a duplicate family entry across multiple faces", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Yu Gothic", style: "Regular", resolvedDisplayName: "游ゴシック" },
      { family: "Yu Gothic", style: "Bold", resolvedDisplayName: "游ゴシック" },
      { family: "Yu Gothic", style: "Italic" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toHaveLength(1);
  });

  it("still ignores FontData.fullName and keeps family as the CSS-facing value", () => {
    const raw: RawFontDataWithDisplayName[] = [
      {
        family: "Family A",
        fullName: "Should Not Be Used",
        resolvedDisplayName: "Resolved Name"
      }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result[0].family).toBe("Family A");
    expect(result[0].displayName).toBe("Resolved Name");
    expect(result[0].family).not.toBe("Should Not Be Used");
  });

  it("does not normalize family names and does not exclude families without a Regular face", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "　My Custom Font　", resolvedDisplayName: "My Custom Font" },
      { family: "BIZ UD Gothic", style: "Bold" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result.find((f) => f.family === "　My Custom Font　")).toBeTruthy();
    expect(result.find((f) => f.family === "BIZ UD Gothic")).toBeTruthy();
  });

  // #496 local review remediation: harden the empty-displayName boundary
  // explicitly, one behavior per test.
  it("falls back to family when resolvedDisplayName is an empty string", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Obscure Font", resolvedDisplayName: "" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toEqual([
      { family: "Obscure Font", displayName: "Obscure Font", fixedWidth: "unknown" }
    ]);
  });

  it("falls back to family when resolvedDisplayName is whitespace-only", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Obscure Font", resolvedDisplayName: "   　  " }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toEqual([
      { family: "Obscure Font", displayName: "Obscure Font", fixedWidth: "unknown" }
    ]);
  });

  it("a later face's whitespace-only resolvedDisplayName never overwrites an already-resolved real name", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Yu Gothic", resolvedDisplayName: "游ゴシック" },
      { family: "Yu Gothic", style: "Bold", resolvedDisplayName: "   " }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result[0].displayName).toBe("游ゴシック");
  });

  it("skips raw font entries whose family is an empty string", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "", resolvedDisplayName: "Should Not Appear" },
      { family: "Real Font", resolvedDisplayName: "Real Font" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe("Real Font");
  });

  it("skips raw font entries whose family is whitespace-only", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "   　  ", resolvedDisplayName: "Should Not Appear" },
      { family: "Real Font", resolvedDisplayName: "Real Font" }
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toHaveLength(1);
    expect(result[0].family).toBe("Real Font");
  });

  it("never produces a cache entry with an empty displayName, across a mixed batch of resolved/unresolved/blank faces", () => {
    const raw: RawFontDataWithDisplayName[] = [
      { family: "Family A", resolvedDisplayName: "Localized A" },
      { family: "Family B" }, // resolution failed
      { family: "Family C", resolvedDisplayName: "" },
      { family: "Family D", resolvedDisplayName: "   " },
      { family: "", resolvedDisplayName: "Ghost" }, // skipped entirely
      { family: "   ", resolvedDisplayName: "Ghost2" } // skipped entirely
    ];
    const result = aggregateFontFamiliesWithDisplayNames(raw);
    expect(result).toHaveLength(4);
    for (const entry of result) {
      expect(entry.displayName.length).toBeGreaterThan(0);
      expect(entry.displayName.trim().length).toBeGreaterThan(0);
    }
    expect(result.find((f) => f.family === "Family A")?.displayName).toBe("Localized A");
    expect(result.find((f) => f.family === "Family B")?.displayName).toBe("Family B");
    expect(result.find((f) => f.family === "Family C")?.displayName).toBe("Family C");
    expect(result.find((f) => f.family === "Family D")?.displayName).toBe("Family D");
  });
});
