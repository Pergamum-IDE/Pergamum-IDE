import type { GlossaryEntry, GlossaryEntryId } from "../shared/glossary";
import {
  createFileEditorIdForPath,
  createGlossaryDescriptionEditorId,
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
import { representativeGlossarySurface } from "./glossaryPresentation";

export interface MarkdownCurrentEditor {
  kind: "markdown";
  document: CurrentDocument;
}

/**
 * #573 Slice 1: a non-file-backed tab for one glossary entry's Description.
 * It holds only what the placeholder needs (identity + the representative
 * surface captured at open time); later slices are expected to evolve this
 * into owning a `GlossaryEntryDraft`. It never has a `CurrentDocument`, so
 * every file-backed feature gated on `markdownDocumentForEditor()` skips it.
 */
export interface GlossaryDescriptionCurrentEditor {
  kind: "glossaryDescription";
  entryId: GlossaryEntryId;
  representativeSurface: string;
}

export type CurrentEditor =
  | MarkdownCurrentEditor
  | GlossaryDescriptionCurrentEditor;

const glossaryDescriptionTitlePrefix = "語彙";

export function createMarkdownCurrentEditor(
  document: CurrentDocument
): MarkdownCurrentEditor {
  return {
    kind: "markdown",
    document
  };
}

export function createGlossaryDescriptionCurrentEditor(
  entry: GlossaryEntry
): GlossaryDescriptionCurrentEditor {
  return {
    kind: "glossaryDescription",
    entryId: entry.id,
    representativeSurface: representativeGlossarySurface(entry).trim()
  };
}

export function markdownDocumentForEditor(
  editor: CurrentEditor
): CurrentDocument | null {
  return editor.kind === "markdown" ? editor.document : null;
}

export function glossaryDescriptionEditorTitle(
  representativeSurface: string
): string {
  const surface = representativeSurface.trim();

  return surface
    ? `${glossaryDescriptionTitlePrefix}: ${surface}`
    : glossaryDescriptionTitlePrefix;
}

export function currentEditorTitle(editor: CurrentEditor): string {
  switch (editor.kind) {
    case "markdown":
      return currentDocumentTitle(editor.document);
    case "glossaryDescription":
      return glossaryDescriptionEditorTitle(editor.representativeSurface);
  }
}

export function isCurrentEditorDirty(editor: CurrentEditor): boolean {
  switch (editor.kind) {
    case "markdown":
      return isCurrentDocumentDirty(editor.document);
    case "glossaryDescription":
      // #573 Slice 1: read-only placeholder — no draft, never dirty.
      return false;
  }
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
  if (editor.kind === "glossaryDescription") {
    return createGlossaryDescriptionEditorId(editor.entryId);
  }

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
  if (editor.kind === "glossaryDescription") {
    return (
      editorId.kind === "glossaryDescription" &&
      editorId.entryId === editor.entryId
    );
  }

  switch (editor.document.kind) {
    case "file":
      return editorId.kind === "file";
    case "project":
      return editorId.kind === "projectDocument";
    case "untitled":
      return editorId.kind === "untitled";
  }
}
