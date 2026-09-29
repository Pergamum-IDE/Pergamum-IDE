import { describe, expect, it } from "vitest";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  JAPANESE_LINT_MAX_SOURCE_LENGTH,
  isJapaneseLintSourceTooLarge,
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
        text: "a".repeat(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1),
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

describe("Japanese lint size limits (#625)", () => {
  it("skips documents longer than the source limit (boundary is inclusive)", () => {
    expect(isJapaneseLintSourceTooLarge(0)).toBe(false);
    expect(isJapaneseLintSourceTooLarge(JAPANESE_LINT_MAX_SOURCE_LENGTH)).toBe(
      false
    );
    expect(
      isJapaneseLintSourceTooLarge(JAPANESE_LINT_MAX_SOURCE_LENGTH + 1)
    ).toBe(true);
  });

  it("keeps the limits at values measured to be safe for the Main Process", () => {
    // ~1s of textlint at 50k chars; 200k chars measured ~9s (frozen window).
    expect(JAPANESE_LINT_MAX_SOURCE_LENGTH).toBeLessThanOrEqual(100_000);
    expect(JAPANESE_LINT_MAX_RESULT_COUNT).toBeLessThanOrEqual(1_000);
  });
});
