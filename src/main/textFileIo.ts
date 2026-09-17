import Encoding from "encoding-japanese";
import iconv from "iconv-lite";
import { TextDecoder } from "node:util";
import {
  isTextFileEncoding,
  type TextFileEncoding
} from "../shared/textFileEncoding";

export type TextFileEncodingErrorReason =
  | "unencodableCharacters"
  | "invalidEncoding"
  | "unsupportedEncoding";

export class PergamumTextFileEncodingError extends Error {
  readonly code = "PERGAMUM_TEXT_FILE_ENCODING_FAILED";
  readonly encoding: TextFileEncoding;
  readonly reason: TextFileEncodingErrorReason;
  readonly firstDiffIndex?: number;
  readonly firstDiffCodePoint?: number;

  constructor(
    encoding: TextFileEncoding,
    reason: TextFileEncodingErrorReason,
    options?: {
      message?: string;
      firstDiffIndex?: number;
      firstDiffCodePoint?: number;
    }
  ) {
    const defaultMsg =
      reason === "unencodableCharacters"
        ? `Content contains characters that cannot be encoded in ${encoding}.`
        : reason === "invalidEncoding"
          ? `Bytes cannot be decoded using ${encoding}.`
          : `Encoding ${encoding} is not supported.`;

    super(options?.message ?? defaultMsg);
    this.name = "PergamumTextFileEncodingError";
    this.encoding = encoding;
    this.reason = reason;
    this.firstDiffIndex = options?.firstDiffIndex;
    this.firstDiffCodePoint = options?.firstDiffCodePoint;
  }
}

export interface DecodeTextFileBytesResult {
  content: string;
  hadBom: boolean;
}

export interface EncodeTextFileContentResult {
  bytes: Uint8Array;
  wroteBom: boolean;
}

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  );
}

function hasUtf16LeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

