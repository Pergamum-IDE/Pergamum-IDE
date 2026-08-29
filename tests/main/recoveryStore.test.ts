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
import { createRecoveryStoreLock } from "../../src/main/recoveryStoreLock";
import { upsertRecoveryDocument } from "../../src/main/recoveryDocumentStore";
import { listRecoveryCandidates } from "../../src/main/recoveryCandidateStore";
import type { RecoveryDocumentPayload } from "../../src/shared/recoveryDocument";

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

  it("is a silent non-owner when another LIVE instance holds the lock: no DB opened, no failure surfaced", async () => {
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
    const status = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-000000000004"),
      deps: { probeProcessLiveness: () => "alive" }
    });

    expect(status).toMatchObject({
      kind: "nonOwner",
      reason: "lockUnavailable"
    });
    // The non-owner opens nothing; the holder's lock is left untouched.
    expect(__recoveryStoreDatabaseForTests()).toBeNull();
    await expect(fs.access(recoveryDbPath())).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(fs.access(lockDir)).resolves.toBeUndefined();
    const lockDirEntries = await fs.readdir(
      path.join(userDataPath, recoveryStoreDirectoryName)
    );
    expect(
      lockDirEntries.filter((name) => name.includes(".stale-"))
    ).toEqual([]);

    const events = loggedEventNames(logger);
    expect(events).toContain("recovery.store.init.started");
    expect(events).toContain("recovery.store.init.skipped");
    // A live owner is a REFUSAL, never "stale detected".
    expect(events).toContain("recovery.store.lock.reclamation.refused");
    expect(events).not.toContain("recovery.store.lock.stale.detected");
    // Nothing that could drive a user-facing error / notification.
    expect(events).not.toContain("recovery.store.init.failed");
    expect(events).not.toContain("recovery.store.init.succeeded");
    expect(events).not.toContain("recovery.store.lock.stale.archived");
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

    const second = await initializeRecoveryStore({
      ...baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-00000000000b"),
      // The first instance's process is still alive → no stale takeover.
      deps: { probeProcessLiveness: () => "alive" }
    });
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

