/**
 * Phase 6-4-2: opening / initialising `<userData>/Recovery/Recovery.db`.
 *
 * Only the Recovery Store *owner* instance calls this. It:
 *   - creates the DB with `journal_mode=WAL` + `synchronous=FULL` and the
 *     Phase 6-4-2 schema (`metadata`, `documents` — NO `glossary_entries`),
 *   - on an existing DB, checks `metadata.schema_version`,
 *   - on an unknown / unreadable schema, ARCHIVES the file
 *     (`Recovery.<timestamp>.db`, plus best-effort `-wal` / `-shm`) rather
 *     than deleting it, then recreates a fresh DB,
 *   - fails with `RecoveryStoreUnavailableError` (never a delete) when the
 *     archive rename cannot complete — destruction avoidance wins over
 *     protection.
 *
 * This module does NOT touch the ownership lock and does NOT write any
 * `payload_text` — row UPSERT is Phase 6-4-3.
 */

import Database, {
  type Database as BetterSqliteDatabase
} from "better-sqlite3";
import { promises as nodeFs } from "node:fs";
import { createUuidv7 } from "./ids";
import {
  RECOVERY_STORE_SCHEMA_VERSION,
  recoveryStoreMetadataKeys
} from "../shared/recovery";

export class RecoveryStoreUnavailableError extends Error {
  readonly reason: string;

