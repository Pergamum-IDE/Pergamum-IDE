/**
 * #356: path-safety helpers shared by the File Explorer COPY plan
 * (`projectCopyValidation.ts`) and the COPY execution
 * (`projectCopyExecution.ts`). Both phases must apply the SAME source-side
 * checks — the plan so a bad copy is never offered, the execution so a copy
 * that went stale between plan and `fs.cp` is refused rather than run.
 *
 * Pure w.r.t. Electron / IPC — filesystem access is via injected
 * `lstat` / `readdir`, so it is cheap to unit test.
 */

import path from "node:path";
import { isProtectedFileExplorerName } from "./fileExplorerDeleteCollect";

export interface CopySafetyStatLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface CopySafetyDirentLike {
  readonly name: string;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export type CopySubtreeScanResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "source-contains-symlink"
        | "source-contains-protected"
        | "enumeration-failed";
    };

/**
 * Walk a folder source's subtree. Rejects the whole folder if any descendant
 * is a symlink, a protected / reserved entry, or an exotic node (socket /
 * device / fifo) — Copy never copies through / around those (mirrors Delete
 * DEL-12). No content reads.
 */
export async function scanCopySubtree(
  projectRootPath: string,
  folderRelativePath: string,
  readdir: (
    directoryPath: string
  ) => Promise<readonly CopySafetyDirentLike[]>
): Promise<CopySubtreeScanResult> {
  const stack: string[] = [folderRelativePath];

  while (stack.length > 0) {
    const currentRelative = stack.pop()!;
    const currentAbsolute = path.resolve(projectRootPath, currentRelative);

    let entries: readonly CopySafetyDirentLike[];
    try {
      entries = await readdir(currentAbsolute);
    } catch {
      return { ok: false, reason: "enumeration-failed" };
    }

    for (const entry of entries) {
      if (isProtectedFileExplorerName(entry.name)) {
        return { ok: false, reason: "source-contains-protected" };
      }
      if (entry.isSymbolicLink()) {
        return { ok: false, reason: "source-contains-symlink" };
      }
      if (entry.isDirectory()) {
        stack.push(`${currentRelative}/${entry.name}`);
        continue;
      }
      if (!entry.isFile()) {
        return { ok: false, reason: "source-contains-protected" };
      }
    }
  }

  return { ok: true };
}

/** NFC + lower-cased, forward-slash path key. */
export function foldCopyPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").normalize("NFC").toLowerCase();
}

/**
 * `true` when any of `dirtyFoldedPaths` is `foldedSource` itself (a file
 * source) or a path inside it (a folder source's subtree). Both inputs are
 * already {@link foldCopyPath}-folded.
 */
export function dirtyPathIsInCopyScope(
  dirtyFoldedPaths: readonly string[],
  foldedSource: string,
  isDirectory: boolean
): boolean {
  return dirtyFoldedPaths.some((dirty) =>
    isDirectory
      ? dirty === foldedSource || dirty.startsWith(`${foldedSource}/`)
      : dirty === foldedSource
  );
}
