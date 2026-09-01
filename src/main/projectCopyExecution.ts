/**
 * #356: File Explorer project-local COPY — Phase B (execute an approved plan).
 *
 * `executeCopyPlan` takes a {@link FileExplorerCopyPlan} produced by
 * `planCopyEntries` and copies each non-blocked row to exactly the
 * `destinationRelativePath` the plan named. It NEVER re-runs the copy-name
 * ladder and NEVER silently picks a new destination: if a planned
 * destination is taken now, that row fails
 * (`destination-conflict-during-execution`).
 *
 * Before each `fs.cp` it RE-VALIDATES the source side against the planned
 * row — the same checks `planCopyEntries` applied — so a copy that went
 * stale between plan and execution is refused rather than run:
 *   - the source still exists,
 *   - its kind still matches the plan (file vs folder),
 *   - it is not a symlink,
 *   - no ancestor path segment became a symlink,
 *   - it is not (a file source) / does not contain (a folder source) an
 *     open dirty project document,
 *   - a folder source's subtree still has no symlink / protected / reserved
 *     / exotic node.
 * Any of those failing → `source-dirty-open-document` for the dirty case,
 * `source-missing-during-execution` for ENOENT, otherwise `copy-plan-stale`.
 *
 * The ONLY filesystem mutation here is `fs.cp` (recursive, `errorOnExist`,
 * no dereference). No rollback: a per-row failure never undoes an earlier
 * success and never stops a later row.
 */

import { promises as nodeFs } from "node:fs";
import nodePath from "node:path";
import { scanFileExplorerDeleteAncestorPath } from "./fileExplorerDeleteCollect";
import {
  dirtyPathIsInCopyScope,
  foldCopyPath,
  scanCopySubtree,
  type CopySafetyDirentLike
} from "./fileExplorerCopySafety";
import type {
  CopyEntriesExecutionResult,
  CopyEntryExecutionFailureReason,
  CopyEntryExecutionResult,
  FileExplorerCopyPlan
} from "../shared/projectCopy";

interface StatLike {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

export interface ExecuteCopyPlanDeps {
  readonly lstat: (targetPath: string) => Promise<StatLike>;
  readonly readdir: (
    directoryPath: string
  ) => Promise<readonly CopySafetyDirentLike[]>;
  readonly cp: (sourcePath: string, destinationPath: string) => Promise<void>;
}

export const defaultExecuteCopyPlanDeps: ExecuteCopyPlanDeps = {
  lstat: (targetPath) => nodeFs.lstat(targetPath),
  readdir: (directoryPath) =>
    nodeFs.readdir(directoryPath, { withFileTypes: true }),
  cp: (sourcePath, destinationPath) =>
    nodeFs.cp(sourcePath, destinationPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false
    })
};

export interface ExecuteCopyPlanInput {
  readonly projectRootPath: string;
  readonly plan: FileExplorerCopyPlan;
  /** Execute-time re-check: a source that became dirty since the plan fails. */
  readonly dirtyProjectDocumentRelativePaths?: readonly string[];
}

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function copyFailureReason(error: unknown): CopyEntryExecutionFailureReason {
  switch (nodeErrorCode(error)) {
    case "ENOENT":
      return "source-missing-during-execution";
    case "EEXIST":
    case "ERR_FS_CP_EEXIST":
      return "destination-conflict-during-execution";
    case "EACCES":
    case "EPERM":
      return "permission-denied";
    default:
      return "copy-failed";
  }
}

