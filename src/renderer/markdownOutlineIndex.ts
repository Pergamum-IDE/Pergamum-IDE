/**
 * #352: the open-Markdown-document heading index foundation.
 *
 * The Outline pane only needs the ACTIVE document's tree, but the data
 * structure here covers every open Markdown document (project / external /
 * untitled) so the follow-up Command Palette `#` heading search can query
 * across all of them without re-deriving anything. Everything is built from
 * the in-memory working text (`CurrentDocument.content`) — never a disk read,
 * never the Preview AST.
 */

import {
  editorIdEquals,
  serializeEditorId,
  type EditorId
} from "../shared/editorId";
import {
  extractMarkdownOutline,
  headingBodyPreviewLine,
  type MarkdownHeadingLevel,
  type MarkdownOutlineParseResult
} from "../shared/markdownOutline";
import { currentDocumentContent } from "./currentDocument";
import { currentEditorTitle, markdownDocumentForEditor } from "./currentEditor";
import type { OpenDocument, OpenDocumentsState } from "./openDocuments";

export type MarkdownOutlineDocumentKind = "project" | "external" | "untitled";

export interface MarkdownOutlineDocument {
  readonly editorId: EditorId;
  /** `serializeEditorId(editorId)` — never a raw path string. */
  readonly editorKey: string;
  /** Tab / display title. */
  readonly title: string;
  /** Project-relative path, external absolute path, or `null` for untitled. */
  readonly displayPath: string | null;
  readonly documentKind: MarkdownOutlineDocumentKind;
  readonly outline: MarkdownOutlineParseResult;
  /**
   * The exact working text this `outline` was parsed from. Internal to the
   * index — used to skip re-parsing an unchanged document during a sync.
   */
  readonly contentSnapshot: string;
}

export interface MarkdownOutlineIndex {
  /** Keyed by `editorKey`. */
  readonly documents: ReadonlyMap<string, MarkdownOutlineDocument>;
}

export const emptyMarkdownOutlineIndex: MarkdownOutlineIndex = {
  documents: new Map()
};

/**
 * #352 follow-up (Command Palette `#` prefix): one heading, in one open
 * Markdown document, as a flat search candidate. Defined here so the
 * follow-up issue only has to add the resolver + palette wiring.
 */
export interface MarkdownHeadingSearchCandidate {
  /** Stable per-result id: `${editorKey}::${headingId}`. */
  readonly id: string;
  readonly editorId: EditorId;
  readonly editorKey: string;
  readonly headingId: string;
  readonly level: MarkdownHeadingLevel;
  readonly text: string;
  readonly lineNumber: number;
  readonly from: number;
  readonly to: number;
  readonly documentTitle: string;
  readonly documentPath: string | null;
  readonly documentKind: MarkdownOutlineDocumentKind;
  /**
   * #141: first non-empty, non-heading line under this heading (bounded to the
   * heading's own body), or `null`. Feeds the Command Palette `#` heading-jump
   * footer detail preview only — never the 2-row candidate row.
   */
  readonly bodyPreview: string | null;
}

/**
 * #141: every heading in every open Markdown document, as flat search
 * candidates for the Command Palette `#` heading-jump mode.
 *
 * Order (matches the Issue): the ACTIVE document's headings first, then the
 * other open Markdown documents in tab-bar order (`state.documents`); within
 * each document, headings in document order. Nothing is re-parsed here — the
 * `MarkdownOutlineIndex` already holds each document's `flat` outline; this
 * only reshapes it and appends the bounded body preview.
 */
export function collectMarkdownHeadingSearchCandidates(
  index: MarkdownOutlineIndex,
  state: OpenDocumentsState
): MarkdownHeadingSearchCandidate[] {
  const activeId = state.activeDocumentId;
  const orderedDocuments = [...state.documents].sort((left, right) => {
    if (activeId === null) {
      return 0;
    }
    const leftActive = editorIdEquals(left.id, activeId) ? 0 : 1;
    const rightActive = editorIdEquals(right.id, activeId) ? 0 : 1;
    return leftActive - rightActive;
  });

  const candidates: MarkdownHeadingSearchCandidate[] = [];

  for (const openDocument of orderedDocuments) {
    const outlineDocument = index.documents.get(
      serializeEditorId(openDocument.id)
    );

    if (!outlineDocument) {
      continue;
    }

    const flat = outlineDocument.outline.flat;

    for (let position = 0; position < flat.length; position += 1) {
      const heading = flat[position];
      const nextHeadingLineNumber =
        position + 1 < flat.length ? flat[position + 1].lineNumber : null;

      candidates.push({
        id: `${outlineDocument.editorKey}::${heading.id}`,
        editorId: outlineDocument.editorId,
        editorKey: outlineDocument.editorKey,
        headingId: heading.id,
        level: heading.level,
        text: heading.text,
        lineNumber: heading.lineNumber,
        from: heading.from,
        to: heading.to,
        documentTitle: outlineDocument.title,
        documentPath: outlineDocument.displayPath,
        documentKind: outlineDocument.documentKind,
        bodyPreview: headingBodyPreviewLine(
          outlineDocument.contentSnapshot,
          heading.lineNumber,
          nextHeadingLineNumber
        )
      });
    }
  }

  return candidates;
}