function hasUtf16BeBom(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

function stripLeadingBomChar(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function findFirstDiff(
  original: string,
  reDecoded: string
): { index: number; codePoint?: number } {
  const minLen = Math.min(original.length, reDecoded.length);
  for (let i = 0; i < minLen; i++) {
    if (original[i] !== reDecoded[i]) {
      return { index: i, codePoint: original.codePointAt(i) };
    }
  }
  return { index: minLen, codePoint: original.codePointAt(minLen) };
}

export function decodeTextFileBytes(
  bytes: Uint8Array,
  encoding: TextFileEncoding
): DecodeTextFileBytesResult {
  if (!isTextFileEncoding(encoding)) {
    throw new PergamumTextFileEncodingError(
      encoding as TextFileEncoding,
      "unsupportedEncoding"
    );
  }

  try {
    switch (encoding) {
      case "utf8":
      case "utf8Bom": {
        const hadBom = hasUtf8Bom(bytes);
        const text = new TextDecoder("utf-8", {
          fatal: true,
          ignoreBOM: true
        }).decode(bytes);
        const content = hadBom ? stripLeadingBomChar(text) : text;
        return { content, hadBom };
      }
      case "utf16le":
      case "utf16leBom": {
        const hadBom = hasUtf16LeBom(bytes);
        const text = iconv.decode(Buffer.from(bytes), "utf16le");
        const content = stripLeadingBomChar(text);
        return { content, hadBom };
      }
      case "utf16be":
      case "utf16beBom": {
        const hadBom = hasUtf16BeBom(bytes);
        const text = iconv.decode(Buffer.from(bytes), "utf16be");
        const content = stripLeadingBomChar(text);
        return { content, hadBom };
      }
      case "shiftJis": {
        const text = iconv.decode(Buffer.from(bytes), "cp932");
        return { content: text, hadBom: false };
      }
      case "eucJp": {
        const text = iconv.decode(Buffer.from(bytes), "euc-jp");
        return { content: text, hadBom: false };
      }
      case "iso2022Jp": {
        const text = Encoding.convert(bytes, {
          to: "UNICODE",
          from: "JIS",
          type: "string"
        });
        return { content: text, hadBom: false };
      }
      default: {
        const _exhaustiveCheck: never = encoding;
        throw new PergamumTextFileEncodingError(
          _exhaustiveCheck,
          "unsupportedEncoding"
        );
      }
    }
  } catch (error) {
    if (error instanceof PergamumTextFileEncodingError) {
      throw error;
    }
    throw new PergamumTextFileEncodingError(encoding, "invalidEncoding");
  }
}

export function encodeTextFileContent(
  content: string,
  encoding: TextFileEncoding
): EncodeTextFileContentResult {
  if (!isTextFileEncoding(encoding)) {
    throw new PergamumTextFileEncodingError(
      encoding as TextFileEncoding,
      "unsupportedEncoding"
    );
  }

  switch (encoding) {
    case "utf8": {
      const rawBytes = Buffer.from(content, "utf8");
      return { bytes: rawBytes, wroteBom: false };
    }
    case "utf8Bom": {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const rawBytes = Buffer.from(content, "utf8");
      return { bytes: Buffer.concat([bom, rawBytes]), wroteBom: true };
    }
    case "utf16le": {
      const rawBytes = iconv.encode(content, "utf16le");
      return { bytes: rawBytes, wroteBom: false };
    }
    case "utf16leBom": {
      const bom = Buffer.from([0xff, 0xfe]);
      const rawBytes = iconv.encode(content, "utf16le");
      return { bytes: Buffer.concat([bom, rawBytes]), wroteBom: true };
    }
    case "utf16be": {
      const rawBytes = iconv.encode(content, "utf16be");
      return { bytes: rawBytes, wroteBom: false };
    }
    case "utf16beBom": {
      const bom = Buffer.from([0xfe, 0xff]);
      const rawBytes = iconv.encode(content, "utf16be");
      return { bytes: Buffer.concat([bom, rawBytes]), wroteBom: true };
    }
    case "shiftJis": {
      const rawBytes = iconv.encode(content, "cp932");
      const reDecoded = iconv.decode(rawBytes, "cp932");
      if (reDecoded !== content) {
        const diff = findFirstDiff(content, reDecoded);
        throw new PergamumTextFileEncodingError(
          encoding,
          "unencodableCharacters",
          {
            firstDiffIndex: diff.index,
            firstDiffCodePoint: diff.codePoint
          }
        );
      }
      return { bytes: rawBytes, wroteBom: false };
    }
    case "eucJp": {
      const rawBytes = iconv.encode(content, "euc-jp");
      const reDecoded = iconv.decode(rawBytes, "euc-jp");
      if (reDecoded !== content) {
        const diff = findFirstDiff(content, reDecoded);
        throw new PergamumTextFileEncodingError(
          encoding,
          "unencodableCharacters",
          {
            firstDiffIndex: diff.index,
            firstDiffCodePoint: diff.codePoint
          }
        );
      }
      return { bytes: rawBytes, wroteBom: false };
    }
    case "iso2022Jp": {
      const codeArray = Encoding.stringToCode(content);
      const rawBytes = new Uint8Array(
        Encoding.convert(codeArray, { to: "JIS", from: "UNICODE" })
      );
      const reDecoded = Encoding.convert(rawBytes, {
        to: "UNICODE",
        from: "JIS",
        type: "string"
      });
      if (reDecoded !== content) {
        const diff = findFirstDiff(content, reDecoded);
        throw new PergamumTextFileEncodingError(
          encoding,
          "unencodableCharacters",
          {
            firstDiffIndex: diff.index,
            firstDiffCodePoint: diff.codePoint
          }
        );
      }
      return { bytes: rawBytes, wroteBom: false };
    }
    default: {
      const _exhaustiveCheck: never = encoding;
      throw new PergamumTextFileEncodingError(
        _exhaustiveCheck,
        "unsupportedEncoding"
      );
    }
  }
}
