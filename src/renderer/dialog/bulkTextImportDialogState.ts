/**
 * #420 Step 3 + 4 + 5: pure state + label helpers for
 * {@link BulkTextImportDialog}.
 *
 * The dialog is a dry-run UI: pick a destination folder, add external
 * `.txt` files / folders, and see the {@link TextImportDryRunResult} main
 * computes. Step 4 adds a per-file **encoding dropdown** whose changes drive
 * `previewTextImportFiles` (preview only — never a fresh dry-run). Step 5
 * adds the actual **import execution** (`executeTextImport`) with an
 * importable-row filter, an in-flight status, and a result summary.
 *
 * This module holds only serialisable state and pure derivations so the
 * dedup / dry-run-trigger / stale-response / encoding-editability /
 * preview-apply / manual-skip / importable-row / execute-request rules are
 * unit-testable without a DOM.
 */

import type {
  ExecuteTextImportFileRequest,
  ExecuteTextImportResult,
  PreviewTextImportFilePreviewResult,
  TextImportBomKind,
  TextImportDryRunResult,
  TextImportEncoding,
  TextImportPreviewFailureReason,
  TextImportSkipReason
} from "../../shared/textImport";
import type { TranslationKey } from "../../shared/i18n";

export type BulkTextImportDryRunStatus =
  | "idle"
  | "loading"
  | "ready"
  | "failed";

/** Per-file-row preview lifecycle for the Step 4 encoding dropdown. */
export type TextImportPreviewStatus = "idle" | "loading" | "ready" | "failed";

/**
 * `"updateFailed"` marks a batch-level failure (`previewTextImportFiles`
 * returned `ok:false`, or the callback threw) — distinct from a per-file
 * decode/read failure, which carries a {@link TextImportPreviewFailureReason}.
 */
export type TextImportPreviewErrorReason =
  | TextImportPreviewFailureReason
  | "updateFailed";

/**
 * The UI's own view of one importable file. Kept **separate** from the
 * dry-run result: `selectedEncoding` / `previewHead` / `previewTail` /
 * `bomKind` are mutated locally when the user changes the encoding, and a
 * fresh dry-run rebuilds the whole list from scratch.
 */
export interface BulkTextImportFileRowViewState {
  /** Stable row key === the dry-run file id; also the preview-request id. */
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceDisplayPath: string;
  readonly targetProjectRelativePath: string;
  readonly renamed: boolean;
  readonly skipped: boolean;
  readonly skipReason?: TextImportSkipReason;
  /**
   * Row-local UI action from the encoding dropdown. Distinct from the dry-run
   * `skipped` / `skipReason` plan and never stored as a TextImportEncoding.
   */
  readonly manualSkipped: boolean;
  readonly selectedEncoding: TextImportEncoding;
  readonly bomKind: TextImportBomKind;
  readonly previewHead: string;
  readonly previewTail: string;
  readonly previewStatus: TextImportPreviewStatus;
  readonly previewErrorReason?: TextImportPreviewErrorReason;
  /** Monotonic id of the preview request this row's preview belongs to. */
  readonly previewRequestId?: number;
  /**
   * A `decodeFailed` dry-run row whose encoding change produced a working
   * preview — the original skip is downgraded to an informational note.
   */
  readonly decodeRecovered: boolean;
}

/** #420 Step 5: lifecycle of the one-shot `executeTextImport` call. */
export type TextImportExecutionStatus =
  | "idle"
  | "importing"
  | "completed"
  | "failed";

export interface BulkTextImportDialogState {
  /** `null` = not chosen yet; `""` = the project root. */
  readonly destinationFolderProjectRelativePath: string | null;
  /** Absolute external paths, in add order, no duplicates. */
  readonly sourcePaths: readonly string[];
  readonly dryRunStatus: BulkTextImportDryRunStatus;
  readonly dryRunResult?: TextImportDryRunResult;
  /**
   * Monotonic id of the dry-run request the current `dryRunResult` /
   * `dryRunStatus` belongs to. A response tagged with an older id is stale
   * and dropped.
   */
  readonly dryRunRequestId: number;
  /**
   * The editable per-file view rows, rebuilt from every successful dry-run.
   * Empty until the first `ok` dry-run result.
   */
  readonly fileRows: readonly BulkTextImportFileRowViewState[];
  /** #420 Step 5: import execution status. */
  readonly executionStatus: TextImportExecutionStatus;
  /**
   * Monotonic id of the execute request the current `executionResult` /
   * `executionStatus` belongs to. A response tagged with an older id is
   * stale (only reachable via close / input change, never a second run).
   */
  readonly executionRequestId: number;
  /** The `executeTextImport` result, once one has come back. */
  readonly executionResult?: ExecuteTextImportResult;
  /** Message for a thrown / transport-level execute failure. */
  readonly executionErrorMessage?: string;
}

