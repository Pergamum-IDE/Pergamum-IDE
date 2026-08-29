import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  parseRecoveryStoreOwnerInfo,
  recoveryStoreLockDirectoryName,
  recoveryStoreLockOwnerFileName,
  type RecoveryStoreOwnerInfo
} from "../../src/shared/recovery";
import {
  createRecoveryStoreLock,
  type RecoveryStoreLockFileSystem
} from "../../src/main/recoveryStoreLock";

let workDir = "";

function lockDirectoryPath(): string {
  return path.join(workDir, recoveryStoreLockDirectoryName);
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

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-recovery-lock-"));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe("createRecoveryStoreLock (Phase 6-4-2)", () => {
  it("acquires by creating the lock directory and stamping owner.json", async () => {
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(lock.acquire(ownerInfo())).resolves.toBe("acquired");
    expect(lock.isHeld()).toBe(true);

    const stat = await fs.stat(lockDirectoryPath());
    expect(stat.isDirectory()).toBe(true);

    const raw = await fs.readFile(
      path.join(lockDirectoryPath(), recoveryStoreLockOwnerFileName),
      "utf8"
    );
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

    await expect(
      second.acquire(
        ownerInfo({ instanceRunId: "0198d95f-97d8-7000-8000-000000000999" })
      )
    ).resolves.toBe("unavailable");
    expect(second.isHeld()).toBe(false);

    // The first owner's marker is untouched — no takeover, no rewrite.
    const raw = await fs.readFile(
      path.join(lockDirectoryPath(), recoveryStoreLockOwnerFileName),
      "utf8"
    );
    expect(parseRecoveryStoreOwnerInfo(JSON.parse(raw))).toEqual(firstOwner);
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
    await expect(second.acquire(ownerInfo())).resolves.toBe("unavailable");
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
    // A directory an unrelated holder owns.
    await fs.mkdir(lockDirectoryPath());
    await fs.writeFile(
      path.join(lockDirectoryPath(), recoveryStoreLockOwnerFileName),
      "held by someone else\n",
      "utf8"
    );

    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath()
    });

    await expect(lock.release()).resolves.toBe("notHeld");
    // The other holder's lock directory + marker are untouched.
    await expect(fs.access(lockDirectoryPath())).resolves.toBeUndefined();
  });

  it("rolls back its own directory when the owner.json write fails", async () => {
    const realFs = (await import("node:fs")).promises;
    const rmdirCalls: string[] = [];
    const faultyFs: RecoveryStoreLockFileSystem = {
      mkdir: (dirPath) => realFs.mkdir(dirPath).then(() => undefined),
      writeFile: () => Promise.reject(new Error("marker write boom")),
      rm: (filePath, options) => realFs.rm(filePath, options),
      rmdir: (dirPath) => {
        rmdirCalls.push(dirPath);
        return realFs.rmdir(dirPath);
      }
    };
    const lock = createRecoveryStoreLock({
      lockDirectoryPath: lockDirectoryPath(),
      fileSystem: faultyFs
    });

    await expect(lock.acquire(ownerInfo())).resolves.toBe("unavailable");
    expect(lock.isHeld()).toBe(false);
    expect(rmdirCalls).toEqual([lockDirectoryPath()]);
    await expect(fs.access(lockDirectoryPath())).rejects.toMatchObject({
      code: "ENOENT"
    });
  });
});
