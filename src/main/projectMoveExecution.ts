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
 * `copyFile`. No Recovery re-key (that is #326, which consumes
 * `successfulPathPairs`). No IPC, no renderer / UI state.
 */

import { promises as nodeFs } from "node:fs";
import type {
  MoveEntriesResult,
  MoveEntryExecutionFailureReason,
  MoveEntryExecutionResult,
  MoveEntryPathPair
} from "../shared/projectMove";
import {
  validateMoveEntries,
  type ValidateMoveEntriesInput
} from "./projectMoveValidation";

/** Injectable so execution-time failures are deterministic in tests. */
export interface MoveEntriesDeps {
  readonly rename?: (oldPath: string, newPath: string) => Promise<void>;
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

    results.push({ status: "moved", ...location });
    successfulPathPairs.push({
      oldAbsolutePath: entry.sourceAbsolutePath,
      newAbsolutePath: entry.destinationAbsolutePath
    });
  }

  if (anyFailed) {
    return {
      ok: false,
      validation: { ok: true },
      results,
      successfulPathPairs
    };
  }

  return {
    ok: true,
    validation: { ok: true },
    results,
    successfulPathPairs
  };
}
