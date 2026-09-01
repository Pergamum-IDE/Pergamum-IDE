/**
 * #356: File Explorer project-local COPY — pure types, the stable reason
 * taxonomy, and the deterministic "Duplicate" copy-name ladder.
 *
 * Copy v1 is D&D-only. It never overwrites: a name collision at the
 * destination is always resolved by walking the copy-name ladder
 * (`chapter.md` → `chapter copy.md` → `chapter copy 2.md`, `notes/` →
 * `notes copy/` → `notes copy 2/`). The Main Process validator
 * (`planCopyEntries`) is authoritative — it produces a PLAN (a dry run) that
 * the renderer shows in a confirmation dialog, then `executeCopyPlan` copies
 * exactly what the plan said.
 *
 * This module is pure — no `node` imports, no I/O. It mirrors
 * `src/shared/projectMove.ts` in spirit; where the semantics are identical
 * (NFC + case-fold name comparison, absolute-path ceiling) it reuses that
 * module's helpers rather than re-deriving them.
 */

import { isMoveDestinationPathTooLong, moveEntryNamesConflict } from "./projectMove";

export {
  isMoveDestinationPathTooLong as isCopyDestinationPathTooLong,
  moveEntryNamesConflict as copyEntryNamesConflict
};

/**
 * Why a single source cannot be copied (dry-run / plan time). A blocked row
 * carries exactly one of these; unlike Move, a plain name collision is NOT a
 * reason — it is resolved by the copy-name ladder.
 */
export type CopyEntriesValidationErrorReason =
  /** `sourceRelativePaths` was empty. */
  | "empty-sources"
  /** The same normalised source path appears more than once. */
  | "duplicate-source"
  /** A source resolves outside the current project root. */
  | "source-outside-project"
  /** A source contains a `.` / `..` path segment. */
  | "path-traversal"
  /** A source / destination string is not a usable project-relative path
   *  (also covers a `.pergamum` / reserved / protected segment). */
  | "invalid-path"
  /** A source does not exist on disk. */
  | "source-not-found"
  /** A source exists but is a symlink or an exotic node (socket / device). */
  | "source-not-file-or-folder"
  /** A source string resolves to the project root itself. */
  | "source-is-project-root"
  /** A source (or, for a folder source, a document inside its subtree) is
   *  open in the editor with unsaved changes. */
  | "source-dirty-open-document"
  /** A folder source's subtree contains a symlink. */
  | "source-contains-symlink"
  /** A folder source's subtree contains a protected / reserved entry. */
  | "source-contains-protected"
  /** An ANCESTOR path segment of a source (or the destination) is a symlink
   *  — the path can resolve outside the project even though its final
   *  component is a plain file / folder. */
  | "ancestor-symlink"
  /** The destination folder IS a folder source or lives inside one. */
  | "destination-inside-source"
  /** The selection mixes a folder with one of its own descendants. */
  | "contains-ancestor-and-descendant"
  /** The destination folder resolves outside the current project root. */
  | "destination-outside-project"
  /** The destination folder does not exist on disk. */
  | "destination-not-found"
  /** The destination path exists but is not a folder. */
  | "destination-not-folder"
  /** The resulting destination path would exceed the path-length ceiling. */
  | "destination-path-too-long"
  /** An I/O / permission error while reading a source or walking a subtree. */
  | "enumeration-failed";

export const COPY_ENTRIES_VALIDATION_ERROR_REASONS: readonly CopyEntriesValidationErrorReason[] =
  [
    "empty-sources",
    "duplicate-source",
    "source-outside-project",
    "path-traversal",
    "invalid-path",
    "source-not-found",
    "source-not-file-or-folder",
    "source-is-project-root",
    "source-dirty-open-document",
    "source-contains-symlink",
    "source-contains-protected",
    "ancestor-symlink",
    "destination-inside-source",
    "contains-ancestor-and-descendant",
    "destination-outside-project",
    "destination-not-found",
    "destination-not-folder",
    "destination-path-too-long",
    "enumeration-failed"
  ];

/** Stable internal reason values for an execution-time `fs.cp` failure. */
export type CopyEntryExecutionFailureReason =
  /** The source vanished between the plan and the copy (ENOENT). */
  | "source-missing-during-execution"
  /** The planned destination name was taken between the plan and the copy —
   *  Copy never silently re-renames, so this is a failure. */
  | "destination-conflict-during-execution"
  /** The OS refused the copy (EACCES / EPERM). */
  | "permission-denied"
  /** A source became dirty (open, unsaved) between the plan and the copy. */
  | "source-dirty-open-document"
  /** The plan no longer matches the on-disk / project state. */
  | "copy-plan-stale"
  /** Any other `fs.cp` failure. */
  | "copy-failed";

export const COPY_ENTRY_EXECUTION_FAILURE_REASONS: readonly CopyEntryExecutionFailureReason[] =
  [
    "source-missing-during-execution",
    "destination-conflict-during-execution",
    "permission-denied",
    "source-dirty-open-document",
    "copy-plan-stale",
    "copy-failed"
  ];

export type FileExplorerCopyPlanRowStatus =
  /** Copies under its first-choice ` copy` name — no further collision. */
  | "ready"
  /** Copies, but its first-choice ` copy` name was taken so it moved further
   *  along the ladder. */
  | "will-auto-rename"
  /** Cannot be copied at all (see `reason`). */
  | "blocked";

