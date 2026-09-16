import { describe, expect, it } from "vitest";
import { parseFontNameRecords } from "../../src/renderer/fontNameTableParser";

// #496: small synthetic sfnt/OpenType binary fixtures — real font files are
// unnecessary (and would bloat the repo) for exercising the `name` table
// parser's byte-level logic.

interface RawNameRecordInput {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  value: string;
}

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

/** Builds a `name` table (format 0) from raw records, returned as bytes. */
function buildNameTable(records: RawNameRecordInput[]): Uint8Array {
  const encodedValues = records.map((r) => encodeUtf16Be(r.value));
  const headerSize = 6;
  const recordSize = 12;
  const stringOffset = headerSize + records.length * recordSize;
  const totalStorage = encodedValues.reduce((sum, v) => sum + v.length, 0);
  const buffer = new ArrayBuffer(stringOffset + totalStorage);
  const view = new DataView(buffer);

  view.setUint16(0, 0, false); // format 0
  view.setUint16(2, records.length, false); // count
  view.setUint16(4, stringOffset, false); // stringOffset

  let storagePos = 0;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const recOffset = headerSize + i * recordSize;
    view.setUint16(recOffset, r.platformID, false);
    view.setUint16(recOffset + 2, r.encodingID, false);
    view.setUint16(recOffset + 4, r.languageID, false);
    view.setUint16(recOffset + 6, r.nameID, false);
    view.setUint16(recOffset + 8, encodedValues[i].length, false);
    view.setUint16(recOffset + 10, storagePos, false);
    bytes.set(encodedValues[i], stringOffset + storagePos);
    storagePos += encodedValues[i].length;
  }

  return bytes;
}

/** Wraps a `name` table in a minimal single-font sfnt (TrueType) container
 * with exactly one table record pointing at it. */
function buildSfntWithNameTable(nameTableBytes: Uint8Array): ArrayBuffer {
  const sfntHeaderSize = 12;
  const tableRecordSize = 16;
  const nameTableStart = sfntHeaderSize + tableRecordSize;
  const totalSize = nameTableStart + nameTableBytes.length;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x00010000, false); // sfntVersion: TrueType
  view.setUint16(4, 1, false); // numTables
  view.setUint16(6, 0, false);
  view.setUint16(8, 0, false);
  view.setUint16(10, 0, false);

  writeTag(view, sfntHeaderSize, "name");
  view.setUint32(sfntHeaderSize + 4, 0, false); // checksum (unused)
  view.setUint32(sfntHeaderSize + 8, nameTableStart, false); // offset
  view.setUint32(sfntHeaderSize + 12, nameTableBytes.length, false); // length

  new Uint8Array(buffer).set(nameTableBytes, nameTableStart);
  return buffer;
}

function buildFontWithRecords(records: RawNameRecordInput[]): ArrayBuffer {
  return buildSfntWithNameTable(buildNameTable(records));
}

function buildTtcWithFonts(fonts: RawNameRecordInput[][]): ArrayBuffer {
  const nameTables = fonts.map((records) => buildNameTable(records));
  const ttcHeaderSize = 12 + fonts.length * 4;
  const sfntHeaderSize = 12;
  const tableRecordSize = 16;
  const sfntSizes = nameTables.map(
    (nameTable) => sfntHeaderSize + tableRecordSize + nameTable.length
  );
  const totalSize =
    ttcHeaderSize + sfntSizes.reduce((sum, size) => sum + size, 0);

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  writeTag(view, 0, "ttcf");
  view.setUint16(4, 2, false); // majorVersion
  view.setUint16(6, 0, false); // minorVersion
  view.setUint32(8, fonts.length, false); // numFonts

  let fontOffset = ttcHeaderSize;
  for (let i = 0; i < fonts.length; i++) {
    view.setUint32(12 + i * 4, fontOffset, false);
    const nameTable = nameTables[i];
    const nameTableStart = fontOffset + sfntHeaderSize + tableRecordSize;

    view.setUint32(fontOffset, 0x00010000, false); // sfntVersion: TrueType
    view.setUint16(fontOffset + 4, 1, false); // numTables
    view.setUint16(fontOffset + 6, 0, false);
    view.setUint16(fontOffset + 8, 0, false);
    view.setUint16(fontOffset + 10, 0, false);
    writeTag(view, fontOffset + sfntHeaderSize, "name");
    view.setUint32(fontOffset + sfntHeaderSize + 4, 0, false);
    view.setUint32(fontOffset + sfntHeaderSize + 8, nameTableStart, false);
    view.setUint32(
      fontOffset + sfntHeaderSize + 12,
      nameTable.length,
      false
    );
    bytes.set(nameTable, nameTableStart);
    fontOffset += sfntSizes[i];
  }

  return buffer;
}

