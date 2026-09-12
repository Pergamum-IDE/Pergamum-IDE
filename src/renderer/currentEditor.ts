import {
  createEditorIdForPath,
  createFileEditorIdForPath,
  createProjectDocumentEditorId,
  type ActiveProjectContext,
  type EditorId
} from "../shared/editorId";
import {
  currentDocumentTitle,
  currentProjectRelativePath,
  isCurrentDocumentDirty,
  type CurrentDocument
} from "./currentDocument";

export interface MarkdownCurrentEditor {
  kind: "markdown";
  document: CurrentDocument;
}

export type CurrentEditor = MarkdownCurrentEditor;

export function createMarkdownCurrentEditor(
  document: CurrentDocument
): MarkdownCurrentEditor {
  return {
    kind: "markdown",
    document
  };
}

export function markdownDocumentForEditor(
  editor: CurrentEditor
): CurrentDocument | null {
  return editor.kind === "markdown" ? editor.document : null;
}

export function currentEditorTitle(editor: CurrentEditor): string {
  return currentDocumentTitle(editor.document);
}

export function isCurrentEditorDirty(editor: CurrentEditor): boolean {
  return isCurrentDocumentDirty(editor.document);
}

export function currentEditorProjectRelativePath(
  editor: CurrentEditor
): string | null {
  return editor.kind === "markdown"
    ? currentProjectRelativePath(editor.document)
    : null;
}

export function editorIdForCurrentEditor(
  editor: CurrentEditor,
  activeProjectContext: ActiveProjectContext | null
): EditorId | null {
  switch (editor.document.kind) {
    case "file":
      return createFileEditorIdForPath(editor.document.path);
    case "project":
      return createProjectDocumentEditorId(
        editor.document.relativePath,
        activeProjectContext
      );
    case "untitled":
      return null;
  }
}

export function isCurrentEditorIdentityCompatible(
  editor: CurrentEditor,
  editorId: EditorId
): boolean {
  switch (editor.document.kind) {
    case "file":
      return editorId.kind === "file";
    case "project":
      return editorId.kind === "projectDocument";
    case "untitled":
      return editorId.kind === "untitled";
  }
}
