import { describe, expect, it } from "vitest";
import {
  DEFAULT_TEXT_FILE_ENCODING,
  isTextFileEncoding,
  TEXT_FILE_ENCODINGS,
  TEXT_FILE_ENCODING_LABEL_OPTIONS,
  type TextFileEncoding
} from "../../src/shared/textFileEncoding";

describe("textFileEncoding", () => {
  it("defines expected canonical text file encodings", () => {
    expect(TEXT_FILE_ENCODINGS).toEqual([
      "utf8",
      "utf8Bom",
      "shiftJis",
      "eucJp",
      "iso2022Jp",
      "utf16le",
      "utf16leBom",
      "utf16be",
      "utf16beBom"
    ]);
  });

  it("defaults to utf8", () => {
    expect(DEFAULT_TEXT_FILE_ENCODING).toBe("utf8");
  });

  it("validates text file encoding type predicate", () => {
    for (const encoding of TEXT_FILE_ENCODINGS) {
      expect(isTextFileEncoding(encoding)).toBe(true);
    }

    expect(isTextFileEncoding("invalid")).toBe(false);
    expect(isTextFileEncoding("utf-8")).toBe(false);
    expect(isTextFileEncoding("")).toBe(false);
    expect(isTextFileEncoding(null)).toBe(false);
    expect(isTextFileEncoding(undefined)).toBe(false);
    expect(isTextFileEncoding(123)).toBe(false);
  });

  it("provides correct Japanese and English labels for all encodings", () => {
    expect(TEXT_FILE_ENCODING_LABEL_OPTIONS.length).toBe(
      TEXT_FILE_ENCODINGS.length
    );

    const map = new Map(
      TEXT_FILE_ENCODING_LABEL_OPTIONS.map((opt) => [opt.encoding, opt])
    );

    for (const encoding of TEXT_FILE_ENCODINGS) {
      expect(map.has(encoding)).toBe(true);
    }

    expect(map.get("utf8")).toEqual({
      encoding: "utf8",
      labelJa: "UTF-8",
      labelEn: "UTF-8"
    });
    expect(map.get("utf8Bom")).toEqual({
      encoding: "utf8Bom",
      labelJa: "UTF-8（BOMあり）",
      labelEn: "UTF-8 with BOM"
    });
    expect(map.get("shiftJis")).toEqual({
      encoding: "shiftJis",
      labelJa: "Shift_JIS（CP932）",
      labelEn: "Shift_JIS (CP932)"
    });
    expect(map.get("eucJp")).toEqual({
      encoding: "eucJp",
      labelJa: "EUC-JP",
      labelEn: "EUC-JP"
    });
    expect(map.get("iso2022Jp")).toEqual({
      encoding: "iso2022Jp",
      labelJa: "ISO-2022-JP",
      labelEn: "ISO-2022-JP"
    });
    expect(map.get("utf16le")).toEqual({
      encoding: "utf16le",
      labelJa: "UTF-16LE（BOMなし）",
      labelEn: "UTF-16LE without BOM"
    });
    expect(map.get("utf16leBom")).toEqual({
      encoding: "utf16leBom",
      labelJa: "UTF-16LE（BOMあり）",
      labelEn: "UTF-16LE with BOM"
    });
    expect(map.get("utf16be")).toEqual({
      encoding: "utf16be",
      labelJa: "UTF-16BE（BOMなし）",
      labelEn: "UTF-16BE without BOM"
    });
    expect(map.get("utf16beBom")).toEqual({
      encoding: "utf16beBom",
      labelJa: "UTF-16BE（BOMあり）",
      labelEn: "UTF-16BE with BOM"
    });
  });
});
