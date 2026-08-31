/**
 * #324: Move v1 — Phase A validation contract (dry run; the filesystem is
 * never mutated here). Phase B execution (#325) reuses these types to turn a
 * successful validation result straight into `fs.rename` pairs, and later
 * feeds the same source/destination absolute paths to the #320 Recovery
 * re-key mechanism.
 *
 * Move v1 handles FILES only: one or more file sources into a single
 * EXISTING destination folder. Folder move / subtree relocation / copy are
 * out of scope. Every path here is a project-root-relative path; the project
 * root is `""` (never `null`).
 *
 * This module is pure — types, the stable reason taxonomy, and small
 * string/length helpers. It has no `node` imports and performs no I/O.
 * `messageKey` / user-facing prose is intentionally absent: i18n belongs to
 * the follow-up Move UI issue.
 */

import type { RecoveryPathRekeyResult } from "./recoveryDocument";

/**
 * Re-exported so main modules on the project-DB / IPC path (which a
 * separation guard keeps free of any `recoveryDocument` reference) can name
 * the Recovery re-key result type without importing that module directly.
 */
export type { RecoveryPathRekeyResult } from "./recoveryDocument";

/**
 * Stable internal reason values. No user-facing prose — a follow-up UI issue
 * maps these to i18n keys.
 */
export type MoveEntriesValidationErrorReason =
  /** `sourceRelativePaths` was empty. */
  | "empty-sources"
  /** The same normalised source path appears more than once. */
  | "duplicate-source"
  /** A source resolves outside the current project root. */
  | "source-outside-project"
  /** A source contains a `.` / `..` path segment. */
  | "path-traversal"
  /** A source / destination string is not a usable project-relative path. */
  | "invalid-path"
  /** A source does not exist on disk. */
  | "source-not-found"
  /** A source exists but is not a regular file (folder / symlink / …). */
  | "source-not-file"
  /** A source is currently open in the editor with unsaved changes. */
  | "source-dirty-open-document"
  /** The destination folder resolves outside the current project root. */
  | "destination-outside-project"
  /** The destination folder does not exist on disk. */
  | "destination-not-found"
  /** The destination path exists but is not a folder. */
  | "destination-not-folder"
  /** A source already lives directly in the destination folder (no-op). */
  | "same-parent"
  /** The destination folder already contains an entry with the same name. */
  | "destination-conflict"
  /** The resulting destination path would exceed the path-length ceiling. */
  | "destination-path-too-long";

export const MOVE_ENTRIES_VALIDATION_ERROR_REASONS: readonly MoveEntriesValidationErrorReason[] =
  [
    "empty-sources",
    "duplicate-source",
    "source-outside-project",
    "path-traversal",
    "invalid-path",
    "source-not-found",
    "source-not-file",
    "source-dirty-open-document",
    "destination-outside-project",
    "destination-not-found",
    "destination-not-folder",
    "same-parent",
    "destination-conflict",
    "destination-path-too-long"
  ];

/**
 * One source that passed every Phase A check. Phase B (#325) `fs.rename`s
 * `sourceAbsolutePath` → `destinationAbsolutePath`; the relative forms feed
 * project-document identity updates and #320 Recovery re-keying.
 */
export interface ValidatedMoveEntry {
  readonly sourceRelativePath: string;
  /** `""` = project root. */
  readonly destinationFolderRelativePath: string;
  readonly destinationRelativePath: string;
  readonly sourceAbsolutePath: string;
  readonly destinationAbsolutePath: string;
}

export interface MoveEntriesValidationError {
  readonly reason: MoveEntriesValidationErrorReason;
  /** Present for a source-scoped failure. */
  readonly sourceRelativePath?: string;
  /** Present for a destination-scoped failure (`""` = project root). */
  readonly destinationFolderRelativePath?: string;
}

/**
 * All-or-nothing: `ok: true` only when every source validated. Any failure
 * yields `ok: false` with one error per distinct problem — no partial
 * `entries` list is ever returned alongside errors.
 */
export type MoveEntriesValidationResult =
  | { readonly ok: true; readonly entries: readonly ValidatedMoveEntry[] }
  | {
      readonly ok: false;
      readonly errors: readonly MoveEntriesValidationError[];
    };

/**
 * Conservative cross-platform ceiling for a resulting destination file's
 * ABSOLUTE path length, in UTF-16 code units.
 *
 * Assumption: there is no central project-path-length policy in the codebase
 * today (the only length reason, `nameTooLong`, surfaces from a live
 * `ENAMETOOLONG`). Phase A cannot call the filesystem to move a file, so it
 * pre-rejects against the classic Windows `MAX_PATH` (260) applied to the
 * whole absolute path — the tightest common limit. Phase B still surfaces a
 * real `ENAMETOOLONG` if the OS disagrees.
 */
export const MOVE_DESTINATION_MAX_ABSOLUTE_PATH_LENGTH = 260;

