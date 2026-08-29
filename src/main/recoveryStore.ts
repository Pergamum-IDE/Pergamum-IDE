/**
 * Phase 6-4-2: the Recovery Store orchestrator (main process only).
 *
 * Startup flow:
 *   1. resolve `<userData>/Recovery/` paths and create the directory,
 *   2. try to acquire the mkdir-based ownership lock,
 *        - lost  → status `nonOwner`; DO NOT open Recovery.db, DO NOT
 *                  write, DO NOT notify the user, stay silent,
 *        - won   → open / initialise Recovery.db (WAL + synchronous FULL,
 *                  archive an unknown schema instead of deleting it),
 *   3. any failure → release the lock and hold status `unavailable`; the
 *      app keeps running.
 *
 * The resulting `RecoveryStoreStatus` is kept as module state for the life
 * of the run and served (read-only) to later phases. Nothing here handles
 * `payload_text` — that is Phase 6-4-3.
 */

import type { Database as BetterSqliteDatabase } from "better-sqlite3";
import { promises as nodeFs } from "node:fs";
import path from "node:path";
import {
  createRecoveryStoreOwnerInfo,
  recoveryStoreDatabaseFileName,
  recoveryStoreDirectoryName,
  recoveryStoreLockDirectoryName,
  type RecoveryStoreStatus
} from "../shared/recovery";
import type { DebugLogRecoveryJournalMode } from "../shared/debugLog";
import type { DebugLogger } from "./debugLogger";
import {
  createRecoveryStoreLock,
  type RecoveryStoreLock,
  type RecoveryStoreLockStaleTakeoverInfo
} from "./recoveryStoreLock";
import {
  openRecoveryStoreDatabase,
  RecoveryStoreUnavailableError,
  type OpenRecoveryStoreDatabaseOptions,
  type RecoveryStoreDatabaseHandle
} from "./recoveryStoreDatabase";
import {
  probeProcessLiveness as defaultProbeProcessLiveness,
  type ProcessLiveness
} from "./processLiveness";

type RecoveryStoreLogger = Pick<DebugLogger, "log">;

const noopLogger: RecoveryStoreLogger = { log: () => undefined };

export interface RecoveryStorePaths {
  readonly recoveryDirectoryPath: string;
  readonly databasePath: string;
  readonly lockDirectoryPath: string;
}

export interface InitializeRecoveryStoreOptions {
  readonly userDataPath: string;
  readonly instanceRunId: string;
  readonly appVersion: string;
  readonly logger?: RecoveryStoreLogger;
  readonly now?: () => Date;
  readonly pid?: () => number;
  /** Test seams. */
  readonly deps?: {
    readonly mkdir?: (dirPath: string) => Promise<void>;
    readonly createLock?: (lockDirectoryPath: string) => RecoveryStoreLock;
    readonly openDatabase?: (
      options: OpenRecoveryStoreDatabaseOptions
    ) => Promise<RecoveryStoreDatabaseHandle>;
    readonly createStoreId?: () => string;
    readonly renameForArchive?: (from: string, to: string) => Promise<void>;
    /** #293: liveness probe for the stale-`Recovery.lock` reclamation path. */
    readonly probeProcessLiveness?: (pid: number) => ProcessLiveness;
  };
}

let currentStatus: RecoveryStoreStatus | null = null;
let currentLock: RecoveryStoreLock | null = null;
let currentHandle: RecoveryStoreDatabaseHandle | null = null;

export function recoveryStorePaths(userDataPath: string): RecoveryStorePaths {
  const recoveryDirectoryPath = path.join(
    userDataPath,
    recoveryStoreDirectoryName
  );

  return {
    recoveryDirectoryPath,
    databasePath: path.join(
      recoveryDirectoryPath,
      recoveryStoreDatabaseFileName
    ),
    lockDirectoryPath: path.join(
      recoveryDirectoryPath,
      recoveryStoreLockDirectoryName
    )
  };
}

/** The Recovery Store view for this run, or `null` before initialisation. */
export function recoveryStoreStatus(): RecoveryStoreStatus | null {
  return currentStatus;
}

/**
 * Phase 6-4-3: the live `Recovery.db` connection — but ONLY when this
 * instance is the Recovery owner. A non-owner / unavailable run gets
 * `null`, so no caller can accidentally read or write the store it does not
 * own.
 */
export function recoveryStoreOwnerDatabase(): BetterSqliteDatabase | null {
  return currentStatus?.kind === "owner" && currentHandle
    ? currentHandle.database
    : null;
}

function normalizeJournalMode(value: string): DebugLogRecoveryJournalMode {
  return value.toLowerCase() === "wal" ? "wal" : "other";
}

/**
 * #293: body-free / path-safe details for the stale-`Recovery.lock` events.
 * The dead owner's `pid` / `appVersion` / `createdAt` come straight from the
 * leftover `owner.json`; the archived directory name and every store path
 * are deliberately NOT logged (a `pathKind: "appData"` marker stands in).
 */
