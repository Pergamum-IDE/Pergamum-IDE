/**
 * #351: File Explorer deletion — Phase B (execution), one entry at a time.
 *
 * The renderer drives an ordered loop over the Phase-A target list (files
 * first, then folders deepest-first — {@link orderFileExplorerDeleteTargets})
 * and calls `deleteOneFileExplorerEntry` once per item, updating the
 * confirmation table's per-row status. A per-item call keeps abort natural
 * (the renderer just stops calling) and keeps progress user-visible.
 *
 * Every call RE-CHECKS the boundary before touching the filesystem — the
 * project root, an outside-root path, a reserved / protected path, and a
 * symlink are refused here too, not only in Phase A. The only mutations are
 * `fs.unlink` (file) and `fs.rmdir` (folder, non-recursive — its children
 * were deleted by earlier iterations). No rollback, no `fs.rm -r`, no
 * rename, no Recovery-store change (ADR-0011 DEL-14: a deleted file's
 * Recovery row is left intact).
 */

import { promises as fsPromises } from "node:fs";
import path from "node:path";
import type {
  FileExplorerDeleteEntryResult,
  FileExplorerDeleteItemKind
} from "../shared/fileExplorerDelete";
import {
  normalizeFileExplorerDeleteSelection,
  scanFileExplorerDeleteAncestorPath
} from "./fileExplorerDeleteCollect";

interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface FileExplorerDeleteExecuteDeps {
  readonly lstat: (targetPath: string) => Promise<StatLike>;
  readonly unlink: (targetPath: string) => Promise<void>;
  readonly rmdir: (targetPath: string) => Promise<void>;
}

export const defaultFileExplorerDeleteExecuteDeps: FileExplorerDeleteExecuteDeps =
  {
    lstat: (targetPath) => fsPromises.lstat(targetPath),
    unlink: (targetPath) => fsPromises.unlink(targetPath),
    rmdir: (targetPath) => fsPromises.rmdir(targetPath)
  };

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function isOutsideProjectRoot(
  projectRootPath: string,
  absolutePath: string
): boolean {
  const relativeFromRoot = path.relative(
    path.resolve(projectRootPath),
    absolutePath
  );

  return (
    relativeFromRoot === ".." ||
    relativeFromRoot.startsWith(`..${path.sep}`) ||
    relativeFromRoot.startsWith("../") ||
    path.isAbsolute(relativeFromRoot)
  );
}

function deletionFailureResult(
  error: unknown
): FileExplorerDeleteEntryResult {
  switch (nodeErrorCode(error)) {
    case "ENOENT":
    case "ENOTDIR":
      // Already gone — the end state matches the intent.
      return { ok: true, alreadyAbsent: true };
    case "EACCES":
    case "EPERM":
      return { ok: false, reason: "permission-denied" };
    case "ENOTEMPTY":
    case "EEXIST":
      return { ok: false, reason: "not-empty" };
    case "EBUSY":
      return { ok: false, reason: "busy" };
    default:
      return { ok: false, reason: "delete-failed" };
  }
}

export interface DeleteOneFileExplorerEntryInput {
  readonly projectRootPath: string;
  readonly relativePath: string;
  readonly kind: FileExplorerDeleteItemKind;
}

export async function deleteOneFileExplorerEntry(
  input: DeleteOneFileExplorerEntryInput,
  deps: FileExplorerDeleteExecuteDeps = defaultFileExplorerDeleteExecuteDeps
): Promise<FileExplorerDeleteEntryResult> {
  const normalized = normalizeFileExplorerDeleteSelection(input.relativePath);

  if (!normalized.ok) {
    return {
      ok: false,
      reason:
        normalized.reason === "outside-project"
          ? "outside-project"
          : normalized.reason === "reserved-or-protected"
            ? "reserved-or-protected"
            : "delete-failed"
    };
  }

  const absolutePath = path.resolve(
    input.projectRootPath,
    normalized.relativePath
  );

  if (isOutsideProjectRoot(input.projectRootPath, absolutePath)) {
    return { ok: false, reason: "outside-project" };
  }

  // Refuse a path that traverses a symlinked directory (an ancestor segment
  // symlink can point outside the project even when the final component is a
  // plain file). Re-checked here, not only in Phase A.
  const ancestorScan = await scanFileExplorerDeleteAncestorPath(
    input.projectRootPath,
    normalized.relativePath,
    deps.lstat
  );

  if (!ancestorScan.ok) {
    return { ok: false, reason: "symlink" };
  }

  let stats: StatLike;

  try {
    stats = await deps.lstat(absolutePath);
  } catch (error) {
    if (
      nodeErrorCode(error) === "ENOENT" ||
      nodeErrorCode(error) === "ENOTDIR"
    ) {
      return { ok: true, alreadyAbsent: true };
    }

    return { ok: false, reason: "delete-failed" };
  }

  if (stats.isSymbolicLink()) {
    return { ok: false, reason: "symlink" };
  }

  // The on-disk node must still match the kind the user confirmed. If a file
  // became a folder (or vice versa), or turned into a special node, between
  // confirmation and now, delete NOTHING — `unlink` runs only for a verified
  // regular file, `rmdir` only for a verified directory.
  if (input.kind === "file") {
    if (!stats.isFile()) {
      return { ok: false, reason: "target-changed" };
    }

    try {
      await deps.unlink(absolutePath);
    } catch (error) {
      return deletionFailureResult(error);
    }

    return { ok: true };
  }

  if (!stats.isDirectory()) {
    return { ok: false, reason: "target-changed" };
  }

  try {
    await deps.rmdir(absolutePath);
  } catch (error) {
    return deletionFailureResult(error);
  }

  return { ok: true };
}
