/**
 * #351: pure, environment-free helpers for File Explorer project-local
 * file/folder deletion (ADR-0011).
 *
 * Nothing here touches the filesystem, Electron, React, or IPC. It defines:
 *   - the shape of a validated deletion target (with the confirmation-table
 *     preview metadata),
 *   - the pre-validation rejection reasons (why a selected entry cannot be
 *     deleted at all),
 *   - the per-item execution failure reasons,
 *   - the SAFE deletion ORDER: every file first, then folders deepest-first,
 *     so a folder is always emptied before it is removed,
 *   - the reason -> localization-key maps.
 *
 * Deletion is a direct delete (never the OS trash) and is never silent:
 * a confirmation dialog lists every item that will actually be deleted.
 */

import type { TranslationKey } from "./i18n";

/** How many user-visible code points the head / tail preview shows. */
export const FILE_EXPLORER_DELETE_PREVIEW_LENGTH = 10;

export type FileExplorerDeleteItemKind = "file" | "folder";

/**
 * One entry that WILL actually be deleted — a selected file, a selected
 * folder, or any descendant discovered by the recursive subtree walk
 * (including empty folders). Project-root-relative, forward-slash paths.
 */
export interface FileExplorerDeleteTarget {
  readonly kind: FileExplorerDeleteItemKind;
  readonly relativePath: string;
  /** basename */
  readonly name: string;
  /** parent directory, project-root-relative; `""` = project root. */
  readonly parentRelativePath: string;
  /** filesystem mtime as an ISO 8601 string; `null` when unavailable. */
  readonly lastModifiedIso: string | null;
  /** total byte size for a file; `null` for a folder. */
  readonly sizeBytes: number | null;
  /**
   * First / last ~{@link FILE_EXPLORER_DELETE_PREVIEW_LENGTH} user-visible
   * code points of the file's content, whitespace collapsed. `null` for a
   * folder. An empty string is a real value (an empty / whitespace-only
   * file). When the content cannot be read or safely decoded,
   * `previewUnavailable` is `true` and these are `null`.
   */
  readonly previewHead: string | null;
  readonly previewTail: string | null;
  readonly previewUnavailable: boolean;
}

/**
 * Why a SELECTED entry cannot be deleted. A single rejected selection makes
 * the whole request `ok: false` — nothing is deleted (ADR-0011 DEL-4).
 */
export type FileExplorerDeleteRejectionReason =
  | "empty-selection"
  | "project-root"
  | "outside-project"
  | "path-traversal"
  | "invalid-path"
  /** `.pergamum` (incl. backup / copy), `.pergamum-{journal,wal,shm}`
   *  sidecars, `.pergamum_recovery/`, `.pergamum.lock/`,
   *  `.pergamum.lock.stale-*`, `pergamum.json`, other reserved names. */
  | "reserved-or-protected"
  | "symlink"
  /** an ANCESTOR path segment is a symlink — `link/x.md` where `<root>/link`
   *  is a directory symlink can resolve outside the project even though the
   *  final component is a plain file. */
  | "symlinked-path"
  | "not-found"
  /** socket / fifo / block / char device — not a regular file or folder. */
  | "unsupported-node"
  /** the selected folder's subtree contains a protected entry, so the
   *  folder cannot be deleted as a whole (no partial deletion). */
  | "folder-contains-protected"
  /** an I/O / permission error while walking the subtree. */
  | "enumeration-failed";

export interface FileExplorerDeleteRejection {
  /** The SELECTED path this rejection is about (project-root-relative, or
   *  the raw string when it could not be normalized). */
  readonly selectedPath: string;
  readonly reason: FileExplorerDeleteRejectionReason;
  /** For `folder-contains-protected`: the offending descendant path, so the
   *  message can name it (the tree hides such entries, so "there is a
   *  protected entry" would otherwise be mysterious). */
  readonly offendingPath?: string;
}

export type FileExplorerDeleteCollectResult =
  | {
      readonly ok: true;
      /** Every item that will be deleted, de-duplicated, in `localeCompare`
       *  path order for DISPLAY. Use {@link orderFileExplorerDeleteTargets}
       *  to derive the safe EXECUTION order. */
      readonly targets: readonly FileExplorerDeleteTarget[];
      readonly fileCount: number;
      readonly folderCount: number;
    }
  | {
      readonly ok: false;
      readonly rejections: readonly FileExplorerDeleteRejection[];
    };

