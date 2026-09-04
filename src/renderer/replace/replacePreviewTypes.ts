/**
 * #386 - shared types for the Replace Preview Dialog.
 *
 * The dialog is built once and reused for both replace scopes. Only
 * `openDocuments` is wired up in this phase; `projectDocuments` has its
 * config prepared so a later phase can connect it without changing the
 * component. NOTHING in this module or the dialog edits a buffer, marks a
 * document dirty, or writes a file.
 */

export type ReplacePreviewScope = "openDocuments" | "projectDocuments";

/**
 * The search conditions echoed in the dialog's summary so the user can do a
 * final "what am I replacing, and how" check. Mirrors the Search pane's
 * `SearchOptions` (regex and whole-word are mutually exclusive there, but the
 * summary stays readable even if both ever arrive `true`). Glossary Search is
 * not offered on the Replace tab, so it never appears here.
 */
export interface ReplacePreviewSearchOptions {
  readonly wholeWord: boolean;
  readonly caseSensitive: boolean;
  readonly useRegex: boolean;
}

/**
 * What a replace-scope button hands the host when it opens the dialog: just the
 * find / replace strings and options for the summary. The host opens the dialog
 * immediately (loading state) and generates the candidates asynchronously, so
 * they are NOT part of this request. Reused for both scopes.
 */
export interface ReplacePreviewOpenRequest {
  /** The current search query (already trimmed). */
  readonly findText: string;
  /** The replace-with text (verbatim, may be empty). */
  readonly replaceText: string;
  /** The active text-search options. */
  readonly searchOptions: ReplacePreviewSearchOptions;
}

/**
 * #386: the destructive (project) apply's outcome, once it settles. The
 * dialog renders this in place of the "cannot be undone" warning and keeps
 * the Close button disabled until it arrives - `null` means still running
 * (or not started).
 */
export type ReplaceApplyResult =
  | {
      readonly kind: "success";
      readonly replacementCount: number;
      readonly fileCount: number;
    }
  | {
      readonly kind: "partialFailure";
      readonly successFileCount: number;
      readonly failureFileCount: number;
    }
  | {
      readonly kind: "allFailure";
      /** `fileChanged` when every failure was a base-text mismatch (the file
       *  changed after the preview was built); `generic` otherwise. */
      readonly reason: "generic" | "fileChanged";
    };

/** One previewed replacement site. Self-contained for rendering. */
export interface ReplacePreviewCandidate {
  /** Stable unique id (used by bulk / row toggles and `onApplySelected`). */
  readonly id: string;
  /** Groups candidates in the dialog. Typically the file's relative path. */
  readonly fileId: string;
  /** Primary label for the file group (usually the file name). */
  readonly fileLabel: string;
  /** Optional secondary label for the file group (e.g. relative path). */
  readonly filePath?: string;
  /** 1-based line of the match. */
  readonly line: number;
  /** 1-based column of the match. */
  readonly column: number;
  /** Context immediately before the match (already clipped for display). */
  readonly contextBefore: string;
  /** Context immediately after the match (already clipped for display). */
  readonly contextAfter: string;
  /** `true` when text was clipped before `contextBefore`. */
  readonly truncatedStart: boolean;
  /** `true` when text was clipped after `contextAfter`. */
  readonly truncatedEnd: boolean;
  /** The current (matched) text — shown highlighted for an ignored row. */
  readonly beforeText: string;
  /** The proposed replacement text — shown highlighted for an applied row. */
  readonly afterText: string;
  /** Initial apply (`true`) / ignore (`false`) state. */
  readonly enabled: boolean;

  // --- #386 execution metadata (ignored by the dialog's rendering) ---------
  /** The open document this candidate belongs to (a serialized EditorId).
   *  Present for Open Documents Replace candidates; the host uses it to route
   *  the edit to the right editor buffer. */
  readonly documentId?: string;
  /** Match start offset in that buffer's current text (UTF-16 units). */
  readonly startOffset?: number;
  /** Match end offset in that buffer's current text (UTF-16 units). */
  readonly endOffset?: number;
}
