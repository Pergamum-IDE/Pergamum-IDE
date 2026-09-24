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
  applyGlossaryEntryDraftSaveResult,
  createGlossaryEntryDraft,
  createNewGlossaryEntryDraft,
  glossaryEntryDraftIsNew,
  isGlossaryEntryDraftDirty,
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
 * entry at open time); only `draft.description` is edited in the tab.
 * Slice 4: `draft.entry` is the saved baseline — the tab is dirty while the
 * draft differs from it, and a successful save replaces it with the saved
 * entry (`applyGlossaryDescriptionEditorSaveResult`).
 */
export interface GlossaryDescriptionCurrentEditor {
  kind: "glossaryDescription";
  entryId: GlossaryEntryId;
  representativeSurface: string;
  draft: GlossaryEntryDraft;
  /** Line-ending breaks for `draft.description`, as last reported by the
   *  editor (seeded by analyzing the entry's Description at open time). */
  descriptionLineEndingBreaks: LineEndingBreakSet;
  /** #574 Slice 4: set only on a tab restored from Recovery whose entry was
   *  updated after the Recovery snapshot — saving it overwrites newer data,
   *  so Save asks first. In-memory only (never persisted in the session);
   *  cleared by a successful save. */
  recoveryConflict?: GlossaryDescriptionRecoveryConflict | null;
}

/** #574 Slice 4: the recovered draft's base vs. the entry as stored now. */
export interface GlossaryDescriptionRecoveryConflict {
  readonly baseUpdatedAt: string;
  readonly currentUpdatedAt: string;
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
 * #573 Slice 5: apply one draft mutation (a metadata edit from the tab's
 * metadata panel) to a glossary Description tab's draft. Any other editor is
 * returned unchanged.
 */
export function updateGlossaryDescriptionEditorDraft(
  editor: CurrentEditor,
  update: (draft: GlossaryEntryDraft) => GlossaryEntryDraft
): CurrentEditor {
  if (editor.kind !== "glossaryDescription") {
    return editor;
  }

  return { ...editor, draft: update(editor.draft) };
}

/**
 * #573 Slice 7: a tab for a NEW, not-yet-saved glossary entry (replacing the
 * removed Glossary Entry Editor Pane's create mode). `localEntryId` is a fresh
 * UUIDv7 used only as the tab's identity until the first save creates the
 * entry and re-keys the tab (`applyGlossaryDescriptionEditorSaveResult`).
 * Unsaved from the start, so it is dirty immediately.
 */
export function createNewGlossaryDescriptionCurrentEditor(
  presetRepresentative: string,
  localEntryId: string
): GlossaryDescriptionCurrentEditor {
  return {
    kind: "glossaryDescription",
    entryId: localEntryId,
    representativeSurface: presetRepresentative.trim(),
    draft: createNewGlossaryEntryDraft(presetRepresentative),
    descriptionLineEndingBreaks: buildLineEndingBreakSet(analyzeLineEndings(""))
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

/**
 * #573 Slice 4: rebase a glossary Description tab onto the entry the store
 * just saved. The CURRENT draft is kept (edits typed while the save was in
 * flight stay dirty against the new baseline); only its baseline and store
 * ids are updated. Any other editor is returned unchanged.
 *
 * #573 Slice 7: a NEW entry's tab (its first save just created the entry)
 * also takes the created entry's id, so its EditorId becomes the real one.
 */
export function applyGlossaryDescriptionEditorSaveResult(
  editor: CurrentEditor,
  savedEntry: GlossaryEntry
): CurrentEditor {
  if (
    editor.kind !== "glossaryDescription" ||
    (editor.entryId !== savedEntry.id &&
      !glossaryEntryDraftIsNew(editor.draft))
  ) {
    return editor;
  }

  return {
    ...editor,
    entryId: savedEntry.id,
    representativeSurface: representativeGlossarySurface(savedEntry).trim(),
    draft: applyGlossaryEntryDraftSaveResult(editor.draft, savedEntry),
    // #574 Slice 4: the save WAS the (confirmed) overwrite — no conflict left.
    recoveryConflict: null
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
