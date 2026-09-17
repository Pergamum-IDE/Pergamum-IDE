import { describe, expect, it } from "vitest";
import {
  decodeTextFileBytes,
  encodeTextFileContent,
  PergamumTextFileEncodingError
} from "../../src/main/textFileIo";
import {
  TEXT_FILE_ENCODINGS,
  type TextFileEncoding
} from "../../src/shared/textFileEncoding";

describe("textFileIo", () => {
  const sampleJapaneseText = "吾輩は猫である。\n名前はまだ無い。";

  describe("round-trip encode and decode for all encodings", () => {
    for (const encoding of TEXT_FILE_ENCODINGS) {
      it(`encodes and decodes Japanese text with ${encoding}`, () => {
        const encodeResult = encodeTextFileContent(sampleJapaneseText, encoding);
        expect(encodeResult.bytes).toBeInstanceOf(Uint8Array);
        expect(encodeResult.bytes.byteLength).toBeGreaterThan(0);

        const decodeResult = decodeTextFileBytes(encodeResult.bytes, encoding);
        expect(decodeResult.content).toBe(sampleJapaneseText);
      });
    }
  });

  describe("BOM handling", () => {
    it("handles UTF-8 BOM correctly", () => {
      const noBomResult = encodeTextFileContent("Hello", "utf8");
      expect(noBomResult.wroteBom).toBe(false);
      expect(new Uint8Array(noBomResult.bytes.slice(0, 3))).not.toEqual(
        new Uint8Array([0xef, 0xbb, 0xbf])
      );
      expect(decodeTextFileBytes(noBomResult.bytes, "utf8")).toEqual({
        content: "Hello",
        hadBom: false
      });

      const bomResult = encodeTextFileContent("Hello", "utf8Bom");
      expect(bomResult.wroteBom).toBe(true);
      expect(new Uint8Array(bomResult.bytes.slice(0, 3))).toEqual(
        new Uint8Array([0xef, 0xbb, 0xbf])
      );
      expect(decodeTextFileBytes(bomResult.bytes, "utf8Bom")).toEqual({
        content: "Hello",
        hadBom: true
      });
      // Decoding utf8Bom bytes as utf8 should also strip the BOM and report hadBom: true
      expect(decodeTextFileBytes(bomResult.bytes, "utf8")).toEqual({
        content: "Hello",
        hadBom: true
      });
    });

    it("handles UTF-16LE BOM correctly", () => {
      const noBomResult = encodeTextFileContent("Test", "utf16le");
      expect(noBomResult.wroteBom).toBe(false);
      expect(new Uint8Array(noBomResult.bytes.slice(0, 2))).not.toEqual(
        new Uint8Array([0xff, 0xfe])
      );
      expect(decodeTextFileBytes(noBomResult.bytes, "utf16le")).toEqual({
        content: "Test",
        hadBom: false
      });

      const bomResult = encodeTextFileContent("Test", "utf16leBom");
      expect(bomResult.wroteBom).toBe(true);
      expect(new Uint8Array(bomResult.bytes.slice(0, 2))).toEqual(
        new Uint8Array([0xff, 0xfe])
      );
      expect(decodeTextFileBytes(bomResult.bytes, "utf16leBom")).toEqual({
        content: "Test",
        hadBom: true
      });
    });

    it("handles UTF-16BE BOM correctly", () => {
      const noBomResult = encodeTextFileContent("Test", "utf16be");
      expect(noBomResult.wroteBom).toBe(false);
      expect(new Uint8Array(noBomResult.bytes.slice(0, 2))).not.toEqual(
        new Uint8Array([0xfe, 0xff])
      );
      expect(decodeTextFileBytes(noBomResult.bytes, "utf16be")).toEqual({
        content: "Test",
        hadBom: false
      });

      const bomResult = encodeTextFileContent("Test", "utf16beBom");
      expect(bomResult.wroteBom).toBe(true);
      expect(new Uint8Array(bomResult.bytes.slice(0, 2))).toEqual(
        new Uint8Array([0xfe, 0xff])
      );
      expect(decodeTextFileBytes(bomResult.bytes, "utf16beBom")).toEqual({
        content: "Test",
        hadBom: true
      });
    });
  });

  describe("CP932 compatibility for shiftJis", () => {
    it("supports CP932 NEC/IBM extended characters and circled numbers", () => {
      const cp932Text = "① 髙橋 ①②③ ㈱";
      const encodeResult = encodeTextFileContent(cp932Text, "shiftJis");
      const decodeResult = decodeTextFileBytes(encodeResult.bytes, "shiftJis");
      expect(decodeResult.content).toBe(cp932Text);
    });
  });

  describe("Unencodable character handling", () => {
    const textWithEmoji = "吾輩は猫である。🙂";

    it("throws unencodableCharacters error for legacy encodings with emoji", () => {
      const legacyEncodings: TextFileEncoding[] = [
        "shiftJis",
        "eucJp",
        "iso2022Jp"
      ];

      for (const encoding of legacyEncodings) {
        expect(() => encodeTextFileContent(textWithEmoji, encoding)).toThrow(
          PergamumTextFileEncodingError
        );

        try {
          encodeTextFileContent(textWithEmoji, encoding);
        } catch (error) {
          expect(error).toBeInstanceOf(PergamumTextFileEncodingError);
          const encErr = error as PergamumTextFileEncodingError;
          expect(encErr.code).toBe("PERGAMUM_TEXT_FILE_ENCODING_FAILED");
          expect(encErr.encoding).toBe(encoding);
          expect(encErr.reason).toBe("unencodableCharacters");
          expect(encErr.firstDiffIndex).toBe(8); // Emoji starts at index 8
        }
      }
    });

    it("preserves Unicode emoji in UTF-8 and UTF-16 variants", () => {
      const unicodeEncodings: TextFileEncoding[] = [
        "utf8",
        "utf8Bom",
        "utf16le",
        "utf16leBom",
        "utf16be",
        "utf16beBom"
      ];

      for (const encoding of unicodeEncodings) {
        const encodeResult = encodeTextFileContent(textWithEmoji, encoding);
        const decodeResult = decodeTextFileBytes(encodeResult.bytes, encoding);
        expect(decodeResult.content).toBe(textWithEmoji);
      }
    });
  });

  describe("Decode error handling", () => {
    it("throws invalidEncoding error when decoding invalid UTF-8 bytes", () => {
      const invalidUtf8Bytes = new Uint8Array([0xff, 0xff, 0xff]);
      expect(() => decodeTextFileBytes(invalidUtf8Bytes, "utf8")).toThrow(
        PergamumTextFileEncodingError
      );

      try {
        decodeTextFileBytes(invalidUtf8Bytes, "utf8");
      } catch (error) {
        expect(error).toBeInstanceOf(PergamumTextFileEncodingError);
        const encErr = error as PergamumTextFileEncodingError;
        expect(encErr.encoding).toBe("utf8");
        expect(encErr.reason).toBe("invalidEncoding");
      }
    });

    it("throws unsupportedEncoding error for invalid encoding parameter", () => {
      expect(() =>
        decodeTextFileBytes(
          new Uint8Array([65]),
          "invalid" as TextFileEncoding
        )
      ).toThrow(PergamumTextFileEncodingError);

      expect(() =>
        encodeTextFileContent("test", "invalid" as TextFileEncoding)
      ).toThrow(PergamumTextFileEncodingError);
    });
  });
});
