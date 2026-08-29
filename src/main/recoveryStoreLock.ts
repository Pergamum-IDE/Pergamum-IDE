/**
 * Phase 6-4-2: the Recovery Store's cross-process ownership lock.
 *
 * The atomic primitive is `mkdir(<Recovery.lock>)` — it succeeds for
 * exactly one caller and throws `EEXIST` for everyone else. The winner
 * writes `owner.json` inside as human-facing diagnostics and holds the
 * directory for the life of the run; on normal shutdown it deletes
 * `owner.json` and `rmdir`s the lock.
 *
 * The default (`staleReclamation` omitted) still does NOTHING on `EEXIST`
 * except report `unavailable`:
 *   - no bounded wait / retry (a later instance is a Recovery non-owner
 *     *immediately*, and stays silent),
 *   - the acquire-failing side deletes NOTHING belonging to the holder.
 *
 * #293: when a `staleReclamation` policy is supplied, an `EEXIST` failure
 * additionally attempts a NARROW, provable reclamation of a lock left
 * behind by a killed owner:
 *   - `mkdir` remains the final ownership primitive — even after stale
 *     detection, ownership is granted only by a fresh `mkdir` this call
 *     wins,
 *   - the stale `Recovery.lock/` is RENAMED aside
 *     (`Recovery.lock.stale-<ts>-<runIdFrag>/`), never deleted, so forensic
 *     traces survive,
 *   - every ambiguous / inconclusive branch refuses and returns
 *     `unavailable` (missing / malformed `owner.json`, an owner that is
 *     alive or whose liveness cannot be proven, a TOCTOU mismatch, an
 *     archive or re-`mkdir` failure),
 *   - it never touches `Recovery.db` / `-wal` / `-shm`,
 *   - it runs at most once per `acquire()` call: no loop, no recursion.
 *
 * Only the Recovery Store's `main` orchestrator uses this.
 */

import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  parseRecoveryStoreOwnerInfo,
  recoveryStoreLockOwnerFileName,
  type RecoveryStoreOwnerInfo
} from "../shared/recovery";
import type { ProcessLiveness } from "./processLiveness";

export interface RecoveryStoreLockFileSystem {
  mkdir(dirPath: string): Promise<void>;
  writeFile(
    filePath: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" }
  ): Promise<void>;
  rm(filePath: string, options: { force: true }): Promise<void>;
  rmdir(dirPath: string): Promise<void>;
  /** #293: read `owner.json` (utf8) during stale-lock reclamation. */
  readFile(filePath: string): Promise<string>;
  /** #293: archive the stale lock directory aside (never a delete). */
  rename(fromPath: string, toPath: string): Promise<void>;
  /** #293: minimal stat — only "is this a directory?" is ever asked. */
  stat(targetPath: string): Promise<{ isDirectory(): boolean }>;
}

export type RecoveryStoreLockReleaseResult = "released" | "notHeld" | "failed";

/**
 * #293: which point the stale-lock reclamation reached. Carried back to the
 * orchestrator purely so it can emit the matching body-free debug event.
 *
 *   - `refused`         — a lock exists but reclamation was declined because
 *                         the recorded owner probes `alive` / `unknown`.
 *                         NOT a stale lock; no archive, no reacquire.
 *   - `reacquired`      — the owner pid was proven dead; the stale lock was
 *                         archived aside and a fresh lock re-`mkdir`ed.
 *   - `archiveFailed`   — dead owner, but the archive `rename` failed.
 *   - `reacquireFailed` — dead owner, archived, but the re-`mkdir` (or its
 *                         marker write / self-check) failed.
 */
export type RecoveryStoreLockStaleTakeoverPhase =
  | "refused"
  | "reacquired"
  | "archiveFailed"
  | "reacquireFailed";

export interface RecoveryStoreLockStaleTakeoverInfo {
  readonly phase: RecoveryStoreLockStaleTakeoverPhase;
  /** The dead owner recorded in the stale `owner.json` (diagnostics only). */
  readonly ownerPid: number;
  readonly ownerAppVersion: string;
  readonly ownerCreatedAt: string;
  /** Basename the stale lock dir was renamed to (present once archived). */
  readonly archivedLockDirName?: string;
}

export type RecoveryStoreLockAcquireOutcome =
  | {
      readonly outcome: "acquired";
      readonly staleTakeover?: RecoveryStoreLockStaleTakeoverInfo;
    }
  | {
      readonly outcome: "unavailable";
      readonly staleTakeover?: RecoveryStoreLockStaleTakeoverInfo;
    };

