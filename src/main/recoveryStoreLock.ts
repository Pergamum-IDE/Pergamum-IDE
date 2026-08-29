/**
 * Phase 6-4-2: the Recovery Store's cross-process ownership lock.
 *
 * The atomic primitive is `mkdir(<Recovery.lock>)` — it succeeds for
 * exactly one caller and throws `EEXIST` for everyone else. The winner
 * writes `owner.json` inside as human-facing diagnostics and holds the
 * directory for the life of the run; on normal shutdown it deletes
 * `owner.json` and `rmdir`s the lock.
 *
 * There is deliberately NO reclamation of any kind:
 *   - no bounded wait / retry (a later instance is a Recovery non-owner
 *     *immediately*, and stays silent),
 *   - no stale-lock takeover — a leftover `Recovery.lock/` from a crashed
 *     owner is never force-broken here (that is a later phase's concern),
 *   - the acquire-failing side deletes NOTHING belonging to the holder.
 *
 * Only the Recovery Store's `main` orchestrator uses this.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  recoveryStoreLockOwnerFileName,
  type RecoveryStoreOwnerInfo
} from "../shared/recovery";

export interface RecoveryStoreLockFileSystem {
  mkdir(dirPath: string): Promise<void>;
  writeFile(
    filePath: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" }
  ): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
  rmdir(dirPath: string): Promise<void>;
}

export type RecoveryStoreLockAcquireResult = "acquired" | "unavailable";
export type RecoveryStoreLockReleaseResult = "released" | "notHeld" | "failed";

export interface RecoveryStoreLock {
  readonly lockDirectoryPath: string;
  readonly ownerFilePath: string;
  isHeld(): boolean;
  /**
   * Try to become the Recovery Store owner. Returns `"acquired"` only when
   * this call created the lock directory AND wrote `owner.json`. Any other
   * outcome (`EEXIST`, permission error, a failed marker write) is
   * `"unavailable"` — the caller must then behave as a Recovery non-owner
   * and touch nothing.
   */
  acquire(
    owner: RecoveryStoreOwnerInfo
  ): Promise<RecoveryStoreLockAcquireResult>;
  /**
   * Relinquish ownership: delete `owner.json` (best effort) and `rmdir` the
   * lock directory. `"notHeld"` when this instance never acquired it;
   * `"failed"` when the directory could not be removed (ownership is still
   * dropped in-process).
   */
  release(): Promise<RecoveryStoreLockReleaseResult>;
}

export interface CreateRecoveryStoreLockOptions {
  /** Absolute path to `<userData>/Recovery/Recovery.lock`. */
  readonly lockDirectoryPath: string;
  readonly fileSystem?: RecoveryStoreLockFileSystem;
}

const defaultFileSystem: RecoveryStoreLockFileSystem = {
  mkdir: (dirPath) => nodeFs.mkdir(dirPath).then(() => undefined),
  writeFile: (filePath, data, options) =>
    nodeFs.writeFile(filePath, data, options),
  rm: (filePath, options) => nodeFs.rm(filePath, options),
  rmdir: (dirPath) => nodeFs.rmdir(dirPath)
};

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

export function createRecoveryStoreLock(
  options: CreateRecoveryStoreLockOptions
): RecoveryStoreLock {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const lockDirectoryPath = options.lockDirectoryPath;
  const ownerFilePath = path.join(
    lockDirectoryPath,
    recoveryStoreLockOwnerFileName
  );

  let held = false;

  async function bestEffortCleanupOwnDirectory(): Promise<void> {
    try {
      await fileSystem.rm(ownerFilePath, { force: true });
    } catch {
      // Only ever our own just-created marker.
    }

    try {
      await fileSystem.rmdir(lockDirectoryPath);
    } catch {
      // Our own just-created empty directory; a failure here is harmless.
    }
  }

  async function acquire(
    owner: RecoveryStoreOwnerInfo
  ): Promise<RecoveryStoreLockAcquireResult> {
    if (held) {
      return "acquired";
    }

    try {
      await fileSystem.mkdir(lockDirectoryPath);
    } catch (error) {
      // `EEXIST` — someone else owns it. Anything else (EACCES, EROFS, …) —
      // we cannot safely own it. Either way: non-owner, wait for nothing,
      // break nothing.
      void nodeErrorCode(error);
      return "unavailable";
    }

    try {
      await fileSystem.writeFile(
        ownerFilePath,
        `${JSON.stringify(owner, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
    } catch {
      // We created the (empty) directory but could not stamp it. Roll back
      // our own artifacts so a later run can still acquire cleanly.
      await bestEffortCleanupOwnDirectory();
      return "unavailable";
    }

    held = true;
    return "acquired";
  }

  async function release(): Promise<RecoveryStoreLockReleaseResult> {
    if (!held) {
      return "notHeld";
    }

    held = false;

    try {
      await fileSystem.rm(ownerFilePath, { force: true });
    } catch {
      // Best effort — the directory removal below is what matters.
    }

    try {
      await fileSystem.rmdir(lockDirectoryPath);
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") {
        return "released";
      }

      return "failed";
    }

    return "released";
  }

  return {
    lockDirectoryPath,
    ownerFilePath,
    isHeld: () => held,
    acquire,
    release
  };
}
