/**
 * Phase 6-4-2: shared contracts for the Recovery Store — the app
 * `userData`-side dedicated store that later phases use to protect unsaved
 * working-copy content (ADR-0009 S-8 / S-9). This module carries ONLY the
 * types, name constants, and pure parsers shared between main and preload;
 * it never touches the filesystem or SQLite.
 *
 * Layout (owned entirely by the main process):
 *
 *   <app userData>/Recovery/
 *   ├─ Recovery.db
 *   ├─ Recovery.db-wal
 *   ├─ Recovery.db-shm
 *   └─ Recovery.lock/
 *      └─ owner.json
 *
 * The Recovery Store is NEVER placed under a project root
 * (`.pergamum_recovery/`, `<project root>/Recovery.db`) or inside the
 * project DB.
 */

import { isUuidv7 } from "./uuidv7";

/** Bumped only when the Recovery.db schema changes in a non-additive way. */
export const RECOVERY_STORE_SCHEMA_VERSION = 1;

/** `<app userData>/Recovery`. */
export const recoveryStoreDirectoryName = "Recovery";
/** `<app userData>/Recovery/Recovery.db`. */
export const recoveryStoreDatabaseFileName = "Recovery.db";
/** `<app userData>/Recovery/Recovery.lock` — the mkdir-based ownership lock. */
export const recoveryStoreLockDirectoryName = "Recovery.lock";
/** `<app userData>/Recovery/Recovery.lock/owner.json`. */
export const recoveryStoreLockOwnerFileName = "owner.json";

/**
 * The `metadata` table's well-known keys. Kept here so the DB module and
 * its tests agree on one spelling.
 */
export const recoveryStoreMetadataKeys = {
  schemaVersion: "schema_version",
  storeId: "store_id",
  createdAt: "created_at",
  createdWithAppVersion: "created_with_app_version",
  lastOpenedWithAppVersion: "last_opened_with_app_version",
  lastSeenRecoverySetSignature: "lastSeenRecoverySetSignature"
} as const;

/**
 * Written into `Recovery.lock/owner.json` by the instance that wins the
 * lock. Human-facing diagnostics only — nothing reads `pid` back to make a
 * liveness judgement (stale-lock takeover is explicitly out of scope for
 * this phase).
 */
export interface RecoveryStoreOwnerInfo {
  readonly instanceRunId: string;
  readonly pid: number;
  readonly createdAt: string;
  readonly appVersion: string;
}

/**
 * The main process's view of the Recovery Store for this run. Exposed
 * (read-only) to later phases via `RECOVERY_CHANNELS.getStoreStatus`.
 *
 *   - `owner`       — this instance holds the lock and opened Recovery.db.
 *   - `nonOwner`    — another instance holds the lock; this instance does
 *                     NOT open Recovery.db, does NOT write, and stays
 *                     completely silent (no UI, no user notification).
 *   - `unavailable` — the store could not be brought up (e.g. the userData
 *                     directory or SQLite failed, or an unknown-schema
 *                     Recovery.db could not be archived); destruction is
 *                     avoided in preference to protection.
 */
export type RecoveryStoreStatus =
  | {
      readonly kind: "owner";
      readonly recoveryDirectoryPath: string;
      readonly databasePath: string;
      readonly lockDirectoryPath: string;
      readonly storeId: string;
    }
  | {
      readonly kind: "nonOwner";
      readonly recoveryDirectoryPath: string;
      readonly lockDirectoryPath: string;
      readonly reason: "lockUnavailable";
    }
  | {
      readonly kind: "unavailable";
      readonly recoveryDirectoryPath: string;
      readonly reason: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function validIsoTimestamp(value: unknown): string | null {
  const text = nonEmptyString(value);

  if (!text) {
    return null;
  }

  return Number.isNaN(new Date(text).getTime()) ? null : text;
}

/**
 * Parse untrusted `owner.json` bytes into a `RecoveryStoreOwnerInfo`, or
 * `null` when any field is missing / malformed. Used for diagnostics only —
 * a `null` here still means "the lock is held by someone".
 */
export function parseRecoveryStoreOwnerInfo(
  value: unknown
): RecoveryStoreOwnerInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  const instanceRunId = nonEmptyString(value.instanceRunId);
  const appVersion = nonEmptyString(value.appVersion);
  const createdAt = validIsoTimestamp(value.createdAt);
  const pid =
    typeof value.pid === "number" &&
    Number.isInteger(value.pid) &&
    value.pid > 0
      ? value.pid
      : null;

  if (!instanceRunId || !isUuidv7(instanceRunId) || !appVersion || !createdAt || pid === null) {
    return null;
  }

  return {
    instanceRunId,
    pid,
    createdAt,
    appVersion
  };
}

export function createRecoveryStoreOwnerInfo(input: {
  readonly instanceRunId: string;
  readonly pid: number;
  readonly appVersion: string;
  readonly now: Date;
}): RecoveryStoreOwnerInfo {
  return {
    instanceRunId: input.instanceRunId,
    pid: input.pid,
    appVersion: input.appVersion.trim() || "unknown",
    createdAt: input.now.toISOString()
  };
}
