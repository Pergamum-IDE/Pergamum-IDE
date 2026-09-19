/**
 * #272 cross-process serialization for `<userData>/sessions/manifest.json`.
 * #519 stale lock reclamation & lock diagnostics.
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
  readonly details?: Record<string, unknown>;

  constructor(details?: Record<string, unknown>) {
    super("Could not acquire the session manifest lock.");
    this.name = "SessionManifestLockUnavailableError";
    this.details = details;
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
  readdir?(dirPath: string): Promise<string[]>;
  readFile?(filePath: string, encoding: "utf8"): Promise<string>;
  stat?(targetPath: string): Promise<{ mtimeMs: number }>;
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
  /** Duration in ms after which an unreleased lock is considered stale and reclaimable. Default 30,000ms. */
  readonly staleAfterMs?: number;
  readonly pid?: () => number;
  readonly hostname?: () => string;
  readonly createToken?: () => string;
  readonly logDebug?: (event: string, details: Record<string, unknown>) => void;
}

interface ManifestLockMarker {
  readonly token: string;
  readonly pid: number;
  readonly hostname: string;
  readonly acquiredAt: number;
}

const DEFAULT_RETRY_DELAY_MS = 25;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 10_000;
const DEFAULT_STALE_AFTER_MS = 30_000;

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
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const pid = options.pid ?? (() => process.pid);
  const hostname = options.hostname ?? (() => os.hostname());
  const createToken = options.createToken ?? (() => randomUUID());
  const logDebug = options.logDebug;

  const lockDirPath = options.lockFilePath;
  const lockParentPath = path.dirname(lockDirPath);

  function markerPath(token: string): string {
    return path.join(lockDirPath, `${MARKER_PREFIX}${token}${MARKER_SUFFIX}`);
  }

  async function fsReaddir(dirPath: string): Promise<string[]> {
    if (fileSystem.readdir) {
      return fileSystem.readdir(dirPath);
    }
    return nodeFs.readdir(dirPath);
  }

  async function fsReadFile(filePath: string): Promise<string> {
    if (fileSystem.readFile) {
      return fileSystem.readFile(filePath, "utf8");
    }
    return nodeFs.readFile(filePath, "utf8");
  }

  async function fsStat(targetPath: string): Promise<{ mtimeMs: number }> {
    if (fileSystem.stat) {
      return fileSystem.stat(targetPath);
    }
    return nodeFs.stat(targetPath);
  }

  async function writeOurMarker(token: string): Promise<void> {
    const marker: ManifestLockMarker = {
      token,
      pid: pid(),
      hostname: hostname(),
      acquiredAt: now()
    };

    await fileSystem.writeFile(markerPath(token), JSON.stringify(marker), {
      encoding: "utf8",
      flag: "wx"
    });
  }

  interface MarkerInspection {
    readonly fileName: string;
    readonly token?: string;
    readonly pid?: number;
    readonly hostname?: string;
    readonly acquiredAt?: number;
    readonly isStale: boolean;
    readonly raw?: string;
  }

  interface LockInspection {
    readonly exists: boolean;
    readonly dirMtimeMs?: number;
    readonly markers: readonly MarkerInspection[];
    readonly isStale: boolean;
  }

  async function inspectLock(): Promise<LockInspection> {
    let dirMtimeMs: number | undefined;
    try {
      const st = await fsStat(lockDirPath);
      dirMtimeMs = st.mtimeMs;
    } catch {
      return { exists: false, markers: [], isStale: false };
    }

    let entries: string[] = [];
    try {
      entries = await fsReaddir(lockDirPath);
    } catch {
      return { exists: true, dirMtimeMs, markers: [], isStale: false };
    }

    const markerFiles = entries.filter(
      (name) => name.startsWith(MARKER_PREFIX) && name.endsWith(MARKER_SUFFIX)
    );

    const currentTime = now();
    const dirAgeMs = dirMtimeMs !== undefined ? currentTime - dirMtimeMs : 0;
    const isDirStale = dirAgeMs > staleAfterMs;

    if (markerFiles.length === 0) {
      return {
        exists: true,
        dirMtimeMs,
        markers: [],
        isStale: isDirStale
      };
    }

    const inspections: MarkerInspection[] = [];
    let hasFreshMarker = false;

    for (const fileName of markerFiles) {
      let raw: string | undefined;
      let parsed: unknown;
      try {
        raw = await fsReadFile(path.join(lockDirPath, fileName));
        parsed = JSON.parse(raw);
      } catch {
        // Unreadable or malformed JSON
      }

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "acquiredAt" in parsed &&
        typeof (parsed as { acquiredAt: unknown }).acquiredAt === "number"
      ) {
        const p = parsed as ManifestLockMarker;
        const ageMs = currentTime - p.acquiredAt;
        const markerIsStale = ageMs > staleAfterMs;
        if (!markerIsStale) {
          hasFreshMarker = true;
        }
        inspections.push({
          fileName,
          token: p.token,
          pid: p.pid,
          hostname: p.hostname,
          acquiredAt: p.acquiredAt,
          isStale: markerIsStale,
          raw
        });
      } else {
        // Legacy or unreadable marker: rely on dir mtime
        if (!isDirStale) {
          hasFreshMarker = true;
        }
        inspections.push({
          fileName,
          isStale: isDirStale,
          raw
        });
      }
    }

    return {
      exists: true,
      dirMtimeMs,
      markers: inspections,
      isStale: !hasFreshMarker
    };
  }

  async function tryReclaim(inspection: LockInspection): Promise<boolean> {
    if (!inspection.isStale) {
      return false;
    }

    // Unlink stale marker files
    for (const marker of inspection.markers) {
      try {
        await fileSystem.rm(path.join(lockDirPath, marker.fileName), {
          force: true
        });
      } catch {
        // ignore
      }
    }

    // Attempt to rmdir the lock directory
    try {
      await fileSystem.rmdir(lockDirPath);
    } catch {
      // If rmdir fails (e.g. non-empty due to concurrent write), abort reclaim
      return false;
    }

    logDebug?.("session.manifestLock.reclaimed", {
      lockDirPath,
      dirMtimeMs: inspection.dirMtimeMs,
      markerCount: inspection.markers.length,
      markers: inspection.markers.map((m) => ({
        fileName: m.fileName,
        token: m.token,
        pid: m.pid,
        hostname: m.hostname,
        acquiredAt: m.acquiredAt
      }))
    });

    return true;
  }

  async function acquire(): Promise<string> {
    const deadline = now() + acquireTimeoutMs;
    const token = createToken();
    let reclaimedInThisAcquire = false;

    await fileSystem.mkdir(lockParentPath, { recursive: true });

    for (;;) {
      try {
        await fileSystem.mkdir(lockDirPath);
      } catch (error) {
        const code = nodeErrorCode(error);
        if (code !== "EEXIST" && code !== "EPERM") {
          throw error;
        }

        if (!reclaimedInThisAcquire && code === "EEXIST") {
          const inspection = await inspectLock();
          if (inspection.isStale) {
            reclaimedInThisAcquire = true;
            const reclaimed = await tryReclaim(inspection);
            if (reclaimed) {
              continue;
            }
          }
        }

        if (now() >= deadline) {
          if (code === "EEXIST") {
            const inspection = await inspectLock();
            throw new SessionManifestLockUnavailableError({
              lockDirPath,
              dirMtimeMs: inspection.dirMtimeMs,
              markerCount: inspection.markers.length,
              markers: inspection.markers.map((m) => ({
                token: m.token,
                pid: m.pid,
                hostname: m.hostname,
                acquiredAt: m.acquiredAt
              }))
            });
          }
          throw error;
        }

        await sleep(retryDelayMs);
        continue;
      }

      // We just created the (empty) lock dir → we own it.
      try {
        await writeOurMarker(token);
        return token;
      } catch {
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
      // best effort
    }

    try {
      await fileSystem.rmdir(lockDirPath);
    } catch {
      // Not empty or already gone
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
