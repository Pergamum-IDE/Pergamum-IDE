import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseRecoveryStoreOwnerInfo,
  recoveryStoreLockDirectoryName,
  recoveryStoreLockOwnerFileName,
  type RecoveryStoreOwnerInfo
} from "../../src/shared/recovery";
import {
  createRecoveryStoreLock,
  type RecoveryStoreLockFileSystem,
  type RecoveryStoreLockStaleReclamationPolicy
} from "../../src/main/recoveryStoreLock";
import type { ProcessLiveness } from "../../src/main/processLiveness";

let workDir = "";

function lockDirectoryPath(): string {
  return path.join(workDir, recoveryStoreLockDirectoryName);
}

function ownerFilePath(): string {
  return path.join(lockDirectoryPath(), recoveryStoreLockOwnerFileName);
}

function ownerInfo(
  overrides: Partial<RecoveryStoreOwnerInfo> = {}
): RecoveryStoreOwnerInfo {
  return {
    instanceRunId: "0198d95f-97d8-7000-8000-000000000238",
    pid: 4242,
    createdAt: new Date("2026-08-29T08:21:00.000Z").toISOString(),
    appVersion: "9.8.7-test",
    ...overrides
  };
}

/** A real-`node:fs`-backed seam; individual methods can be overridden. */
function realSeam(
  overrides: Partial<RecoveryStoreLockFileSystem> = {}
): RecoveryStoreLockFileSystem {
  return {
    mkdir: (dirPath) => fs.mkdir(dirPath).then(() => undefined),
    writeFile: (filePath, data, options) =>
      fs.writeFile(filePath, data, options),
    rm: (filePath, options) => fs.rm(filePath, options),
    rmdir: (dirPath) => fs.rmdir(dirPath),
    readFile: (filePath) => fs.readFile(filePath, "utf8"),
    rename: (fromPath, toPath) =>
      fs.rename(fromPath, toPath).then(() => undefined),
    stat: async (targetPath) => {
      const stats = await fs.stat(targetPath);
      return { isDirectory: () => stats.isDirectory() };
    },
    ...overrides
  };
}

function stalePolicy(
  liveness: ProcessLiveness | ((pid: number) => ProcessLiveness),
  now: () => Date = () => new Date("2026-08-29T10:00:00.000Z")
): { staleReclamation: RecoveryStoreLockStaleReclamationPolicy } {
  return {
    staleReclamation: {
      probeProcessLiveness:
        typeof liveness === "function" ? liveness : () => liveness,
      now
    }
  };
}

async function seedHeldLock(owner: RecoveryStoreOwnerInfo): Promise<void> {
  await fs.mkdir(lockDirectoryPath());
  await fs.writeFile(
    ownerFilePath(),
    `${JSON.stringify(owner, null, 2)}\n`,
    "utf8"
  );
}

