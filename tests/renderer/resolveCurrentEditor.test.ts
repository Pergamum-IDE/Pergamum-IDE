import { describe, expect, it, vi } from "vitest";
import type { PergamumProject, ProjectDocument } from "../../src/shared/api";
import {
  createProjectDocumentEditorId,
  type ActiveProjectContext
} from "../../src/shared/editorId";
import { createProjectDocument } from "../../src/renderer/currentDocument";
import { createInitialOpenDocumentsState } from "../../src/renderer/openDocuments";
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

describe("resolveCurrentEditor", () => {
  it("resolves project documents through the project document boundary", async () => {
    const readProjectDocument = vi.fn(async () =>
      createProjectDocument(projectDocument, "content")
    );

    const result = await resolveCurrentEditor(
      createProjectDocumentEditorId(projectDocument.relativePath, projectContext),
      {
        openDocumentsState: createInitialOpenDocumentsState(),
        project,
        activeProjectContext: projectContext,
        readProjectDocument
      }
    );

    expect(result.kind).toBe("resolved");
    expect(result.kind === "resolved" && result.editor.kind).toBe("markdown");
    expect(readProjectDocument).toHaveBeenCalledWith(projectDocument);
  });

  it("maps missing project documents to notFound", async () => {
    await expect(
      resolveCurrentEditor(
        createProjectDocumentEditorId("missing.md", projectContext),
        {
          openDocumentsState: createInitialOpenDocumentsState(),
          project,
          activeProjectContext: projectContext,
          readProjectDocument: vi.fn()
        }
      )
    ).resolves.toEqual({ kind: "notFound" });
  });
});
