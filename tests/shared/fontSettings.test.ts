import { describe, expect, it } from "vitest";
import {
  buildFontFamilyCss,
  defaultFontFamilyListSettings,
  FONT_SLOT_GENERIC_FALLBACKS,
  GENERIC_FONT_FAMILIES,
  parseFontFamilyEntry,
  quoteCssFontFamily,
  validateFontFamilyList,
  type FontFamilySetting
} from "../../src/shared/fontSettings";

describe("fontSettings (#490)", () => {
  describe("constants and defaults", () => {
    it("has generic fallbacks for all three font slots", () => {
      expect(FONT_SLOT_GENERIC_FALLBACKS["workbench.uiFontFamilyList"]).toBe(
        "sans-serif"
      );
      expect(FONT_SLOT_GENERIC_FALLBACKS["editor.fontFamilyList"]).toBe(
        "monospace"
      );
      expect(FONT_SLOT_GENERIC_FALLBACKS["preview.fontFamilyList"]).toBe(
        "serif"
      );
    });

    it("default font family list settings is an empty array", () => {
      expect(defaultFontFamilyListSettings).toEqual([]);
    });
  });

  describe("parseFontFamilyEntry", () => {
    it("parses valid string entries", () => {
      expect(parseFontFamilyEntry("Segoe UI")).toEqual({ family: "Segoe UI" });
      expect(parseFontFamilyEntry("  Meiryo  ")).toEqual({ family: "Meiryo" });
    });

    it("parses valid object entries with optional displayName", () => {
      expect(parseFontFamilyEntry({ family: "YuGothic" })).toEqual({
        family: "YuGothic"
      });
      expect(
        parseFontFamilyEntry({
          family: "YuGothic",
          displayName: "游ゴシック"
        })
      ).toEqual({
        family: "YuGothic",
        displayName: "游ゴシック"
      });
    });

    it("drops generic font families", () => {
      expect(parseFontFamilyEntry("sans-serif")).toBeNull();
      expect(parseFontFamilyEntry("SERIF")).toBeNull();
      expect(parseFontFamilyEntry("monospace")).toBeNull();
      expect(parseFontFamilyEntry("system-ui")).toBeNull();
      expect(parseFontFamilyEntry({ family: "cursive" })).toBeNull();
    });

    it("returns null for empty strings or invalid inputs", () => {
      expect(parseFontFamilyEntry("")).toBeNull();
      expect(parseFontFamilyEntry("   ")).toBeNull();
      expect(parseFontFamilyEntry(123)).toBeNull();
      expect(parseFontFamilyEntry(null)).toBeNull();
      expect(parseFontFamilyEntry({})).toBeNull();
    });
  });

  describe("validateFontFamilyList", () => {
    it("returns typeMismatch for non-array inputs", () => {
      expect(validateFontFamilyList("not an array")).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
      expect(validateFontFamilyList(null)).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("returns typeMismatch if array contains non-string, non-object elements", () => {
      expect(validateFontFamilyList([123])).toEqual({
        ok: false,
        failure: "typeMismatch"
      });
    });

    it("validates, sanitizes, and deduplicates font family lists", () => {
      const input = [
        { family: "Segoe UI", displayName: "Segoe UI" },
        "sans-serif", // generic family -> dropped
        { family: "Meiryo", displayName: "メイリオ" },
        { family: "segoe ui" } // duplicate case-insensitive family -> dropped
      ];

      const result = validateFontFamilyList(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([
          { family: "Segoe UI", displayName: "Segoe UI" },
          { family: "Meiryo", displayName: "メイリオ" }
        ]);
      }
    });

    it("handles empty arrays", () => {
      const result = validateFontFamilyList([]);
      expect(result).toEqual({ ok: true, value: [] });
    });
  });

  describe("quoteCssFontFamily", () => {
    it("leaves generic font families unquoted", () => {
      expect(quoteCssFontFamily("sans-serif")).toBe("sans-serif");
      expect(quoteCssFontFamily("monospace")).toBe("monospace");
    });

    it("quotes font family names and escapes special characters", () => {
      expect(quoteCssFontFamily("Segoe UI")).toBe('"Segoe UI"');
      expect(quoteCssFontFamily('My "Custom" Font')).toBe(
        '"My \\"Custom\\" Font"'
      );
      expect(quoteCssFontFamily("Font\\With\\Backslash")).toBe(
        '"Font\\\\With\\\\Backslash"'
      );
    });

    it("normalizes existing quotes", () => {
      expect(quoteCssFontFamily('"Segoe UI"')).toBe('"Segoe UI"');
      expect(quoteCssFontFamily("'Segoe UI'")).toBe('"Segoe UI"');
    });
  });

  describe("buildFontFamilyCss", () => {
    it("returns fallback only when families list is empty", () => {
      expect(buildFontFamilyCss([], "sans-serif")).toBe("sans-serif");
      expect(buildFontFamilyCss([], "monospace")).toBe("monospace");
    });

    it("builds ordered CSS font-family string with generic fallback appended at end", () => {
      const families: FontFamilySetting[] = [
        { family: "Segoe UI", displayName: "Segoe UI" },
        { family: "Meiryo", displayName: "メイリオ" }
      ];

      expect(buildFontFamilyCss(families, "sans-serif")).toBe(
        '"Segoe UI", "Meiryo", sans-serif'
      );
    });

    it("supports string array inputs", () => {
      expect(buildFontFamilyCss(["Consolas", "Courier New"], "monospace")).toBe(
        '"Consolas", "Courier New", monospace'
      );
    });

    it("safely escapes backslashes and double quotes in family names", () => {
      const families: FontFamilySetting[] = [
        { family: 'Font "A" \\ B' }
      ];
      expect(buildFontFamilyCss(families, "sans-serif")).toBe(
        '"Font \\"A\\" \\\\ B", sans-serif'
      );
    });

    it("deduplicates family names case-insensitively in CSS output", () => {
      expect(
        buildFontFamilyCss(["Segoe UI", "segoe ui", "Meiryo"], "sans-serif")
      ).toBe('"Segoe UI", "Meiryo", sans-serif');
    });
  });
});
