/**
 * #351: the File Explorer delete-confirmation dialog's per-row execution
 * state, as a pure helper (no React, no DOM).
 *
 * The dialog lists every target (files first, then folders deepest-first —
 * `orderFileExplorerDeleteTargets`) and, on confirm, drives a renderer-side
 * loop calling `deleteFileExplorerEntry` once per row, moving each row
 * through: `pending` -> `deleting` -> `deleted` / `failed`. On abort, every
 * row still `pending` becomes `aborted`; rows already `deleted` / `failed`
 * are left as-is (abort is not a rollback — ADR-0011 DEL-15).
 */

import type {
  FileExplorerDeleteExecutionFailureReason,
  FileExplorerDeleteTarget
} from "../shared/fileExplorerDelete";

export type FileExplorerDeleteRowStatus =
  | "pending"
  | "deleting"
  | "deleted"
  /** `ENOENT` — the entry was already gone; the end state matches the
   *  intent, so it counts as resolved and is never re-run on a retry. */
  | "already-absent"
  | "failed"
  | "aborted";

export interface FileExplorerDeleteRowState {
  readonly relativePath: string;
  readonly status: FileExplorerDeleteRowStatus;
  readonly failureReason: FileExplorerDeleteExecutionFailureReason | null;
}

export function initFileExplorerDeleteRows(
  targets: readonly FileExplorerDeleteTarget[]
): readonly FileExplorerDeleteRowState[] {
  return targets.map((target) => ({
    relativePath: target.relativePath,
    status: "pending" as const,
    failureReason: null
  }));
}

export function setFileExplorerDeleteRowStatus(
  rows: readonly FileExplorerDeleteRowState[],
  relativePath: string,
  status: FileExplorerDeleteRowStatus,
  failureReason: FileExplorerDeleteExecutionFailureReason | null = null
): readonly FileExplorerDeleteRowState[] {
  return rows.map((row) =>
    row.relativePath === relativePath
      ? { ...row, status, failureReason }
      : row
  );
}

/** Every row still `pending` becomes `aborted`. In-flight / settled rows are
 *  untouched. */
export function abortPendingFileExplorerDeleteRows(
  rows: readonly FileExplorerDeleteRowState[]
): readonly FileExplorerDeleteRowState[] {
  return rows.map((row) =>
    row.status === "pending"
      ? { ...row, status: "aborted" as const }
      : row
  );
}

/**
 * A row whose end state already matches the intent — the entry is gone
 * (`deleted` or `already-absent`). Such a row is NEVER re-run by a retry.
 */
export function isFileExplorerDeleteRowResolved(
  row: FileExplorerDeleteRowState
): boolean {
  return row.status === "deleted" || row.status === "already-absent";
}

/**
 * Prepare `rows` for a RETRY run: every not-yet-resolved row (`failed` /
 * `aborted` / `pending` / a stray `deleting`) goes back to `pending`;
 * resolved rows (`deleted` / `already-absent`) are kept exactly as-is so
 * nothing is deleted twice.
 */
export function resetFileExplorerDeleteRowsForRerun(
  rows: readonly FileExplorerDeleteRowState[]
): readonly FileExplorerDeleteRowState[] {
  return rows.map((row) =>
    isFileExplorerDeleteRowResolved(row)
      ? row
      : { ...row, status: "pending" as const, failureReason: null }
  );
}

export interface FileExplorerDeleteRunSummary {
  readonly total: number;
  /** rows with status `deleted`. */
  readonly deleted: number;
  /** rows with status `already-absent` (`ENOENT` — gone before we ran). */
  readonly alreadyAbsent: number;
  readonly failed: number;
  readonly aborted: number;
  /** rows still `pending` or `deleting`. */
  readonly pending: number;
  /** `deleted + alreadyAbsent` — the entry is gone. */
  readonly resolved: number;
  /** `failed + aborted + pending` — the rows a retry run would re-attempt. */
  readonly retryable: number;
  /** every row resolved and there is at least one row: nothing left to do. */
  readonly allResolved: boolean;
  /** no row still `pending` / `deleting`. */
  readonly settled: boolean;
}

export function summarizeFileExplorerDeleteRun(
  rows: readonly FileExplorerDeleteRowState[]
): FileExplorerDeleteRunSummary {
  let deleted = 0;
  let alreadyAbsent = 0;
  let failed = 0;
  let aborted = 0;
  let pending = 0;

  for (const row of rows) {
    switch (row.status) {
      case "deleted":
        deleted += 1;
        break;
      case "already-absent":
        alreadyAbsent += 1;
        break;
      case "failed":
        failed += 1;
        break;
      case "aborted":
        aborted += 1;
        break;
      default:
        pending += 1;
        break;
    }
  }

  const resolved = deleted + alreadyAbsent;
  const retryable = failed + aborted + pending;

  return {
    total: rows.length,
    deleted,
    alreadyAbsent,
    failed,
    aborted,
    pending,
    resolved,
    retryable,
    allResolved: rows.length > 0 && retryable === 0,
    settled: pending === 0
  };
}