function staleTakeoverLogDetails(
  info: RecoveryStoreLockStaleTakeoverInfo,
  instanceRunId: string,
  startedAt: number,
  result: "succeeded" | "failed" | "ignored"
): Record<string, unknown> {
  return {
    pathKind: "appData",
    result,
    instanceRunId,
    ownerPid: info.ownerPid,
    ownerAppVersion: info.ownerAppVersion,
    ownerCreatedAt: info.ownerCreatedAt,
    durationMs: Math.max(0, Date.now() - startedAt)
  };
}

function normalizeSynchronous(value: number): "full" | "other" {
  return value === 2 ? "full" : "other";
}

export async function initializeRecoveryStore(
  options: InitializeRecoveryStoreOptions
): Promise<RecoveryStoreStatus> {
  if (currentStatus) {
    return currentStatus;
  }

  const logger = options.logger ?? noopLogger;
  const now = options.now ?? (() => new Date());
  const pid = options.pid ?? (() => process.pid);
  const mkdir =
    options.deps?.mkdir ??
    ((dirPath: string) =>
      nodeFs.mkdir(dirPath, { recursive: true }).then(() => undefined));
  const createLock =
    options.deps?.createLock ??
    ((lockDirectoryPath: string) =>
      createRecoveryStoreLock({ lockDirectoryPath }));
  const openDatabase = options.deps?.openDatabase ?? openRecoveryStoreDatabase;

  const paths = recoveryStorePaths(options.userDataPath);
  const startedAt = Date.now();

  logger.log({
    level: "debug",
    event: "recovery.store.init.started",
    details: {
      pathKind: "appData",
      instanceRunId: options.instanceRunId
    }
  });

  try {
    await mkdir(paths.recoveryDirectoryPath);
  } catch (error) {
    currentStatus = {
      kind: "unavailable",
      recoveryDirectoryPath: paths.recoveryDirectoryPath,
      reason: "recoveryDirectoryUnavailable"
    };
    logger.log({
      level: "error",
      event: "recovery.store.init.failed",
      details: {
        pathKind: "appData",
        reason: "unknown",
        error,
        durationMs: Math.max(0, Date.now() - startedAt)
      }
    });

    return currentStatus;
  }

  const lock = createLock(paths.lockDirectoryPath);
  const probeProcessLiveness =
    options.deps?.probeProcessLiveness ?? defaultProbeProcessLiveness;
  const acquireResult = await lock.acquire(
    createRecoveryStoreOwnerInfo({
      instanceRunId: options.instanceRunId,
      pid: pid(),
      appVersion: options.appVersion,
      now: now()
    }),
    { staleReclamation: { probeProcessLiveness, now } }
  );
  const staleTakeover = acquireResult.staleTakeover;

  if (staleTakeover) {
    if (staleTakeover.phase === "refused") {
      // A lock exists but its recorded owner probes alive / unknown — this
      // is a REFUSAL, not a stale lock. No archive, no reacquire, no DB.
      logger.log({
        level: "debug",
        event: "recovery.store.lock.reclamation.refused",
        details: {
          ...staleTakeoverLogDetails(
            staleTakeover,
            options.instanceRunId,
            startedAt,
            "ignored"
          ),
          reason: "locked"
        }
      });
    } else {
      // Dead owner: announce the stale lock before acting on it. The
      // outcome-specific event (archived / reacquire.succeeded / *.failed)
      // follows below.
      logger.log({
        level: "debug",
        event: "recovery.store.lock.stale.detected",
        details: staleTakeoverLogDetails(
          staleTakeover,
          options.instanceRunId,
          startedAt,
          "ignored"
        )
      });
    }
  }

  if (acquireResult.outcome !== "acquired") {
    // #293: surface a failed stale-lock reclamation attempt (the plain
    // "held by a live instance" and the missing/malformed-marker cases
    // carry no `staleTakeover` / a `refused` phase and log only
    // `recovery.store.init.skipped`, exactly as before).
    if (staleTakeover?.phase === "archiveFailed") {
      logger.log({
        level: "error",
        event: "recovery.store.lock.stale.archive.failed",
        details: staleTakeoverLogDetails(
          staleTakeover,
          options.instanceRunId,
          startedAt,
          "failed"
        )
      });
    } else if (staleTakeover?.phase === "reacquireFailed") {
      logger.log({
        level: "error",
        event: "recovery.store.lock.reacquire.failed",
        details: staleTakeoverLogDetails(
          staleTakeover,
          options.instanceRunId,
          startedAt,
          "failed"
        )
      });
    }

    // Another instance owns the store (or a stale lock could not be safely
    // reclaimed). Say nothing to the user, do nothing.
    currentStatus = {
      kind: "nonOwner",
      recoveryDirectoryPath: paths.recoveryDirectoryPath,
      lockDirectoryPath: paths.lockDirectoryPath,
      reason: "lockUnavailable"
    };
    // A non-owner is the expected outcome in Pergamum's multi-instance
    // model — record it for diagnostics only, not as an info-level
    // lifecycle event.
    logger.log({
      level: "debug",
      event: "recovery.store.init.skipped",
      details: {
        pathKind: "appData",
        reason: "locked",
        instanceRunId: options.instanceRunId,
        durationMs: Math.max(0, Date.now() - startedAt)
      }
    });

    return currentStatus;
  }

  if (staleTakeover?.phase === "reacquired") {
    // #293: we took over a lock left by a killed owner — the archived
    // directory is kept for forensics; `Recovery.db` is opened, not
    // recreated, further down.
    logger.log({
      level: "info",
      event: "recovery.store.lock.stale.archived",
      details: staleTakeoverLogDetails(
        staleTakeover,
        options.instanceRunId,
        startedAt,
        "succeeded"
      )
    });
    logger.log({
      level: "info",
      event: "recovery.store.lock.reacquire.succeeded",
      details: staleTakeoverLogDetails(
        staleTakeover,
        options.instanceRunId,
        startedAt,
        "succeeded"
      )
    });
  }

  currentLock = lock;

  let handle: RecoveryStoreDatabaseHandle;

  try {
    handle = await openDatabase({
      databasePath: paths.databasePath,
      appVersion: options.appVersion,
      now,
      ...(options.deps?.createStoreId
        ? { createStoreId: options.deps.createStoreId }
        : {}),
      ...(options.deps?.renameForArchive
        ? { renameForArchive: options.deps.renameForArchive }
        : {})
    });
  } catch (error) {
    const reason =
      error instanceof RecoveryStoreUnavailableError
        ? error.reason
        : "databaseUnavailable";

    await lock.release().catch(() => undefined);
    currentLock = null;
    currentStatus = {
      kind: "unavailable",
      recoveryDirectoryPath: paths.recoveryDirectoryPath,
      reason
    };
    logger.log({
      level: "error",
      event: "recovery.store.init.failed",
      details: {
        pathKind: "appData",
        reason: "database_unavailable",
        instanceRunId: options.instanceRunId,
        error,
        durationMs: Math.max(0, Date.now() - startedAt)
      }
    });

    return currentStatus;
  }

  currentHandle = handle;

  if (handle.initMode === "archivedAndRecreated") {
    logger.log({
      level: "info",
      event: "recovery.store.schema.archived",
      details: {
        pathKind: "appData",
        result: "succeeded",
        instanceRunId: options.instanceRunId,
        ...(handle.archivedFromSchemaVersion !== undefined
          ? { schemaVersion: handle.archivedFromSchemaVersion }
          : {})
      }
    });
  }

  currentStatus = {
    kind: "owner",
    recoveryDirectoryPath: paths.recoveryDirectoryPath,
    databasePath: paths.databasePath,
    lockDirectoryPath: paths.lockDirectoryPath,
    storeId: handle.storeId
  };

  logger.log({
    level: "info",
    event: "recovery.store.init.succeeded",
    details: {
      pathKind: "appData",
      instanceRunId: options.instanceRunId,
      schemaVersion: handle.schemaVersion,
      journalMode: normalizeJournalMode(handle.journalMode),
      synchronous: normalizeSynchronous(handle.synchronous),
      durationMs: Math.max(0, Date.now() - startedAt)
    }
  });

  return currentStatus;
}

