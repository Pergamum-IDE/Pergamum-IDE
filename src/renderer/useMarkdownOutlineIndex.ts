/**
 * #352: keeps a {@link MarkdownOutlineIndex} for every open Markdown document
 * in sync with `openDocumentsState`, cheaply.
 *
 *   - structural changes (tab opened / closed / restored) → index shape
 *     reconciled synchronously, parsing only the not-yet-indexed documents;
 *   - the ACTIVE document's outline → re-parsed on a debounce while typing,
 *     and immediately on a tab switch (both entering and leaving);
 *   - inactive documents are never re-parsed on a keystroke.
 *
 * Nothing here reads from disk or from the Preview.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { serializeEditorId } from "../shared/editorId";
import type { MarkdownOutlineParseResult } from "../shared/markdownOutline";
import { currentDocumentContent } from "./currentDocument";
import { markdownDocumentForEditor } from "./currentEditor";
import {
  emptyMarkdownOutlineIndex,
  markdownOutlineDocumentFor,
  recomputeMarkdownOutlineDocument,
  syncMarkdownOutlineIndex,
  type MarkdownOutlineDocument,
  type MarkdownOutlineIndex
} from "./markdownOutlineIndex";
import { activeOpenDocument, type OpenDocumentsState } from "./openDocuments";

export interface UseMarkdownOutlineIndexOptions {
  /** Active-document re-parse debounce while typing. Default 250ms. */
  readonly debounceMs?: number;
}

export interface UseMarkdownOutlineIndexResult {
  readonly index: MarkdownOutlineIndex;
  readonly activeOutline: MarkdownOutlineParseResult | null;
  readonly activeOutlineDocument: MarkdownOutlineDocument | null;
}

export function useMarkdownOutlineIndex(
  openDocumentsState: OpenDocumentsState,
  options: UseMarkdownOutlineIndexOptions = {}
): UseMarkdownOutlineIndexResult {
  const debounceMs = options.debounceMs ?? 250;
  const [index, setIndex] = useState<MarkdownOutlineIndex>(
    emptyMarkdownOutlineIndex
  );

  // The freshest `openDocumentsState` for the deferred (debounce / cleanup)
  // recompute passes, whose deps deliberately exclude the per-keystroke state.
  const stateRef = useRef(openDocumentsState);
  stateRef.current = openDocumentsState;

  const activeDocument = activeOpenDocument(openDocumentsState);
  const activeMarkdown = activeDocument
    ? markdownDocumentForEditor(activeDocument.editor)
    : null;
  const activeEditorKey =
    activeDocument && activeMarkdown
      ? serializeEditorId(activeDocument.id)
      : null;
  const activeContent = activeMarkdown
    ? currentDocumentContent(activeMarkdown)
    : null;

  // 1. Structural reconcile — parses only newly-seen documents, drops closed
  //    ones. Runs on every state change but re-parses nothing on a keystroke.
  useEffect(() => {
    setIndex((previous) =>
      syncMarkdownOutlineIndex(openDocumentsState, previous)
    );
  }, [openDocumentsState]);

  // 2. Tab switch — refresh the incoming active document now (populate the
  //    pane without waiting for the debounce); on leaving, flush the outgoing
  //    active document so edits made just before the switch are indexed.
  useEffect(() => {
    if (activeEditorKey === null) {
      return;
    }
    const editorKey = activeEditorKey;
    setIndex((previous) =>
      recomputeMarkdownOutlineDocument(stateRef.current, previous, editorKey)
    );
    return () => {
      setIndex((previous) =>
        recomputeMarkdownOutlineDocument(stateRef.current, previous, editorKey)
      );
    };
  }, [activeEditorKey]);

  // 3. Active-document editing — debounced re-parse of just the active doc.
  useEffect(() => {
    if (activeEditorKey === null) {
      return;
    }
    const editorKey = activeEditorKey;
    const handle = setTimeout(() => {
      setIndex((previous) =>
        recomputeMarkdownOutlineDocument(stateRef.current, previous, editorKey)
      );
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [activeEditorKey, activeContent, debounceMs]);

  const activeOutlineDocument = useMemo(
    () => markdownOutlineDocumentFor(index, activeDocument?.id ?? null),
    [index, activeDocument]
  );

  return {
    index,
    activeOutline: activeOutlineDocument?.outline ?? null,
    activeOutlineDocument
  };
}
