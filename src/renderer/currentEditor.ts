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
import {
  buildLineEndingBreakSet,
  type LineEndingBreakSet
} from "./editorLineEndingField";
import {
  createGlossaryEntryDraft,
  updateGlossaryEntryDraftDescription,
  type GlossaryEntryDraft
} from "./glossaryEntryDraft";
import { representativeGlossarySurface } from "./glossaryPresentation";
import { analyzeLineEndings } from "./lineEndingTracking";

export interface MarkdownCurrentEditor {
  kind: "markdown";
  document: CurrentDocument;
}

/**
 * #573: a non-file-backed tab for one glossary entry's Description. It never
 * has a `CurrentDocument`, so every file-backed feature gated on
 * `markdownDocumentForEditor()` skips it.
 *
 * Slice 3: the tab owns an in-memory `GlossaryEntryDraft` (seeded from the
 * entry at open time); only `draft.description` is edited. Nothing is
 * persisted yet — save / dirty arrive in a later slice.
 */
export interface GlossaryDescriptionCurrentEditor {
  kind: "glossaryDescription";
  entryId: GlossaryEntryId;
  representativeSurface: string;
  draft: GlossaryEntryDraft;
  /** Line-ending breaks for `draft.description`, as last reported by the
   *  editor (seeded by analyzing the entry's Description at open time). */
  descriptionLineEndingBreaks: LineEndingBreakSet;
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
    representativeSurface: representativeGlossarySurface(entry).trim(),
    draft: createGlossaryEntryDraft(entry),
    descriptionLineEndingBreaks: buildLineEndingBreakSet(
      analyzeLineEndings(entry.description)
    )
  };
}

/**
 * #573 Slice 3: apply an editor text change to a glossary Description tab's
 * in-memory draft. Any other editor is returned unchanged.
 */
export function updateGlossaryDescriptionEditorText(
  editor: CurrentEditor,
  description: string,
  lineEndingBreaks: LineEndingBreakSet
): CurrentEditor {
  if (editor.kind !== "glossaryDescription") {
    return editor;
  }

  return {
    ...editor,
    draft: updateGlossaryEntryDraftDescription(editor.draft, description),
    descriptionLineEndingBreaks: lineEndingBreaks
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
      // #573 Slice 3: edits live only in the in-memory draft; dirty / save
      // tracking is deliberately deferred to a later slice.
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
