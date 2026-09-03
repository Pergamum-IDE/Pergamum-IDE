import { describe, expect, it, vi } from "vitest";
import type { PergamumProject, ProjectDocument } from "../../src/shared/api";
import {
  createGlossaryEntryEditorId,
  createProjectDocumentEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import {
  createInitialOpenDocumentsState,
  openOrActivateEditor
} from "../../src/renderer/openDocuments";
import { createGlossaryEntryCurrentEditor } from "../../src/renderer/currentEditor";
import { resolveCurrentEditor } from "../../src/renderer/resolveCurrentEditor";

const projectContext: ActiveProjectContext = {
  rootPath: "C:\\Novel"
};

const projectDocument: ProjectDocument = {
  relativePath: "chapter-01.md",
  name: "chapter-01.md"
};

const project: PergamumProject = {
  rootPath: projectContext.rootPath,
  activeProjectFilePath: `${projectContext.rootPath}\\pergamum.db`,
  accessMode: { kind: "readWrite" },
  name: "Novel",
  config: null,
  documents: [projectDocument]
};

const glossaryEntry: GlossaryEntry = {
  id: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  description: "説明",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  atoms: [
    {
      id: "018f4b8c-7a2b-7c3d-8e4f-223456789abc",
      entryId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
      sortOrder: 0,
      value: "王都",
      matchFlags: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  tags: []
};

describe("resolveCurrentEditor", () => {
  it("resolves glossaryEntry EditorIds through the renderer Glossary API", async () => {
    const getGlossaryEntryById = vi.fn(async () => glossaryEntry);
    const result = await resolveCurrentEditor(
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext),
      {
        openDocumentsState: createInitialOpenDocumentsState(),
        project,
        activeProjectContext: projectContext,
        readProjectDocument: vi.fn(),
        getGlossaryEntryById
      }
    );

    expect(result.kind).toBe("resolved");
    expect(result.kind === "resolved" && result.editor.kind).toBe(
      "glossaryEntry"
    );
    expect(getGlossaryEntryById).toHaveBeenCalledWith(glossaryEntry.id);
  });

  it("maps missing glossary entries to notFound", async () => {
    await expect(
      resolveCurrentEditor(
        createGlossaryEntryEditorId(glossaryEntry.id, projectContext),
        {
          openDocumentsState: createInitialOpenDocumentsState(),
          project,
          activeProjectContext: projectContext,
          readProjectDocument: vi.fn(),
          getGlossaryEntryById: vi.fn(async () => null)
        }
      )
    ).resolves.toEqual({ kind: "notFound" });
  });

  it("maps temporary glossary lookup failures to unavailable", async () => {
    const error = new Error("database busy");
    const result = await resolveCurrentEditor(
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext),
      {
        openDocumentsState: createInitialOpenDocumentsState(),
        project,
        activeProjectContext: projectContext,
        readProjectDocument: vi.fn(),
        getGlossaryEntryById: vi.fn(async () => {
          throw error;
        })
      }
    );

    expect(result).toEqual({
      kind: "unavailable",
      error
    });
  });

  it("resolves already-open glossary entries without hitting the API", async () => {
    const editorId = createGlossaryEntryEditorId(
      glossaryEntry.id,
      projectContext
    );
    const getGlossaryEntryById = vi.fn();
    const openDocumentsState = openOrActivateEditor(
      createInitialOpenDocumentsState(),
      createGlossaryEntryCurrentEditor(glossaryEntry),
      projectContext
    );
    const result = await resolveCurrentEditor(editorId, {
      openDocumentsState,
      project,
      activeProjectContext: projectContext,
      readProjectDocument: vi.fn(),
      getGlossaryEntryById
    });

    expect(result.kind).toBe("resolved");
    expect(result.kind === "resolved" && result.editor.kind).toBe(
      "glossaryEntry"
    );
    expect(getGlossaryEntryById).not.toHaveBeenCalled();
  });

  it("resolves project documents and glossary entries through the same boundary", async () => {
    const readProjectDocument = vi.fn(async () =>
      createProjectDocument(projectDocument, "content")
    );
    const openDocumentsState = createInitialOpenDocumentsState();

    const markdownResult = await resolveCurrentEditor(
      createProjectDocumentEditorId(projectDocument.relativePath, projectContext),
      {
        openDocumentsState,
        project,
        activeProjectContext: projectContext,
        readProjectDocument,
        getGlossaryEntryById: vi.fn()
      }
    );
    const glossaryResult = await resolveCurrentEditor(
      createGlossaryEntryEditorId(glossaryEntry.id, projectContext),
      {
        openDocumentsState,
        project,
        activeProjectContext: projectContext,
        readProjectDocument,
        getGlossaryEntryById: vi.fn(async () => glossaryEntry)
      }
    );

    expect(markdownResult.kind).toBe("resolved");
    expect(
      markdownResult.kind === "resolved" && markdownResult.editor.kind
    ).toBe("markdown");
    expect(glossaryResult.kind).toBe("resolved");
    expect(
      glossaryResult.kind === "resolved" && glossaryResult.editor.kind
    ).toBe("glossaryEntry");
  });
});