export function createInitialBulkTextImportDialogState(): BulkTextImportDialogState {
  return {
    destinationFolderProjectRelativePath: null,
    sourcePaths: [],
    dryRunStatus: "idle",
    dryRunResult: undefined,
    dryRunRequestId: 0,
    fileRows: [],
    executionStatus: "idle",
    executionRequestId: 0,
    executionResult: undefined,
    executionErrorMessage: undefined
  };
}

/**
 * Drop any prior import result. Called whenever the destination, the source
 * set, or a row encoding changes so a stale success / failure summary never
 * lingers over fresh inputs. `executionRequestId` stays monotonic so a
 * response from the dropped run is still recognised as stale.
 */
export function resetTextImportExecutionState(
  state: BulkTextImportDialogState
): BulkTextImportDialogState {
  if (
    state.executionStatus === "idle" &&
    state.executionResult === undefined &&
    state.executionErrorMessage === undefined
  ) {
    return state;
  }
  return {
    ...state,
    executionStatus: "idle",
    executionResult: undefined,
    executionErrorMessage: undefined
  };
}

/** Append `paths`, keeping add order and dropping duplicates / blanks. */
export function addSourcePaths(
  current: readonly string[],
  paths: readonly string[]
): readonly string[] {
  const seen = new Set(current);
  const next = [...current];
  for (const path of paths) {
    const trimmed = path.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next.length === current.length ? current : next;
}

export function removeSourcePath(
  current: readonly string[],
  path: string
): readonly string[] {
  const next = current.filter((entry) => entry !== path);
  return next.length === current.length ? current : next;
}

/**
 * `true` once both a destination folder (root counts) and at least one
 * source path are set — the only time a dry-run should run.
 */
export function bulkTextImportInputsReady(
  state: Pick<
    BulkTextImportDialogState,
    "destinationFolderProjectRelativePath" | "sourcePaths"
  >
): boolean {
  return (
    state.destinationFolderProjectRelativePath !== null &&
    state.sourcePaths.length > 0
  );
}

/** A stable key for the current dry-run inputs; a change ⟹ re-run. */
export function bulkTextImportInputsKey(
  state: Pick<
    BulkTextImportDialogState,
    "destinationFolderProjectRelativePath" | "sourcePaths"
  >
): string {
  return JSON.stringify([
    state.destinationFolderProjectRelativePath,
    state.sourcePaths
  ]);
}

/** `true` when a dry-run response tagged `responseRequestId` is out of date. */
export function isStaleDryRunResponse(
  state: Pick<BulkTextImportDialogState, "dryRunRequestId">,
  responseRequestId: number
): boolean {
  return responseRequestId !== state.dryRunRequestId;
}

// ---------------------------------------------------------------------------
// #420 Step 4: per-file encoding + preview row state
// ---------------------------------------------------------------------------

/**
 * `true` when the user may pick a different encoding for this row: a normal
 * (non-skipped) row, a manually skipped row, or a `decodeFailed` row that
 * still has a source path to re-read. Every other skip reason (`notTextFile`,
 * `invalidProjectPath`, `targetExists`, `sourceMissing`, `sourceUnreadable`,
 * `unsupportedSource`) is left disabled — an encoding change cannot fix any
 * of them.
 */
export function isTextImportEncodingEditable(
  row: Pick<
    BulkTextImportFileRowViewState,
    "sourcePath" | "skipped" | "skipReason" | "manualSkipped"
  >
): boolean {
  if (row.sourcePath.length === 0) {
    return false;
  }
  if (row.manualSkipped) {
    return true;
  }
  if (!row.skipped) {
    return true;
  }
  return row.skipReason === "decodeFailed";
}

/** Build one editable view row from a dry-run file entry. */
export function createFileRowViewState(file: {
  readonly id: string;
  readonly sourcePath: string;
  readonly sourceDisplayPath: string;
  readonly targetProjectRelativePath: string;
  readonly selectedEncoding: TextImportEncoding;
  readonly bomKind: TextImportBomKind;
  readonly renamed: boolean;
  readonly skipped: boolean;
  readonly skipReason?: TextImportSkipReason;
  readonly previewHead: string;
  readonly previewTail: string;
}): BulkTextImportFileRowViewState {
  return {
    id: file.id,
    sourcePath: file.sourcePath,
    sourceDisplayPath: file.sourceDisplayPath,
    targetProjectRelativePath: file.targetProjectRelativePath,
    renamed: file.renamed,
    skipped: file.skipped,
    skipReason: file.skipReason,
    manualSkipped: false,
    selectedEncoding: file.selectedEncoding,
    bomKind: file.bomKind,
    previewHead: file.previewHead,
    previewTail: file.previewTail,
    previewStatus: "idle",
    previewErrorReason: undefined,
    previewRequestId: undefined,
    decodeRecovered: false
  };
}

/**
 * Rebuild the whole editable row list from a successful dry-run result. A
 * non-`ok` result clears the rows. Rows are intentionally reset to the
 * dry-run's own `selectedEncoding` — carrying a user's earlier choice across
 * a fresh dry-run is a Step 5 refinement, and resetting keeps stale-response
 * handling simple.
 */
export function buildFileRowViewStates(
  dryRunResult: TextImportDryRunResult | undefined
): readonly BulkTextImportFileRowViewState[] {
  if (!dryRunResult || !dryRunResult.ok) {
    return [];
  }
  return dryRunResult.files.map((file) => createFileRowViewState(file));
}

/**
 * Set a row's chosen encoding, clear any manual skip, and move it into
 * `loading`, tagged with `previewRequestId`. Returns the same array reference
 * when nothing changes (row missing, not editable, or already on that encoding
 * without a manual skip to clear).
 */
export function applySelectedEncoding(
  rows: readonly BulkTextImportFileRowViewState[],
  rowId: string,
  encoding: TextImportEncoding,
  previewRequestId: number
): readonly BulkTextImportFileRowViewState[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId) {
      return row;
    }
    if (
      !isTextImportEncodingEditable(row) ||
      (row.selectedEncoding === encoding && !row.manualSkipped)
    ) {
      return row;
    }
    changed = true;
    return {
      ...row,
      manualSkipped: false,
      selectedEncoding: encoding,
      previewStatus: "loading" as const,
      previewErrorReason: undefined,
      previewRequestId
    };
  });
  return changed ? next : rows;
}

