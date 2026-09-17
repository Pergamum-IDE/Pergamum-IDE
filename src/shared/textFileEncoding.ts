export const TEXT_FILE_ENCODINGS = [
  "utf8",
  "utf8Bom",
  "shiftJis",
  "eucJp",
  "iso2022Jp",
  "utf16le",
  "utf16leBom",
  "utf16be",
  "utf16beBom"
] as const;

export type TextFileEncoding = (typeof TEXT_FILE_ENCODINGS)[number];

export const DEFAULT_TEXT_FILE_ENCODING: TextFileEncoding = "utf8";

export function isTextFileEncoding(value: unknown): value is TextFileEncoding {
  return (
    typeof value === "string" &&
    (TEXT_FILE_ENCODINGS as readonly string[]).includes(value)
  );
}

export interface TextFileEncodingLabelOption {
  readonly encoding: TextFileEncoding;
  readonly labelJa: string;
  readonly labelEn: string;
}

export const TEXT_FILE_ENCODING_LABEL_OPTIONS: readonly TextFileEncodingLabelOption[] =
  [
    { encoding: "utf8", labelJa: "UTF-8", labelEn: "UTF-8" },
    {
      encoding: "utf8Bom",
      labelJa: "UTF-8（BOMあり）",
      labelEn: "UTF-8 with BOM"
    },
    {
      encoding: "shiftJis",
      labelJa: "Shift_JIS（CP932）",
      labelEn: "Shift_JIS (CP932)"
    },
    { encoding: "eucJp", labelJa: "EUC-JP", labelEn: "EUC-JP" },
    { encoding: "iso2022Jp", labelJa: "ISO-2022-JP", labelEn: "ISO-2022-JP" },
    {
      encoding: "utf16le",
      labelJa: "UTF-16LE（BOMなし）",
      labelEn: "UTF-16LE without BOM"
    },
    {
      encoding: "utf16leBom",
      labelJa: "UTF-16LE（BOMあり）",
      labelEn: "UTF-16LE with BOM"
    },
    {
      encoding: "utf16be",
      labelJa: "UTF-16BE（BOMなし）",
      labelEn: "UTF-16BE without BOM"
    },
    {
      encoding: "utf16beBom",
      labelJa: "UTF-16BE（BOMあり）",
      labelEn: "UTF-16BE with BOM"
    }
  ];
