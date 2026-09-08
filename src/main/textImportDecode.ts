import { TextDecoder } from "node:util";
import {
  TEXT_IMPORT_PREVIEW_CHARACTER_COUNT,
  type TextImportBomKind,
  type TextImportEncoding
} from "../shared/textImport";

const TEXT_DECODER_LABEL_BY_IMPORT_ENCODING: Record<
  TextImportEncoding,
  string
> = {
  utf8: "utf-8",
  utf8Bom: "utf-8",
  shiftJis: "shift_jis",
  eucJp: "euc-jp",
  utf16le: "utf-16le",
  utf16be: "utf-16be",
  iso2022Jp: "iso-2022-jp"
};

export class TextImportDecodeError extends Error {
  readonly code = "PERGAMUM_TEXT_IMPORT_DECODE_FAILED";

  constructor() {
    super("The file could not be decoded with the selected encoding.");
  }
}

export function detectTextImportBom(bytes: Uint8Array): TextImportBomKind {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    return "utf8";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf16le";
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf16be";
  }

  return "none";
}

export function defaultTextImportEncodingForBom(
  bom: TextImportBomKind
): TextImportEncoding {
  switch (bom) {
    case "utf8":
      return "utf8Bom";
    case "utf16le":
      return "utf16le";
    case "utf16be":
      return "utf16be";
    case "none":
      return "utf8";
  }
}

export function decodeTextImportBytes(
  bytes: Uint8Array,
  encoding: TextImportEncoding
): string {
  const label = TEXT_DECODER_LABEL_BY_IMPORT_ENCODING[encoding];

  try {
    const decoded = new TextDecoder(label, { fatal: true }).decode(bytes);

    return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
  } catch {
    throw new TextImportDecodeError();
  }
}

export function previewDecodedText(text: string): {
  readonly head: string;
  readonly tail: string;
} {
  const characters = Array.from(text);
  const head = characters
    .slice(0, TEXT_IMPORT_PREVIEW_CHARACTER_COUNT)
    .join("");
  const tail = characters
    .slice(-TEXT_IMPORT_PREVIEW_CHARACTER_COUNT)
    .join("");

  return { head, tail };
}
