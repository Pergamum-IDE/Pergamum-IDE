import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  isMarkdownCurrentDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import {
  closeOpenEditor,
  createOpenDocumentsStateWithDocument,
  documentTabs,
  findOpenDocument,
  isOpenDocumentDirty,
  updateOpenDocument
} from "../../src/renderer/openDocuments";
import {
  createProjectDocumentEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";
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

  it("gates .txt paths based on textFiles.enablePlainTextDocuments setting", () => {
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

  it("keeps an already-open .txt project document tab and dirty state until the tab is explicitly closed", () => {
    const projectContext: ActiveProjectContext = {
      rootPath: "C:\\project"
    };
    const editorId = createProjectDocumentEditorId(
      "notes.txt",
      projectContext
    );
    const document = createProjectDocument(
      { relativePath: "notes.txt", name: "notes.txt" },
      "saved"
    );
    const opened = createOpenDocumentsStateWithDocument(
      document,
      projectContext
    );
    const dirty = updateOpenDocument(opened, editorId, (currentDocument) =>
      updateCurrentDocumentContent(
        currentDocument,
        "dirty",
        currentDocument.lineEndingBreaks
      )
    );

    expect(findOpenDocument(dirty, editorId)?.editor.document).toMatchObject({
      kind: "project",
      relativePath: "notes.txt",
      content: "dirty",
      savedContent: "saved"
    });
    expect(isOpenDocumentDirty(dirty, editorId)).toBe(true);
    expect(documentTabs(dirty)).toEqual([
      {
        id: editorId,
        title: "notes.txt",
        isDirty: true,
        isExternalMarkdownFile: false
      }
    ]);

    const closed = closeOpenEditor(dirty, editorId);
    expect(findOpenDocument(closed, editorId)).toBeNull();
    expect(closed.documents).toEqual([]);
    expect(closed.activeDocumentId).toBeNull();
  });

  it("gates new .txt project-document opens by current settings while allowing already-open tabs", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf(
      "async function activateProjectDocument(relativePath: string): Promise<void>"
    );
    const end = source.indexOf(
      "function createProjectSearchReadText",
      start
    );
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain(
      "const documentId = createProjectDocumentEditorId(\n      relativePath,\n      activeContext\n    );"
    );
    expect(block).toContain(
      "const openDocument = findOpenDocument(\n      openDocumentsStateRef.current,\n      documentId\n    );"
    );
    expect(block).toContain(
      "!openDocument &&\n      !isProjectDocumentPath(relativePath, {"
    );
    expect(block.indexOf("const openDocument = findOpenDocument")).toBeLessThan(
      block.indexOf("!openDocument &&")
    );
    expect(block.indexOf("!openDocument &&")).toBeLessThan(
      block.indexOf("window.pergamum.projects.readProjectDocument")
    );
  });

  it("does not gate the project-document save path by textFiles.enablePlainTextDocuments", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf("async function saveFile(");
    const end = source.indexOf("async function readProjectDocument", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("window.pergamum.projects.saveProjectDocument");
    expect(block).not.toContain("enablePlainTextDocuments");
    expect(block).not.toContain("isProjectDocumentPath");
  });
});
