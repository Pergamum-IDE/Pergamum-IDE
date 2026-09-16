import { describe, expect, it } from "vitest";
import { resolveLocalizedDisplayName } from "../../src/renderer/fontLocalizedDisplayName";
import type { RawFontData } from "../../src/shared/fontCache";

function encodeUtf16Be(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length * 2);
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xff;
    bytes[i * 2 + 1] = code & 0xff;
  }
  return bytes;
}

function writeTag(view: DataView, offset: number, tag: string): void {
  for (let i = 0; i < 4; i++) {
    view.setUint8(offset + i, tag.charCodeAt(i));
  }
}

/** Builds a minimal single-font sfnt binary with one Microsoft-platform
 * Typographic Family (nameID 16) record for the given language/value. */
function buildFontBinary(languageID: number, value: string): ArrayBuffer {
  const encoded = encodeUtf16Be(value);
  const nameHeaderSize = 6;
  const nameRecordSize = 12;
  const stringOffset = nameHeaderSize + nameRecordSize;
  const nameTableSize = stringOffset + encoded.length;

  const sfntHeaderSize = 12;
  const tableRecordSize = 16;
  const nameTableStart = sfntHeaderSize + tableRecordSize;
  const totalSize = nameTableStart + nameTableSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x00010000, false);
  view.setUint16(4, 1, false);
  writeTag(view, sfntHeaderSize, "name");
  view.setUint32(sfntHeaderSize + 8, nameTableStart, false);
  view.setUint32(sfntHeaderSize + 12, nameTableSize, false);

  view.setUint16(nameTableStart, 0, false); // format
  view.setUint16(nameTableStart + 2, 1, false); // count
  view.setUint16(nameTableStart + 4, stringOffset, false);
  view.setUint16(nameTableStart + 6, 3, false); // platformID: Microsoft
  view.setUint16(nameTableStart + 8, 1, false); // encodingID
  view.setUint16(nameTableStart + 10, languageID, false);
  view.setUint16(nameTableStart + 12, 16, false); // nameID: Typographic Family
  view.setUint16(nameTableStart + 14, encoded.length, false);
  view.setUint16(nameTableStart + 16, 0, false); // string offset within storage

  new Uint8Array(buffer).set(encoded, nameTableStart + stringOffset);
  return buffer;
}

function fakeBlob(buffer: ArrayBuffer): { arrayBuffer: () => Promise<ArrayBuffer> } {
  return { arrayBuffer: async () => buffer };
}

describe("resolveLocalizedDisplayName (#496)", () => {
  it("resolves the localized name from a real name-table binary", async () => {
    const rawFont: RawFontData = {
      family: "Yu Gothic",
      blob: async () => fakeBlob(buildFontBinary(0x0411, "游ゴシック")) as any
    };
    const result = await resolveLocalizedDisplayName(rawFont, "ja");
    expect(result).toBe("游ゴシック");
  });

  it("falls back to family when blob() is missing", async () => {
    const rawFont: RawFontData = { family: "SomeFont" };
    const result = await resolveLocalizedDisplayName(rawFont, "ja");
    expect(result).toBe("SomeFont");
  });

  it("falls back to family when blob() rejects", async () => {
    const rawFont: RawFontData = {
      family: "SomeFont",
      blob: async () => {
        throw new Error("blob failed");
      }
    };
    const result = await resolveLocalizedDisplayName(rawFont, "ja");
    expect(result).toBe("SomeFont");
  });

  it("falls back to family when the blob cannot be read as an ArrayBuffer", async () => {
    const rawFont: RawFontData = {
      family: "SomeFont",
      blob: async () => ({
        arrayBuffer: async () => {
          throw new Error("cannot read bytes");
        }
      })
    };
    const result = await resolveLocalizedDisplayName(rawFont, "ja");
    expect(result).toBe("SomeFont");
  });

  it("falls back to family when the binary is not a valid font", async () => {
    const rawFont: RawFontData = {
      family: "SomeFont",
      blob: async () => fakeBlob(new ArrayBuffer(4)) as any
    };
    const result = await resolveLocalizedDisplayName(rawFont, "ja");
    expect(result).toBe("SomeFont");
  });

  it("resolves English when uiLanguage is en, ignoring a Japanese-only record", async () => {
    const rawFont: RawFontData = {
      family: "Yu Gothic",
      blob: async () => fakeBlob(buildFontBinary(0x0411, "游ゴシック")) as any
    };
    const result = await resolveLocalizedDisplayName(rawFont, "en");
    expect(result).toBe("Yu Gothic"); // falls back to family
  });
});
