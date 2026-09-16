/**
 * #496 (ADR-0015): a minimal OpenType/TrueType `name` table parser.
 *
 * Reads only what is needed to resolve a localized display name: the sfnt
 * table directory, the `name` table's records, and Microsoft-platform
 * (platformID 3) UTF-16BE string decoding. Never throws — any malformed,
 * truncated, or unsupported input yields an empty result, and callers fall
 * back to `FontData.family`.
 */

export interface FontNameRecord {
  platformID: number;
  encodingID: number;
  languageID: number;
  nameID: number;
  value: string;
}

/** Only Microsoft platform (Windows) records are decoded. Macintosh
 * platform records are explicitly out of scope for this issue — the app's
 * target platform is Windows, and the ja/en language IDs this feature
 * needs are Microsoft-platform IDs (0x0411 / 0x0409) anyway; unsupported
 * platform records are just skipped, never guessed at. */
const MICROSOFT_PLATFORM_ID = 3;

const SFNT_VERSION_TRUETYPE = 0x00010000;
const SFNT_TAG_OTTO = 0x4f54544f; // 'OTTO' (CFF-flavored OpenType)
const SFNT_TAG_TRUE = 0x74727565; // 'true' (older Mac TrueType)
const SFNT_TAG_TTCF = 0x74746366; // 'ttcf' (TrueType/OpenType Collection)

const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;
const NAME_TABLE_HEADER_SIZE = 6;
const NAME_RECORD_SIZE = 12;

function readTag(view: DataView, offset: number): string {
  return (
    String.fromCharCode(view.getUint8(offset)) +
    String.fromCharCode(view.getUint8(offset + 1)) +
    String.fromCharCode(view.getUint8(offset + 2)) +
    String.fromCharCode(view.getUint8(offset + 3))
  );
}

function decodeUtf16Be(view: DataView, offset: number, length: number): string {
  const codeUnits: number[] = [];
  for (let i = 0; i + 1 < length; i += 2) {
    codeUnits.push(view.getUint16(offset + i, false));
  }
  return String.fromCharCode(...codeUnits).trim();
}

/**
 * Locates the sfnt offset table to actually parse. Handles the trivial TTC
 * case (a collection header pointing at one or more sfnt tables) by using
 * the collection's first font — full multi-face collection support is
 * explicitly out of scope for this issue.
 */
function resolveSfntOffset(view: DataView): number | null {
  if (view.byteLength < SFNT_HEADER_SIZE) {
    return null;
  }
  const tag0 = view.getUint32(0, false);
  if (tag0 === SFNT_TAG_TTCF) {
    if (view.byteLength < 16) {
      return null;
    }
    const numFonts = view.getUint32(8, false);
    if (numFonts < 1) {
      return null;
    }
    const firstOffset = view.getUint32(12, false);
    if (firstOffset < 0 || firstOffset + SFNT_HEADER_SIZE > view.byteLength) {
      return null;
    }
    return firstOffset;
  }
  return 0;
}

function isRecognizedSfntVersion(version: number): boolean {
  return (
    version === SFNT_VERSION_TRUETYPE ||
    version === SFNT_TAG_OTTO ||
    version === SFNT_TAG_TRUE
  );
}

function findNameTable(
  view: DataView,
  sfntOffset: number
): { offset: number; length: number } | null {
  const sfntVersion = view.getUint32(sfntOffset, false);
  if (!isRecognizedSfntVersion(sfntVersion)) {
    return null;
  }
  const numTables = view.getUint16(sfntOffset + 4, false);
  const tableRecordsStart = sfntOffset + SFNT_HEADER_SIZE;

  for (let i = 0; i < numTables; i++) {
    const recordOffset = tableRecordsStart + i * TABLE_RECORD_SIZE;
    if (recordOffset + TABLE_RECORD_SIZE > view.byteLength) {
      break;
    }
    if (readTag(view, recordOffset) === "name") {
      const offset = view.getUint32(recordOffset + 8, false);
      const length = view.getUint32(recordOffset + 12, false);
      if (offset < 0 || offset + NAME_TABLE_HEADER_SIZE > view.byteLength) {
        return null;
      }
      return { offset, length };
    }
  }
  return null;
}

/**
 * Parses the `name` table out of a font binary (sfnt/TrueType/OpenType, or
 * the first font of a trivially-handled TTC/OTC collection) and returns its
 * Microsoft-platform name records. Returns `[]` for anything malformed,
 * truncated, an unsupported format, or a parse-time exception — this
 * function is safe to call on arbitrary/untrusted bytes.
 */
export function parseFontNameRecords(buffer: ArrayBuffer): FontNameRecord[] {
  try {
    const view = new DataView(buffer);
    const sfntOffset = resolveSfntOffset(view);
    if (sfntOffset === null) {
      return [];
    }

    const nameTable = findNameTable(view, sfntOffset);
    if (!nameTable) {
      return [];
    }

    const { offset: nameTableOffset } = nameTable;
    const format = view.getUint16(nameTableOffset, false);
    if (format !== 0 && format !== 1) {
      return [];
    }
    const count = view.getUint16(nameTableOffset + 2, false);
    const stringOffset = view.getUint16(nameTableOffset + 4, false);
    const storageStart = nameTableOffset + stringOffset;
    const recordsStart = nameTableOffset + NAME_TABLE_HEADER_SIZE;

    const records: FontNameRecord[] = [];
    for (let i = 0; i < count; i++) {
      const recordOffset = recordsStart + i * NAME_RECORD_SIZE;
      if (recordOffset + NAME_RECORD_SIZE > view.byteLength) {
        break;
      }
      const platformID = view.getUint16(recordOffset, false);
      const encodingID = view.getUint16(recordOffset + 2, false);
      const languageID = view.getUint16(recordOffset + 4, false);
      const nameID = view.getUint16(recordOffset + 6, false);
      const length = view.getUint16(recordOffset + 8, false);
      const strOffset = view.getUint16(recordOffset + 10, false);

      if (platformID !== MICROSOFT_PLATFORM_ID) {
        continue;
      }

      const absoluteOffset = storageStart + strOffset;
      if (
        length <= 0 ||
        length % 2 !== 0 ||
        absoluteOffset < 0 ||
        absoluteOffset + length > view.byteLength
      ) {
        continue;
      }

      const value = decodeUtf16Be(view, absoluteOffset, length);
      if (!value) {
        continue;
      }

      records.push({ platformID, encodingID, languageID, nameID, value });
    }

    return records;
  } catch {
    return [];
  }
}
