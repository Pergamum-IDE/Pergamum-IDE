/**
 * #420 Step 3 + 4: pure state + label helpers for {@link BulkTextImportDialog}.
 *
 * The dialog is a dry-run UI: pick a destination folder, add external
 * `.txt` files / folders, and see the {@link TextImportDryRunResult} main
 * computes. Step 4 adds a per-file **encoding dropdown** whose changes drive
 * `previewTextImportFiles` (preview only — never a fresh dry-run). No import
 * is executed yet.
 *
 * This module holds only serialisable state and pure derivations so the
 * dedup / dry-run-trigger / stale-response / encoding-editability /
 * preview-apply rules are unit-testable without a DOM.
 */

import type {
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
}

export function createInitialBulkTextImportDialogState(): BulkTextImportDialogState {
  return {
    destinationFolderProjectRelativePath: null,
    sourcePaths: [],
    dryRunStatus: "idle",
    dryRunResult: undefined,
    dryRunRequestId: 0,
    fileRows: []
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
 * (non-skipped) row, or a `decodeFailed` row that still has a source path to
 * re-read. Every other skip reason (`notTextFile`, `invalidProjectPath`,
 * `targetExists`, `sourceMissing`, `sourceUnreadable`, `unsupportedSource`)
 * is left disabled — an encoding change cannot fix any of them.
 */
export function isTextImportEncodingEditable(
  row: Pick<
    BulkTextImportFileRowViewState,
    "sourcePath" | "skipped" | "skipReason"
  >
): boolean {
  if (row.sourcePath.length === 0) {
    return false;
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
 * Set a row's chosen encoding and move it into `loading`, tagged with
 * `previewRequestId`. Returns the same array reference when nothing changes
 * (row missing, not editable, or already on that encoding).
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
    if (!isTextImportEncodingEditable(row) || row.selectedEncoding === encoding) {
      return row;
    }
    changed = true;
    return {
      ...row,
      selectedEncoding: encoding,
      previewStatus: "loading" as const,
      previewErrorReason: undefined,
      previewRequestId
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