/**
 * Mark one row as manually skipped from the dropdown. Any in-flight preview
 * request for this row is invalidated by clearing `previewRequestId`.
 */
export function applyManualSkip(
  rows: readonly BulkTextImportFileRowViewState[],
  rowId: string
): readonly BulkTextImportFileRowViewState[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId || !isTextImportEncodingEditable(row)) {
      return row;
    }
    if (
      row.manualSkipped &&
      row.previewStatus === "idle" &&
      row.previewErrorReason === undefined &&
      row.previewRequestId === undefined
    ) {
      return row;
    }
    changed = true;
    return {
      ...row,
      manualSkipped: true,
      previewStatus: "idle" as const,
      previewErrorReason: undefined,
      previewRequestId: undefined
    };
  });
  return changed ? next : rows;
}

/** `true` when a preview response tagged `responseRequestId` no longer matches the row. */
export function isStalePreviewResponse(
  row: Pick<BulkTextImportFileRowViewState, "previewRequestId"> | undefined,
  responseRequestId: number
): boolean {
  return row === undefined || row.previewRequestId !== responseRequestId;
}

/**
 * Apply a successful per-file preview to its row, if that row is still
 * waiting for exactly this `previewRequestId`. A `decodeFailed` dry-run row
 * is marked `decodeRecovered` so the UI can downgrade its skip note.
 */
export function applyPreviewSuccess(
  rows: readonly BulkTextImportFileRowViewState[],
  rowId: string,
  previewRequestId: number,
  preview: Pick<
    Extract<PreviewTextImportFilePreviewResult, { ok: true }>,
    "previewHead" | "previewTail" | "bomKind"
  >
): readonly BulkTextImportFileRowViewState[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId || isStalePreviewResponse(row, previewRequestId)) {
      return row;
    }
    changed = true;
    return {
      ...row,
      manualSkipped: false,
      previewHead: preview.previewHead,
      previewTail: preview.previewTail,
      bomKind: preview.bomKind,
      previewStatus: "ready" as const,
      previewErrorReason: undefined,
      decodeRecovered: row.skipReason === "decodeFailed" ? true : row.decodeRecovered
    };
  });
  return changed ? next : rows;
}