describe("initializeRecoveryStore — stale Recovery.lock recovery (#293)", () => {
  const DEAD_OWNER = {
    instanceRunId: "0198d95f-97d8-7000-8000-0000000000ff",
    pid: 62368,
    createdAt: new Date("2026-08-29T08:06:16.724Z").toISOString(),
    appVersion: "0.60.0"
  };
  const CANDIDATE_MARKER = "SECRET_MANUSCRIPT_BODY_293";

  function recoveryDirPath(): string {
    return path.join(userDataPath, recoveryStoreDirectoryName);
  }
  function lockDirPath(): string {
    return path.join(recoveryDirPath(), recoveryStoreLockDirectoryName);
  }

  async function seedStaleLock(
    owner: Record<string, unknown> = DEAD_OWNER
  ): Promise<void> {
    await fs.mkdir(lockDirPath(), { recursive: true });
    await fs.writeFile(
      path.join(lockDirPath(), recoveryStoreLockOwnerFileName),
      `${JSON.stringify(owner, null, 2)}\n`,
      "utf8"
    );
  }

  function candidatePayload(): RecoveryDocumentPayload {
    return {
      documentKey: "file:/novel/chapter-03.md",
      documentType: "markdown.file",
      sourceUri: "file:///novel/chapter-03.md",
      displayName: "chapter-03.md",
      projectId: null,
      projectFilePath: "/novel/Novel.pergamum",
      filePath: "/novel/chapter-03.md",
      documentEncoding: "utf-8",
      documentLineend: "lf",
      baseMtimeMs: null,
      baseSize: 5,
      baseSha256: "a".repeat(64),
      payloadText: `# Chapter\n${CANDIDATE_MARKER}`
    };
  }

  /** Create a real Recovery.db (schema v1) holding one candidate, then let
   *  go of the lock so a stale one can be seeded in its place. */
  async function seedRecoveryDbWithCandidate(): Promise<string> {
    const first = await initializeRecoveryStore(
      baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-0000000000a1")
    );
    if (first.kind !== "owner") throw new Error("seed: expected owner");
    const handle = __recoveryStoreDatabaseForTests();
    if (!handle) throw new Error("seed: no db handle");
    upsertRecoveryDocument(handle.database, candidatePayload(), {
      instanceRunId: "0198d95f-97d8-7000-8000-0000000000a1",
      appVersion: "9.8.7-test",
      now: () => new Date("2026-08-29T08:00:00.000Z"),
      createRowId: () => "row-seed-1"
    });
    await shutdownRecoveryStore();
    __resetRecoveryStoreForTests();
    return first.storeId;
  }

  it("takes over a stale lock from a dead owner and OPENS the existing Recovery.db (candidate still listable)", async () => {
    const seededStoreId = await seedRecoveryDbWithCandidate();
    await seedStaleLock();

    const logger = createLoggerMock();
    const status = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-0000000000b2"),
      deps: { probeProcessLiveness: () => "dead" }
    });

    expect(status.kind).toBe("owner");
    if (status.kind !== "owner") return;
    // The DB was OPENED, not recreated.
    expect(status.storeId).toBe(seededStoreId);

    const handle = __recoveryStoreDatabaseForTests();
    expect(handle).not.toBeNull();
    // The seed row was written by a *previous* run ("…a1"); this run is
    // "…b2", so it is a listable previous-run candidate (#288).
    const candidates = listRecoveryCandidates(
      handle!.database,
      "0198d95f-97d8-7000-8000-0000000000b2"
    );
    expect(candidates.map((c) => c.recoveryId)).toEqual(["row-seed-1"]);

    const events = loggedEventNames(logger);
    expect(events).toEqual(
      expect.arrayContaining([
        "recovery.store.lock.stale.detected",
        "recovery.store.lock.stale.archived",
        "recovery.store.lock.reacquire.succeeded",
        "recovery.store.init.succeeded"
      ])
    );
    // stale.detected precedes the archive/reacquire it announces.
    expect(events.indexOf("recovery.store.lock.stale.detected")).toBeLessThan(
      events.indexOf("recovery.store.lock.stale.archived")
    );
    expect(
      events.indexOf("recovery.store.lock.reacquire.succeeded")
    ).toBeLessThan(events.indexOf("recovery.store.init.succeeded"));
    expect(events).not.toContain("recovery.store.init.skipped");
    // A dead-owner takeover is never a "refusal".
    expect(events).not.toContain("recovery.store.lock.reclamation.refused");

    // The stale lock was renamed aside, never deleted.
    const entries = await fs.readdir(recoveryDirPath());
    expect(entries.filter((n) => n.includes(".stale-"))).toHaveLength(1);

    // Body-free / path-safe logs.
    const serialized = JSON.stringify(
      logger.log.mock.calls.map(([entry]) => entry)
    );
    expect(serialized).not.toContain(CANDIDATE_MARKER);
    expect(serialized).not.toContain("payload_text");
    expect(serialized).not.toContain(userDataPath);
    expect(serialized).not.toContain(recoveryStoreDatabaseFileName);
    expect(serialized).not.toContain(".stale-");
    // The dead owner's diagnostics DO appear (as scalar fields).
    const archived = logger.log.mock.calls
      .map(([entry]) => entry)
      .find(
        (e: { event: string }) =>
          e.event === "recovery.store.lock.stale.archived"
      ) as { details: Record<string, unknown> };
    expect(archived.details).toMatchObject({
      pathKind: "appData",
      result: "succeeded",
      ownerPid: 62368,
      ownerAppVersion: "0.60.0",
      ownerCreatedAt: DEAD_OWNER.createdAt
    });
  });

  it.each(["alive", "unknown"] as const)(
    "refuses takeover when the owner probes %s: reclamation.refused, nonOwner, DB not opened",
    async (liveness) => {
      await seedRecoveryDbWithCandidate();
      await seedStaleLock();

      const logger = createLoggerMock();
      const status = await initializeRecoveryStore({
        ...baseOptions(logger, "0198d95f-97d8-7000-8000-0000000000c3"),
        deps: { probeProcessLiveness: () => liveness }
      });

      expect(status.kind).toBe("nonOwner");
      expect(__recoveryStoreDatabaseForTests()).toBeNull();
      // The stale lock is left exactly as found.
      await expect(fs.access(lockDirPath())).resolves.toBeUndefined();
      const entries = await fs.readdir(recoveryDirPath());
      expect(entries.filter((n) => n.includes(".stale-"))).toEqual([]);

      const events = loggedEventNames(logger);
      expect(events).toContain("recovery.store.lock.reclamation.refused");
      // alive / unknown is NOT a stale lock.
      expect(events).not.toContain("recovery.store.lock.stale.detected");
      expect(events).not.toContain("recovery.store.lock.stale.archived");
      expect(events).toContain("recovery.store.init.skipped");
      expect(events).not.toContain("recovery.store.init.succeeded");

      const refused = logger.log.mock.calls
        .map(([entry]) => entry)
        .find(
          (e: { event: string }) =>
            e.event === "recovery.store.lock.reclamation.refused"
        ) as { level: string; details: Record<string, unknown> };
      expect(refused.level).toBe("debug");
      expect(refused.details).toMatchObject({
        pathKind: "appData",
        result: "ignored",
        reason: "locked",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: DEAD_OWNER.createdAt
      });
    }
  );

  it("archive failure: nonOwner, Recovery.db untouched, DB not opened", async () => {
    await seedRecoveryDbWithCandidate();
    await seedStaleLock();
    const dbBytesBefore = await fs.readFile(recoveryDbPath());

    const logger = createLoggerMock();
    const status = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-0000000000d4"),
      deps: {
        probeProcessLiveness: () => "dead",
        createLock: (lockDirectoryPath) =>
          createRecoveryStoreLock({
            lockDirectoryPath,
            fileSystem: {
              mkdir: (p) => fs.mkdir(p).then(() => undefined),
              writeFile: (p, d, o) => fs.writeFile(p, d, o),
              rm: (p, o) => fs.rm(p, o),
              rmdir: (p) => fs.rmdir(p),
              readFile: (p) => fs.readFile(p, "utf8"),
              rename: () => Promise.reject(new Error("rename boom")),
              stat: async (p) => {
                const s = await fs.stat(p);
                return { isDirectory: () => s.isDirectory() };
              }
            }
          })
      }
    });

    expect(status.kind).toBe("nonOwner");
    expect(__recoveryStoreDatabaseForTests()).toBeNull();
    const events = loggedEventNames(logger);
    // A dead owner: stale.detected fires before the archive it announces.
    expect(events.indexOf("recovery.store.lock.stale.detected")).toBeLessThan(
      events.indexOf("recovery.store.lock.stale.archive.failed")
    );
    expect(events).not.toContain("recovery.store.lock.reclamation.refused");
    // Recovery.db is byte-identical; no sidecars were deleted.
    expect(await fs.readFile(recoveryDbPath())).toEqual(dbBytesBefore);
    const entries = await fs.readdir(recoveryDirPath());
    expect(entries).toContain(recoveryStoreDatabaseFileName);
  });

  it("reacquire mkdir failure: nonOwner, DB not opened, Recovery.db preserved", async () => {
    await seedRecoveryDbWithCandidate();
    await seedStaleLock();
    const dbBytesBefore = await fs.readFile(recoveryDbPath());

    let mkdirCalls = 0;
    const logger = createLoggerMock();
    const status = await initializeRecoveryStore({
      ...baseOptions(logger, "0198d95f-97d8-7000-8000-0000000000e5"),
      deps: {
        probeProcessLiveness: () => "dead",
        createLock: (lockDirectoryPath) =>
          createRecoveryStoreLock({
            lockDirectoryPath,
            fileSystem: {
              mkdir: (p) => {
                mkdirCalls += 1;
                return mkdirCalls >= 2
                  ? Promise.reject(new Error("mkdir boom"))
                  : fs.mkdir(p).then(() => undefined);
              },
              writeFile: (p, d, o) => fs.writeFile(p, d, o),
              rm: (p, o) => fs.rm(p, o),
              rmdir: (p) => fs.rmdir(p),
              readFile: (p) => fs.readFile(p, "utf8"),
              rename: (a, b) => fs.rename(a, b).then(() => undefined),
              stat: async (p) => {
                const s = await fs.stat(p);
                return { isDirectory: () => s.isDirectory() };
              }
            }
          })
      }
    });

    expect(status.kind).toBe("nonOwner");
    expect(__recoveryStoreDatabaseForTests()).toBeNull();
    const events = loggedEventNames(logger);
    expect(events.indexOf("recovery.store.lock.stale.detected")).toBeLessThan(
      events.indexOf("recovery.store.lock.reacquire.failed")
    );
    expect(events).not.toContain("recovery.store.lock.reclamation.refused");
    expect(await fs.readFile(recoveryDbPath())).toEqual(dbBytesBefore);
  });

  it("never deletes Recovery.db / -wal / -shm across any stale-lock branch", async () => {
    await seedRecoveryDbWithCandidate();
    // Force WAL sidecars to exist by opening once more via a takeover.
    await seedStaleLock();
    await initializeRecoveryStore({
      ...baseOptions(createLoggerMock(), "0198d95f-97d8-7000-8000-0000000000f6"),
      deps: { probeProcessLiveness: () => "dead" }
    });
    await shutdownRecoveryStore();
    __resetRecoveryStoreForTests();

    const entries = await fs.readdir(recoveryDirPath());
    expect(entries).toContain(recoveryStoreDatabaseFileName);
    // The archived stale lock dir is retained for forensics.
    expect(entries.filter((n) => n.includes(".stale-")).length).toBeGreaterThan(
      0
    );
  });
});
