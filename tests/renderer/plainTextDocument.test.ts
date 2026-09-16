import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  isMarkdownCurrentDocument
} from "../../src/renderer/currentDocument";
import {
  getProjectDocumentKind,
  isMarkdownPath,
  isProjectDocumentPath
} from "../../src/shared/projectDocumentKind";

describe("Plain Text Document Support (#501 Slice 3)", () => {
  it("identifies Plain Text vs Markdown current documents accurately", () => {
    const untitled = createUntitledDocument();
    expect(isMarkdownCurrentDocument(untitled)).toBe(true);

    const markdownFile = createFileDocument({
      path: "C:\\project\\chapter1.md",
      content: "# Chapter 1",
      metadata: {
        encoding: "utf8",
        lineEnding: "lf",
        byteLength: 11,
        characterLength: 11,
        hadBom: false
      }
    });
    expect(isMarkdownCurrentDocument(markdownFile)).toBe(true);

    const txtFile = createFileDocument({
      path: "C:\\project\\notes.txt",
      content: "Just plain text notes.",
      metadata: {
        encoding: "utf8",
        lineEnding: "lf",
        byteLength: 22,
        characterLength: 22,
        hadBom: false
      }
    });
    expect(isMarkdownCurrentDocument(txtFile)).toBe(false);

    const projectMarkdown = createProjectDocument(
      { relativePath: "docs/readme.markdown", name: "readme.markdown" },
      "# Readme"
    );
    expect(isMarkdownCurrentDocument(projectMarkdown)).toBe(true);

    const projectTxt = createProjectDocument(
      { relativePath: "notes/todo.txt", name: "todo.txt" },
      "1. Item 1\n2. Item 2"
    );
    expect(isMarkdownCurrentDocument(projectTxt)).toBe(false);
  });

  it("gates .txt paths based on workbench.enablePlainTextDocuments setting", () => {
    const optionsDisabled = { enablePlainTextDocuments: false };
    const optionsEnabled = { enablePlainTextDocuments: true };

    expect(isProjectDocumentPath("notes.txt", optionsDisabled)).toBe(false);
    expect(isProjectDocumentPath("notes.txt", optionsEnabled)).toBe(true);

    expect(getProjectDocumentKind("notes.txt", optionsDisabled)).toBeNull();
    expect(getProjectDocumentKind("notes.txt", optionsEnabled)).toBe("plainText");

    // Markdown is always a project document regardless of setting
    expect(isProjectDocumentPath("chapter.md", optionsDisabled)).toBe(true);
    expect(isProjectDocumentPath("chapter.md", optionsEnabled)).toBe(true);
  });

  it("checks path extensions correctly with isMarkdownPath", () => {
    expect(isMarkdownPath("file.md")).toBe(true);
    expect(isMarkdownPath("file.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("file.txt")).toBe(false);
    expect(isMarkdownPath("file.png")).toBe(false);
  });
});