/** Why a single `deleteFileExplorerEntry` call failed. */
export type FileExplorerDeleteExecutionFailureReason =
  | "permission-denied"
  /** a folder still had children when `rmdir` ran (external race). */
  | "not-empty"
  /** the entry is held open by another process (Windows `EBUSY` / `EPERM`). */
  | "busy"
  /** defense-in-depth: the entry re-validated as reserved / protected. */
  | "reserved-or-protected"
  | "outside-project"
  | "symlink"
  /** the on-disk node no longer matches the confirmed target kind (a file
   *  became a folder, or vice versa, or turned into a special node between
   *  confirmation and execution). Nothing was deleted. */
  | "target-changed"
  | "delete-failed";

export type FileExplorerDeleteEntryResult =
  | { readonly ok: true; readonly alreadyAbsent?: boolean }
  | {
      readonly ok: false;
      readonly reason: FileExplorerDeleteExecutionFailureReason;
    };

function relativePathDepth(relativePath: string): number {
  return relativePath.length === 0 ? 0 : relativePath.split("/").length;
}

/**
 * The SAFE deletion order for a validated target list:
 *   1. every file (path order among them — order does not matter for
 *      safety, only determinism),
 *   2. then every folder, DEEPEST first (descending depth), path order
 *      within a depth.
 *
 * A folder is therefore always emptied — its files and its deeper
 * sub-folders removed — before `rmdir` runs on it.
 */
export function orderFileExplorerDeleteTargets(
  targets: readonly FileExplorerDeleteTarget[]
): readonly FileExplorerDeleteTarget[] {
  return [...targets].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "file" ? -1 : 1;
    }

    if (a.kind === "folder") {
      const depthDelta =
        relativePathDepth(b.relativePath) - relativePathDepth(a.relativePath);

      if (depthDelta !== 0) {
        return depthDelta;
      }
    }

    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Collapse whitespace runs to a single space, trim, and return the first
 * (`fromEnd: false`) or last (`fromEnd: true`)
 * {@link FILE_EXPLORER_DELETE_PREVIEW_LENGTH} user-visible code points, with
 * a leading / trailing `…` when there is more text. A blank input yields
 * `""`.
 */
export function fileExplorerDeletePreviewFragment(
  text: string,
  fromEnd: boolean
): string {
  const collapsed = text.replace(/\s+/g, " ").trim();

  if (collapsed.length === 0) {
    return "";
  }

  const codePoints = Array.from(collapsed);

  if (codePoints.length <= FILE_EXPLORER_DELETE_PREVIEW_LENGTH) {
    return codePoints.join("");
  }

  return fromEnd
    ? `…${codePoints.slice(-FILE_EXPLORER_DELETE_PREVIEW_LENGTH).join("")}`
    : `${codePoints
        .slice(0, FILE_EXPLORER_DELETE_PREVIEW_LENGTH)
        .join("")}…`;
}

const REJECTION_REASON_KEY: Readonly<
  Record<FileExplorerDeleteRejectionReason, TranslationKey>
> = {
  "empty-selection": "explorer.delete.reject.emptySelection",
  "project-root": "explorer.delete.reject.projectRoot",
  "outside-project": "explorer.delete.reject.outsideProject",
  "path-traversal": "explorer.delete.reject.invalidPath",
  "invalid-path": "explorer.delete.reject.invalidPath",
  "reserved-or-protected": "explorer.delete.reject.protected",
  symlink: "explorer.delete.reject.symlink",
  "symlinked-path": "explorer.delete.reject.symlinkedPath",
  "not-found": "explorer.delete.reject.notFound",
  "unsupported-node": "explorer.delete.reject.unsupportedNode",
  "folder-contains-protected": "explorer.delete.reject.folderContainsProtected",
  "enumeration-failed": "explorer.delete.reject.enumerationFailed"
};

export function fileExplorerDeleteRejectionReasonKey(
  reason: FileExplorerDeleteRejectionReason
): TranslationKey {
  return REJECTION_REASON_KEY[reason] ?? "explorer.delete.reject.invalidPath";
}

const EXECUTION_FAILURE_REASON_KEY: Readonly<
  Record<FileExplorerDeleteExecutionFailureReason, TranslationKey>
> = {
  "permission-denied": "explorer.delete.failure.permissionDenied",
  "not-empty": "explorer.delete.failure.notEmpty",
  busy: "explorer.delete.failure.busy",
  "reserved-or-protected": "explorer.delete.failure.protected",
  "outside-project": "explorer.delete.failure.outsideProject",
  symlink: "explorer.delete.failure.symlink",
  "target-changed": "explorer.delete.failure.targetChanged",
  "delete-failed": "explorer.delete.failure.deleteFailed"
};

export function fileExplorerDeleteExecutionFailureReasonKey(
  reason: FileExplorerDeleteExecutionFailureReason
): TranslationKey {
  return (
    EXECUTION_FAILURE_REASON_KEY[reason] ??
    "explorer.delete.failure.deleteFailed"
  );
}