/**
 * Build the outline record for one open document, or `null` when the editor
 * is not a Markdown document (glossary entry, etc.).
 */
export function buildMarkdownOutlineDocument(
  openDocument: OpenDocument
): MarkdownOutlineDocument | null {
  const document = markdownDocumentForEditor(openDocument.editor);

  if (!document) {
    return null;
  }

  const documentKind: MarkdownOutlineDocumentKind =
    document.kind === "project"
      ? "project"
      : document.kind === "file"
        ? "external"
        : "untitled";
  const displayPath =
    document.kind === "project"
      ? document.relativePath
      : document.kind === "file"
        ? document.path
        : null;

  const contentSnapshot = currentDocumentContent(document);

  return {
    editorId: openDocument.id,
    editorKey: serializeEditorId(openDocument.id),
    title: currentEditorTitle(openDocument.editor),
    displayPath,
    documentKind,
    outline: extractMarkdownOutline(contentSnapshot),
    contentSnapshot
  };
}

function openMarkdownDocuments(
  state: OpenDocumentsState
): { openDocument: OpenDocument; editorKey: string }[] {
  const result: { openDocument: OpenDocument; editorKey: string }[] = [];

  for (const openDocument of state.documents) {
    if (!markdownDocumentForEditor(openDocument.editor)) {
      continue;
    }
    result.push({
      openDocument,
      editorKey: serializeEditorId(openDocument.id)
    });
  }

  return result;
}

/**
 * Reconcile the index's SHAPE with the open tabs: PARSE only documents that
 * are not yet indexed (newly opened, restored, or switched to for the first
 * time), carry already-indexed documents over verbatim (NO re-parse, even if
 * their working text moved — the hook's debounced / tab-switch passes own
 * active-document freshness), and drop records for tabs that were closed.
 *
 * Cheap enough to run on every `openDocumentsState` change: a keystroke
 * re-parses nothing here.
 */
export function syncMarkdownOutlineIndex(
  state: OpenDocumentsState,
  previous: MarkdownOutlineIndex
): MarkdownOutlineIndex {
  const nextDocuments = new Map<string, MarkdownOutlineDocument>();

  for (const { openDocument, editorKey } of openMarkdownDocuments(state)) {
    const prior = previous.documents.get(editorKey);

    if (prior) {
      nextDocuments.set(editorKey, prior);
      continue;
    }

    const built = buildMarkdownOutlineDocument(openDocument);

    if (built) {
      nextDocuments.set(editorKey, built);
    }
  }

  // Referential stability: when the open-tab set is unchanged, keep the
  // previous index object so consumers don't churn on unrelated keystrokes.
  if (
    nextDocuments.size === previous.documents.size &&
    [...nextDocuments].every(
      ([key, value]) => previous.documents.get(key) === value
    )
  ) {
    return previous;
  }

  return { documents: nextDocuments };
}

/**
 * Force a re-parse of exactly one document (its `editorKey`), leaving every
 * other record untouched. Used by the hook to refresh the active document
 * after a debounce and on tab switch. A missing document is dropped.
 */
export function recomputeMarkdownOutlineDocument(
  state: OpenDocumentsState,
  previous: MarkdownOutlineIndex,
  editorKey: string
): MarkdownOutlineIndex {
  const match = openMarkdownDocuments(state).find(
    (entry) => entry.editorKey === editorKey
  );

  if (!match) {
    if (!previous.documents.has(editorKey)) {
      return previous;
    }
    const nextDocuments = new Map(previous.documents);
    nextDocuments.delete(editorKey);
    return { documents: nextDocuments };
  }

  const built = buildMarkdownOutlineDocument(match.openDocument);
  const prior = previous.documents.get(editorKey);

  if (built && prior && built.contentSnapshot === prior.contentSnapshot) {
    return previous;
  }

  const nextDocuments = new Map(previous.documents);

  if (built) {
    nextDocuments.set(editorKey, built);
  } else {
    nextDocuments.delete(editorKey);
  }

  return { documents: nextDocuments };
}

export function markdownOutlineDocumentFor(
  index: MarkdownOutlineIndex,
  editorId: EditorId | null
): MarkdownOutlineDocument | null {
  if (!editorId) {
    return null;
  }
  return index.documents.get(serializeEditorId(editorId)) ?? null;
}