/** One planned copy — a top-level dragged source and where it will land. */
export interface FileExplorerCopyPlanRow {
  readonly sourceRelativePath: string;
  readonly sourceName: string;
  readonly sourceKind: "file" | "folder";
  readonly sourceSizeBytes: number | null;
  readonly sourceModifiedAt: string | null;
  /** Final basename created inside `destinationFolderRelativePath`, e.g.
   *  `"chapter copy 2.md"`. Empty for a blocked row. */
  readonly destinationName: string;
  /** Final project-relative path to be created. Empty for a blocked row. */
  readonly destinationRelativePath: string;
  /** `true` when the first-choice ` copy` name collided and this row had to
   *  advance along the ladder. */
  readonly wasAutoRenamed: boolean;
  /** Metadata of the EXISTING destination item that caused the collision
   *  (the first-choice ` copy` name), when there is one on disk. */
  readonly collisionSizeBytes: number | null;
  readonly collisionModifiedAt: string | null;
  readonly status: FileExplorerCopyPlanRowStatus;
  readonly reason?: CopyEntriesValidationErrorReason;
}

export interface FileExplorerCopyPlan {
  readonly planId: string;
  /** `""` = project root. */
  readonly destinationFolderRelativePath: string;
  readonly rows: readonly FileExplorerCopyPlanRow[];
  /** Any non-blocked row `wasAutoRenamed` — the renderer shows the dedicated
   *  file-copy confirmation dialog before executing. */
  readonly hasCollisions: boolean;
  /** Any row is `blocked`, or a non-row-scoped `blockingReason` is set. */
  readonly hasBlockingIssues: boolean;
  /** A non-row-scoped blocker (empty selection, unusable destination). When
   *  set, `rows` may be empty and the whole copy is refused. */
  readonly blockingReason?: CopyEntriesValidationErrorReason;
}

export type CopyEntryExecutionResult =
  | {
      readonly status: "copied";
      readonly sourceRelativePath: string;
      readonly destinationRelativePath: string;
      readonly isDirectory: boolean;
    }
  | {
      readonly status: "failed";
      readonly sourceRelativePath: string;
      readonly destinationRelativePath: string;
      readonly reason: CopyEntryExecutionFailureReason;
    };

export interface CopyEntriesExecutionResult {
  /** `true` only when every non-blocked planned row copied. */
  readonly ok: boolean;
  readonly results: readonly CopyEntryExecutionResult[];
  /** Project-relative paths of copied `.md` / `.markdown` FILES — the caller
   *  registers these with the project document registry. */
  readonly registeredDocumentRelativePaths: readonly string[];
}

// ---------------------------------------------------------------------------
// Copy-name ladder ("Duplicate" semantics).
// ---------------------------------------------------------------------------

/**
 * Split a basename into `[stem, extension]`. The extension is the last
 * `.`-delimited suffix, but only when the dot is not the first character
 * (so `.gitignore` is all stem). A folder name is never split — pass
 * `isDirectory: true`.
 */
export function splitCopyBaseName(
  baseName: string,
  isDirectory: boolean
): readonly [string, string] {
  if (isDirectory) {
    return [baseName, ""];
  }
  const dotIndex = baseName.lastIndexOf(".");
  if (dotIndex <= 0) {
    return [baseName, ""];
  }
  return [baseName.slice(0, dotIndex), baseName.slice(dotIndex)];
}

const COPY_STEM_PATTERN = /^(.*) copy(?: ([1-9]\d*))?$/;

/**
 * Parse a stem that may already sit on the copy ladder.
 *   `"chapter"`        → `{ base: "chapter",  count: 0 }`  (not yet a copy)
 *   `"chapter copy"`   → `{ base: "chapter",  count: 1 }`
 *   `"chapter copy 2"` → `{ base: "chapter",  count: 2 }`
 */
export function parseCopyStem(stem: string): {
  readonly base: string;
  readonly count: number;
} {
  const match = COPY_STEM_PATTERN.exec(stem);
  if (!match) {
    return { base: stem, count: 0 };
  }
  return { base: match[1], count: match[2] ? Number(match[2]) : 1 };
}

/** `count <= 1` → `"<base> copy"`, otherwise `"<base> copy <count>"`. */
export function copyStemForCount(base: string, count: number): string {
  return count <= 1 ? `${base} copy` : `${base} copy ${count}`;
}

export interface ResolvedCopyName {
  /** Final basename to create. */
  readonly name: string;
  /** First-choice ` copy` name (before any ladder advance). */
  readonly firstChoiceName: string;
  /** `true` when `name !== firstChoiceName` (the first choice was taken). */
  readonly wasAutoRenamed: boolean;
}

/**
 * Duplicate semantics: the copy of `originalBaseName` ALWAYS starts with
 * ` copy`, even when the plain name would be free at the destination. Walk
 * the ladder until `isTaken(candidateNameFolded)` is `false`.
 *
 * `isTaken` receives the NFC + lower-cased candidate name so the caller can
 * match it against a case-folded set of existing destination names AND the
 * names already claimed earlier in the same batch.
 */
export function resolveCopyName(
  originalBaseName: string,
  isDirectory: boolean,
  isTaken: (foldedCandidateName: string) => boolean
): ResolvedCopyName {
  const [stem, extension] = splitCopyBaseName(originalBaseName, isDirectory);
  const { base, count } = parseCopyStem(stem);
  const firstCount = count + 1;
  const firstChoiceName = `${copyStemForCount(base, firstCount)}${extension}`;

  let candidateCount = firstCount;
  let candidateName = firstChoiceName;
  while (isTaken(candidateName.normalize("NFC").toLowerCase())) {
    candidateCount += 1;
    candidateName = `${copyStemForCount(base, candidateCount)}${extension}`;
  }

  return {
    name: candidateName,
    firstChoiceName,
    wasAutoRenamed: candidateName !== firstChoiceName
  };
}
