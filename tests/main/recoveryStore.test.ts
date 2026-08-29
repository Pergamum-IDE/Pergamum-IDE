import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RECOVERY_STORE_SCHEMA_VERSION,
  recoveryStoreDatabaseFileName,
  recoveryStoreDirectoryName,
  recoveryStoreLockDirectoryName,
  recoveryStoreLockOwnerFileName,
  recoveryStoreMetadataKeys
} from "../../src/shared/recovery";
import {
  __recoveryStoreDatabaseForTests,
  __resetRecoveryStoreForTests,
  initializeRecoveryStore,
  recoveryStorePaths,
  recoveryStoreStatus,
  shutdownRecoveryStore
} from "../../src/main/recoveryStore";

let userDataPath = "";
let projectRootPath = "";

type LoggerMock = { log: ReturnType<typeof vi.fn> };

function createLoggerMock(): LoggerMock {
  return { log: vi.fn() };
}

function loggedEventNames(logger: LoggerMock): string[] {
  return logger.log.mock.calls.map(([entry]) => entry.event as string);
}

function loggedDetails(logger: LoggerMock, event: string): Record<string, unknown> {
  const call = logger.log.mock.calls.find(([entry]) => entry.event === event);
  return (call?.[0].details ?? {}) as Record<string, unknown>;
}

function baseOptions(logger: LoggerMock, instanceRunId: string) {
  return {
    userDataPath,
    instanceRunId,
    appVersion: "9.8.7-test",
    logger,
    now: () => new Date("2026-08-29T08:21:00.000Z"),
    pid: () => 4242
  };
}

function recoveryDbPath(): string {
  return path.join(
    userDataPath,
    recoveryStoreDirectoryName,
    recoveryStoreDatabaseFileName
  );
}

function readMetadata(dbPath: string): Record<string, string> {
  const db = new Database(dbPath, { readonly: true });
  try {
    return Object.fromEntries(
      (
        db.prepare("SELECT key, value FROM metadata").all() as Array<{
          key: string;
          value: string;
        }>
      ).map((row) => [row.key, row.value])
    );
  } finally {
    db.close();
  }
}

beforeEach(async () => {
  __resetRecoveryStoreForTests();
  userDataPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "pergamum-recovery-store-userdata-")
  );
  projectRootPath = await fs.mkdtemp(
    path.join(os.tmpdir(), "pergamum-recovery-store-project-")
  );
});

afterEach(async () => {
  __resetRecoveryStoreForTests();
  await fs.rm(userDataPath, { recursive: true, force: true, maxRetries: 3 });
  await fs.rm(projectRootPath, { recursive: true, force: true, maxRetries: 3 });
});