/**
 * Release the ownership lock and close Recovery.db (owner only; a no-op for
 * a non-owner / unavailable run). Called from the normal-shutdown cleanup.
 */
export async function shutdownRecoveryStore(
  logger: RecoveryStoreLogger = noopLogger
): Promise<void> {
  if (currentHandle) {
    try {
      currentHandle.close();
    } catch {
      // A close failure must not block shutdown.
    }
    currentHandle = null;
  }

  if (currentLock) {
    const releaseResult = await currentLock.release().catch(() => "failed");
    currentLock = null;
    logger.log({
      level: "debug",
      event: "recovery.store.lock.released",
      details: {
        result:
          releaseResult === "released"
            ? "succeeded"
            : releaseResult === "notHeld"
              ? "ignored"
              : "failed"
      }
    });
  }
}

/** Test-only: drop all module state (and close any open handle). */
export function __resetRecoveryStoreForTests(): void {
  if (currentHandle) {
    try {
      currentHandle.close();
    } catch {
      // ignore
    }
  }
  currentHandle = null;
  currentLock = null;
  currentStatus = null;
}

/** Test-only: the live owner DB handle, for PRAGMA assertions. */
export function __recoveryStoreDatabaseForTests(): RecoveryStoreDatabaseHandle | null {
  return currentHandle;
}
