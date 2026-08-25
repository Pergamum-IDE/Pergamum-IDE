import type {
  MarkdownFile,
  ProjectDocument,
  WriteMarkdownSavedResult
} from "../shared/api";
import {
  buildLineEndingBreakSet,
  lineEndingBreakSetsEqual,
  type LineEndingBreakSet
} from "./editorLineEndingField";
import { analyzeLineEndings, normalizeLineEndings } from "./lineEndingTracking";

export const initialDocumentContent =
  "# Untitled\n\nStart writing in Markdown.\n\n**Bold** text renders in the preview.";

// #253: the per-break line-ending kind tracked for this document's current
// content, kept as the same immutable CodeMirror RangeSet the editor's own
// StateField produces (see editorLineEndingField.ts) rather than a plain
// array. Storing the RangeSet reference itself means every edit updates
// this field at the same O(1) reference-passing cost as `content` — no
// per-keystroke array rebuild. It is only walked into a plain array once,
// at save time (src/renderer/App.tsx's saveFile).
interface BaseCurrentDocument {
  name: string;
  // #253: always CodeMirror-normalized ("\n"-only) text, never the raw
  // on-disk bytes — this must match what `analyzeLineEndings`'s break
  // positions and `serializeLineEndings`'s `content` parameter assume, and
  // what CodeMirror's own `doc.toString()` will produce for this same
  // text. Raw CRLF/CR/mixed content is normalized once at document-create
  // time (see createFileDocument/createProjectDocument below); it is never
  // stored as-is.
  content: string;
  savedContent: string;
  // #253 review: the per-break kind is part of save semantics (it decides
  // the on-disk byte sequence), not just display metadata — so dirty
  // detection must compare it against the snapshot from the last
  // successful save, exactly like content/savedContent. Kept as the same
  // kind of RangeSet reference as `lineEndingBreaks` for the same O(1)
  // reference-passing reason (see below); the two are equal by reference
  // immediately after open/create/save, so comparing them is free in the
  // common case (see isCurrentDocumentDirty).
  lineEndingBreaks: LineEndingBreakSet;
  savedLineEndingBreaks: LineEndingBreakSet;
}

export interface UntitledCurrentDocument extends BaseCurrentDocument {
  kind: "untitled";
  path: null;
}

export interface FileCurrentDocument extends BaseCurrentDocument {
  kind: "file";
  path: string;
}

export interface ProjectCurrentDocument extends BaseCurrentDocument {
  kind: "project";
  relativePath: string;
}

export type CurrentDocument =
  | UntitledCurrentDocument
  | FileCurrentDocument
  | ProjectCurrentDocument;

export function createUntitledDocument(): UntitledCurrentDocument {
  const breaks = buildLineEndingBreakSet(
    analyzeLineEndings(initialDocumentContent)
  );

  return {
    kind: "untitled",
    path: null,
    name: "Untitled.md",
    content: initialDocumentContent,
    savedContent: initialDocumentContent,
    lineEndingBreaks: breaks,
    savedLineEndingBreaks: breaks
  };
}

export function createFileDocument(file: MarkdownFile): FileCurrentDocument {
  const normalizedContent = normalizeLineEndings(file.content);
  // Breaks are analyzed from the raw content (their positions are already
  // defined in normalized coordinate space — see lineEndingTracking.ts),
  // never from normalizedContent itself.
  const breaks = buildLineEndingBreakSet(analyzeLineEndings(file.content));

  return {
    kind: "file",
    path: file.path,
    name: displayName(file.path),
    content: normalizedContent,
    savedContent: normalizedContent,
    lineEndingBreaks: breaks,
    savedLineEndingBreaks: breaks
  };
}

export function createProjectDocument(
  document: ProjectDocument,
  content: string
): ProjectCurrentDocument {
  const normalizedContent = normalizeLineEndings(content);
  const breaks = buildLineEndingBreakSet(analyzeLineEndings(content));

  return {
    kind: "project",
    relativePath: document.relativePath,
    name: document.name,
    content: normalizedContent,
    savedContent: normalizedContent,
    lineEndingBreaks: breaks,
    savedLineEndingBreaks: breaks
  };
}

export function displayName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function currentDocumentTitle(document: CurrentDocument): string {
  return document.name;
}

export function currentDocumentContent(document: CurrentDocument): string {
  return document.content;
}

export function currentProjectRelativePath(
  document: CurrentDocument
): string | null {
  return document.kind === "project" ? document.relativePath : null;
}

export function isInitialUntitledDocument(document: CurrentDocument): boolean {
  return (
    document.kind === "untitled" && document.content === initialDocumentContent
  );
}

/**
 * #253 review: line-ending kind is part of save semantics (it decides the
 * on-disk byte sequence), so a document whose canonical content matches
 * savedContent but whose tracked breaks no longer match the saved
 * snapshot (e.g. an existing break was deleted and a new one inherited a
 * different local kind at the same text position) must still be dirty —
 * saving it would change the file's bytes even though `content` alone
 * looks unchanged.
 *
 * Ordered as a fast path: `content` mismatch (the common case while
 * typing) returns immediately without ever touching the break sets.
 * `lineEndingBreaks`/`savedLineEndingBreaks` are the exact same RangeSet
 * reference immediately after open/create/save, so the reference check
 * resolves the common "still clean" / "already confirmed dirty via
 * content" cases in O(1) too. Only a content-equal-but-reference-differing
 * case (rare — requires an edit that round-trips content while still
 * altering tracked breaks) pays for the O(n) structural comparison.
 */
export function isCurrentDocumentDirty(document: CurrentDocument): boolean {
  if (document.content !== document.savedContent) {
    return true;
  }

  if (document.lineEndingBreaks === document.savedLineEndingBreaks) {
    return false;
  }

  return !lineEndingBreakSetsEqual(
    document.lineEndingBreaks,
    document.savedLineEndingBreaks
  );
}

export function isProjectCurrentDocument(
  document: CurrentDocument
): document is ProjectCurrentDocument {
  return document.kind === "project";
}

export function updateCurrentDocumentContent(
  document: CurrentDocument,
  content: string,
  lineEndingBreaks: LineEndingBreakSet
): CurrentDocument {
  return {
    ...document,
    content,
    lineEndingBreaks
  };
}

export function standaloneSavePath(document: CurrentDocument): string | null {
  return document.kind === "file" ? document.path : null;
}

export function markCurrentDocumentSaved(
  document: CurrentDocument
): CurrentDocument {
  return {
    ...document,
    savedContent: document.content,
    savedLineEndingBreaks: document.lineEndingBreaks
  };
}

export function applyStandaloneSaveResult(
  document: CurrentDocument,
  result: WriteMarkdownSavedResult
): FileCurrentDocument {
  return {
    kind: "file",
    path: result.path,
    name: displayName(result.path),
    content: document.content,
    savedContent: document.content,
    // Content/tracking didn't change — only the file identity (e.g. Save
    // As) did — so the current tracking state carries forward unchanged,
    // and (since this represents a successful write) becomes the new
    // saved snapshot too.
    lineEndingBreaks: document.lineEndingBreaks,
    savedLineEndingBreaks: document.lineEndingBreaks
  };
}
