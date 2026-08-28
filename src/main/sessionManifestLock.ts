/**
 * #272 (PO decision — degradation over takeover): cross-process
 * serialization for `<userData>/sessions/manifest.json` read-modify-write.
 *
 * The `SessionStore`'s in-memory promise queue only orders mutations within
 * one process. Two Pergamum processes sharing the same `userData` could
 * both read the manifest, both append a different sessionId, and one write
 * would clobber the other — a silent orphan. This lock prevents that.
 *
 * Protocol (directory + per-owner marker file):
 *
 *   - the atomic primitive is `mkdir(<lock>)` (EEXIST ⇒ held by someone).
 *   - the acquirer then writes ONE marker file `owner.<token>.json` inside,
 *     carrying `{ token, pid, hostname }`. The marker exists ONLY as
 *     release-time ownership proof: RELEASE removes `owner.<ourToken>.json`
 *     by name and then `rmdir`s the lock dir if it is now empty. A holder
 *     can never touch a *different* owner's marker.
 *
 * There is deliberately NO runtime lock reclamation of any kind. A lock
 * that is held is NEVER force-broken — not on marker age, not on a
 * "seemingly dead" pid, not on hostname, not on a missing / unreadable
 * marker. An HDD / USB / VM / Defender scan / synced FS / transient I/O
 * stall can make a genuinely live owner slow, and an ABA race (owner B
 * reclaims what looks like a dead lock, acquires a fresh one; owner C,
 * having made the same stale judgment a moment earlier, then deletes B's
 * fresh lock) can silently corrupt the restore set. So if the lock dir
 * exists we simply wait a bounded time: if the current owner releases
 * normally we take it and continue; if the wait times out we FAIL with
 * `SessionManifestLockUnavailableError` and the caller degrades Session
 * persistence to SUSPENDED. Pergamum is the flat-tyre warning light, not
 * the tyre-repair shop.
 *
 * The acquire-failing side deletes NOTHING belonging to the existing
 * owner — a marker-less dir, a broken marker, an old-looking marker and a
 * seemingly-dead pid are all just "a lock I cannot safely acquire" →
 * bounded wait → SUSPENDED.
 *
 * Only `manifest.json` membership goes through here.
 */

import { randomUUID } from "node:crypto";
import { promises as nodeFs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SessionManifestLock {
  /** Run `operation` while holding the cross-process manifest lock. */
  run<T>(operation: () => Promise<T>): Promise<T>;
}

export class SessionManifestLockUnavailableError extends Error {
  constructor() {
    super("Could not acquire the session manifest lock.");
    this.name = "SessionManifestLockUnavailableError";
  }
}

export interface ManifestLockFileSystem {
  mkdir(
    dirPath: string,
    options?: { recursive?: boolean }
  ): Promise<string | undefined>;
  writeFile(
    filePath: string,
    data: string,
    options: { encoding: "utf8"; flag: "wx" }
  ): Promise<void>;
  rm(targetPath: string, options: { force?: boolean }): Promise<void>;
  rmdir(dirPath: string): Promise<void>;
}

export interface CreateFsSessionManifestLockOptions {
  /** Absolute path of the lock DIRECTORY, e.g. `<sessions>/manifest.lock`. */
  readonly lockFilePath: string;
  readonly fileSystem?: ManifestLockFileSystem;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly retryDelayMs?: number;
  /** Bounded wait before giving up and failing (→ SUSPENDED). */
  readonly acquireTimeoutMs?: number;
  readonly pid?: () => number;
  readonly hostname?: () => string;
  readonly createToken?: () => string;
}

interface ManifestLockMarker {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
}

const DEFAULT_RETRY_DELAY_MS = 25;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;

const MARKER_PREFIX = "owner.";
const MARKER_SUFFIX = ".json";

const defaultFileSystem: ManifestLockFileSystem =
  nodeFs as unknown as ManifestLockFileSystem;

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFsSessionManifestLock(
  options: CreateFsSessionManifestLockOptions
): SessionManifestLock {
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? defaultSleep;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const acquireTimeoutMs =
    options.acquireTimeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const pid = options.pid ?? (() => process.pid);
  const hostname = options.hostname ?? (() => os.hostname());
  const createToken = options.createToken ?? (() => randomUUID());

  const lockDirPath = options.lockFilePath;
  const lockParentPath = path.dirname(lockDirPath);

  function markerPath(token: string): string {
    return path.join(lockDirPath, `${MARKER_PREFIX}${token}${MARKER_SUFFIX}`);
  }

  async function writeOurMarker(token: string): Promise<void> {
    // `pid` / `hostname` are written purely as human-facing diagnostics for
    // anyone inspecting a leftover lock by hand. Nothing in this module ever
    // reads them back — acquisition never inspects the current owner.
    const marker: ManifestLockMarker = {
      token,
      pid: pid(),
      hostname: hostname()
    };

    await fileSystem.writeFile(markerPath(token), JSON.stringify(marker), {
      encoding: "utf8",
      flag: "wx"
    });
  }

  async function acquire(): Promise<string> {
    const deadline = now() + acquireTimeoutMs;
    const token = createToken();

    await fileSystem.mkdir(lockParentPath, { recursive: true });

    for (;;) {
      try {
        await fileSystem.mkdir(lockDirPath);
      } catch (error) {
        if (nodeErrorCode(error) !== "EEXIST") {
          throw error;
        }

        // Held by someone else. We NEVER inspect, judge, or break it:
        // no PID probe, no hostname check, no marker-age check, no rm. We
        // wait a bounded time for a normal release, then FAIL so the caller
        // SUSPENDS Session persistence.
        if (now() >= deadline) {
          throw new SessionManifestLockUnavailableError();
        }

        await sleep(retryDelayMs);
        continue;
      }

      // We just created the (empty) lock dir → we own it. Stamp it with our
      // marker as release-time proof.
      try {
        await writeOurMarker(token);
        return token;
      } catch {
        // Only our own fresh, empty dir is touched here.
        await release(token);

        if (now() >= deadline) {
          throw new SessionManifestLockUnavailableError();
        }

        await sleep(retryDelayMs);
      }
    }
  }

  async function release(token: string): Promise<void> {
    try {
      await fileSystem.rm(markerPath(token), { force: true });
    } catch {
      // best effort — we only ever remove our OWN marker, by name.
    }

    try {
      await fileSystem.rmdir(lockDirPath);
    } catch {
      // Not empty (a newer owner is present) or already gone — either is
      // fine; we never recursively remove another owner's lock.
    }
  }

  return {
    async run<T>(operation: () => Promise<T>): Promise<T> {
      const token = await acquire();

      try {
        return await operation();
      } finally {
        await release(token);
      }
    }
  };
}
