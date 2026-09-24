import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFileDocument,
  createProjectDocument,
  createUntitledDocument,
  isMarkdownCurrentDocument,
  updateCurrentDocumentContent
} from "../../src/renderer/currentDocument";
import { markdownDocumentForEditor } from "../../src/renderer/currentEditor";
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

    const dirtyEditor = findOpenDocument(dirty, editorId)?.editor;

    expect(
      dirtyEditor ? markdownDocumentForEditor(dirtyEditor) : null
    ).toMatchObject({
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

  it("#501 slice 8: Project-wide Search reads a project document through the same textFiles.encoding-aware IPC as a normal open", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf(
      "function createProjectSearchReadText("
    );
    const end = source.indexOf(
      "// #384 Phase 2: project-wide text search executed for the Search pane."
    );
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Same IPC Slice 6 wired to decode `.txt` using `textFiles.encoding` and
    // `.md`/`.markdown` as UTF-8 — no separate, extension-specific search
    // reader, and no reference to the enablement setting here (the document
    // would not be in `project.documents` at all if it were gated out).
    expect(block).toContain(
      "window.pergamum.projects.readProjectDocument(relativePath)"
    );
    expect(block).not.toContain("enablePlainTextDocuments");
    expect(block).not.toContain("isProjectDocumentPath");
    expect(block).not.toContain("isMarkdownPath");
  });

  it("#501 slice 8: runProjectSearch and runProjectGlossarySearch pass project.documents through unfiltered by extension", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const textSearchStart = source.indexOf(
      "async function runProjectSearch("
    );
    const textSearchEnd = source.indexOf(
      "async function runProjectGlossarySearch(",
      textSearchStart
    );
    const textSearchBlock = source.slice(textSearchStart, textSearchEnd);

    expect(textSearchStart).toBeGreaterThan(-1);
    expect(textSearchEnd).toBeGreaterThan(textSearchStart);
    expect(textSearchBlock).toContain("documents: activeProject.documents,");

    const glossarySearchStart = source.indexOf(
      "async function runProjectGlossarySearch("
    );
    const glossarySearchBlock = source.slice(
      glossarySearchStart,
      glossarySearchStart + 900
    );

    expect(glossarySearchStart).toBeGreaterThan(-1);
    expect(glossarySearchBlock).toContain(
      "documents: activeProject.documents,"
    );
  });

  it("#501 slice 8 blocker fix: refreshes project.documents from main when textFiles.enablePlainTextDocuments changes, without a project reopen", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const importIndex = source.indexOf(
      'import { projectDocumentDiscoverySettingChanged } from "./projectDocumentsRefresh";'
    );
    const effectStart = source.indexOf(
      "const enablePlainTextDocumentsObservedRef = useRef<boolean | null>(null);"
    );
    const effectEnd = source.indexOf(
      "// #360: ONE Markdown character count",
      effectStart
    );
    const block = source.slice(effectStart, effectEnd);

    expect(importIndex).toBeGreaterThan(-1);
    expect(effectStart).toBeGreaterThan(-1);
    expect(effectEnd).toBeGreaterThan(effectStart);

    // Reacts to the LIVE setting value, not a one-time snapshot.
    expect(block).toContain(
      "effectiveSettings.textFiles.enablePlainTextDocuments"
    );
    // Uses the shared, unit-tested predicate rather than an inline
    // ad hoc comparison.
    expect(block).toContain("projectDocumentDiscoverySettingChanged(");
    // Refreshes from main via the new channel, then folds the result back
    // into `project.documents` via setProject — never a project reopen /
    // remount.
    expect(block).toContain(
      "window.pergamum.projects.listProjectDocuments()"
    );
    expect(block).toContain("setProject((currentProject) =>");
    expect(block).not.toContain("openProjectByFilePath");
    expect(block).not.toContain("closeCurrentProject");

    const useEffectDepsIndex = block.indexOf(
      "}, [effectiveSettings.textFiles.enablePlainTextDocuments, project]);"
    );
    expect(useEffectDepsIndex).toBeGreaterThan(-1);
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

describe("Plain Text Project-wide Replace (#501 Slice 9)", () => {
  it("gates open document replace targets by textFiles.enablePlainTextDocuments", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf(
      "function collectOpenDocumentReplaceTargets(): OpenDocumentReplaceTarget[] {"
    );
    const end = source.indexOf("function replaceTemplateErrorMessageKey(", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain(
      "!effectiveSettings.textFiles.enablePlainTextDocuments"
    );
    expect(block).toContain("!isMarkdownCurrentDocument(markdownDocument)");
  });

  it("gates project document replace candidate generation by textFiles.enablePlainTextDocuments", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf(
      "async function generateProjectReplacePreviewCandidates("
    );
    const end = source.indexOf("async function applyProjectReplaceSelection(", start);
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain("isProjectDocumentPath(projectDocument.relativePath, {");
    expect(block).toContain(
      "enablePlainTextDocuments:\n            effectiveSettings.textFiles.enablePlainTextDocuments"
    );
  });

  it("protects apply-time stale preview and restricts normalizeMarkdownTextForStorage to Markdown files", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf("async function applyProjectReplaceSelection(");
    const end = source.indexOf(
      "function syncOpenCleanBuffersAfterProjectReplace(",
      start
    );
    const block = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    // Apply-time stale preview check
    expect(block).toContain("isProjectDocumentPath(relativePath, {");
    expect(block).toContain(
      "enablePlainTextDocuments:\n            effectiveSettings.textFiles.enablePlainTextDocuments"
    );
    // Markdown-only storage normalization guard
    expect(block).toContain("isMarkdownPath(relativePath)");
    expect(block).toContain("normalizeMarkdownTextForStorage(");
    // Structured save failure check
    expect(block).toContain('saveResult.kind === "failed"');
  });

  it("ensures old setting keys remain completely absent from the codebase", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const ipcSource = readFileSync("src/main/projectIpc.ts", "utf8");

    expect(appSource).not.toContain("files.newFile");
    expect(appSource).not.toContain("workbench.enablePlainTextDocuments");
    expect(ipcSource).not.toContain("files.newFile");
    expect(ipcSource).not.toContain("workbench.enablePlainTextDocuments");
  });
});

describe("Plain Text Quick Open Preview Lines (#501 Slice 10)", () => {
  it("threads getProjectDocumentKind and textFiles.encoding through readProjectDocumentPreviewLine in projectIpc.ts", () => {
    const ipcSource = readFileSync("src/main/projectIpc.ts", "utf8");
    const start = ipcSource.indexOf("async function readProjectDocumentPreviewLine(");
    const end = ipcSource.indexOf("export function registerCurrentProjectDocumentPath(", start);
    const block = ipcSource.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    // Live settings inspection
    expect(block).toContain("settings = await loadSettings()");
    // Document kind check using effective setting
    expect(block).toContain("getProjectDocumentKind(normalized, {");
    expect(block).toContain("enablePlainTextDocuments: settings?.textFiles.enablePlainTextDocuments");
    // Plain text encoding-aware decoding via textFiles.encoding
    expect(block).toContain("kind === \"markdown\"");
    expect(block).toContain("decodeMarkdownBytes(bytes).content");
    expect(block).toContain("decodeTextFileBytes(bytes, settings?.textFiles.encoding");
    // Safe preview line extraction
    expect(block).toContain("firstNonEmptyMarkdownPreviewLine(content)");
  });
});