/**
 * Move a row to `failed`, if it is still waiting for this `previewRequestId`.
 * `reason` is a per-file {@link TextImportPreviewFailureReason} or the
 * batch-level `"updateFailed"` marker.
 */
export function applyPreviewFailure(
  rows: readonly BulkTextImportFileRowViewState[],
  rowId: string,
  previewRequestId: number,
  reason?: TextImportPreviewErrorReason
): readonly BulkTextImportFileRowViewState[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== rowId || isStalePreviewResponse(row, previewRequestId)) {
      return row;
    }
    changed = true;
    return {
      ...row,
      previewStatus: "failed" as const,
      previewErrorReason: reason
    };
  });
  return changed ? next : rows;
}

const PREVIEW_FAILURE_REASON_KEYS: Record<
  TextImportPreviewFailureReason,
  TranslationKey
> = {
  sourceMissing: "textImport.dialog.skipReason.sourceMissing",
  sourceUnreadable: "textImport.dialog.skipReason.sourceUnreadable",
  decodeFailed: "textImport.dialog.skipReason.decodeFailed"
};

/** Translation key describing why a per-file preview failed. */
export function textImportPreviewFailureReasonKey(
  reason: TextImportPreviewFailureReason
): TranslationKey {
  return PREVIEW_FAILURE_REASON_KEYS[reason];
}

/** `true` when `reason` is a concrete per-file preview failure (not `"updateFailed"`). */
export function isTextImportPreviewFailureReason(
  reason: TextImportPreviewErrorReason | undefined
): reason is TextImportPreviewFailureReason {
  return (
    reason === "sourceMissing" ||
    reason === "sourceUnreadable" ||
    reason === "decodeFailed"
  );
}

// ---------------------------------------------------------------------------
// #420 Step 5: importable-row filter + execute request + result summary
// ---------------------------------------------------------------------------

/**
 * `true` when this row should be sent to `executeTextImport`:
 *
 * - it has both a source path and a target project-relative path,
 * - it has not been manually skipped from the row dropdown,
 * - its preview is not mid-update (`loading`) and did not fail (`failed`),
 * - and it is either a normal (non-skipped) row, **or** a `decodeFailed`
 *   dry-run row the user rescued by changing the encoding
 *   (`decodeRecovered` + a `ready` preview).
 *
 * Every other skip reason (`targetExists`, `notTextFile`, `sourceMissing`,
 * …) stays out — an import cannot fix those here.
 */
export function isTextImportRowImportable(
  row: BulkTextImportFileRowViewState
): boolean {
  if (
    row.sourcePath.length === 0 ||
    row.targetProjectRelativePath.length === 0
  ) {
    return false;
  }
  if (row.manualSkipped) {
    return false;
  }
  if (row.previewStatus === "loading" || row.previewStatus === "failed") {
    return false;
  }
  if (!row.skipped) {
    return true;
  }
  return (
    row.skipReason === "decodeFailed" &&
    row.decodeRecovered &&
    row.previewStatus === "ready"
  );
}

/** The importable subset of `rows`, in display order. */
export function collectImportableTextImportRows(
  rows: readonly BulkTextImportFileRowViewState[]
): readonly BulkTextImportFileRowViewState[] {
  return rows.filter((row) => isTextImportRowImportable(row));
}

/**
 * Build the `files` array for an `executeTextImport` request from the current
 * row view-state. Only importable rows are included, and each carries the
 * **row-local** `selectedEncoding` (the Step 4 dropdown value, not the
 * dry-run's original guess). `skipped` / `skipReason` are deliberately left
 * unset: an included row is meant to be written, and a recovered
 * `decodeFailed` row must not be treated as skipped by the main process.
 */
export function buildExecuteTextImportFileRequests(
  rows: readonly BulkTextImportFileRowViewState[]
): readonly ExecuteTextImportFileRequest[] {
  return collectImportableTextImportRows(rows).map((row) => ({
    sourcePath: row.sourcePath,
    targetProjectRelativePath: row.targetProjectRelativePath,
    encoding: row.selectedEncoding
  }));
}

/**
 * `true` when the Import button may be enabled: a destination is chosen, the
 * dry-run is `ready`, no preview is mid-update, no import is running and
 * none has completed on these inputs, and at least one row is importable.
 * (The component also requires the dialog to be open and an `onExecute`
 * callback to be present.)
 */
