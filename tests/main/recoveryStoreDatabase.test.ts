import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RECOVERY_STORE_SCHEMA_VERSION,
  recoveryStoreMetadataKeys
} from "../../src/shared/recovery";
import {
  openRecoveryStoreDatabase,
  RecoveryStoreUnavailableError
} from "../../src/main/recoveryStoreDatabase";

let workDir = "";

function databasePath(): string {
  return path.join(workDir, "Recovery.db");
}

function readMetadata(dbPath: string): Record<string, string> {
  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db
      .prepare("SELECT key, value FROM metadata")
      .all() as Array<{ key: string; value: string }>;
    return Object.fromEntries(rows.map((row) => [row.key, row.value]));
  } finally {
    db.close();
  }
}

function tableNames(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return (
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
        )
        .all() as Array<{ name: string }>
    ).map((row) => row.name);
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-db-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("openRecoveryStoreDatabase (Phase 6-4-2)", () => {
  it("creates Recovery.db with the metadata + documents schema and no glossary table", async () => {
    const handle = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T08:21:00.000Z"),
      createStoreId: () => "0198d95f-97d8-7000-8000-0000000000aa"
    });
    handle.close();

    expect(handle.initMode).toBe("created");
    expect(handle.schemaVersion).toBe(RECOVERY_STORE_SCHEMA_VERSION);

    const tables = tableNames(databasePath());
    expect(tables).toContain("metadata");
    expect(tables).toContain("documents");
    expect(tables).not.toContain("glossary_entries");
    expect(tables).not.toContain("glossary_forms");
  });

  it("persists the required metadata keys", async () => {
    const handle = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T08:21:00.000Z"),
      createStoreId: () => "0198d95f-97d8-7000-8000-0000000000aa"
    });
    handle.close();

    const metadata = readMetadata(databasePath());
    expect(metadata).toMatchObject({
      [recoveryStoreMetadataKeys.schemaVersion]: String(
        RECOVERY_STORE_SCHEMA_VERSION
      ),
      [recoveryStoreMetadataKeys.storeId]:
        "0198d95f-97d8-7000-8000-0000000000aa",
      [recoveryStoreMetadataKeys.createdAt]: "2026-08-29T08:21:00.000Z",
      [recoveryStoreMetadataKeys.createdWithAppVersion]: "9.8.7-test",
      [recoveryStoreMetadataKeys.lastOpenedWithAppVersion]: "9.8.7-test"
    });
    expect(handle.storeId).toBe("0198d95f-97d8-7000-8000-0000000000aa");
  });

  it("enforces a UNIQUE document_key", async () => {
    const handle = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test"
    });

    try {
      const createSql = handle.database
        .prepare(
          "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'documents'"
        )
        .get() as { sql: string };
      expect(createSql.sql).toMatch(/document_key\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);

      const insert = handle.database.prepare(
        "INSERT INTO documents (" +
          "id, document_key, document_type, source_uri, display_name, " +
          "payload_text, origin_instance_run_id, created_at, updated_at, app_version" +
          ") VALUES (?, ?, 'markdown', 'x', 'x', '', 'run', 'now', 'now', 'v')"
      );
      insert.run("id-1", "shared-key");
      expect(() => insert.run("id-2", "shared-key")).toThrow(
        /UNIQUE constraint failed/i
      );
    } finally {
      handle.close();
    }
  });

  it("opens Recovery.db with journal_mode=WAL and synchronous=FULL on the owner connection", async () => {
    const handle = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test"
    });

    try {
      expect(handle.journalMode).toBe("wal");
      // 2 === PRAGMA synchronous FULL
      expect(handle.synchronous).toBe(2);
      expect(
        handle.database.pragma("journal_mode", { simple: true })
      ).toBe("wal");
      expect(
        handle.database.pragma("synchronous", { simple: true })
      ).toBe(2);
    } finally {
      handle.close();
    }

    // journal_mode is persisted in the DB file header.
    const reopened = new Database(databasePath(), { readonly: true });
    try {
      expect(reopened.pragma("journal_mode", { simple: true })).toBe("wal");
    } finally {
      reopened.close();
    }
  });

  it("reopens an existing current-schema DB without recreating it", async () => {
    const first = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      createStoreId: () => "0198d95f-97d8-7000-8000-0000000000aa"
    });
    first.close();

    const second = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.9.0-test"
    });
    second.close();

    expect(second.initMode).toBe("opened");
    expect(second.storeId).toBe("0198d95f-97d8-7000-8000-0000000000aa");

    const metadata = readMetadata(databasePath());
    // store_id / created_at unchanged; only last_opened moves forward.
    expect(metadata[recoveryStoreMetadataKeys.storeId]).toBe(
      "0198d95f-97d8-7000-8000-0000000000aa"
    );
    expect(
      metadata[recoveryStoreMetadataKeys.lastOpenedWithAppVersion]
    ).toBe("9.9.0-test");
  });

  it("archives an unknown-schema DB instead of deleting it, then recreates a fresh one", async () => {
    const first = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      createStoreId: () => "0198d95f-97d8-7000-8000-0000000000aa"
    });
    first.close();

    // Simulate a future / unknown schema version.
    const tamper = new Database(databasePath());
    tamper
      .prepare("UPDATE metadata SET value = '999' WHERE key = ?")
      .run(recoveryStoreMetadataKeys.schemaVersion);
    tamper.close();

    const reopened = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T09:30:00.000Z"),
      createStoreId: () => "0198d95f-97d8-7000-8000-0000000000bb"
    });
    reopened.close();

    expect(reopened.initMode).toBe("archivedAndRecreated");
    expect(reopened.archiveReason).toBe("schemaMismatch");
    expect(reopened.archivedFromSchemaVersion).toBe(999);

    // The original bytes still exist under an archive name.
    const archived = reopened.archivedDatabasePath as string;
    expect(archived).toContain("Recovery.2026-08-29T09-30-00-000Z.db");
    await expect(fs.access(archived)).resolves.toBeUndefined();
    expect(readMetadata(archived)[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      "999"
    );

    // A brand-new store took its place.
    const fresh = readMetadata(databasePath());
    expect(fresh[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      String(RECOVERY_STORE_SCHEMA_VERSION)
    );
    expect(fresh[recoveryStoreMetadataKeys.storeId]).toBe(
      "0198d95f-97d8-7000-8000-0000000000bb"
    );
  });

  it("archives a structurally unrecognisable DB (no metadata table)", async () => {
    const junk = new Database(databasePath());
    junk.exec("CREATE TABLE not_ours (x TEXT)");
    junk.close();

    const handle = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T10:00:00.000Z")
    });
    handle.close();

    expect(handle.initMode).toBe("archivedAndRecreated");
    expect(handle.archiveReason).toBe("unreadable");
    expect(handle.archivedFromSchemaVersion).toBeUndefined();
    await expect(
      fs.access(handle.archivedDatabasePath as string)
    ).resolves.toBeUndefined();
    expect(tableNames(databasePath())).toEqual(["documents", "metadata"]);
  });

  it("fails as unavailable (and keeps the original DB) when the archive rename fails", async () => {
    const first = await openRecoveryStoreDatabase({
      databasePath: databasePath(),
      appVersion: "9.8.7-test"
    });
    first.close();

    const tamper = new Database(databasePath());
    tamper
      .prepare("UPDATE metadata SET value = '999' WHERE key = ?")
      .run(recoveryStoreMetadataKeys.schemaVersion);
    tamper.close();

    await expect(
      openRecoveryStoreDatabase({
        databasePath: databasePath(),
        appVersion: "9.8.7-test",
        renameForArchive: () => Promise.reject(new Error("rename boom"))
      })
    ).rejects.toMatchObject({
      name: "RecoveryStoreUnavailableError",
      reason: "archiveFailed"
    });

    // The unknown-schema DB was NOT deleted.
    await expect(fs.access(databasePath())).resolves.toBeUndefined();
    expect(readMetadata(databasePath())[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      "999"
    );
  });

  it("exposes RecoveryStoreUnavailableError as a typed error", () => {
    const error = new RecoveryStoreUnavailableError("archiveFailed", {
      cause: new Error("x")
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.reason).toBe("archiveFailed");
  });
});