export function isMoveDestinationPathTooLong(
  destinationAbsolutePath: string
): boolean {
  return (
    destinationAbsolutePath.length > MOVE_DESTINATION_MAX_ABSOLUTE_PATH_LENGTH
  );
}

/**
 * Whether two entry names collide for Move-conflict purposes. Comparison is
 * Unicode NFC-normalised and case-insensitive, so `work.md` / `Work.md` and
 * an NFC vs NFD Japanese name are all treated as the same name — the safe
 * choice across case-insensitive (Windows/macOS) and Unicode-normalising
 * (APFS/HFS+) filesystems.
 */
export function moveEntryNamesConflict(
  leftName: string,
  rightName: string
): boolean {
  return (
    leftName.normalize("NFC").toLowerCase() ===
    rightName.normalize("NFC").toLowerCase()
  );
}

// ---------------------------------------------------------------------------
// #325: Move v1 — Phase B execution (`fs.rename`).
//
// `moveEntries` runs Phase A first; only a fully `ok: true` validation
// proceeds to sequential renames. Each rename is caught per entry — a
// failure never rolls back an earlier success and never stops a later entry
// (Phase A already vetted the batch; a Phase B failure is TOCTOU / external
// process / permission / disk / lock, and a half-rollback would only make
// the on-disk state harder to reason about). No user-facing prose: i18n
// belongs to the follow-up Move UI issue.
// ---------------------------------------------------------------------------

/** Stable internal reason values for an execution-time `fs.rename` failure. */
export type MoveEntryExecutionFailureReason =
  /** The source vanished between validation and the rename (ENOENT). */
  | "source-missing-during-execution"
  /** The destination name was taken between validation and the rename
   *  (EEXIST / ENOTEMPTY). */
  | "destination-conflict-during-execution"
  /** The OS refused the rename (EACCES / EPERM). */
  | "permission-denied"
  /** Any other `fs.rename` failure. */
  | "rename-failed";

export const MOVE_ENTRY_EXECUTION_FAILURE_REASONS: readonly MoveEntryExecutionFailureReason[] =
  [
    "source-missing-during-execution",
    "destination-conflict-during-execution",
    "permission-denied",
    "rename-failed"
  ];

interface MoveEntryLocation {
  readonly sourceRelativePath: string;
  readonly destinationRelativePath: string;
  readonly sourceAbsolutePath: string;
  readonly destinationAbsolutePath: string;
}

export type MoveEntryExecutionResult =
  | ({ readonly status: "moved" } & MoveEntryLocation)
  | ({
      readonly status: "failed";
      readonly reason: MoveEntryExecutionFailureReason;
    } & MoveEntryLocation);

/**
 * One successfully-moved file's old → new absolute path. #326 hands these to
 * the #320 best-effort Recovery re-key mechanism.
 */
export interface MoveEntryPathPair {
  readonly oldAbsolutePath: string;
  readonly newAbsolutePath: string;
}

/**
 * #326: best-effort Recovery re-key metadata attached to a Move result. It
 * is DIAGNOSTIC ONLY — it never influences `MoveEntriesResult.ok`.
 *
 *   - a #320 `RecoveryPathRekeyResult` when the re-key hook ran,
 *   - `{ skipped: "no-successful-path-pairs" }` when nothing moved so the
 *     hook was deliberately not called,
 *   - `{ failed: "threw" }` when the hook threw (Move already completed;
 *     the throw is swallowed).
 *
 * Absent entirely when no re-key hook was supplied.
 */
export type MoveEntriesRecoveryRekey =
  | RecoveryPathRekeyResult
  | { readonly skipped: "no-successful-path-pairs" }
  | { readonly failed: "threw" };

/**
 * `ok: true` only when Phase A passed AND every `fs.rename` succeeded —
 * Recovery re-key (`recoveryRekey`) is best-effort and never affects it.
 *
 *   - validation failure → `ok: false`, `validation.ok: false`, empty
 *     `results` / `successfulPathPairs`, NO `fs.rename` and NO Recovery
 *     re-key attempted.
 *   - partial execution failure → `ok: false`, `validation.ok: true`,
 *     per-entry `results`, `successfulPathPairs` for the moved entries only,
 *     and the moved pairs handed to Recovery re-key.
 */
export type MoveEntriesResult =
  | {
      readonly ok: true;
      readonly validation: { readonly ok: true };
      readonly results: readonly MoveEntryExecutionResult[];
      readonly successfulPathPairs: readonly MoveEntryPathPair[];
      readonly recoveryRekey?: MoveEntriesRecoveryRekey;
    }
  | {
      readonly ok: false;
      readonly validation: MoveEntriesValidationResult | { readonly ok: true };
      readonly results: readonly MoveEntryExecutionResult[];
      readonly successfulPathPairs: readonly MoveEntryPathPair[];
      readonly recoveryRekey?: MoveEntriesRecoveryRekey;
    };
