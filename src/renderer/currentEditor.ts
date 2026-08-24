import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import {
  createEditorIdForPath,
  createFileEditorIdForPath,
  createGlossaryEntryEditorId,
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
import {
  createGlossaryEntryDraft,
  isGlossaryEntryDraftDirty,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { canonicalGlossarySurface } from "./glossaryPresentation";

export interface MarkdownCurrentEditor {
  kind: "markdown";
  document: CurrentDocument;
}

export interface GlossaryEntryCurrentEditor {
  kind: "glossaryEntry";
  draft: GlossaryEntryDraft;
}

export type CurrentEditor =
  | MarkdownCurrentEditor
  | GlossaryEntryCurrentEditor;

export function createMarkdownCurrentEditor(
  document: CurrentDocument
): MarkdownCurrentEditor {
  return {
    kind: "markdown",
    document
  };
}

export function createGlossaryEntryCurrentEditor(
  entry: GlossaryEntry
): GlossaryEntryCurrentEditor {
  return {
    kind: "glossaryEntry",
    draft: createGlossaryEntryDraft(entry)
  };
}

export function markdownDocumentForEditor(
  editor: CurrentEditor
): CurrentDocument | null {
  return editor.kind === "markdown" ? editor.document : null;
}

export function currentEditorTitle(editor: CurrentEditor): string {
  switch (editor.kind) {
    case "markdown":
      return currentDocumentTitle(editor.document);
    case "glossaryEntry":
      return (
        editor.draft.canonicalSurface.trim() ||
        canonicalGlossarySurface(editor.draft.entry)
      );
  }
}

export function isCurrentEditorDirty(editor: CurrentEditor): boolean {
  switch (editor.kind) {
    case "markdown":
      return isCurrentDocumentDirty(editor.document);
    case "glossaryEntry":
      return isGlossaryEntryDraftDirty(editor.draft);
  }
}

export function currentEditorProjectRelativePath(
  editor: CurrentEditor
): string | null {
  return editor.kind === "markdown"
    ? currentProjectRelativePath(editor.document)
    : null;
}

export function currentEditorGlossaryEntryId(
  editor: CurrentEditor
): GlossaryEntryId | null {
  return editor.kind === "glossaryEntry" ? editor.draft.entry.id : null;
}

export function editorIdForCurrentEditor(
  editor: CurrentEditor,
  activeProjectContext: ActiveProjectContext | null
): EditorId | null {
  switch (editor.kind) {
    case "markdown":
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
    case "glossaryEntry":
      return createGlossaryEntryEditorId(
        editor.draft.entry.id,
        activeProjectContext
      );
  }
}

export function isCurrentEditorIdentityCompatible(
  editor: CurrentEditor,
  editorId: EditorId
): boolean {
  switch (editor.kind) {
    case "markdown":
      switch (editor.document.kind) {
        case "file":
          return editorId.kind === "file";
        case "project":
          return editorId.kind === "projectDocument";
        case "untitled":
          return editorId.kind === "untitled";
      }
    case "glossaryEntry":
      return editorId.kind === "glossaryEntry";
  }
}
