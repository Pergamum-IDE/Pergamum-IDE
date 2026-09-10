/**
 * #425 follow-up — the process-lived "Active Find session".
 *
 * Split into two scopes:
 *
 *   - {@link ActiveFindUiState} (`open` / `mode`) is SURFACE / window global. The
 *     panel being open, and whether it shows Find or Replace, follows the user
 *     across Markdown tabs and survives a Settings / Project Settings round trip
 *     (which unmounts `EditorSurface` entirely).
 *
 *   - {@link ActiveFindDocumentState} (query, replace text, search options,
 *     glossary conditions, mark-all) is per `documentKey`. Active Find is a
 *     search UI for the ACTIVE document — carrying one query across files is
 *     Project-wide Search's job — so each document tab keeps its own. Switching
 *     to a never-searched document shows the defaults.
 *
 * Everything document-DERIVED — the match list, current-match index, editor
 * decorations, gutter markers, the match count — is recomputed by
 * `MarkdownEditorSurface` for whichever document is active and is NEVER stored
 * here (a match offset from document A is meaningless in document B).
 *
 * One renderer, one active-document Find surface at a time (see
 * `activeFindKeymapExtension.ts`). Tests reset via {@link resetActiveFindSession}.
 * Not persisted to disk.
 */

import {
  DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
  type ActiveDocumentFindOptions
} from "./activeDocumentFind";
import type { ActiveFindPanelMode } from "./activeFindKeymapExtension";
import type { ActiveGlossarySearchRelation } from "./activeGlossaryFind";

/** Surface-global: survives both a Markdown tab switch and an EditorSurface remount. */
export interface ActiveFindUiState {
  /** Panel visible. `false` after an explicit close — a tab switch never flips this. */
  readonly open: boolean;
  readonly mode: ActiveFindPanelMode;
}

/** Per-`documentKey`: the search conditions the user set for THAT document. */
export interface ActiveFindDocumentState {
  readonly query: string;
  readonly replaceText: string;
  readonly queryKind: "text" | "glossary";
  /** `caseSensitive` / `wholeWord` / `useRegex`. */
  readonly options: ActiveDocumentFindOptions;
  readonly glossaryRelation: ActiveGlossarySearchRelation;
  readonly searchGlossaryAtomIds: readonly string[];
  readonly replaceGlossaryAtomId: string | null;
  readonly markAll: boolean;
}

export const DEFAULT_ACTIVE_FIND_UI_STATE: ActiveFindUiState = {
  open: false,
  mode: "search"
};

export const DEFAULT_ACTIVE_FIND_DOCUMENT_STATE: ActiveFindDocumentState = {
  query: "",
  replaceText: "",
  queryKind: "text",
  options: DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
  glossaryRelation: "any",
  searchGlossaryAtomIds: [],
  replaceGlossaryAtomId: null,
  markAll: true
};

let uiState: ActiveFindUiState = DEFAULT_ACTIVE_FIND_UI_STATE;
const documentStates = new Map<string, ActiveFindDocumentState>();

/** The surface-global UI state to seed a (re)mounting `MarkdownEditorSurface`. */
export function getActiveFindUiState(): ActiveFindUiState {
  return uiState;
}

export function setActiveFindUiState(next: ActiveFindUiState): void {
  uiState = next;
}

/** That document's saved search conditions, or the defaults if it has none. */
export function getActiveFindDocumentState(
  documentKey: string
): ActiveFindDocumentState {
  return documentStates.get(documentKey) ?? DEFAULT_ACTIVE_FIND_DOCUMENT_STATE;
}

/**
 * Privacy-safe shape of the session for a debug log — booleans / counts only,
 * NEVER a query / replace / selection string.
 */
export function getActiveFindSessionSummary(): {
  readonly open: boolean;
  readonly mode: ActiveFindPanelMode;
  readonly documentStateCount: number;
} {
  return {
    open: uiState.open,
    mode: uiState.mode,
    documentStateCount: documentStates.size
  };
}

export function setActiveFindDocumentState(
  documentKey: string,
  next: ActiveFindDocumentState
): void {
  documentStates.set(documentKey, next);
}

/** Back to defaults (panel closed, every document's conditions cleared). Tests / a full reset. */
export function resetActiveFindSession(): void {
  uiState = DEFAULT_ACTIVE_FIND_UI_STATE;
  documentStates.clear();
}