const MS_PLATFORM = 3;
const MS_UNICODE_BMP_ENCODING = 1;
const JAPANESE = 0x0411;
const US_ENGLISH = 0x0409;
const NAME_ID_TYPOGRAPHIC_FAMILY = 16;
const NAME_ID_FONT_FAMILY = 1;
const NAME_ID_POSTSCRIPT_NAME = 6;

describe("fontNameTableParser (#496)", () => {
  it("parses a Microsoft platform UTF-16BE Japanese nameID 16 record", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: JAPANESE,
        nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
        value: "游ゴシック"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records).toEqual([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: JAPANESE,
        nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
        value: "游ゴシック"
      }
    ]);
  });

  it("parses a Microsoft platform UTF-16BE Japanese nameID 1 record", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: JAPANESE,
        nameID: NAME_ID_FONT_FAMILY,
        value: "ＭＳ ゴシック"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records[0]).toMatchObject({ nameID: NAME_ID_FONT_FAMILY, value: "ＭＳ ゴシック" });
  });

  it("parses a Microsoft platform UTF-16BE English nameID 16 record", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: US_ENGLISH,
        nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
        value: "Cascadia Code"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records[0]).toMatchObject({
      languageID: US_ENGLISH,
      nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
      value: "Cascadia Code"
    });
  });

  it("parses a Microsoft platform UTF-16BE English nameID 1 record", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: US_ENGLISH,
        nameID: NAME_ID_FONT_FAMILY,
        value: "Consolas"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records[0]).toMatchObject({ nameID: NAME_ID_FONT_FAMILY, value: "Consolas" });
  });

  it("returns multiple records unfiltered — priority selection is the resolver's job", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: JAPANESE,
        nameID: NAME_ID_FONT_FAMILY,
        value: "游ゴシック Regular"
      },
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: JAPANESE,
        nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
        value: "游ゴシック"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records.length).toBe(2);
  });

  it("returns [] when the name table is missing entirely", () => {
    // sfnt header + a lone "head" table record, no "name" table at all.
    const sfntHeaderSize = 12;
    const tableRecordSize = 16;
    const totalSize = sfntHeaderSize + tableRecordSize + 4;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    view.setUint32(0, 0x00010000, false);
    view.setUint16(4, 1, false);
    writeTag(view, sfntHeaderSize, "head");
    view.setUint32(sfntHeaderSize + 4, 0, false);
    view.setUint32(sfntHeaderSize + 8, sfntHeaderSize + tableRecordSize, false);
    view.setUint32(sfntHeaderSize + 12, 4, false);

    expect(parseFontNameRecords(buffer)).toEqual([]);
  });

  it("returns [] when the name table is malformed (invalid format)", () => {
    const badNameTable = new Uint8Array(6);
    const view = new DataView(badNameTable.buffer);
    view.setUint16(0, 99, false); // invalid format (must be 0 or 1)
    view.setUint16(2, 0, false);
    view.setUint16(4, 6, false);

    expect(parseFontNameRecords(buildSfntWithNameTable(badNameTable))).toEqual([]);
  });

  it("skips unsupported platform/encoding records safely instead of guessing", () => {
    const buffer = buildFontWithRecords([
      {
        // Macintosh platform — explicitly unsupported (out of scope), must
        // be skipped rather than mis-decoded as UTF-16BE.
        platformID: 1,
        encodingID: 0,
        languageID: 0,
        nameID: NAME_ID_FONT_FAMILY,
        value: "Should Be Skipped"
      },
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: US_ENGLISH,
        nameID: NAME_ID_FONT_FAMILY,
        value: "Consolas"
      }
    ]);
    const records = parseFontNameRecords(buffer);
    expect(records.length).toBe(1);
    expect(records[0].value).toBe("Consolas");
  });

  it("ignores an empty decoded name (zero-length string record)", () => {
    const buffer = buildFontWithRecords([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: US_ENGLISH,
        nameID: NAME_ID_FONT_FAMILY,
        value: ""
      }
    ]);
    expect(parseFontNameRecords(buffer)).toEqual([]);
  });

  it("ignores a record whose string offset/length is out of range", () => {
    const nameTable = buildNameTable([
      {
        platformID: MS_PLATFORM,
        encodingID: MS_UNICODE_BMP_ENCODING,
        languageID: US_ENGLISH,
        nameID: NAME_ID_FONT_FAMILY,
        value: "Consolas"
      }
    ]);
    // Corrupt the one record's length field to point far past the buffer.
    const view = new DataView(nameTable.buffer);
    view.setUint16(6 + 8, 60000, false); // record's `length` field
    expect(parseFontNameRecords(buildSfntWithNameTable(nameTable))).toEqual([]);
  });

  it("does not throw on invalid/garbage input", () => {
    expect(() => parseFontNameRecords(new ArrayBuffer(0))).not.toThrow();
    expect(parseFontNameRecords(new ArrayBuffer(0))).toEqual([]);

    const garbage = new Uint8Array(64);
    for (let i = 0; i < garbage.length; i++) {
      garbage[i] = (i * 37) % 256;
    }
    expect(() => parseFontNameRecords(garbage.buffer)).not.toThrow();
    expect(parseFontNameRecords(garbage.buffer)).toEqual([]);
  });

  it("does not throw and returns [] for a too-small buffer", () => {
    expect(parseFontNameRecords(new ArrayBuffer(4))).toEqual([]);
  });

  it("selects the matching TTC/OTC face by PostScript nameID 6 instead of reading the first face", () => {
    const buffer = buildTtcWithFonts([
      [
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: US_ENGLISH,
          nameID: NAME_ID_POSTSCRIPT_NAME,
          value: "YuGothic-Regular"
        },
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: JAPANESE,
          nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
          value: "游ゴシック"
        }
      ],
      [
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: US_ENGLISH,
          nameID: NAME_ID_POSTSCRIPT_NAME,
          value: "YuGothicUI-Regular"
        },
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: US_ENGLISH,
          nameID: NAME_ID_FONT_FAMILY,
          value: "Yu Gothic UI"
        }
      ]
    ]);

    const records = parseFontNameRecords(buffer, {
      postscriptName: "YuGothicUI-Regular"
    });

    expect(records).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nameID: NAME_ID_POSTSCRIPT_NAME,
          value: "YuGothicUI-Regular"
        }),
        expect.objectContaining({
          nameID: NAME_ID_FONT_FAMILY,
          value: "Yu Gothic UI"
        })
      ])
    );
    expect(records.some((record) => record.value === "游ゴシック")).toBe(false);
  });

  it("returns [] for a TTC/OTC collection when no face matches the supplied PostScript name", () => {
    const buffer = buildTtcWithFonts([
      [
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: US_ENGLISH,
          nameID: NAME_ID_POSTSCRIPT_NAME,
          value: "YuGothic-Regular"
        },
        {
          platformID: MS_PLATFORM,
          encodingID: MS_UNICODE_BMP_ENCODING,
          languageID: JAPANESE,
          nameID: NAME_ID_TYPOGRAPHIC_FAMILY,
          value: "游ゴシック"
        }
      ]
    ]);

    expect(parseFontNameRecords(buffer, { postscriptName: "YuGothicUI-Regular" })).toEqual([]);
    expect(parseFontNameRecords(buffer)).toEqual([]);
  });

  it("returns [] for an unrecognized sfnt version (not a crash)", () => {
    const buffer = new ArrayBuffer(12);
    const view = new DataView(buffer);
    view.setUint32(0, 0xdeadbeef, false);
    expect(parseFontNameRecords(buffer)).toEqual([]);
  });
});
