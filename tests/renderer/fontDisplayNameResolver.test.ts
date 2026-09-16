import { describe, expect, it } from "vitest";
import {
  getPreferredFontNameLanguageIds,
  resolveDisplayNameFromRecords
} from "../../src/renderer/fontDisplayNameResolver";
import type { FontNameRecord } from "../../src/renderer/fontNameTableParser";

const MS_PLATFORM = 3;
const MS_UNICODE_BMP_ENCODING = 1;
const JAPANESE = 0x0411;
const US_ENGLISH = 0x0409;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_FONT_FAMILY = 1;

function record(
  languageID: number,
  nameID: number,
  value: string
): FontNameRecord {
  return {
    platformID: MS_PLATFORM,
    encodingID: MS_UNICODE_BMP_ENCODING,
    languageID,
    nameID,
    value
  };
}

describe("fontDisplayNameResolver (#496)", () => {
  describe("getPreferredFontNameLanguageIds", () => {
    it("ja tries Japanese before US English", () => {
      expect(getPreferredFontNameLanguageIds("ja")).toEqual([JAPANESE, US_ENGLISH]);
    });

    it("en tries only US English", () => {
      expect(getPreferredFontNameLanguageIds("en")).toEqual([US_ENGLISH]);
    });
  });

  describe("resolveDisplayNameFromRecords", () => {
    it("ja: resolves the Japanese Typographic/Preferred Family (nameID 16) when present", () => {
      const records = [
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック Regular"),
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "游ゴシック"),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Yu Gothic")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "YuGothic")).toBe("游ゴシック");
    });

    it("ja: falls back to the Japanese Font Family (nameID 1) when nameID 16 is absent", () => {
      const records = [record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック")];
      expect(resolveDisplayNameFromRecords(records, "ja", "YuGothic")).toBe("游ゴシック");
    });

    it("ja: falls back to the English Typographic/Preferred Family when no Japanese record exists", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Cascadia Code"),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Cascadia Code Regular")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "CascadiaCode")).toBe(
        "Cascadia Code"
      );
    });

    it("ja: falls back to the English Font Family when neither Japanese record nor English nameID 16 exist", () => {
      const records = [record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")];
      expect(resolveDisplayNameFromRecords(records, "ja", "Consolas")).toBe("Consolas");
    });

    it("ja: falls back to FontData.family when no usable record exists at all", () => {
      expect(resolveDisplayNameFromRecords([], "ja", "SomeObscureFont")).toBe(
        "SomeObscureFont"
      );
    });

    it("en: resolves the English Typographic/Preferred Family (nameID 16) when present", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Cascadia Code Regular"),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Cascadia Code"),
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "キャスケイディア コード")
      ];
      // English UI never looks at Japanese records at all.
      expect(resolveDisplayNameFromRecords(records, "en", "CascadiaCode")).toBe(
        "Cascadia Code"
      );
    });

    it("en: falls back to the English Font Family (nameID 1) when nameID 16 is absent", () => {
      const records = [record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")];
      expect(resolveDisplayNameFromRecords(records, "en", "Consolas")).toBe("Consolas");
    });

    it("en: falls back to FontData.family when no English record exists (even if a Japanese one does)", () => {
      const records = [record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "游ゴシック")];
      expect(resolveDisplayNameFromRecords(records, "en", "YuGothic")).toBe("YuGothic");
    });

    it("prefers nameID 16 over nameID 1 for the same language", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Cascadia Code Regular"),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Cascadia Code")
      ];
      expect(resolveDisplayNameFromRecords(records, "en", "CascadiaCode")).toBe(
        "Cascadia Code"
      );
    });

    it("never returns an empty string — a blank-valued record is treated as absent", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "   "),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")
      ];
      const result = resolveDisplayNameFromRecords(records, "en", "Consolas");
      expect(result).toBe("Consolas");
      expect(result.length).toBeGreaterThan(0);

      expect(resolveDisplayNameFromRecords([], "en", "FallbackFamily")).toBe(
        "FallbackFamily"
      );
    });

    // #496 local review remediation: harden the empty/whitespace-name and
    // empty-fallback edges explicitly, one behavior per test.
    it("ignores an empty-string (\"\") localized name record and continues to the next priority candidate", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "YuGothic")).toBe("游ゴシック");
    });

    it("ignores a whitespace-only localized name record and continues to the next priority candidate", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "   　  "),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "YuGothic")).toBe("游ゴシック");
    });

    it("falls back through every priority tier when every candidate record is empty/whitespace-only", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "   "),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "　")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "YuGothic")).toBe("YuGothic");
    });

    it("does not return an empty string even when fallbackFamily itself is empty (defensive last resort)", () => {
      const empty = resolveDisplayNameFromRecords([], "ja", "");
      expect(empty).not.toBe("");
      expect(empty.length).toBeGreaterThan(0);

      const wholeSpace = resolveDisplayNameFromRecords([], "ja", "   ");
      expect(wholeSpace).not.toBe("");
      expect(wholeSpace.trim().length).toBeGreaterThan(0);
    });

    it("does not return an empty string when fallbackFamily is empty even though every record is also blank", () => {
      const records = [record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "   ")];
      const result = resolveDisplayNameFromRecords(records, "ja", "");
      expect(result).not.toBe("");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
