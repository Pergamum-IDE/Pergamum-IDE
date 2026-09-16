import { describe, expect, it } from "vitest";
import {
  getFontNameLanguageId,
  resolveDisplayNameFromFamilyRecords,
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
  describe("getFontNameLanguageId", () => {
    it("ja resolves to the Microsoft Japanese language ID", () => {
      expect(getFontNameLanguageId("ja")).toBe(JAPANESE);
    });

    it("en resolves to the Microsoft US English language ID", () => {
      expect(getFontNameLanguageId("en")).toBe(US_ENGLISH);
    });
  });

  describe("resolveDisplayNameFromFamilyRecords", () => {
    it("ja: resolves any face's Japanese Typographic/Preferred Family (nameID 16) first", () => {
      const records = [
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック Regular"),
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "游ゴシック"),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Yu Gothic")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "Yu Gothic")).toBe(
        "游ゴシック"
      );
    });

    it("ja: uses Japanese nameID 1 only from a face whose English nameID 1 exactly equals family", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "BIZ UDPGothic"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "BIZ UDPゴシック")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "BIZ UDPGothic")).toBe(
        "BIZ UDPゴシック"
      );
    });

    it("ja: does not use English nameID 16 as a localized display-name fallback", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Cascadia Code"),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Cascadia Code Regular")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "CascadiaCode")).toBe(
        "CascadiaCode"
      );
    });

    it("ja: falls back to family when no English nameID 1 equals the family", () => {
      const records = [record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "Consolas")).toBe(
        "Consolas"
      );
    });

    it("ja: falls back to FontData.family when no usable record exists at all", () => {
      expect(resolveDisplayNameFromFamilyRecords([[]], "ja", "SomeObscureFont")).toBe(
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
      expect(resolveDisplayNameFromFamilyRecords([records], "en", "CascadiaCode")).toBe(
        "Cascadia Code"
      );
    });

    it("en: falls back to the English Font Family (nameID 1) when nameID 16 is absent", () => {
      const records = [record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")];
      expect(resolveDisplayNameFromFamilyRecords([records], "en", "Consolas")).toBe(
        "Consolas"
      );
    });

    it("en: falls back to FontData.family when no English record exists (even if a Japanese one does)", () => {
      const records = [record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "游ゴシック")];
      expect(resolveDisplayNameFromFamilyRecords([records], "en", "YuGothic")).toBe(
        "YuGothic"
      );
    });

    it("prefers nameID 16 over nameID 1 for the same language", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Cascadia Code Regular"),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "Cascadia Code")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "en", "CascadiaCode")).toBe(
        "Cascadia Code"
      );
    });

    it("is independent from queryLocalFonts face order when a later face has the localized name", () => {
      const noLocalizedNameFace = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "BIZ UDGothic")
      ];
      const localizedNameFace = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "BIZ UDGothic"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "BIZ UDゴシック")
      ];

      expect(
        resolveDisplayNameFromFamilyRecords(
          [noLocalizedNameFace, localizedNameFace],
          "ja",
          "BIZ UDGothic"
        )
      ).toBe("BIZ UDゴシック");
      expect(
        resolveDisplayNameFromFamilyRecords(
          [localizedNameFace, noLocalizedNameFace],
          "ja",
          "BIZ UDGothic"
        )
      ).toBe("BIZ UDゴシック");
    });

    it("does not use a style-specific nameID 1 when English nameID 1 does not exactly equal family", () => {
      const lightFace = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Yu Mincho Light"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游明朝 Light")
      ];
      const regularFace = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Yu Mincho"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游明朝")
      ];

      expect(
        resolveDisplayNameFromFamilyRecords(
          [lightFace, regularFace],
          "ja",
          "Yu Mincho"
        )
      ).toBe("游明朝");
    });

    it("never returns an empty string — a blank-valued record is treated as absent", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, "   "),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "Consolas")
      ];
      const result = resolveDisplayNameFromFamilyRecords([records], "en", "Consolas");
      expect(result).toBe("Consolas");
      expect(result.length).toBeGreaterThan(0);

      expect(resolveDisplayNameFromFamilyRecords([[]], "en", "FallbackFamily")).toBe(
        "FallbackFamily"
      );
    });

    // #496 local review remediation: harden the empty/whitespace-name and
    // empty-fallback edges explicitly, one behavior per test.
    it("ignores an empty localized nameID 16 and does not use nameID 1 without the English-family gate", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "YuGothic")).toBe(
        "YuGothic"
      );
    });

    it("ignores a whitespace-only localized nameID 16 and only uses nameID 1 through the English-family gate", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "   　  "),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "YuGothic"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "游ゴシック")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "YuGothic")).toBe(
        "游ゴシック"
      );
    });

    it("falls back through every priority tier when every candidate record is empty/whitespace-only", () => {
      const records = [
        record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "   "),
        record(US_ENGLISH, NAME_ID_TYPOGRAPHIC_FAMILY, ""),
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "　")
      ];
      expect(resolveDisplayNameFromFamilyRecords([records], "ja", "YuGothic")).toBe(
        "YuGothic"
      );
    });

    it("does not return an empty string even when fallbackFamily itself is empty (defensive last resort)", () => {
      const empty = resolveDisplayNameFromFamilyRecords([[]], "ja", "");
      expect(empty).not.toBe("");
      expect(empty.length).toBeGreaterThan(0);

      const wholeSpace = resolveDisplayNameFromFamilyRecords([[]], "ja", "   ");
      expect(wholeSpace).not.toBe("");
      expect(wholeSpace.trim().length).toBeGreaterThan(0);
    });

    it("does not return an empty string when fallbackFamily is empty even though every record is also blank", () => {
      const records = [record(JAPANESE, NAME_ID_TYPOGRAPHIC_FAMILY, "   ")];
      const result = resolveDisplayNameFromFamilyRecords([records], "ja", "");
      expect(result).not.toBe("");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("resolveDisplayNameFromRecords", () => {
    it("keeps the single-face wrapper aligned with the family resolver", () => {
      const records = [
        record(US_ENGLISH, NAME_ID_FONT_FAMILY, "BIZ UDPGothic"),
        record(JAPANESE, NAME_ID_FONT_FAMILY, "BIZ UDPゴシック")
      ];
      expect(resolveDisplayNameFromRecords(records, "ja", "BIZ UDPGothic")).toBe(
        "BIZ UDPゴシック"
      );
    });
  });
});
