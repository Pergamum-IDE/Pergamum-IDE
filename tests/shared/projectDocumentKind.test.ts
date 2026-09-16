import { describe, expect, it } from "vitest";
import {
  getProjectDocumentKind,
  isMarkdownPath,
  isProjectDocumentPath
} from "../../src/shared/projectDocumentKind";

describe("getProjectDocumentKind (#501 Slice 0)", () => {
  it("classifies .md and .markdown as markdown documents regardless of plain text setting", () => {
    expect(
      getProjectDocumentKind("chapter1.md", {
        enablePlainTextDocuments: false
      })
    ).toBe("markdown");

    expect(
      getProjectDocumentKind("chapter1.markdown", {
        enablePlainTextDocuments: false
      })
    ).toBe("markdown");

    expect(
      getProjectDocumentKind("CHAPTER1.MD", {
        enablePlainTextDocuments: false
      })
    ).toBe("markdown");

    expect(
      getProjectDocumentKind("chapter1.md", {
        enablePlainTextDocuments: true
      })
    ).toBe("markdown");
  });

  it("classifies .txt as null when enablePlainTextDocuments is false", () => {
    expect(
      getProjectDocumentKind("notes.txt", {
        enablePlainTextDocuments: false
      })
    ).toBeNull();

    expect(
      getProjectDocumentKind("NOTES.TXT", {
        enablePlainTextDocuments: false
      })
    ).toBeNull();

    expect(
      isProjectDocumentPath("notes.txt", {
        enablePlainTextDocuments: false
      })
    ).toBe(false);
  });

  it("classifies .txt as plainText when enablePlainTextDocuments is true", () => {
    expect(
      getProjectDocumentKind("notes.txt", {
        enablePlainTextDocuments: true
      })
    ).toBe("plainText");

    expect(
      getProjectDocumentKind("NOTES.TXT", {
        enablePlainTextDocuments: true
      })
    ).toBe("plainText");

    expect(
      isProjectDocumentPath("notes.txt", {
        enablePlainTextDocuments: true
      })
    ).toBe(true);
  });

  it("returns null for unsupported file extensions", () => {
    const optionsFalse = { enablePlainTextDocuments: false };
    const optionsTrue = { enablePlainTextDocuments: true };

    for (const options of [optionsFalse, optionsTrue]) {
      expect(getProjectDocumentKind("image.png", options)).toBeNull();
      expect(getProjectDocumentKind("document.pdf", options)).toBeNull();
      expect(getProjectDocumentKind("script.js", options)).toBeNull();
      expect(getProjectDocumentKind("file", options)).toBeNull();
      expect(isProjectDocumentPath("image.png", options)).toBe(false);
    }
  });

  it("identifies Markdown file paths accurately with isMarkdownPath", () => {
    expect(isMarkdownPath("chapter1.md")).toBe(true);
    expect(isMarkdownPath("chapter1.markdown")).toBe(true);
    expect(isMarkdownPath("CHAPTER1.MD")).toBe(true);
    expect(isMarkdownPath("notes.txt")).toBe(false);
    expect(isMarkdownPath("image.png")).toBe(false);
  });
});
