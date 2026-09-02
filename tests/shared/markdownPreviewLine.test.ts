import { describe, expect, it } from "vitest";
import { firstNonEmptyMarkdownPreviewLine } from "../../src/shared/markdownPreviewLine";

describe("firstNonEmptyMarkdownPreviewLine (#372)", () => {
  it("skips leading blank lines and returns the first non-empty line", () => {
    expect(
      firstNonEmptyMarkdownPreviewLine("\n\n# Title\nBody")
    ).toBe("# Title");
  });

  it("returns a heading line as-is (headings are not skipped)", () => {
    expect(
      firstNonEmptyMarkdownPreviewLine("# 第一章\n\n本文が始まる。\n")
    ).toBe("# 第一章");
  });

  it("trims surrounding whitespace from the returned line", () => {
    expect(
      firstNonEmptyMarkdownPreviewLine("   \n\t  hello world  \t\n")
    ).toBe("hello world");
  });

  it("handles \\n, \\r\\n, and \\r line breaks", () => {
    expect(firstNonEmptyMarkdownPreviewLine("\n\nlf body\n")).toBe("lf body");
    expect(
      firstNonEmptyMarkdownPreviewLine("\r\n\r\ncrlf body\r\n")
    ).toBe("crlf body");
    expect(firstNonEmptyMarkdownPreviewLine("\r\r cr body \r")).toBe(
      "cr body"
    );
  });

  it("returns null for a whitespace-only document", () => {
    expect(firstNonEmptyMarkdownPreviewLine("\n  \n")).toBeNull();
    expect(firstNonEmptyMarkdownPreviewLine("")).toBeNull();
    expect(firstNonEmptyMarkdownPreviewLine("   \r\n\t\r\n \r\n")).toBeNull();
  });

  it("returns the only line of a single-line document with no trailing break", () => {
    expect(firstNonEmptyMarkdownPreviewLine("just one line")).toBe(
      "just one line"
    );
  });
});