export interface RecoveryStoreLockStaleReclamationPolicy {
  readonly probeProcessLiveness: (pid: number) => ProcessLiveness;
  readonly now: () => Date;
}

export interface RecoveryStoreLockAcquireOptions {
  /**
   * When supplied, an `EEXIST` on `mkdir` triggers one narrow attempt to
   * reclaim a lock whose recorded owner process is provably dead. Omit for
   * the pre-#293 behavior (any `EEXIST` ⇒ `unavailable`).
   */
  readonly staleReclamation?: RecoveryStoreLockStaleReclamationPolicy;
}

export interface RecoveryStoreLock {
  readonly lockDirectoryPath: string;
  readonly ownerFilePath: string;
  isHeld(): boolean;
  /**
   * Try to become the Recovery Store owner. Resolves `{ outcome:
   * "acquired" }` only when this call created the lock directory AND wrote
   * `owner.json`. Any other result is `{ outcome: "unavailable" }` — the
   * caller must then behave as a Recovery non-owner and touch nothing.
   *
   * With `options.staleReclamation`, an `EEXIST` may still end in
   * `"acquired"` via a provable stale-lock takeover; `staleTakeover` then
   * carries the phase reached and the dead owner's diagnostics.
   */
  acquire(
    owner: RecoveryStoreOwnerInfo,
    options?: RecoveryStoreLockAcquireOptions
  ): Promise<RecoveryStoreLockAcquireOutcome>;
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
  rmdir: (dirPath) => nodeFs.rmdir(dirPath),
  readFile: (filePath) => nodeFs.readFile(filePath, "utf8"),
  rename: (fromPath, toPath) =>
    nodeFs.rename(fromPath, toPath).then(() => undefined),
  stat: async (targetPath) => {
    const stats = await nodeFs.stat(targetPath);
    return { isDirectory: () => stats.isDirectory() };
  }
};

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

/**
 * `<lockBasename>.stale-<iso-ish-timestamp>-<runIdFrag>` — the same
 * colon/dot-free timestamp convention the Recovery.db archiver uses, plus a
 * short fragment of THIS run's id so two instances archiving the same dead
 * lock in the same millisecond can never collide on the target name.
 */
function staleArchiveDirName(
  lockDirectoryPath: string,
  now: Date,
  instanceRunId: string
): string {
  const base = path.basename(lockDirectoryPath);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const fragment =
    instanceRunId.replace(/[^0-9a-fA-F]/g, "").slice(0, 8) || "run";

  return `${base}.stale-${timestamp}-${fragment}`;
}

