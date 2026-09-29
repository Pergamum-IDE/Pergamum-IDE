import { describe, expect, it } from "vitest";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  decideJapaneseLintToggle,
  japaneseLintSourceForPath,
  parseJapaneseLintRequest
} from "../../src/shared/japaneseLint";
import { isMarkdownPath } from "../../src/shared/projectDocumentKind";

describe("parseJapaneseLintRequest (#625)", () => {
  it("accepts valid format / extension pairs", () => {
    for (const [format, ext] of [
      ["markdown", ".md"],
      ["markdown", ".markdown"],
      ["text", ".txt"]
    ] as const) {
      expect(parseJapaneseLintRequest({ text: "あ", format, ext })).toEqual({
        text: "あ",
        format,
        ext
      });
    }
  });

  it("rejects mismatched pairs, unknown values, and non-objects", () => {
    for (const bad of [
      { text: "x", format: "text", ext: ".md" },
      { text: "x", format: "markdown", ext: ".txt" },
      { text: "x", format: "html", ext: ".md" },
      { text: "x", format: "markdown", ext: ".MD" },
      { text: 1, format: "markdown", ext: ".md" },
      { format: "markdown", ext: ".md" },
      null,
      undefined,
      "text",
      42
    ]) {
      expect(parseJapaneseLintRequest(bad)).toBeNull();
    }
  });

  it("drops unknown extra fields and leaves the size check to the handler", () => {
    expect(
      parseJapaneseLintRequest({
        text: "a".repeat(500_000),
        format: "text",
        ext: ".txt"
      })
    ).not.toBeNull();
    expect(
      parseJapaneseLintRequest({
        text: "x",
        format: "text",
        ext: ".txt",
        projectRoot: "C:\secret"
      })
    ).toEqual({ text: "x", format: "text", ext: ".txt" });
  });
});

describe("japaneseLintSourceForPath (#625)", () => {
  it("maps .md / .markdown / .txt to their own format and extension", () => {
    expect(japaneseLintSourceForPath("a/b/ch1.md", isMarkdownPath)).toEqual({
      format: "markdown",
      ext: ".md"
    });
    expect(japaneseLintSourceForPath("ch1.markdown", isMarkdownPath)).toEqual({
      format: "markdown",
      ext: ".markdown"
    });
    expect(japaneseLintSourceForPath("memo.txt", isMarkdownPath)).toEqual({
      format: "text",
      ext: ".txt"
    });
  });

  it("is case-insensitive", () => {
    expect(japaneseLintSourceForPath("A.MD", isMarkdownPath)?.ext).toBe(".md");
    expect(japaneseLintSourceForPath("A.Markdown", isMarkdownPath)?.ext).toBe(
      ".markdown"
    );
    expect(japaneseLintSourceForPath("A.TXT", isMarkdownPath)?.format).toBe(
      "text"
    );
  });

  it("returns null for unsupported types and a missing path", () => {
    expect(japaneseLintSourceForPath("image.png", isMarkdownPath)).toBeNull();
    expect(japaneseLintSourceForPath("notes.docx", isMarkdownPath)).toBeNull();
    expect(japaneseLintSourceForPath(null, isMarkdownPath)).toBeNull();
  });
});

describe("Japanese lint result cap (#625)", () => {
  it("keeps the result cap; there is no source length limit any more", () => {
    expect(JAPANESE_LINT_MAX_RESULT_COUNT).toBe(1_000);
  });

  it("the toolbar toggle turns ON for any document and OFF when active", () => {
    expect(
      decideJapaneseLintToggle({ canUse: true, isActive: false })
    ).toBe("turn-on");
    expect(decideJapaneseLintToggle({ canUse: true, isActive: true })).toBe(
      "turn-off"
    );
    expect(
      decideJapaneseLintToggle({ canUse: false, isActive: false })
    ).toBe("ignore");
  });
});
