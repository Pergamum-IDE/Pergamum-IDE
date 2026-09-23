import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { createCurrentDocumentMarkdownSurfaceSource } from "../../src/renderer/markdownSurfaceSource";

describe("createCurrentDocumentMarkdownSurfaceSource (#573 Slice 2)", () => {
  it("adapts a project Markdown document", () => {
    const document = createProjectDocument(
      { relativePath: "chapters/01.md", name: "01.md" },
      "# 第一章\r\n本文"
    );
    const source = createCurrentDocumentMarkdownSurfaceSource(document);

    expect(source).toEqual({
      text: "# 第一章\n本文",
      lineEndingBreaks: document.lineEndingBreaks,
      isDirty: false,
      isMarkdownDocument: true,
      imageResolution: {
        kind: "sourceFile",
        sourceMarkdownProjectRelativePath: "chapters/01.md"
      },
      aozoraSourceText: {
        kind: "projectDocument",
        relativePath: "chapters/01.md"
      }
    });
    // Same RangeSet reference — never re-analyzed by the adapter.
    expect(source.lineEndingBreaks).toBe(document.lineEndingBreaks);
  });

  it("treats a project .txt document as plain text, still file-backed", () => {
    const source = createCurrentDocumentMarkdownSurfaceSource(
      createProjectDocument(
        { relativePath: "notes/todo.txt", name: "todo.txt" },
        "memo"
      )
    );

    expect(source.isMarkdownDocument).toBe(false);
    expect(source.imageResolution).toEqual({
      kind: "sourceFile",
      sourceMarkdownProjectRelativePath: "notes/todo.txt"
    });
    expect(source.aozoraSourceText).toEqual({
      kind: "projectDocument",
      relativePath: "notes/todo.txt"
    });
  });

  it("adapts an external file without project image resolution", () => {
    const source = createCurrentDocumentMarkdownSurfaceSource(
      createFileDocument({
        path: "D:/outside/story.txt",
        content: "text",
        metadata: {
          encoding: "utf8",
          lineEnding: "lf",
          byteLength: 4,
          characterLength: 4,
          hadBom: false
        }
      })
    );

    expect(source.isMarkdownDocument).toBe(false);
    expect(source.imageResolution).toEqual({ kind: "none" });
    expect(source.aozoraSourceText).toEqual({
      kind: "file",
      path: "D:/outside/story.txt"
    });
  });

  it("adapts an untitled document with no file-backed capabilities", () => {
    const source = createCurrentDocumentMarkdownSurfaceSource(
      createUntitledDocument(() => "untitled-1")
    );

    expect(source.isMarkdownDocument).toBe(true);
    expect(source.imageResolution).toEqual({ kind: "none" });
    expect(source.aozoraSourceText).toBeNull();
  });

  it("reports working text and dirtiness from the document", () => {
    const document = createProjectDocument(
      { relativePath: "a.md", name: "a.md" },
      "saved"
    );
    const edited = updateCurrentDocumentContent(
      document,
      "edited",
      document.lineEndingBreaks
    );
    const source = createCurrentDocumentMarkdownSurfaceSource(edited);

    expect(source.text).toBe("edited");
    expect(source.isDirty).toBe(true);
  });
});