  constructor(reason: string, options?: { cause?: unknown }) {
    super(`Recovery Store unavailable: ${reason}`);
    this.name = "RecoveryStoreUnavailableError";
    this.reason = reason;

    if (options && options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export type RecoveryStoreDatabaseInitMode =
  | "created"
  | "opened"
  | "archivedAndRecreated";

export type RecoveryStoreDatabaseArchiveReason =
  | "schemaMismatch"
  | "unreadable";

export interface RecoveryStoreDatabaseHandle {
  readonly database: BetterSqliteDatabase;
  readonly storeId: string;
  readonly schemaVersion: number;
  /** `PRAGMA journal_mode` read back on this connection (expected "wal"). */
  readonly journalMode: string;
  /** `PRAGMA synchronous` read back on this connection (2 === FULL). */
  readonly synchronous: number;
  readonly initMode: RecoveryStoreDatabaseInitMode;
  /** Set only when `initMode === "archivedAndRecreated"`. */
  readonly archiveReason?: RecoveryStoreDatabaseArchiveReason;
  readonly archivedFromSchemaVersion?: number;
  readonly archivedDatabasePath?: string;
  close(): void;
}

export interface OpenRecoveryStoreDatabaseOptions {
  /** Absolute path to `<userData>/Recovery/Recovery.db`. */
  readonly databasePath: string;
  readonly appVersion: string;
  readonly now?: () => Date;
  /** Injectable so tests get a deterministic `store_id`. */
  readonly createStoreId?: () => string;
  /**
   * Injectable rename used ONLY when archiving an unknown-schema DB, so a
   * fault test can make the archive fail without deleting the original.
   */
  readonly renameForArchive?: (from: string, to: string) => Promise<void>;
}

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  document_key TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  display_name TEXT NOT NULL,

  project_id TEXT,
  project_file_path TEXT,
  file_path TEXT,

  document_encoding TEXT,
  document_lineend TEXT,

  base_mtime_ms INTEGER,
  base_size INTEGER,
  base_sha256 TEXT,

  payload_text TEXT NOT NULL,

  origin_instance_run_id TEXT NOT NULL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  app_version TEXT NOT NULL
);
`;

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await nodeFs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function archiveTimestamp(now: Date): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

function archiveDatabasePath(databasePath: string, now: Date): string {
  const suffix = ".db";
  const base = databasePath.endsWith(suffix)
    ? databasePath.slice(0, -suffix.length)
    : databasePath;

  return `${base}.${archiveTimestamp(now)}${suffix}`;
}

function readSchemaVersion(database: BetterSqliteDatabase): number | null {
  let row: { value?: unknown } | undefined;

  try {
    row = database
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(recoveryStoreMetadataKeys.schemaVersion) as
      | { value?: unknown }
      | undefined;
  } catch {
    // e.g. `no such table: metadata` — an unrecognisable file.
    return null;
  }

  if (!row || typeof row.value !== "string") {
    return null;
  }

  const parsed = Number.parseInt(row.value, 10);

  return Number.isInteger(parsed) && String(parsed) === row.value.trim()
    ? parsed
    : null;
}

function readStoreId(database: BetterSqliteDatabase): string | null {
  try {
    const row = database
      .prepare("SELECT value FROM metadata WHERE key = ?")
      .get(recoveryStoreMetadataKeys.storeId) as { value?: unknown } | undefined;

    return row && typeof row.value === "string" && row.value.length > 0
      ? row.value
      : null;
  } catch {
    return null;
  }
}

function applyConnectionPragmas(database: BetterSqliteDatabase): {
  journalMode: string;
  synchronous: number;
} {
  // WAL is persisted in the DB header; re-stating it is harmless.
  // `synchronous` is per-connection and MUST be re-applied every open.
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = FULL");

  const journalMode = String(
    database.pragma("journal_mode", { simple: true })
  ).toLowerCase();
  const synchronous = Number(
    database.pragma("synchronous", { simple: true })
  );

  return { journalMode, synchronous };
}

function ensureSchema(database: BetterSqliteDatabase): void {
  database.exec(SCHEMA_DDL);
}

function createFreshDatabase(
  options: OpenRecoveryStoreDatabaseOptions,
  nowFn: () => Date,
  createStoreId: () => string
): {
  database: BetterSqliteDatabase;
  storeId: string;
  journalMode: string;
  synchronous: number;
} {
  let database: BetterSqliteDatabase;

  try {
    database = new Database(options.databasePath);
  } catch (error) {
    throw new RecoveryStoreUnavailableError("databaseOpenFailed", {
      cause: error
    });
  }

  try {
    const { journalMode, synchronous } = applyConnectionPragmas(database);
    ensureSchema(database);

    const storeId = createStoreId();
    const nowIso = nowFn().toISOString();
    const upsert = database.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    );

    database.transaction(() => {
      upsert.run(
        recoveryStoreMetadataKeys.schemaVersion,
        String(RECOVERY_STORE_SCHEMA_VERSION)
      );
      upsert.run(recoveryStoreMetadataKeys.storeId, storeId);
      upsert.run(recoveryStoreMetadataKeys.createdAt, nowIso);
      upsert.run(
        recoveryStoreMetadataKeys.createdWithAppVersion,
        options.appVersion
      );
      upsert.run(
        recoveryStoreMetadataKeys.lastOpenedWithAppVersion,
        options.appVersion
      );
    })();

    return { database, storeId, journalMode, synchronous };
  } catch (error) {
    try {
      database.close();
    } catch {
      // ignore
    }

    if (error instanceof RecoveryStoreUnavailableError) {
      throw error;
    }

    throw new RecoveryStoreUnavailableError("databaseInitFailed", {
      cause: error
    });
  }
}

async function archiveUnknownSchemaDatabase(
  options: OpenRecoveryStoreDatabaseOptions,
  now: Date
): Promise<string> {
  const rename =
    options.renameForArchive ??
    ((from: string, to: string) => nodeFs.rename(from, to));
  const target = archiveDatabasePath(options.databasePath, now);

  try {
    await rename(options.databasePath, target);
  } catch (error) {
    // The original file was NOT moved — leave it exactly as it is.
    throw new RecoveryStoreUnavailableError("archiveFailed", { cause: error });
  }

  // Best-effort: keep the sidecar files with their DB so the archived copy
  // is self-consistent. A failure here never fails the archive.
  for (const sidecar of ["-wal", "-shm"]) {
    try {
      await rename(
        `${options.databasePath}${sidecar}`,
        `${target}${sidecar}`
      );
    } catch {
      // The sidecar may not exist, or may be locked — either is fine.
    }
  }

  return target;
}

export async function openRecoveryStoreDatabase(
  options: OpenRecoveryStoreDatabaseOptions
): Promise<RecoveryStoreDatabaseHandle> {
  const nowFn = options.now ?? (() => new Date());
  const createStoreId = options.createStoreId ?? createUuidv7;

  if (!(await pathExists(options.databasePath))) {
    const fresh = createFreshDatabase(options, nowFn, createStoreId);

    return {
      database: fresh.database,
      storeId: fresh.storeId,
      schemaVersion: RECOVERY_STORE_SCHEMA_VERSION,
      journalMode: fresh.journalMode,
      synchronous: fresh.synchronous,
      initMode: "created",
      close: () => fresh.database.close()
    };
  }

  let existing: BetterSqliteDatabase;

  try {
    existing = new Database(options.databasePath, { fileMustExist: true });
  } catch (error) {
    throw new RecoveryStoreUnavailableError("databaseOpenFailed", {
      cause: error
    });
  }

  const schemaVersion = readSchemaVersion(existing);

  if (schemaVersion === RECOVERY_STORE_SCHEMA_VERSION) {
    try {
      const { journalMode, synchronous } = applyConnectionPragmas(existing);
      ensureSchema(existing);
      existing
        .prepare(
          "INSERT INTO metadata (key, value) VALUES (?, ?) " +
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value"
        )
        .run(
          recoveryStoreMetadataKeys.lastOpenedWithAppVersion,
          options.appVersion
        );

      const storeId = readStoreId(existing) ?? createStoreId();

      return {
        database: existing,
        storeId,
        schemaVersion,
        journalMode,
        synchronous,
        initMode: "opened",
        close: () => existing.close()
      };
    } catch (error) {
      try {
        existing.close();
      } catch {
        // ignore
      }

      throw new RecoveryStoreUnavailableError("databaseInitFailed", {
        cause: error
      });
    }
  }

  // Unknown / unreadable schema: archive (never delete), then recreate.
  const archiveReason: RecoveryStoreDatabaseArchiveReason =
    schemaVersion === null ? "unreadable" : "schemaMismatch";

  try {
    existing.close();
  } catch {
    // ignore — we are about to move the file
  }

  const now = nowFn();
  const archivedDatabasePath = await archiveUnknownSchemaDatabase(
    options,
    now
  );
  const fresh = createFreshDatabase(options, () => now, createStoreId);

  return {
    database: fresh.database,
    storeId: fresh.storeId,
    schemaVersion: RECOVERY_STORE_SCHEMA_VERSION,
    journalMode: fresh.journalMode,
    synchronous: fresh.synchronous,
    initMode: "archivedAndRecreated",
    archiveReason,
    ...(schemaVersion !== null
      ? { archivedFromSchemaVersion: schemaVersion }
      : {}),
    archivedDatabasePath,
    close: () => fresh.database.close()
  };
}