async function listStaleArchives(): Promise<string[]> {
  const entries = await fs.readdir(workDir);
  return entries.filter((name) =>
    name.startsWith(`${recoveryStoreLockDirectoryName}.stale-`)
  );
}

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-lock-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("createRecoveryStoreLock — plain acquire (Phase 6-4-2)", () => {
  it("acquires by creating the lock directory and stamping owner.json", async () => {
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(lock.acquire(ownerInfo())).resolves.toEqual({
      outcome: "acquired"
    });
    expect(lock.isHeld()).toBe(true);

    const stat = await fs.stat(lockDirectoryPath());
    expect(stat.isDirectory()).toBe(true);

    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(ownerInfo());
  });

  it("a second lock over the same directory is unavailable and leaves the holder's marker intact", async () => {
    const firstOwner = ownerInfo();
    const first = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });
    await first.acquire(firstOwner);

    const second = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    // Feature off (no staleReclamation): any EEXIST ⇒ unavailable.
    await expect(
      second.acquire(
        ownerInfo({ instanceRunId: "0198d95f-97d8-7000-8000-000000000999" })
      )
    ).resolves.toEqual({ outcome: "unavailable" });
    expect(second.isHeld()).toBe(false);

    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(firstOwner);
    expect(await listStaleArchives()).toEqual([]);
  });

  it("does not wait or retry when the lock is held (immediate non-owner)", async () => {
    const first = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });
    await first.acquire(ownerInfo());

    const second = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    const startedAt = Date.now();
    await expect(second.acquire(ownerInfo())).resolves.toEqual({
      outcome: "unavailable"
    });
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  it("release deletes owner.json and the lock directory", async () => {
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });
    await lock.acquire(ownerInfo());

    await expect(lock.release()).resolves.toBe("released");
    expect(lock.isHeld()).toBe(false);
    await expect(fs.access(lockDirectoryPath())).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("release before acquire reports notHeld and never touches the filesystem", async () => {
    await fs.mkdir(lockDirectoryPath());
    await fs.writeFile(ownerFilePath(), "held by someone else\n", "utf8");

    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(lock.release()).resolves.toBe("notHeld");
    await expect(fs.access(lockDirectoryPath())).resolves.toBeUndefined();
  });

  it("rolls back its own directory when the owner.json write fails", async () => {
    const rmdirCalls: string[] = [];
    const faultyFs = realSeam({
      writeFile: () => Promise.reject(new Error("marker write boom")),
      rmdir: (dirPath) => {
        rmdirCalls.push(dirPath);
        return fs.rmdir(dirPath);
      }
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    await expect(lock.acquire(ownerInfo())).resolves.toEqual({
      outcome: "unavailable"
    });
    expect(lock.isHeld()).toBe(false);
    expect(rmdirCalls).toEqual([lockDirectoryPath()]);
    await expect(fs.access(lockDirectoryPath())).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});

describe("createRecoveryStoreLock — stale-lock reclamation (#293)", () => {
  it("no lock present: plain acquire, no stale takeover, no archive", async () => {
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("dead"));

    expect(result).toEqual({ outcome: "acquired" });
    expect(await listStaleArchives()).toEqual([]);
  });

  it("feature off + EEXIST: unavailable, pre-#293 behavior", async () => {
    await seedHeldLock(ownerInfo({ pid: 999 }));
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(lock.acquire(ownerInfo())).resolves.toEqual({
      outcome: "unavailable"
    });
    expect(await listStaleArchives()).toEqual([]);
  });

  it("owner probes alive: unavailable, no archive, marker intact", async () => {
    const staleOwner = ownerInfo({
      pid: 999,
      instanceRunId: "0198d95f-97d8-7000-8000-0000000000ff"
    });
    await seedHeldLock(staleOwner);
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("alive"));

    expect(result).toEqual({
      outcome: "unavailable",
      staleTakeover: {
        phase: "refused",
        ownerPid: 999,
        ownerAppVersion: "9.8.7-test",
        ownerCreatedAt: staleOwner.createdAt
      }
    });
    expect(await listStaleArchives()).toEqual([]);
    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(staleOwner);
  });

  it("owner liveness unknown: unavailable, no archive", async () => {
    await seedHeldLock(ownerInfo({ pid: 999 }));
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("unknown"));

    expect(result.outcome).toBe("unavailable");
    expect(result.staleTakeover?.phase).toBe("refused");
    expect(await listStaleArchives()).toEqual([]);
  });

  it("missing owner.json (marker-less dir): unavailable, no archive", async () => {
    await fs.mkdir(lockDirectoryPath());
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(
      lock.acquire(ownerInfo(), stalePolicy("dead"))
    ).resolves.toEqual({ outcome: "unavailable" });
    expect(await listStaleArchives()).toEqual([]);
  });

  it("malformed owner.json: unavailable, no archive", async () => {
    await fs.mkdir(lockDirectoryPath());
    await fs.writeFile(ownerFilePath(), "{ not json", "utf8");
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(
      lock.acquire(ownerInfo(), stalePolicy("dead"))
    ).resolves.toEqual({ outcome: "unavailable" });

    await fs.writeFile(
      ownerFilePath(),
      JSON.stringify({ pid: "x", instanceRunId: "not-a-uuid" }),
      "utf8"
    );
    await expect(
      lock.acquire(ownerInfo(), stalePolicy("dead"))
    ).resolves.toEqual({ outcome: "unavailable" });

    expect(await listStaleArchives()).toEqual([]);
  });

  it("dead owner: archives the stale lock, reacquires, writes a fresh owner.json", async () => {
    const staleOwner = ownerInfo({
      pid: 62368,
      instanceRunId: "0198d95f-97d8-7000-8000-0000000000ff",
      appVersion: "0.60.0",
      createdAt: new Date("2026-08-29T08:06:16.724Z").toISOString()
    });
    await seedHeldLock(staleOwner);

    const takingOver = ownerInfo({
      pid: 4242,
      instanceRunId: "0198d95f-97d8-7000-8000-000000000238"
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    const result = await lock.acquire(takingOver, stalePolicy("dead"));

    expect(result).toEqual({
      outcome: "acquired",
      staleTakeover: {
        phase: "reacquired",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt,
        archivedLockDirName: expect.stringMatching(
          /^Recovery\.lock\.stale-.+-[0-9a-f]{8}$/
        )
      }
    });
    expect(lock.isHeld()).toBe(true);

    // The live lock exists again, now stamped with the taking-over process.
    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(takingOver);

    // Exactly one archive dir, holding the dead owner's marker verbatim.
    const archives = await listStaleArchives();
    expect(archives).toHaveLength(1);
    const archivedRaw = await fs.readFile(
      path.join(workDir, archives[0], recoveryStoreLockOwnerFileName),
      "utf8"
    );
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(archivedRaw))).toEqual(
      staleOwner
    );
  });

  it("archive rename fails: unavailable, original lock untouched", async () => {
    const staleOwner = ownerInfo({ pid: 999 });
    await seedHeldLock(staleOwner);

    const faultyFs = realSeam({
      rename: () => Promise.reject(new Error("rename boom"))
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("dead"));

    expect(result.outcome).toBe("unavailable");
    expect(result.staleTakeover?.phase).toBe("archiveFailed");
    expect(lock.isHeld()).toBe(false);
    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(staleOwner);
    expect(await listStaleArchives()).toEqual([]);
  });

  it("reacquire mkdir fails after archive: unavailable, no loop", async () => {
    await seedHeldLock(ownerInfo({ pid: 999 }));

    let mkdirCalls = 0;
    const faultyFs = realSeam({
      mkdir: (dirPath) => {
        mkdirCalls += 1;
        return mkdirCalls >= 2
          ? Promise.reject(new Error("mkdir boom"))
          : fs.mkdir(dirPath).then(() => undefined);
      }
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("dead"));

    expect(result.outcome).toBe("unavailable");
    expect(result.staleTakeover?.phase).toBe("reacquireFailed");
    // Exactly one archive, exactly two mkdir attempts — no retry loop.
    expect(mkdirCalls).toBe(2);
    expect(await listStaleArchives()).toHaveLength(1);
    await expect(fs.access(lockDirectoryPath())).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("TOCTOU re-read mismatch: unavailable, never renames", async () => {
    const first = ownerInfo({
      pid: 999,
      instanceRunId: "0198d95f-97d8-7000-8000-00000000aaaa"
    });
    const second = ownerInfo({
      pid: 1000,
      instanceRunId: "0198d95f-97d8-7000-8000-00000000bbbb"
    });
    await seedHeldLock(first);

    let reads = 0;
    const renameSpy = vi.fn(() => Promise.resolve());
    const faultyFs = realSeam({
      readFile: () => {
        reads += 1;
        return Promise.resolve(
          `${JSON.stringify(reads === 1 ? first : second, null, 2)}\n`
        );
      },
      rename: renameSpy
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    await expect(
      lock.acquire(ownerInfo(), stalePolicy("dead"))
    ).resolves.toEqual({ outcome: "unavailable" });
    expect(renameSpy).not.toHaveBeenCalled();
    expect(await listStaleArchives()).toEqual([]);
  });

  it("holder released during the EEXIST window: clean acquire, no stale takeover", async () => {
    // EEXIST from mkdir, then the dir is gone by the time we stat it.
    let mkdirCalls = 0;
    const faultyFs = realSeam({
      mkdir: (dirPath) => {
        mkdirCalls += 1;
        if (mkdirCalls === 1) {
          const error = Object.assign(new Error("exists"), { code: "EEXIST" });
          return Promise.reject(error);
        }
        return fs.mkdir(dirPath).then(() => undefined);
      },
      stat: () =>
        Promise.reject(Object.assign(new Error("gone"), { code: "ENOENT" }))
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("dead"));

    expect(result).toEqual({ outcome: "acquired" });
    expect(lock.isHeld()).toBe(true);
    expect(await listStaleArchives()).toEqual([]);
    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(ownerInfo());
  });

  it("Recovery.lock is a file, not a directory: unavailable, file not renamed", async () => {
    await fs.writeFile(lockDirectoryPath(), "not a directory", "utf8");
    const renameSpy = vi.fn(() => Promise.resolve());
    const faultyFs = realSeam({ rename: renameSpy });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    await expect(
      lock.acquire(ownerInfo(), stalePolicy("dead"))
    ).resolves.toEqual({ outcome: "unavailable" });
    expect(renameSpy).not.toHaveBeenCalled();
    expect(await fs.readFile(lockDirectoryPath(), "utf8")).toBe(
      "not a directory"
    );
  });

  it("fresh owner.json self-check fails: refuses safely, does not claim ownership", async () => {
    await seedHeldLock(ownerInfo({ pid: 999 }));

    const impostor = ownerInfo({
      pid: 5,
      instanceRunId: "0198d95f-97d8-7000-8000-00000000cccc"
    });
    let writes = 0;
    const faultyFs = realSeam({
      writeFile: async (filePath, data, options) => {
        writes += 1;
        // Let the write land, but make the read-back look like someone else.
        await fs.writeFile(filePath, data, options);
      },
      readFile: async (filePath) => {
        const real = await fs.readFile(filePath, "utf8");
        // After our fresh write, pretend a different run owns it.
        return writes > 0
          ? `${JSON.stringify(impostor, null, 2)}\n`
          : real;
      }
    });
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    const result = await lock.acquire(ownerInfo(), stalePolicy("dead"));

    expect(result.outcome).toBe("unavailable");
    expect(lock.isHeld()).toBe(false);
  });

  it("two contenders over one dead owner: exactly one becomes owner", async () => {
    const staleOwner = ownerInfo({
      pid: 999,
      instanceRunId: "0198d95f-97d8-7000-8000-0000000000ff"
    });
    await seedHeldLock(staleOwner);

    const a = createRecoveryStoreLock({ lockDirectoryPath: lockDirectoryPath() });
    const b = createRecoveryStoreLock({ lockDirectoryPath: lockDirectoryPath() });

    const [ra, rb] = await Promise.all([
      a.acquire(
        ownerInfo({ instanceRunId: "0198d95f-97d8-7000-8000-00000000000a" }),
        stalePolicy("dead", () => new Date("2026-08-29T10:00:00.000Z"))
      ),
      b.acquire(
        ownerInfo({ instanceRunId: "0198d95f-97d8-7000-8000-00000000000b" }),
        stalePolicy("dead", () => new Date("2026-08-29T10:00:01.000Z"))
      )
    ]);

    const acquired = [ra, rb].filter((r) => r.outcome === "acquired");
    expect(acquired).toHaveLength(1);
    expect([a.isHeld(), b.isHeld()].filter(Boolean)).toHaveLength(1);
    // A live Recovery.lock exists and its marker parses.
    const raw = await fs.readFile(ownerFilePath(), "utf8");
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).not.toBeNull();
  });
});
