/**
 * #420 Step 3: pure state + label helpers for {@link BulkTextImportDialog}.
 *
 * The dialog is a dry-run UI: pick a destination folder, add external
 * `.txt` files / folders, and see the {@link TextImportDryRunResult} main
 * computes. No import is executed in Step 3.
 *
 * This module holds only serialisable state and pure derivations so the
 * dedup / dry-run-trigger / stale-response rules are unit-testable without a
 * DOM.
 */

import type {
  TextImportBomKind,
  TextImportDryRunResult,
  TextImportEncoding,
  TextImportSkipReason
} from "../../shared/textImport";
import type { TranslationKey } from "../../shared/i18n";

export type BulkTextImportDryRunStatus =
  | "idle"
  | "loading"
  | "ready"
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
}

export function createInitialBulkTextImportDialogState(): BulkTextImportDialogState {
  return {
    destinationFolderProjectRelativePath: null,
    sourcePaths: [],
    dryRunStatus: "idle",
    dryRunResult: undefined,
    dryRunRequestId: 0
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
