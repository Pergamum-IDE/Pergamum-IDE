import type { ProjectLocalImageResolutionContext } from "../shared/projectLocalImageLink";
import {
  currentDocumentContent,
  currentProjectRelativePath,
  isCurrentDocumentDirty,
  isMarkdownCurrentDocument,
  type CurrentDocument
} from "./currentDocument";
import type { LineEndingBreakSet } from "./editorLineEndingField";

/**
 * Where the Aozora-renderer preview can load a document's pre-cleaned source
 * text from (#501). Only a file-backed plain text document has one.
 */
export type MarkdownSurfaceAozoraSourceText =
  | { readonly kind: "file"; readonly path: string }
  | { readonly kind: "projectDocument"; readonly relativePath: string };

/**
 * #573 Slice 2: the narrow set of facts `MarkdownEditorSurface` needs about
 * what it is editing, so the editor / preview stack no longer reads a
 * file-backed `CurrentDocument` directly. Today the only adapter is
 * `createCurrentDocumentMarkdownSurfaceSource`; a glossary Description
 * adapter is expected in a later slice.
 *
 * Tab identity (`documentKey`) and project read-only state stay separate
 * `MarkdownEditorSurface` props — they are not properties of the text source.
 */
export interface MarkdownSurfaceSource {
  /** The working text shown in the editor. */
  readonly text: string;
  /** Initial per-line line-ending breaks (read once per `documentKey`). */
  readonly lineEndingBreaks: LineEndingBreakSet;
  readonly isDirty: boolean;
  /** `false` for a plain text (`.txt`) document. */
  readonly isMarkdownDocument: boolean;
  /** How project-local image links in the Preview are resolved. */
  readonly imageResolution: ProjectLocalImageResolutionContext;
  /** `null` = no Aozora pre-cleaned source text is available. */
  readonly aozoraSourceText: MarkdownSurfaceAozoraSourceText | null;
}

function currentDocumentImageResolution(
  document: CurrentDocument
): ProjectLocalImageResolutionContext {
  // #409 / #412: only a project document has a project-root-relative path
  // to anchor image links at (its own folder, `sourceFile`); a standalone /
  // untitled document renders image links verbatim (`none`).
  const projectRelativePath = currentProjectRelativePath(document);

  return projectRelativePath !== null
    ? {
        kind: "sourceFile",
        sourceMarkdownProjectRelativePath: projectRelativePath
      }
    : { kind: "none" };
}

function currentDocumentAozoraSourceText(
  document: CurrentDocument
): MarkdownSurfaceAozoraSourceText | null {
  switch (document.kind) {
    case "file":
      return document.path ? { kind: "file", path: document.path } : null;
    case "project":
      return document.relativePath
        ? { kind: "projectDocument", relativePath: document.relativePath }
        : null;
    case "untitled":
      return null;
  }
}

/** Adapts a file-backed / untitled Markdown or text document. */
export function createCurrentDocumentMarkdownSurfaceSource(
  document: CurrentDocument
): MarkdownSurfaceSource {
  return {
    text: currentDocumentContent(document),
    lineEndingBreaks: document.lineEndingBreaks,
    isDirty: isCurrentDocumentDirty(document),
    isMarkdownDocument: isMarkdownCurrentDocument(document),
    imageResolution: currentDocumentImageResolution(document),
    aozoraSourceText: currentDocumentAozoraSourceText(document)
  };
}