function staleTakeoverInfo(
  phase: RecoveryStoreLockStaleTakeoverPhase,
  staleOwner: RecoveryStoreOwnerInfo,
  archivedLockDirName?: string
): RecoveryStoreLockStaleTakeoverInfo {
  return {
    phase,
    ownerPid: staleOwner.pid,
    ownerAppVersion: staleOwner.appVersion,
    ownerCreatedAt: staleOwner.createdAt,
    ...(archivedLockDirName ? { archivedLockDirName } : {})
  };
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

  async function writeOwnerMarker(
    owner: RecoveryStoreOwnerInfo
  ): Promise<boolean> {
    try {
      await fileSystem.writeFile(
        ownerFilePath,
        `${JSON.stringify(owner, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Read + parse the CURRENT `owner.json`, or `null` on any problem. */
  async function readOwnerInfo(): Promise<RecoveryStoreOwnerInfo | null> {
    let raw: string;

    try {
      raw = await fileSystem.readFile(ownerFilePath);
    } catch {
      return null;
    }

    try {
      return parseRecoveryStoreOwnerInfo(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /**
   * One narrow attempt (no loop, no recursion) to reclaim a lock whose
   * recorded owner is provably dead. `mkdir` stays the final ownership
   * primitive; the stale directory is renamed aside, never deleted; every
   * ambiguous branch returns `unavailable`.
   */
  async function reclaimStaleLock(
    owner: RecoveryStoreOwnerInfo,
    policy: RecoveryStoreLockStaleReclamationPolicy
  ): Promise<RecoveryStoreLockAcquireOutcome> {
    // 1. What is actually at `Recovery.lock`?
    let lockStat: { isDirectory(): boolean };

    try {
      lockStat = await fileSystem.stat(lockDirectoryPath);
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") {
        // The holder released between our `mkdir` and this stat — one clean
        // retry (this is not a takeover: nothing to archive).
        try {
          await fileSystem.mkdir(lockDirectoryPath);
        } catch {
          return { outcome: "unavailable" };
        }

        if (!(await writeOwnerMarker(owner))) {
          await bestEffortCleanupOwnDirectory();
          return { outcome: "unavailable" };
        }

        held = true;
        return { outcome: "acquired" };
      }

      return { outcome: "unavailable" };
    }

    if (!lockStat.isDirectory()) {
      // `Recovery.lock` is a stray file — never rename a mystery path.
      return { outcome: "unavailable" };
    }

    // 2/3. Read + validate the recorded owner.
    const firstOwner = await readOwnerInfo();

    if (!firstOwner) {
      // Missing / unreadable / malformed marker, or a marker-less dir (an
      // instance may be mid-acquire between its mkdir and its marker write).
      return { outcome: "unavailable" };
    }

    // 4. Liveness — the ONLY thing that permits a takeover. `alive` /
    // `unknown` is a refusal, not a stale-lock detection.
    if (policy.probeProcessLiveness(firstOwner.pid) !== "dead") {
      return {
        outcome: "unavailable",
        staleTakeover: staleTakeoverInfo("refused", firstOwner)
      };
    }

    // 5. TOCTOU re-read guard: the marker must be byte-stable and the pid
    // still dead. Defends against a fresh live owner replacing the dir in
    // the gap between the first read and the rename below.
    const secondOwner = await readOwnerInfo();

    if (
      !secondOwner ||
      secondOwner.instanceRunId !== firstOwner.instanceRunId ||
      secondOwner.createdAt !== firstOwner.createdAt ||
      policy.probeProcessLiveness(secondOwner.pid) !== "dead"
    ) {
      return { outcome: "unavailable" };
    }

    // 6. Archive the stale directory aside (rename — never a delete).
    const archivedLockDirName = staleArchiveDirName(
      lockDirectoryPath,
      policy.now(),
      owner.instanceRunId
    );
    const archivedLockDirPath = path.join(
      path.dirname(lockDirectoryPath),
      archivedLockDirName
    );

    try {
      await fileSystem.rename(lockDirectoryPath, archivedLockDirPath);
    } catch {
      // ENOENT (someone archived first), EPERM/EACCES, or the target
      // already exists — refuse, leave everything as found.
      return {
        outcome: "unavailable",
        staleTakeover: staleTakeoverInfo("archiveFailed", firstOwner)
      };
    }

    // 7. Re-acquire — a single `mkdir`. A concurrent instance may have won
    // the fresh directory; if so we lose. No re-entry into reclamation.
    try {
      await fileSystem.mkdir(lockDirectoryPath);
    } catch {
      return {
        outcome: "unavailable",
        staleTakeover: staleTakeoverInfo(
          "reacquireFailed",
          firstOwner,
          archivedLockDirName
        )
      };
    }

    // 8. Stamp a FRESH owner.json for this process.
    if (!(await writeOwnerMarker(owner))) {
      await bestEffortCleanupOwnDirectory();
      return {
        outcome: "unavailable",
        staleTakeover: staleTakeoverInfo(
          "reacquireFailed",
          firstOwner,
          archivedLockDirName
        )
      };
    }

    // 9. Post-mkdir self-check: the marker we just read back must be ours.
    const confirmed = await readOwnerInfo();

    if (!confirmed || confirmed.instanceRunId !== owner.instanceRunId) {
      held = false;
      return {
        outcome: "unavailable",
        staleTakeover: staleTakeoverInfo(
          "reacquireFailed",
          firstOwner,
          archivedLockDirName
        )
      };
    }

    held = true;
    return {
      outcome: "acquired",
      staleTakeover: staleTakeoverInfo(
        "reacquired",
        firstOwner,
        archivedLockDirName
      )
    };
  }

  async function acquire(
    owner: RecoveryStoreOwnerInfo,
    options?: RecoveryStoreLockAcquireOptions
  ): Promise<RecoveryStoreLockAcquireOutcome> {
    if (held) {
      return { outcome: "acquired" };
    }

    try {
      await fileSystem.mkdir(lockDirectoryPath);
    } catch (error) {
      // `EEXIST` — someone else owns it. Anything else (EACCES, EROFS, …) —
      // we cannot safely own it. Without a stale-reclamation policy this is
      // always the end: non-owner, wait for nothing, break nothing.
      if (
        nodeErrorCode(error) !== "EEXIST" ||
        !options?.staleReclamation
      ) {
        return { outcome: "unavailable" };
      }

      return reclaimStaleLock(owner, options.staleReclamation);
    }

    if (!(await writeOwnerMarker(owner))) {
      // We created the (empty) directory but could not stamp it. Roll back
      // our own artifacts so a later run can still acquire cleanly.
      await bestEffortCleanupOwnDirectory();
      return { outcome: "unavailable" };
    }

    held = true;
    return { outcome: "acquired" };
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