function isMarkdownFilePath(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export async function executeCopyPlan(
  input: ExecuteCopyPlanInput,
  deps: ExecuteCopyPlanDeps = defaultExecuteCopyPlanDeps
): Promise<CopyEntriesExecutionResult> {
  const { plan, projectRootPath } = input;

  // A blocked plan is never executed — the renderer shows the blockers and
  // never reaches here. Defensive: refuse it.
  if (plan.hasBlockingIssues) {
    return { ok: false, results: [], registeredDocumentRelativePaths: [] };
  }

  const dirtyFolded = (input.dirtyProjectDocumentRelativePaths ?? [])
    .filter((value): value is string => typeof value === "string")
    .map(foldCopyPath);

  const results: CopyEntryExecutionResult[] = [];
  const registeredDocumentRelativePaths: string[] = [];
  let anyFailed = false;

  for (const row of plan.rows) {
    if (row.status === "blocked") {
      continue;
    }

    const sourceAbsolutePath = nodePath.resolve(
      projectRootPath,
      row.sourceRelativePath
    );
    const destinationAbsolutePath = nodePath.resolve(
      projectRootPath,
      row.destinationRelativePath
    );
    const location = {
      sourceRelativePath: row.sourceRelativePath,
      destinationRelativePath: row.destinationRelativePath
    };

    const fail = (reason: CopyEntryExecutionFailureReason): void => {
      anyFailed = true;
      results.push({ status: "failed", reason, ...location });
    };

    const plannedIsDirectory = row.sourceKind === "folder";
    const foldedSource = foldCopyPath(row.sourceRelativePath);

    // 1. Dirty re-check — exact path for a file source, subtree for a folder.
    if (
      dirtyPathIsInCopyScope(dirtyFolded, foldedSource, plannedIsDirectory)
    ) {
      fail("source-dirty-open-document");
      continue;
    }

    // 2. Ancestor-symlink scan — an ancestor may have become a link.
    const ancestorScan = await scanFileExplorerDeleteAncestorPath(
      projectRootPath,
      row.sourceRelativePath,
      deps.lstat
    );
    if (!ancestorScan.ok) {
      fail("copy-plan-stale");
      continue;
    }

    // 3. Source still exists, is not a symlink, and its kind matches the plan.
    let sourceStats: StatLike;
    try {
      sourceStats = await deps.lstat(sourceAbsolutePath);
    } catch (error) {
      fail(
        nodeErrorCode(error) === "ENOENT"
          ? "source-missing-during-execution"
          : "copy-plan-stale"
      );
      continue;
    }
    if (sourceStats.isSymbolicLink()) {
      fail("copy-plan-stale");
      continue;
    }
    const sourceIsDirectory = sourceStats.isDirectory();
    const sourceIsFile = sourceStats.isFile();
    if (!sourceIsDirectory && !sourceIsFile) {
      fail("copy-plan-stale");
      continue;
    }
    if (sourceIsDirectory !== plannedIsDirectory) {
      // file → folder or folder → file since the plan.
      fail("copy-plan-stale");
      continue;
    }

    // 4. Folder source: the subtree still has no symlink / protected / exotic.
    if (sourceIsDirectory) {
      const subtreeScan = await scanCopySubtree(
        projectRootPath,
        row.sourceRelativePath,
        deps.readdir
      );
      if (!subtreeScan.ok) {
        fail("copy-plan-stale");
        continue;
      }
    }

    // 5. The planned destination must still be free — Copy never re-renames.
    try {
      await deps.lstat(destinationAbsolutePath);
      fail("destination-conflict-during-execution");
      continue;
    } catch (error) {
      if (nodeErrorCode(error) !== "ENOENT") {
        fail("copy-failed");
        continue;
      }
    }

    try {
      await deps.cp(sourceAbsolutePath, destinationAbsolutePath);
    } catch (error) {
      fail(copyFailureReason(error));
      continue;
    }

    results.push({
      status: "copied",
      isDirectory: sourceIsDirectory,
      ...location
    });

    if (sourceIsFile && isMarkdownFilePath(row.destinationRelativePath)) {
      registeredDocumentRelativePaths.push(row.destinationRelativePath);
    }
  }

  return {
    ok: !anyFailed,
    results,
    registeredDocumentRelativePaths
  };
}
