import type {
  MarkdownFile,
  PergamumProject,
  ProjectDocument
} from "../shared/api";
import {
  createEditorIdForPath,
  createProjectDocumentEditorId,
  editorIdEquals,
  type ActiveProjectContext,
  type EditorId
} from "../shared/editorId";
import {
  createFileDocument,
  createProjectDocument,
  type CurrentDocument
} from "./currentDocument";

export function findProjectDocumentByEditorId(
  project: PergamumProject,
  editorId: EditorId,
  activeProjectContext: ActiveProjectContext
): ProjectDocument | null {
  if (editorId.kind !== "projectDocument") {
    return null;
  }

  return (
    project.documents.find((document) =>
      editorIdEquals(
        createProjectDocumentEditorId(
          document.relativePath,
          activeProjectContext
        ),
        editorId
      )
    ) ?? null
  );
}

export function currentDocumentForOpenedFile(
  file: MarkdownFile,
  project: PergamumProject | null,
  activeProjectContext: ActiveProjectContext | null
): CurrentDocument {
  const editorId = createEditorIdForPath(file.path, activeProjectContext);

  if (editorId.kind === "projectDocument") {
    const projectDocument =
      project && activeProjectContext
        ? findProjectDocumentByEditorId(project, editorId, activeProjectContext)
        : null;

    if (!projectDocument) {
      throw new Error("Project document is not listed in the active project.");
    }

    return createProjectDocument(projectDocument, file.content, file.metadata);
  }

  return createFileDocument(file);
}
