import { Buffer } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  decodeTextImportBytes,
  defaultTextImportEncodingForBom,
  detectTextImportBom,
  previewDecodedText,
  TextImportDecodeError
} from "../../src/main/textImportDecode";

function utf16beBytes(text: string): Uint8Array {
  const littleEndian = Buffer.from(text, "utf16le");
  const swapped = new Uint8Array(littleEndian.length);

  for (let index = 0; index < littleEndian.length; index += 2) {
    swapped[index] = littleEndian[index + 1];
    swapped[index + 1] = littleEndian[index];
  }

  return swapped;
}

describe("text import decode helpers (#420 Step 1)", () => {
  it("defaults BOM-less input to UTF-8", () => {
    expect(detectTextImportBom(Buffer.from("本文", "utf8"))).toBe("none");
    expect(defaultTextImportEncodingForBom("none")).toBe("utf8");
  });

  it("detects UTF-8 BOM and removes it from decoded text", () => {
    const bytes = Uint8Array.from([0xef, 0xbb, 0xbf, ...Buffer.from("本文")]);

    expect(detectTextImportBom(bytes)).toBe("utf8");
    expect(defaultTextImportEncodingForBom("utf8")).toBe("utf8Bom");
    expect(decodeTextImportBytes(bytes, "utf8Bom")).toBe("本文");
  });

  it("detects UTF-16LE BOM and removes it from decoded text", () => {
    const bytes = Buffer.from("\ufeff本文", "utf16le");

    expect(detectTextImportBom(bytes)).toBe("utf16le");
    expect(defaultTextImportEncodingForBom("utf16le")).toBe("utf16le");
    expect(decodeTextImportBytes(bytes, "utf16le")).toBe("本文");
  });

  it("detects UTF-16BE BOM and removes it from decoded text", () => {
    const bytes = utf16beBytes("\ufeff本文");

    expect(detectTextImportBom(bytes)).toBe("utf16be");
    expect(defaultTextImportEncodingForBom("utf16be")).toBe("utf16be");
    expect(decodeTextImportBytes(bytes, "utf16be")).toBe("本文");
  });

  it("decodes Shift_JIS as CP932 / Windows-31J compatible text", () => {
    const bytes = Uint8Array.from([
      0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
    ]);

    expect(decodeTextImportBytes(bytes, "shiftJis")).toBe("日本語①");
  });

  it("decodes EUC-JP", () => {
    const bytes = Uint8Array.from([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]);

    expect(decodeTextImportBytes(bytes, "eucJp")).toBe("日本語");
  });

  it("decodes ISO-2022-JP", () => {
    const bytes = Uint8Array.from([
      0x1b, 0x24, 0x42, 0x46, 0x7c, 0x4b, 0x5c, 0x38, 0x6c, 0x1b, 0x28, 0x42
    ]);

    expect(decodeTextImportBytes(bytes, "iso2022Jp")).toBe("日本語");
  });

  it("throws decodeFailed for an invalid byte sequence", () => {
    expect(() => decodeTextImportBytes(Uint8Array.from([0xff]), "utf8")).toThrow(
      TextImportDecodeError
    );
  });

  it("builds 20-character head and tail previews", () => {
    const text = `${"a".repeat(25)}${"b".repeat(25)}`;

    expect(previewDecodedText(text)).toEqual({
      head: "a".repeat(20),
      tail: "b".repeat(20)
    });
  });

  it("does not split surrogate pairs in preview text", () => {
    const text = `${"😀".repeat(21)}終`;
    const preview = previewDecodedText(text);

    expect(Array.from(preview.head)).toHaveLength(20);
    expect(preview.head).toBe("😀".repeat(20));
    expect(Array.from(preview.tail)).toHaveLength(20);
    expect(preview.tail).toBe(`${"😀".repeat(19)}終`);
  });
});

// ---------------------------------------------------------------------------
// #420 Step 8: BOM auto-selection is the ONLY implicit encoding decision.
// Shift_JIS / EUC-JP / ISO-2022-JP are never guessed — a BOM-less file always
// defaults to UTF-8 regardless of what its bytes actually are.
// ---------------------------------------------------------------------------

describe("text import BOM handling is declaration-only (#420 Step 8)", () => {
  it("maps every BOM kind to its declared default encoding", () => {
    expect(defaultTextImportEncodingForBom("none")).toBe("utf8");
    expect(defaultTextImportEncodingForBom("utf8")).toBe("utf8Bom");
    expect(defaultTextImportEncodingForBom("utf16le")).toBe("utf16le");
    expect(defaultTextImportEncodingForBom("utf16be")).toBe("utf16be");
  });

  it("never infers Shift_JIS from BOM-less CP932 bytes", () => {
    // 「日本語①」in CP932 — perfectly valid Shift_JIS, no BOM.
    const cp932 = Uint8Array.from([
      0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
    ]);
    expect(detectTextImportBom(cp932)).toBe("none");
    expect(defaultTextImportEncodingForBom(detectTextImportBom(cp932))).toBe(
      "utf8"
    );
  });

  it("never infers EUC-JP from BOM-less EUC-JP bytes", () => {
    const eucJp = Uint8Array.from([0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]);
    expect(detectTextImportBom(eucJp)).toBe("none");
    expect(defaultTextImportEncodingForBom(detectTextImportBom(eucJp))).toBe(
      "utf8"
    );
  });

  it("never infers ISO-2022-JP from its escape-sequence bytes", () => {
    const iso = Uint8Array.from([
      0x1b, 0x24, 0x42, 0x46, 0x7c, 0x4b, 0x5c, 0x38, 0x6c, 0x1b, 0x28, 0x42
    ]);
    expect(detectTextImportBom(iso)).toBe("none");
    expect(defaultTextImportEncodingForBom(detectTextImportBom(iso))).toBe(
      "utf8"
    );
  });

  it("requires the full 3-byte UTF-8 BOM before selecting utf8Bom", () => {
    expect(detectTextImportBom(Uint8Array.from([0xef, 0xbb]))).toBe("none");
    expect(
      detectTextImportBom(Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))
    ).toBe("utf8");
  });
});
