import { describe, expect, it } from "vitest";
import {
  documentCharCount,
  documentLineCount,
  documentMaxLineLength
} from "../../src/shared/documentMetrics";

describe("document aggregate metrics (#161)", () => {
  it("returns 0 for all three metrics on empty content", () => {
    expect(documentCharCount("")).toBe(0);
    expect(documentLineCount("")).toBe(0);
    expect(documentMaxLineLength("")).toBe(0);
  });

  it("documentCharCount is the JS string UTF-16 code unit length", () => {
    expect(documentCharCount("abc")).toBe(3);
    expect(documentCharCount("吾輩は猫である")).toBe(7);
    expect(documentCharCount("𠮷野家")).toBe(4);
  });

  it("documentLineCount counts logical lines split on LF", () => {
    expect(documentLineCount("one line")).toBe(1);
    expect(documentLineCount("line one\nline two\nline three")).toBe(3);
    expect(documentLineCount("trailing newline\n")).toBe(2);
  });

  it("documentLineCount treats CRLF as a single line ending, not two lines", () => {
    expect(documentLineCount("a\r\nb\r\nc")).toBe(3);
  });

  it("documentMaxLineLength is the longest logical line's length", () => {
    expect(documentMaxLineLength("short\na much longer line here\nmid")).toBe(
      "a much longer line here".length
    );
  });

  it("documentMaxLineLength is 0 when every line is empty", () => {
    expect(documentMaxLineLength("\n\n\n")).toBe(0);
  });
});
