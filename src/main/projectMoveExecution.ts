/**
 * #325: Move v1 — Phase B execution.
 *
 * `moveEntries` runs #324 `validateMoveEntries` first. Only a fully
 * `ok: true` validation proceeds to renames; a validation failure returns
 * the errors and NEVER touches the filesystem.
 *
 * When validation passes, each `ValidatedMoveEntry` is `fs.rename`d in
 * order. Every rename is caught per entry:
 *   - a failure does NOT roll back an earlier success,
 *   - a failure does NOT stop a later entry,
 *   - one or more failures make the whole operation `ok: false` (partial
 *     failure), with per-entry `results` and `successfulPathPairs` for the
 *     entries that actually moved.
 *
 * The ONLY filesystem mutation here is `fs.rename`, inside the post-
 * validation loop. No rollback rename, no `unlink` / `rm` / `mkdir` /
 * `copyFile`. No IPC, no renderer / UI state.
 *
 * #326: after a successful (or partially successful) execution, the moved
 * `successfulPathPairs` are handed to an injected Recovery re-key hook
 * (`deps.rekeyRecoveryPaths`, wired elsewhere to #320's
 * `rekeyRecoveryDocumentPaths`). It is BEST EFFORT: it runs only when at
 * least one file moved, its failure is swallowed, and it never changes
 * `MoveEntriesResult.ok` — which stays a function of validation + rename
 * results alone. This module still imports nothing from the Recovery Store.
 */

import { promises as nodeFs } from "node:fs";
import nodePath from "node:path";
import type {
  MoveEntriesRecoveryRekey,
  MoveEntriesResult,
  MoveEntryExecutionFailureReason,
  MoveEntryExecutionResult,
  MoveEntryPathPair
} from "../shared/projectMove";
import type { RecoveryPathRekeyResult } from "../shared/recoveryDocument";
import {
  validateMoveEntries,
  type ValidateMoveEntriesInput
} from "./projectMoveValidation";

/** Injectable so execution / re-key are deterministic in tests. */
export interface MoveEntriesDeps {
  readonly rename?: (oldPath: string, newPath: string) => Promise<void>;
  /**
   * #326: best-effort Recovery path re-key for the files that actually
   * moved. Wired elsewhere to #320's `rekeyRecoveryDocumentPaths` (kept as a
   * hook so this module never imports the Recovery Store). Called ONLY when
   * `successfulPathPairs` is non-empty; a throw here is caught and does not
   * reject `moveEntries` or change its `ok`.
   */
  readonly rekeyRecoveryPaths?: (
    pairs: readonly MoveEntryPathPair[]
  ) => RecoveryPathRekeyResult | Promise<RecoveryPathRekeyResult>;
}

const defaultRename: NonNullable<MoveEntriesDeps["rename"]> = (
  oldPath,
  newPath
) => nodeFs.rename(oldPath, newPath);

function nodeErrorCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
}

function renameFailureReason(
  error: unknown
): MoveEntryExecutionFailureReason {
  switch (nodeErrorCode(error)) {
    case "ENOENT":
      return "source-missing-during-execution";
    case "EEXIST":
    case "ENOTEMPTY":
      return "destination-conflict-during-execution";
    case "EACCES":
    case "EPERM":
      return "permission-denied";
    default:
      return "rename-failed";
  }
}

export async function moveEntries(
  input: ValidateMoveEntriesInput,
  deps: MoveEntriesDeps = {}
): Promise<MoveEntriesResult> {
  const validation = await validateMoveEntries(input);

  if (!validation.ok) {
    // No `fs.rename` is attempted on a validation failure.
    return {
      ok: false,
      validation,
      results: [],
      successfulPathPairs: []
    };
  }

  const rename = deps.rename ?? defaultRename;
  const results: MoveEntryExecutionResult[] = [];
  const successfulPathPairs: MoveEntryPathPair[] = [];
  let anyFailed = false;

  for (const entry of validation.entries) {
    const location = {
      sourceRelativePath: entry.sourceRelativePath,
      destinationRelativePath: entry.destinationRelativePath,
      sourceAbsolutePath: entry.sourceAbsolutePath,
      destinationAbsolutePath: entry.destinationAbsolutePath
    };

    try {
      // A folder source is one `fs.rename` of the whole subtree — no
      // recursion, no per-file work here.
      await rename(entry.sourceAbsolutePath, entry.destinationAbsolutePath);
    } catch (error) {
      anyFailed = true;
      results.push({
        status: "failed",
        reason: renameFailureReason(error),
        ...location
      });
      // No rollback; keep going with the remaining entries.
      continue;
    }

    results.push({
      status: "moved",
      isDirectory: entry.isDirectory,
      movedProjectDocuments: entry.movedProjectDocuments,
      ...location
    });

    if (entry.isDirectory) {
      // #340: hand the #326 Recovery re-key hook the moved subtree's known
      // project-document FILE pairs (not the folder itself — no Recovery row
      // is keyed to a directory).
      for (const relocated of entry.movedProjectDocuments) {
        successfulPathPairs.push({
          oldAbsolutePath: nodePath.resolve(
            input.projectRootPath,
            relocated.oldRelativePath
          ),
          newAbsolutePath: nodePath.resolve(
            input.projectRootPath,
            relocated.newRelativePath
          )
        });
      }
    } else {
      successfulPathPairs.push({
        oldAbsolutePath: entry.sourceAbsolutePath,
        newAbsolutePath: entry.destinationAbsolutePath
      });
    }
  }

  // #326: best-effort Recovery re-key for the files that actually moved.
  // Never runs on an empty pair list; a throw is swallowed; the result is
  // diagnostic metadata only and does not affect `ok`.
  const recoveryRekey = await rekeyMovedPathsBestEffort(
    successfulPathPairs,
    deps.rekeyRecoveryPaths
  );

  return {
    ok: !anyFailed,
    validation: { ok: true },
    results,
    successfulPathPairs,
    ...(recoveryRekey ? { recoveryRekey } : {})
  };
}

async function rekeyMovedPathsBestEffort(
  successfulPathPairs: readonly MoveEntryPathPair[],
  rekeyRecoveryPaths: MoveEntriesDeps["rekeyRecoveryPaths"]
): Promise<MoveEntriesRecoveryRekey | undefined> {
  if (!rekeyRecoveryPaths) {
    return undefined;
  }

  if (successfulPathPairs.length === 0) {
    return { skipped: "no-successful-path-pairs" };
  }

  try {
    return await rekeyRecoveryPaths(successfulPathPairs);
  } catch {
    // Recovery is best effort — a re-key failure never rejects the Move
    // (which already completed) or changes its result. The hook itself
    // owns any safe #320 logging.
    return { failed: "threw" };
  }
}
