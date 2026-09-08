import { describe, expect, it } from "vitest";
import {
  TEXT_IMPORT_ENCODINGS,
  isTextImportEncoding,
  isTextImportLineEnding,
  isTextImportSkipReason
} from "../../src/shared/textImport";

describe("text import shared types (#420 Step 1)", () => {
  it("exposes the supported import encoding values", () => {
    expect(TEXT_IMPORT_ENCODINGS).toEqual([
      "utf8",
      "utf8Bom",
      "shiftJis",
      "eucJp",
      "utf16le",
      "utf16be",
      "iso2022Jp"
    ]);
  });

  it("validates IPC allowlisted values", () => {
    expect(isTextImportEncoding("shiftJis")).toBe(true);
    expect(isTextImportEncoding("utf16be")).toBe(true);
    expect(isTextImportEncoding("chardet")).toBe(false);
    expect(isTextImportLineEnding("lf")).toBe(true);
    expect(isTextImportLineEnding("crlf")).toBe(true);
    expect(isTextImportLineEnding("cr")).toBe(false);
    expect(isTextImportSkipReason("targetExists")).toBe(true);
    expect(isTextImportSkipReason("writeFailed")).toBe(false);
  });
});
