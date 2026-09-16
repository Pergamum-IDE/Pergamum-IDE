import { describe, expect, it } from "vitest";
import {
  countGraphemes,
  EMPHASIS_RULE_PREVIEW_META,
  getAozoraEmphasisPreviewSymbol,
  getEmphasisMarkPreviewSymbol,
  sanitizeAozoraEmphasisMark,
  validateNarouEmphasisMarkText
} from "../../src/shared/emphasisMarkSettings";
import {
  getCatalogDefaultValue,
  resolveCatalogValue,
  validateCatalogValue
} from "../../src/shared/settingsCatalog";
import { resolveEffectiveSettings, defaultApplicationSettings } from "../../src/shared/settings";

describe("Emphasis Mark Settings (Slice 1, #484)", () => {
  describe("validateNarouEmphasisMarkText", () => {
    it("accepts valid 1-8 grapheme mark text", () => {
      expect(validateNarouEmphasisMarkText("・")).toBe(true);
      expect(validateNarouEmphasisMarkText("★")).toBe(true);
      expect(validateNarouEmphasisMarkText("12345678")).toBe(true);
      expect(validateNarouEmphasisMarkText("あいうえおかきく")).toBe(true);
    });

    it("rejects empty string", () => {
      expect(validateNarouEmphasisMarkText("")).toBe(false);
    });

    it("rejects text longer than 8 graphemes", () => {
      expect(validateNarouEmphasisMarkText("123456789")).toBe(false);
      expect(validateNarouEmphasisMarkText("あいうえおかきくけ")).toBe(false);
    });

    it("rejects text with newlines", () => {
      expect(validateNarouEmphasisMarkText("a\nb")).toBe(false);
      expect(validateNarouEmphasisMarkText("a\rb")).toBe(false);
    });

    it("rejects text containing bracket characters 《, 》, or ｜", () => {
      expect(validateNarouEmphasisMarkText("《")).toBe(false);
      expect(validateNarouEmphasisMarkText("》")).toBe(false);
      expect(validateNarouEmphasisMarkText("｜")).toBe(false);
      expect(validateNarouEmphasisMarkText("a《b")).toBe(false);
    });
  });

  describe("countGraphemes", () => {
    it("correctly counts graphemes for surrogate pairs and Japanese characters", () => {
      expect(countGraphemes("abc")).toBe(3);
      expect(countGraphemes("あいう")).toBe(3);
      expect(countGraphemes("𩸽")).toBe(1); // 2 UTF-16 units, 1 grapheme
    });
  });

  describe("getAozoraEmphasisPreviewSymbol", () => {
    it("maps all official Aozora emphasis mark types to their visual preview symbols", () => {
      expect(getAozoraEmphasisPreviewSymbol("sesame")).toBe("﹅");
      expect(getAozoraEmphasisPreviewSymbol("whiteSesame")).toBe("﹆");
      expect(getAozoraEmphasisPreviewSymbol("circle")).toBe("●");
      expect(getAozoraEmphasisPreviewSymbol("whiteCircle")).toBe("○");
      expect(getAozoraEmphasisPreviewSymbol("blackTriangle")).toBe("▲");
      expect(getAozoraEmphasisPreviewSymbol("whiteTriangle")).toBe("△");
      expect(getAozoraEmphasisPreviewSymbol("doubleCircle")).toBe("◎");
      expect(getAozoraEmphasisPreviewSymbol("fisheye")).toBe("◉");
      expect(getAozoraEmphasisPreviewSymbol("saltire")).toBe("×");
    });
  });

  describe("EMPHASIS_RULE_PREVIEW_META & getEmphasisMarkPreviewSymbol", () => {
    it("defines preview metadata per rule according to Option 2", () => {
      expect(EMPHASIS_RULE_PREVIEW_META.aozora).toEqual({
        defaultSymbol: "﹅",
        allowSymbolCustomization: true
      });
      expect(EMPHASIS_RULE_PREVIEW_META.kakuyomu).toEqual({
        defaultSymbol: "・",
        allowSymbolCustomization: false
      });
      expect(EMPHASIS_RULE_PREVIEW_META.narou).toEqual({
        defaultSymbol: "・",
        allowSymbolCustomization: true
      });
    });

    it("resolves visual rendered preview symbols for all rules", () => {
      expect(
        getEmphasisMarkPreviewSymbol({
          rule: "aozora",
          aozoraMark: "circle",
          narouMarkText: "・"
        })
      ).toBe("●");

      expect(
        getEmphasisMarkPreviewSymbol({
          rule: "kakuyomu",
          aozoraMark: "sesame",
          narouMarkText: "・"
        })
      ).toBe("・");

      expect(
        getEmphasisMarkPreviewSymbol({
          rule: "narou",
          aozoraMark: "sesame",
          narouMarkText: "★"
        })
      ).toBe("★");

      expect(
        getEmphasisMarkPreviewSymbol({
          rule: "narou",
          aozoraMark: "sesame",
          narouMarkText: "invalid《"
        })
      ).toBe("");
    });
  });

  describe("catalog settings", () => {
    it("has expected defaults for emphasisMark keys", () => {
      expect(getCatalogDefaultValue("editor.emphasisMark.rule")).toBe("aozora");
      expect(getCatalogDefaultValue("editor.emphasisMark.aozoraMark")).toBe("sesame");
      expect(getCatalogDefaultValue("editor.emphasisMark.narouMarkText")).toBe("・");
    });

    it("validates rule enum values", () => {
      expect(validateCatalogValue("editor.emphasisMark.rule", "aozora").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.rule", "kakuyomu").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.rule", "narou").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.rule", "invalid").ok).toBe(false);
    });

    it("validates aozoraMark enum values", () => {
      expect(validateCatalogValue("editor.emphasisMark.aozoraMark", "whiteSesame").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.aozoraMark", "sesame").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.aozoraMark", "doubleCircle").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.aozoraMark", "invalid").ok).toBe(false);
    });

    it("validates narouMarkText string values", () => {
      expect(validateCatalogValue("editor.emphasisMark.narouMarkText", "・").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.narouMarkText", "▲").ok).toBe(true);
      expect(validateCatalogValue("editor.emphasisMark.narouMarkText", "").ok).toBe(false);
      expect(validateCatalogValue("editor.emphasisMark.narouMarkText", "《").ok).toBe(false);
    });
  });

  describe("effective settings resolution", () => {
    it("resolves Project Settings > Application Settings > Built-in defaults", () => {
      const appSettings = defaultApplicationSettings;
      const effectiveAppOnly = resolveEffectiveSettings(appSettings, undefined);
      expect(effectiveAppOnly.editor.emphasisMark.rule).toBe("aozora");
      expect(effectiveAppOnly.editor.emphasisMark.aozoraMark).toBe("sesame");
      expect(effectiveAppOnly.editor.emphasisMark.narouMarkText).toBe("・");

      const projectOverride = {
        editor: {
          emphasisMark: {
            rule: "narou" as const,
            narouMarkText: "★"
          }
        }
      };

      const effectiveProject = resolveEffectiveSettings(appSettings, projectOverride);
      expect(effectiveProject.editor.emphasisMark.rule).toBe("narou");
      expect(effectiveProject.editor.emphasisMark.aozoraMark).toBe("sesame");
      expect(effectiveProject.editor.emphasisMark.narouMarkText).toBe("★");
    });
  });

  describe("sanitizeAozoraEmphasisMark", () => {
    it("maps legacy blackCircle to circle", () => {
      expect(sanitizeAozoraEmphasisMark("blackCircle")).toBe("circle");
    });

    it("accepts valid official Aozora mark values", () => {
      expect(sanitizeAozoraEmphasisMark("circle")).toBe("circle");
      expect(sanitizeAozoraEmphasisMark("fisheye")).toBe("fisheye");
      expect(sanitizeAozoraEmphasisMark("saltire")).toBe("saltire");
      expect(sanitizeAozoraEmphasisMark("whiteSesame")).toBe("whiteSesame");
    });

    it("falls back to sesame for unknown/invalid input", () => {
      expect(sanitizeAozoraEmphasisMark("invalid")).toBe("sesame");
      expect(sanitizeAozoraEmphasisMark(null)).toBe("sesame");
      expect(sanitizeAozoraEmphasisMark(123)).toBe("sesame");
    });
  });
});