export function bulkTextImportCanExecute(
  state: BulkTextImportDialogState
): boolean {
  if (state.destinationFolderProjectRelativePath === null) {
    return false;
  }
  if (state.dryRunStatus !== "ready") {
    return false;
  }
  if (
    state.executionStatus === "importing" ||
    state.executionStatus === "completed"
  ) {
    return false;
  }
  if (state.fileRows.some((row) => row.previewStatus === "loading")) {
    return false;
  }
  return collectImportableTextImportRows(state.fileRows).length > 0;
}

/** Move state into `importing`, tagged with `executionRequestId`. */
export function applyTextImportExecutionStart(
  state: BulkTextImportDialogState,
  executionRequestId: number
): BulkTextImportDialogState {
  return {
    ...state,
    executionStatus: "importing",
    executionRequestId,
    executionResult: undefined,
    executionErrorMessage: undefined
  };
}

/** `true` when an execute response tagged `responseRequestId` is out of date. */
export function isStaleTextImportExecutionResponse(
  state: Pick<BulkTextImportDialogState, "executionRequestId">,
  responseRequestId: number
): boolean {
  return responseRequestId !== state.executionRequestId;
}

export type TextImportExecutionSummaryKind =
  | "completed"
  | "partial"
  | "failed";

/**
 * Classify a finished `executeTextImport` result for the summary banner:
 *
 * - `failed`  — top-level failure, or `ok` but nothing was imported,
 * - `partial` — some files imported, some skipped / failed,
 * - `completed` — every file imported.
 */
export function textImportExecutionSummaryKind(
  result: ExecuteTextImportResult
): TextImportExecutionSummaryKind {
  if (!result.ok) {
    return "failed";
  }
  if (result.imported.length === 0) {
    return "failed";
  }
  if (result.failed.length > 0 || result.skipped.length > 0) {
    return "partial";
  }
  return "completed";
}

const EXECUTION_SUMMARY_KEYS: Record<
  TextImportExecutionSummaryKind,
  TranslationKey
> = {
  completed: "textImport.dialog.importCompleted",
  partial: "textImport.dialog.importPartialFailure",
  failed: "textImport.dialog.importFailed"
};

export function textImportExecutionSummaryKey(
  kind: TextImportExecutionSummaryKind
): TranslationKey {
  return EXECUTION_SUMMARY_KEYS[kind];
}

const SKIP_REASON_KEYS: Record<TextImportSkipReason, TranslationKey> = {
  notTextFile: "textImport.dialog.skipReason.notTextFile",
  invalidProjectPath: "textImport.dialog.skipReason.invalidProjectPath",
  targetExists: "textImport.dialog.skipReason.targetExists",
  sourceMissing: "textImport.dialog.skipReason.sourceMissing",
  sourceUnreadable: "textImport.dialog.skipReason.sourceUnreadable",
  decodeFailed: "textImport.dialog.skipReason.decodeFailed",
  unsupportedSource: "textImport.dialog.skipReason.unsupportedSource"
};

export function textImportSkipReasonKey(
  reason: TextImportSkipReason
): TranslationKey {
  return SKIP_REASON_KEYS[reason];
}

const ENCODING_NAME_KEYS: Record<TextImportEncoding, TranslationKey> = {
  utf8: "textImport.dialog.encodingName.utf8",
  utf8Bom: "textImport.dialog.encodingName.utf8Bom",
  shiftJis: "textImport.dialog.encodingName.shiftJis",
  eucJp: "textImport.dialog.encodingName.eucJp",
  utf16le: "textImport.dialog.encodingName.utf16le",
  utf16be: "textImport.dialog.encodingName.utf16be",
  iso2022Jp: "textImport.dialog.encodingName.iso2022Jp"
};

export function textImportEncodingNameKey(
  encoding: TextImportEncoding
): TranslationKey {
  return ENCODING_NAME_KEYS[encoding];
}

const BOM_KIND_KEYS: Record<TextImportBomKind, TranslationKey> = {
  none: "textImport.dialog.bomKind.none",
  utf8: "textImport.dialog.bomKind.utf8",
  utf16le: "textImport.dialog.bomKind.utf16le",
  utf16be: "textImport.dialog.bomKind.utf16be"
};

export function textImportBomKindKey(
  bomKind: TextImportBomKind
): TranslationKey {
  return BOM_KIND_KEYS[bomKind];
}

/** The `{folder}` shown for a chosen destination (`""` → project root). */
export function bulkTextImportDestinationLabel(
  destinationFolderProjectRelativePath: string,
  rootLabel: string
): string {
  return destinationFolderProjectRelativePath.length === 0
    ? rootLabel
    : destinationFolderProjectRelativePath;
}