describe("initializeRecoveryStore (Phase 6-4-2)", () => {
  it("owns and creates <userData>/Recovery/Recovery.db, never anything under a project root", async () => {
    const logger = createLoggerMock();

    const status = await initializeRecoveryStore(baseOptions(logger, "0198d95f-97d8-7000-8000-000000000001"));

    expect(status.kind).toBe("owner");
    if (status.kind !== "owner") return;
    expect(status.databasePath).toBe(recoveryDbPath());
    expect(status.recoveryDirectoryPath).toBe(
      path.join(userDataPath, recoveryStoreDirectoryName)
    );
    await expect(fs.access(recoveryDbPath())).resolves.toBeUndefined();

    // Nothing is ever written under a project root.
    const projectEntries = await fs.readdir(projectRootPath);
    expect(projectEntries).toEqual([]);
    await expect(
      fs.access(path.join(projectRootPath, ".pergamum_recovery"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      fs.access(path.join(projectRootPath, recoveryStoreDatabaseFileName))
    ).rejects.toMatchObject({ code: "ENOENT" });

    expect(loggedEventNames(logger)).toEqual([
      "recovery.store.init.started",
      "recovery.store.init.succeeded"
    ]);
    expect(loggedDetails(logger, "recovery.store.init.succeeded")).toMatchObject({
      pathKind: "appData",
      instanceRunId: "0198d95f-97d8-7000-8000-000000000001",
      schemaVersion: RECOVERY_STORE_SCHEMA_VERSION,
      journalMode: "wal",
      synchronous: "full"
    });
  });

  it("creates the metadata + documents schema (no glossary table) with a UNIQUE document_key and required metadata", async () => {
    await initializeRecoveryStore(baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-000000000002"));

    const db = new Database(recoveryDbPath(), { readonly: true });
    try {
      const tables = (
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
          )
          .all() as Array<{ name: string }>
      ).map((row) => row.name);
      expect(tables).toEqual(["documents", "metadata"]);
      expect(tables).not.toContain("glossary_entries");

      const documentsSql = (
        db
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'documents'"
          )
          .get() as { sql: string }
      ).sql;
      expect(documentsSql).toMatch(/document_key\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
    } finally {
      db.close();
    }

    const metadata = readMetadata(recoveryDbPath());
    for (const key of Object.values(recoveryStoreMetadataKeys)) {
      expect(metadata[key]).toBeTruthy();
    }
    expect(metadata[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      String(RECOVERY_STORE_SCHEMA_VERSION)
    );
  });

  it("keeps journal_mode=WAL and synchronous=FULL on the live owner connection", async () => {
    await initializeRecoveryStore(baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-000000000003"));

    const handle = __recoveryStoreDatabaseForTests();
    expect(handle).not.toBeNull();
    expect(handle?.database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(handle?.database.pragma("synchronous", { simple: true })).toBe(2);
  });

  it("is a silent non-owner when another instance holds the lock: no DB opened, no failure surfaced", async () => {
    const lockDir = path.join(
      userDataPath,
      recoveryStoreDirectoryName,
      recoveryStoreLockDirectoryName
    );
    await fs.mkdir(lockDir, { recursive: true });
    await fs.writeFile(
      path.join(lockDir, recoveryStoreLockOwnerFileName),
      JSON.stringify({
        instanceRunId: "0198d95f-97d8-7000-8000-0000000000ff",
        pid: 111,
        createdAt: new Date("2026-08-29T07:00:00.000Z").toISOString(),
        appVersion: "9.8.7-test"
      }),
      "utf8"
    );

    const logger = createLoggerMock();
    const status = await initializeRecoveryStore(
      baseOptions(logger, "0198d95f-97d8-7000-8000-000000000004")
    );

    expect(status).toMatchObject({
      kind: "nonOwner",
      reason: "lockUnavailable"
    });
    // The non-owner opens nothing.
    expect(__recoveryStoreDatabaseForTests()).toBeNull();
    await expect(fs.access(recoveryDbPath())).rejects.toMatchObject({
      code: "ENOENT"
    });

    const events = loggedEventNames(logger);
    expect(events).toEqual([
      "recovery.store.init.started",
      "recovery.store.init.skipped"
    ]);
    // Nothing that could drive a user-facing error / notification.
    expect(events).not.toContain("recovery.store.init.failed");
    expect(events).not.toContain("recovery.store.init.succeeded");
    for (const [entry] of logger.log.mock.calls) {
      expect(entry.level).not.toBe("error");
    }
  });

  it("gives ownership to the first instance and non-ownership to the next", async () => {
    const first = await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000a")
    );
    expect(first.kind).toBe("owner");

    // First instance is still running (its lock dir stays on disk); only
    // this process's module state is dropped, WITHOUT releasing the lock.
    __resetRecoveryStoreForTests();

    const second = await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000b")
    );
    expect(second.kind).toBe("nonOwner");
  });

  it("releases the ownership lock on normal shutdown", async () => {
    const lockDir = path.join(
      userDataPath,
      recoveryStoreDirectoryName,
      recoveryStoreLockDirectoryName
    );

    await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000c")
    );
    await expect(fs.access(lockDir)).resolves.toBeUndefined();

    const shutdownLogger = createLoggerMock();
    await shutdownRecoveryStore(shutdownLogger);

    await expect(fs.access(lockDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(loggedDetails(shutdownLogger, "recovery.store.lock.released")).toMatchObject(
      { result: "succeeded" }
    );
  });

  it("archives an unknown-schema Recovery.db instead of deleting it, then recreates a fresh store", async () => {
    const first = await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000d")
    );
    const originalStoreId =
      first.kind === "owner" ? first.storeId : "";
    await shutdownRecoveryStore();
    __resetRecoveryStoreForTests();

    const tamper = new Database(recoveryDbPath());
    tamper
      .prepare("UPDATE metadata SET value = '999' WHERE key = ?")
      .run(recoveryStoreMetadataKeys.schemaVersion);
    tamper.close();

    const logger = createLoggerMock();
    const reopened = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-00000000000e"),
      now: () => new Date("2026-08-29T09:30:00.000Z")
    });

    expect(reopened.kind).toBe("owner");
    if (reopened.kind !== "owner") return;
    expect(reopened.storeId).not.toBe(originalStoreId);

    const archivedPath = path.join(
      userDataPath,
      recoveryStoreDirectoryName,
      "Recovery.2026-08-29T09-30-00-000Z.db"
    );
    await expect(fs.access(archivedPath)).resolves.toBeUndefined();
    expect(readMetadata(archivedPath)[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      "999"
    );
    expect(readMetadata(recoveryDbPath())[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      String(RECOVERY_STORE_SCHEMA_VERSION)
    );

    expect(loggedEventNames(logger)).toContain("recovery.store.schema.archived");
    expect(loggedDetails(logger, "recovery.store.schema.archived")).toMatchObject({
      pathKind: "appData",
      result: "succeeded",
      schemaVersion: 999
    });
  });

  it("holds status unavailable (and keeps the original DB) when the unknown-schema archive fails", async () => {
    await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000f")
    );
    await shutdownRecoveryStore();
    __resetRecoveryStoreForTests();

    const tamper = new Database(recoveryDbPath());
    tamper
      .prepare("UPDATE metadata SET value = '999' WHERE key = ?")
      .run(recoveryStoreMetadataKeys.schemaVersion);
    tamper.close();

    const logger = createLoggerMock();
    const status = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-000000000010"),
      deps: {
        renameForArchive: () => Promise.reject(new Error("rename boom"))
      }
    });

    expect(status).toMatchObject({
      kind: "unavailable",
      reason: "archiveFailed"
    });
    // The unknown-schema DB is preserved, never deleted.
    await expect(fs.access(recoveryDbPath())).resolves.toBeUndefined();
    expect(readMetadata(recoveryDbPath())[recoveryStoreMetadataKeys.schemaVersion]).toBe(
      "999"
    );
    // The lock is dropped so a later run can retry.
    await expect(
      fs.access(
        path.join(
          userDataPath,
          recoveryStoreDirectoryName,
          recoveryStoreLockDirectoryName
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(loggedEventNames(logger)).toContain("recovery.store.init.failed");
  });

  it("never writes payload_text or a raw store path into the debug log", async () => {
    const logger = createLoggerMock();
    await initializeRecoveryStore(
      baseOptions(logger, "0198d95f-97d8-7000-8000-000000000011")
    );
    await shutdownRecoveryStore(logger);

    const serialized = JSON.stringify(
      logger.log.mock.calls.map(([entry]) => entry)
    );
    expect(serialized).not.toContain("payload_text");
    expect(serialized).not.toContain(userDataPath);
    expect(serialized).not.toContain(recoveryStoreDatabaseFileName);
  });

  it("exposes the resolved status via recoveryStoreStatus()", async () => {
    expect(recoveryStoreStatus()).toBeNull();
    const status = await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-000000000012")
    );
    expect(recoveryStoreStatus()).toBe(status);
  });

  it("resolves store paths under <userData>/Recovery only", () => {
    const paths = recoveryStorePaths("/home/w/.config/Pergamum");
    expect(paths.recoveryDirectoryPath).toBe(
      path.join("/home/w/.config/Pergamum", "Recovery")
    );
    expect(paths.databasePath).toBe(
      path.join("/home/w/.config/Pergamum", "Recovery", "Recovery.db")
    );
    expect(paths.lockDirectoryPath).toBe(
      path.join("/home/w/.config/Pergamum", "Recovery", "Recovery.lock")
    );
  });
});
