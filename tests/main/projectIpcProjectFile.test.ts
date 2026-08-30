import { promises as fs, readFileSync, type Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultProjectAccessMode,
  PROJECT_CHANNELS,
  type ListFileExplorerChildrenResult,
  type PendingReadOnlyProjectOpen,
  type ProjectOpenResult
} from "../../src/shared/api";
import type { DebugLogger } from "../../src/main/debugLogger";
import { projectConfigFileName } from "../../src/main/projectConfigStore";
import {
  createProjectDatabase,
  currentProjectDatabaseSchemaVersion,
  openProjectDatabase,
  readProjectMetadata
} from "../../src/main/projectDatabase";
import type { Mock } from "vitest";

type DebugLoggerMock = DebugLogger & {
  log: Mock<DebugLogger["log"]>;
};

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn(() => undefined),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showMessageBox: vi.fn(),
  getPath: vi.fn(),
  getVersion: vi.fn()
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents
  },
  dialog: {
    showOpenDialog: electronMock.showOpenDialog,
    showSaveDialog: electronMock.showSaveDialog,
    showMessageBox: electronMock.showMessageBox
  },
  ipcMain: {
    handle: electronMock.handle
  },
  app: {
    getPath: electronMock.getPath,
    getVersion: electronMock.getVersion
  }
}));

import {
  currentActiveProjectFilePath,
  currentProjectAccessMode,
  currentProjectRootPath,
  closeCurrentProject,
  defaultProjectWriteOwnershipManager,
  registerCurrentProjectDocumentPath,
  projectAccessModeFromWriteOwnership,
  ProjectWriteLockOwnershipManager,
  projectWriteLockDirectoryPath,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectWindowTitle,
  type ProjectWriteLockFileHandle,
  type ProjectWriteLockFileSystem,
  type ProjectWriteOwnership,
  type ProjectWriteOwnershipManager,
  type ProjectWindowTitleTargetProvider,
  registerProjectIpc
} from "../../src/main/projectIpc";
import {
  createProjectLockOwnerMetadata,
  parseProjectLockOwnerMetadata,
  projectLockOwnerHandleContent,
  projectLockOwnerHandlePath,
  projectLockOwnerMetadataFileName,
  projectLockOwnerMetadataPath,
  type ProjectLockOwnerMetadata
} from "../../src/main/projectLockOwnerMetadata";

const projectConflictWarningMessage =
  "既に Pergamum のプロジェクト設定または復旧領域があります。\n\n" +
  "既存の設定を上書きし、本文やGlossaryに関する復旧領域があるフォルダに新しいプロジェクトを作成します。\n\n" +
  "これは破壊的な変更を伴います。\n" +
  "本当によろしいですか？";

describe("project file IPC foundation", () => {
  let projectRootPath: string;
  let userDataPath: string;

  it("uses readWrite as the default project access mode", () => {
    expect(defaultProjectAccessMode).toEqual({ kind: "readWrite" });
  });

  it("default write ownership acquisition returns owned", async () => {
    const projectFilePath = path.join(projectRootPath, "Owned.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const ownership = await defaultProjectWriteOwnershipManager.acquire(
      projectFilePath,
      {
        projectId: "0198d95f-97d8-7000-8000-000000000238",
        sessionId: "session-test"
      }
    );

    expect(ownership).toEqual({ kind: "owned" });
    const lockDirectoryStats = await fs.stat(lockDirectoryPath);
    expect(lockDirectoryStats.isDirectory()).toBe(true);
    const metadata = JSON.parse(
      await fs.readFile(projectLockOwnerMetadataPath(lockDirectoryPath), "utf8")
    ) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      schemaVersion: 1,
      projectId: "0198d95f-97d8-7000-8000-000000000238",
      sessionId: "session-test",
      pid: process.pid,
      hostname: os.hostname(),
      appVersion: "9.8.7-test"
    });
    expect(typeof metadata.createdAt).toBe("string");
    expect(metadata.updatedAt).toBe(metadata.createdAt);
    await expect(
      fs.readFile(projectLockOwnerHandlePath(lockDirectoryPath), "utf8")
    ).resolves.toBe(projectLockOwnerHandleContent);

    await defaultProjectWriteOwnershipManager.release(
      projectFilePath,
      ownership
    );
    await expect(fs.access(lockDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("existing lock directory makes write ownership unavailable without removing it", async () => {
    const projectFilePath = path.join(projectRootPath, "Locked.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    await fs.mkdir(lockDirectoryPath);

    const ownership = await defaultProjectWriteOwnershipManager.acquire(
      projectFilePath
    );

    expect(ownership).toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: null
    });

    await defaultProjectWriteOwnershipManager.release(
      projectFilePath,
      ownership
    );
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();
  });

  it("dead stale project write lock is archived and reacquired with meta.json and owner.handle intact", async () => {
    const projectFilePath = path.join(projectRootPath, "Dead Lock.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);

    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem(),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    const ownership = await manager.acquire(projectFilePath, {
      projectId: "0198d95f-97d8-7000-8000-000000000302",
      sessionId: "fresh-session",
      instanceRunId: "0198d95f-97d8-7000-8000-000000000302"
    });

    expect(ownership).toMatchObject({
      kind: "owned",
      staleTakeover: {
        phase: "reacquired",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt,
        archivedLockDirName: expect.stringMatching(
          /^\.pergamum\.lock\.stale-2026-08-29T10-00-00-000Z-[0-9a-f]{8}$/
        )
      }
    });

    const liveOwner = parseProjectLockOwnerMetadata(
      JSON.parse(
        await fs.readFile(
          projectLockOwnerMetadataPath(lockDirectoryPath),
          "utf8"
        )
      )
    );
    expect(liveOwner).toMatchObject({
      projectId: "0198d95f-97d8-7000-8000-000000000302",
      sessionId: "fresh-session",
      pid: 4242,
      hostname: "fresh-host",
      appVersion: "9.8.7-test"
    });
    await expect(
      fs.readFile(projectLockOwnerHandlePath(lockDirectoryPath), "utf8")
    ).resolves.toBe(projectLockOwnerHandleContent);

    const archives = await listProjectWriteLockArchives(projectFilePath);
    expect(archives).toEqual([
      ownership.staleTakeover?.archivedLockDirName
    ]);
    const archivedLockDirectoryPath = path.join(projectRootPath, archives[0]);
    const archivedOwner = parseProjectLockOwnerMetadata(
      JSON.parse(
        await fs.readFile(
          projectLockOwnerMetadataPath(archivedLockDirectoryPath),
          "utf8"
        )
      )
    );
    expect(archivedOwner).toEqual(staleOwner);
    await expect(
      fs.readFile(
        projectLockOwnerHandlePath(archivedLockDirectoryPath),
        "utf8"
      )
    ).resolves.toBe(projectLockOwnerHandleContent);

    await manager.release(projectFilePath, ownership);
    await expect(fs.access(lockDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(fs.access(archivedLockDirectoryPath)).resolves.toBeUndefined();
  });

  it.each(["alive", "unknown"] as const)(
    "owner liveness %s refuses stale project write lock recovery without archiving",
    async (liveness) => {
      const projectFilePath = path.join(projectRootPath, `Owner ${liveness}.pergamum`);
      const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
      const staleOwner = createProjectLockOwnerMetadata({
        projectId: "0198d95f-97d8-7000-8000-0000000000aa",
        sessionId: "stale-session",
        pid: 62368,
        hostname: "stale-host",
        appVersion: "0.60.0",
        now: new Date(2026, 7, 29, 8, 6, 16)
      });
      await seedProjectWriteLock(projectFilePath, staleOwner);

      const manager = new ProjectWriteLockOwnershipManager(
        realProjectWriteLockFileSystem(),
        {
          now: () => new Date("2026-08-29T10:00:00.000Z"),
          hostname: () => "fresh-host",
          appVersion: () => "9.8.7-test",
          pid: () => 4242
        },
        { probeProcessLiveness: () => liveness }
      );

      await expect(
        manager.acquire(projectFilePath, {
          projectId: "0198d95f-97d8-7000-8000-000000000302",
          sessionId: "fresh-session",
          instanceRunId: "0198d95f-97d8-7000-8000-000000000302"
        })
      ).resolves.toEqual({
        kind: "unavailable",
        reason: "lockUnavailable",
        lockOwner: {
          hostname: "stale-host",
          openedAt: "2026-08-29 08:06:16"
        },
        staleTakeover: {
          phase: "refused",
          ownerPid: 62368,
          ownerAppVersion: "0.60.0",
          ownerCreatedAt: staleOwner.createdAt
        }
      });
      expect(await listProjectWriteLockArchives(projectFilePath)).toEqual([]);
      const raw = await fs.readFile(
        projectLockOwnerMetadataPath(lockDirectoryPath),
        "utf8"
      );
      expect(parseProjectLockOwnerMetadata(JSON.parse(raw))).toEqual(staleOwner);
    }
  );

  it("malformed project lock metadata is unavailable and never archived", async () => {
    const projectFilePath = path.join(projectRootPath, "Malformed Lock.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    await fs.mkdir(lockDirectoryPath);
    await fs.writeFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      "{not-json",
      "utf8"
    );

    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem(),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    await expect(manager.acquire(projectFilePath)).resolves.toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: null
    });
    expect(await listProjectWriteLockArchives(projectFilePath)).toEqual([]);
    await expect(
      fs.readFile(projectLockOwnerMetadataPath(lockDirectoryPath), "utf8")
    ).resolves.toBe("{not-json");
  });

  it("unreadable project lock metadata is unavailable and never renamed", async () => {
    const projectFilePath = path.join(projectRootPath, "Unreadable Lock.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    await fs.mkdir(lockDirectoryPath);
    const rename = vi.fn(async () => undefined);
    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        readFile: vi.fn(async () => {
          const error = Object.assign(new Error("denied"), { code: "EACCES" });
          throw error;
        }),
        rename
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    await expect(manager.acquire(projectFilePath)).resolves.toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: null
    });
    expect(rename).not.toHaveBeenCalled();
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();
  });

  it("project write lock path as a file is unavailable and never renamed", async () => {
    const projectFilePath = path.join(projectRootPath, "Lock File.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    await fs.writeFile(lockDirectoryPath, "not a lock directory", "utf8");
    const rename = vi.fn(async () => undefined);
    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({ rename }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    await expect(manager.acquire(projectFilePath)).resolves.toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: null
    });
    expect(rename).not.toHaveBeenCalled();
    await expect(fs.readFile(lockDirectoryPath, "utf8")).resolves.toBe(
      "not a lock directory"
    );
  });

  it("project lock metadata TOCTOU mismatch refuses recovery without archiving", async () => {
    const projectFilePath = path.join(projectRootPath, "TOCTOU Lock.pergamum");
    const firstOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "first-session",
      pid: 62368,
      hostname: "first-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    const secondOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000bb",
      sessionId: "second-session",
      pid: 62369,
      hostname: "second-host",
      appVersion: "0.61.0",
      now: new Date(2026, 7, 29, 8, 7, 16)
    });
    await seedProjectWriteLock(projectFilePath, firstOwner);
    let reads = 0;
    const rename = vi.fn(async () => undefined);
    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        readFile: vi.fn(async () => {
          reads += 1;
          return `${JSON.stringify(reads === 1 ? firstOwner : secondOwner, null, 2)}\n`;
        }),
        rename
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    await expect(manager.acquire(projectFilePath)).resolves.toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: {
        hostname: "second-host",
        openedAt: "2026-08-29 08:07:16"
      }
    });
    expect(rename).not.toHaveBeenCalled();
    expect(await listProjectWriteLockArchives(projectFilePath)).toEqual([]);
  });

  it("archive rename failure falls back to read-only and leaves the stale lock untouched", async () => {
    const projectFilePath = path.join(projectRootPath, "Archive Failure.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);

    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        rename: vi.fn(async () => {
          throw new Error("rename failed");
        })
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    const ownership = await manager.acquire(projectFilePath);

    expect(ownership).toEqual({
      kind: "unavailable",
      reason: "lockUnavailable",
      lockOwner: {
        hostname: "stale-host",
        openedAt: "2026-08-29 08:06:16"
      },
      staleTakeover: {
        phase: "archiveFailed",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt
      }
    });
    expect(await listProjectWriteLockArchives(projectFilePath)).toEqual([]);
    const raw = await fs.readFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      "utf8"
    );
    expect(parseProjectLockOwnerMetadata(JSON.parse(raw))).toEqual(staleOwner);
  });

  it("fresh mkdir failure after archive falls back without retrying", async () => {
    const projectFilePath = path.join(projectRootPath, "Fresh Mkdir Failure.pergamum");
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);

    let mkdirCalls = 0;
    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        mkdir: (dirPath) => {
          mkdirCalls += 1;
          return mkdirCalls >= 2
            ? Promise.reject(new Error("fresh mkdir failed"))
            : fs.mkdir(dirPath).then(() => undefined);
        }
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    const ownership = await manager.acquire(projectFilePath);

    expect(ownership).toMatchObject({
      kind: "unavailable",
      reason: "lockSetupFailed",
      staleTakeover: {
        phase: "reacquireFailed",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt
      }
    });
    expect(mkdirCalls).toBe(2);
    expect(await listProjectWriteLockArchives(projectFilePath)).toHaveLength(1);
  });

  it("fresh owner metadata write failure after archive falls back without deleting the archive", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Fresh Metadata Failure.pergamum"
    );
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);

    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        writeFile: vi.fn(async () => {
          throw new Error("fresh metadata write failed");
        })
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    const ownership = await manager.acquire(projectFilePath);

    expect(ownership).toMatchObject({
      kind: "unavailable",
      reason: "lockSetupFailed",
      staleTakeover: {
        phase: "reacquireFailed",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt
      }
    });
    expect(await listProjectWriteLockArchives(projectFilePath)).toHaveLength(1);
    await expect(fs.access(lockDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("fresh owner metadata self-check failure falls back and never claims ownership", async () => {
    const projectFilePath = path.join(projectRootPath, "Self Check Failure.pergamum");
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    const impostorOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000bb",
      sessionId: "impostor-session",
      pid: 7000,
      hostname: "impostor-host",
      appVersion: "0.61.0",
      now: new Date(2026, 7, 29, 8, 7, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);

    let freshMetadataWrites = 0;
    const manager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem({
        writeFile: async (targetPath, data, options) => {
          freshMetadataWrites += 1;
          await fs.writeFile(targetPath, data, options);
        },
        readFile: async (targetPath, encoding) => {
          if (
            freshMetadataWrites > 0 &&
            targetPath.endsWith(projectLockOwnerMetadataFileName)
          ) {
            return `${JSON.stringify(impostorOwner, null, 2)}\n`;
          }

          return fs.readFile(targetPath, encoding);
        }
      }),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );

    const ownership = await manager.acquire(projectFilePath);

    expect(ownership).toMatchObject({
      kind: "unavailable",
      reason: "lockSetupFailed",
      staleTakeover: {
        phase: "reacquireFailed",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt
      }
    });
    await manager.release(projectFilePath, ownership);
    await expect(fs.access(projectWriteLockDirectoryPath(projectFilePath))).resolves.toBeUndefined();
  });

  it("retains the owner.handle file handle until lock release", async () => {
    const projectFilePath = path.join(projectRootPath, "Retained.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    let writtenMetadata = "";
    const ownerHandle = {
      writeFile: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    } satisfies ProjectWriteLockFileHandle;
    const fileSystem = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (_targetPath, data) => {
        writtenMetadata = data;
      }),
      open: vi.fn(async () => ownerHandle),
      unlink: vi.fn(async () => undefined),
      rmdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => writtenMetadata),
      rename: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isDirectory: () => true }))
    } satisfies ProjectWriteLockFileSystem;
    const manager = new ProjectWriteLockOwnershipManager(fileSystem, {
      now: () => new Date(2026, 7, 25, 8, 21, 0),
      hostname: () => "writer-host",
      appVersion: () => "9.8.7-test",
      pid: () => 238
    });

    const ownership = await manager.acquire(projectFilePath, {
      projectId: "0198d95f-97d8-7000-8000-000000000238",
      sessionId: "session-test"
    });

    expect(ownership).toEqual({ kind: "owned" });
    expect(fileSystem.mkdir).toHaveBeenCalledWith(lockDirectoryPath);
    expect(fileSystem.writeFile).toHaveBeenCalledWith(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      expect.stringContaining('"projectId": "0198d95f-97d8-7000-8000-000000000238"'),
      { encoding: "utf8", flag: "wx" }
    );
    expect(fileSystem.open).toHaveBeenCalledWith(
      projectLockOwnerHandlePath(lockDirectoryPath),
      "wx"
    );
    expect(ownerHandle.writeFile).toHaveBeenCalledWith(
      projectLockOwnerHandleContent,
      "utf8"
    );
    expect(ownerHandle.close).not.toHaveBeenCalled();

    await manager.release(projectFilePath, ownership);

    expect(ownerHandle.close).toHaveBeenCalledTimes(1);
    expect(fileSystem.unlink.mock.calls.map(([targetPath]) => targetPath)).toEqual(
      [
        projectLockOwnerMetadataPath(lockDirectoryPath),
        projectLockOwnerHandlePath(lockDirectoryPath)
      ]
    );
    expect(fileSystem.rmdir).toHaveBeenCalledWith(lockDirectoryPath);
  });

  it("cleans up partial lock artifacts best-effort when owner metadata setup fails", async () => {
    const projectFilePath = path.join(projectRootPath, "Setup Failure.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const fileSystem = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => {
        throw new Error("metadata write failed");
      }),
      open: vi.fn(async () => {
        throw new Error("owner handle should not be opened");
      }),
      unlink: vi.fn(async () => undefined),
      rmdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => ""),
      rename: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isDirectory: () => true }))
    } satisfies ProjectWriteLockFileSystem;
    const manager = new ProjectWriteLockOwnershipManager(fileSystem, {
      now: () => new Date(2026, 7, 25, 8, 21, 0),
      hostname: () => "writer-host",
      appVersion: () => "9.8.7-test",
      pid: () => 238
    });

    await expect(
      manager.acquire(projectFilePath, {
        projectId: "0198d95f-97d8-7000-8000-000000000238",
        sessionId: "session-test"
      })
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "lockSetupFailed",
      lockOwner: null
    });

    expect(fileSystem.unlink.mock.calls.map(([targetPath]) => targetPath)).toEqual(
      [
        projectLockOwnerMetadataPath(lockDirectoryPath),
        projectLockOwnerHandlePath(lockDirectoryPath)
      ]
    );
    expect(fileSystem.rmdir).toHaveBeenCalledWith(lockDirectoryPath);
  });

  it("does not acquire writable ownership when owner.handle creation fails", async () => {
    const projectFilePath = path.join(projectRootPath, "Handle Failure.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const fileSystem = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      open: vi.fn(async () => {
        throw new Error("owner handle open failed");
      }),
      unlink: vi.fn(async () => undefined),
      rmdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => ""),
      rename: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isDirectory: () => true }))
    } satisfies ProjectWriteLockFileSystem;
    const manager = new ProjectWriteLockOwnershipManager(fileSystem, {
      now: () => new Date(2026, 7, 25, 8, 21, 0),
      hostname: () => "writer-host",
      appVersion: () => "9.8.7-test",
      pid: () => 238
    });

    await expect(
      manager.acquire(projectFilePath, {
        projectId: "0198d95f-97d8-7000-8000-000000000238",
        sessionId: "session-test"
      })
    ).resolves.toEqual({
      kind: "unavailable",
      reason: "lockSetupFailed",
      lockOwner: null
    });

    expect(fileSystem.writeFile).toHaveBeenCalledWith(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      expect.any(String),
      { encoding: "utf8", flag: "wx" }
    );
    expect(fileSystem.open).toHaveBeenCalledWith(
      projectLockOwnerHandlePath(lockDirectoryPath),
      "wx"
    );
    expect(fileSystem.rmdir).toHaveBeenCalledWith(lockDirectoryPath);
  });

  it("keeps lock release cleanup best-effort after closing owner.handle", async () => {
    const projectFilePath = path.join(projectRootPath, "Cleanup Failure.pergamum");
    let writtenMetadata = "";
    const ownerHandle = {
      writeFile: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined)
    } satisfies ProjectWriteLockFileHandle;
    const fileSystem = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async (_targetPath, data) => {
        writtenMetadata = data;
      }),
      open: vi.fn(async () => ownerHandle),
      unlink: vi.fn(async () => {
        throw new Error("unlink failed");
      }),
      rmdir: vi.fn(async () => {
        throw new Error("rmdir failed");
      }),
      readFile: vi.fn(async () => writtenMetadata),
      rename: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isDirectory: () => true }))
    } satisfies ProjectWriteLockFileSystem;
    const manager = new ProjectWriteLockOwnershipManager(fileSystem, {
      now: () => new Date(2026, 7, 25, 8, 21, 0),
      hostname: () => "writer-host",
      appVersion: () => "9.8.7-test",
      pid: () => 238
    });
    const ownership = await manager.acquire(projectFilePath, {
      projectId: "0198d95f-97d8-7000-8000-000000000238",
      sessionId: "session-test"
    });

    await expect(manager.release(projectFilePath, ownership)).resolves.toBeUndefined();

    expect(ownerHandle.close).toHaveBeenCalledTimes(1);
    expect(fileSystem.unlink).toHaveBeenCalledTimes(2);
    expect(fileSystem.rmdir).toHaveBeenCalledTimes(1);
  });

  it("maps owned write ownership to readWrite access mode", () => {
    expect(
      projectAccessModeFromWriteOwnership({
        kind: "owned"
      })
    ).toEqual(defaultProjectAccessMode);
  });

  it("maps unavailable write ownership to readOnly access mode", () => {
    expect(
      projectAccessModeFromWriteOwnership({
        kind: "unavailable",
        reason: "lockUnavailable"
      })
    ).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });
  });

  beforeEach(async () => {
    electronMock.handle.mockClear();
    electronMock.fromWebContents.mockReset().mockReturnValue(undefined);
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
    electronMock.showMessageBox.mockReset();
    electronMock.getPath.mockReset();
    electronMock.getVersion.mockReset().mockReturnValue("9.8.7-test");

    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-file-ipc-")
    );
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-file-ipc-user-data-")
    );
    electronMock.getPath.mockReturnValue(userDataPath);
  });

  afterEach(async () => {
    await releaseCurrentProjectWriteOwnership();
    setProjectWindowTitleTargetProvider(null);
    vi.restoreAllMocks();
    await fs.rm(projectRootPath, {
      recursive: true,
      force: true
    });
    await fs.rm(userDataPath, {
      recursive: true,
      force: true
    });
  });

  it("registers Create Project and .pergamum Open Project IPC channels", () => {
    registerProjectIpc(createLoggerMock());

    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expect.arrayContaining([
        PROJECT_CHANNELS.createProject,
        PROJECT_CHANNELS.openProject,
        PROJECT_CHANNELS.openStartupProject,
        PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
        PROJECT_CHANNELS.cancelReadOnlyProjectOpen,
        PROJECT_CHANNELS.listFileExplorerChildren,
        PROJECT_CHANNELS.closeCurrentProject
      ])
    );
    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).not.toContain(
      "projects:openProjectFile"
    );
  });

  it("does not keep user-facing folder open or openProjectFile IPC routes", () => {
    const source = readFileSync("src/main/projectIpc.ts", "utf8");

    expect(source).not.toContain("openDirectory");
    expect(source).not.toContain("openProjectRoot");
    expect(source).not.toContain("PROJECT_CHANNELS.openProjectFile");
    expect(source).not.toContain("isLegacyProjectDatabaseRecentProject");
  });

  it("updates the initial window title after the title target provider is registered", async () => {
    const titleWindow = createTitleWindowMock();
    setProjectWindowTitleTargetProvider(() => titleWindow);

    await updateCurrentProjectWindowTitle();

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - a novel IDE -"
    );
  });

  it("createProject returns null when the save dialog is canceled", async () => {
    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject
    );
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: true
    });

    await expect(createProjectHandler({ sender: {} })).resolves.toBeNull();

    expect(electronMock.showMessageBox).not.toHaveBeenCalled();
  });

  it("createProject safely rejects a selected path without the .pergamum extension", async () => {
    const projectFilePath = path.join(projectRootPath, "Wrong Secret.txt");
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject
    );

    await expect(createProjectHandler({ sender: {} })).resolves.toBeNull();

    await expect(fs.access(projectFilePath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expectSettingsJsonMissing(userDataPath);
    expectDialogHasNoUnsafeSurface([
      projectRootPath,
      projectFilePath,
      "Wrong Secret.txt",
      "Wrong Secret"
    ]);
  });

  it("createProject creates a .pergamum DB, writes metadata, and activates the selected file", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Secret Draft.pergamum");
    await fs.writeFile(
      path.join(projectRootPath, "chapter-01.md"),
      "# Chapter\n"
    );
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      logger
    );
    const project = await createProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Secret Draft",
      config: {
        name: "Secret Draft"
      },
      documents: [
        {
          relativePath: "chapter-01.md",
          name: "chapter-01.md"
        }
      ]
    });
    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(path.resolve(projectFilePath));
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
    const lockDirectoryStats = await fs.stat(
      projectWriteLockDirectoryPath(projectFilePath)
    );
    expect(lockDirectoryStats.isDirectory()).toBe(true);

    const database = await openProjectDatabase(projectFilePath);
    try {
      const metadata = await readProjectMetadata(database);
      expect(metadata.projectName).toBe("Secret Draft");
    } finally {
      await database.close();
    }

    await expect(
      fs.readFile(path.join(projectRootPath, projectConfigFileName), "utf8")
    ).resolves.toBe('{\n  "name": "Secret Draft"\n}\n');
    await expect(readRecentProjects(userDataPath)).resolves.toMatchObject([
      {
        projectName: "Secret Draft",
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath,
        schemaVersion: currentProjectDatabaseSchemaVersion
      }
    ]);
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Secret Draft.pergamum",
      "Secret Draft"
    ]);
  });

  it("createProject updates the window title to the readWrite project title", async () => {
    const projectFilePath = path.join(projectRootPath, "Title Create.pergamum");
    const titleWindow = createTitleWindowMock();
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      createLoggerMock(),
      undefined,
      () => titleWindow
    );

    await createProjectHandler({ sender: {} });

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - Title Create -"
    );
  });

  it("createProject waits for confirmation when write ownership is unavailable", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Created Readonly.pergamum"
    );
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      createLoggerMock(),
      ownershipManager
    );
    const result = await createProjectHandler({ sender: {} });

    expect(ownershipManager.acquire).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      {
        projectId: expect.any(String),
        sessionId: "session"
      }
    );
    const pending = expectPendingReadOnlyProjectOpen(result);
    expect(pending.readOnlyReason).toBe("lockUnavailable");
    expect(pending.lockOwner).toBeNull();
    expect(pending.project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Created Readonly"
    });
    expect(currentProjectAccessMode()).toBeNull();
    await expectSettingsJsonMissing(userDataPath);

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Created Readonly"
    });
    expect(currentProjectAccessMode()).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });

    const database = await openProjectDatabase(projectFilePath);
    try {
      const metadata = await readProjectMetadata(database);
      expect(metadata.projectName).toBe("Created Readonly");
    } finally {
      await database.close();
    }
  });

  it("createProject waits for read-only confirmation with a setup failure reason when lock setup fails", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Created Lock Setup Failure.pergamum"
    );
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockSetupFailed",
      lockOwner: null
    });
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      createLoggerMock(),
      ownershipManager
    );
    const result = await createProjectHandler({ sender: {} });
    const pending = expectPendingReadOnlyProjectOpen(result);

    expect(pending.readOnlyReason).toBe("lockSetupFailed");
    expect(pending.lockOwner).toBeNull();

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Created Lock Setup Failure"
    });
  });

  it("rejects project document Save when the current project is read-only", async () => {
    const projectFilePath = path.join(projectRootPath, "Readonly Save.pergamum");
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      createLoggerMock(),
      ownershipManager
    );
    const pending = expectPendingReadOnlyProjectOpen(
      await createProjectHandler({ sender: {} })
    );
    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );

    await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    const saveProjectDocumentHandler = registeredHandler(
      PROJECT_CHANNELS.saveProjectDocument
    );
    const relativePath = "chapter.md";
    const content = "SECRET_MANUSCRIPT_TEXT_MARKER";

    await expectSanitizedProjectRejection(
      saveProjectDocumentHandler(
        { sender: {} },
        {
          relativePath,
          content
        }
      ) as Promise<unknown>,
      "invalidPath",
      [projectRootPath, relativePath, content]
    );
    await expect(
      fs.access(path.join(projectRootPath, relativePath))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("saveProjectDocument writes atomically, preserving exact bytes and leaving no temp file", async () => {
    const projectFilePath = path.join(projectRootPath, "Atomic Save.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Atomic Save"
    });
    await created.close();
    const documentPath = path.join(projectRootPath, "chapter.md");
    await fs.writeFile(documentPath, "# Old chapter\nprevious body\n", "utf8");
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const saveProjectDocumentHandler = registeredHandler(
      PROJECT_CHANNELS.saveProjectDocument
    );
    // Mixed CRLF / LF, no trailing newline — the renderer already
    // reconstructed the on-disk line endings, so main must persist these
    // exact bytes with no normalization / BOM re-attachment.
    const content = "# New chapter\r\nrewritten body\nlast line";

    await expect(
      saveProjectDocumentHandler(
        { sender: {} },
        { relativePath: "chapter.md", content }
      )
    ).resolves.toEqual({ relativePath: "chapter.md" });

    // Byte-exact round trip: the previous good file is fully swapped, not
    // appended to, and line endings are untouched.
    expect(readFileSync(documentPath, "utf8")).toBe(content);

    // Atomic replace only: no `*.pergamum-tmp-*` sibling is left behind in
    // the manuscript folder on success.
    const rootEntries = await fs.readdir(projectRootPath);
    expect(rootEntries).toContain("chapter.md");
    expect(
      rootEntries.filter((name) => name.includes(".pergamum-tmp-"))
    ).toEqual([]);
  });

  it("registerCurrentProjectDocumentPath makes a file created after open readable + saveable", async () => {
    const projectFilePath = path.join(projectRootPath, "Late Add.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Late Add"
    });
    await created.close();
    await fs.writeFile(
      path.join(projectRootPath, "chapter.md"),
      "# Chapter\nbody\n",
      "utf8"
    );
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const readHandler = registeredHandler(PROJECT_CHANNELS.readProjectDocument);
    const saveHandler = registeredHandler(PROJECT_CHANNELS.saveProjectDocument);

    // A recovered sibling created AFTER open is not yet a project document.
    const recoveredAbsolute = path.join(
      projectRootPath,
      "chapter.recovered.md"
    );
    await fs.writeFile(recoveredAbsolute, "# Chapter\nrecovered body\n", "utf8");
    await expect(
      readHandler({ sender: {} }, { relativePath: "chapter.recovered.md" })
    ).rejects.toMatchObject({ name: "PergamumFileIoError" });

    // A path outside the project root is rejected (null, no mutation).
    expect(
      registerCurrentProjectDocumentPath(
        path.join(os.tmpdir(), "outside.recovered.md")
      )
    ).toBeNull();
    // A non-Markdown path is rejected.
    expect(
      registerCurrentProjectDocumentPath(
        path.join(projectRootPath, "notes.txt")
      )
    ).toBeNull();

    // Registering the in-project recovered file returns its root-relative,
    // forward-slash path and makes both read and save succeed.
    expect(registerCurrentProjectDocumentPath(recoveredAbsolute)).toBe(
      "chapter.recovered.md"
    );

    const readResult = (await readHandler(
      { sender: {} },
      { relativePath: "chapter.recovered.md" }
    )) as { content: string };
    expect(readResult.content).toBe("# Chapter\nrecovered body\n");

    await expect(
      saveHandler(
        { sender: {} },
        { relativePath: "chapter.recovered.md", content: "# Chapter\nedited\n" }
      )
    ).resolves.toEqual({ relativePath: "chapter.recovered.md" });
    expect(readFileSync(recoveredAbsolute, "utf8")).toBe("# Chapter\nedited\n");

    // Idempotent.
    expect(registerCurrentProjectDocumentPath(recoveredAbsolute)).toBe(
      "chapter.recovered.md"
    );

    const markdownAbsolute = path.join(projectRootPath, "appendix.markdown");
    await fs.writeFile(markdownAbsolute, "# Appendix\nbody\n", "utf8");
    expect(registerCurrentProjectDocumentPath(markdownAbsolute)).toBe(
      "appendix.markdown"
    );
    await expect(
      readHandler({ sender: {} }, { relativePath: "appendix.markdown" })
    ).resolves.toMatchObject({
      relativePath: "appendix.markdown",
      content: "# Appendix\nbody\n"
    });
  });

  it("confirmReadOnlyProjectOpen updates the window title with the readOnly status suffix", async () => {
    const projectFilePath = path.join(projectRootPath, "Readonly Title.pergamum");
    const titleWindow = createTitleWindowMock();
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      createLoggerMock(),
      ownershipManager,
      () => titleWindow
    );
    const pending = expectPendingReadOnlyProjectOpen(
      await createProjectHandler({ sender: {} })
    );

    expect(titleWindow.setTitle).not.toHaveBeenCalled();

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
      createLoggerMock(),
      ownershipManager,
      () => titleWindow
    );
    await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - Readonly Title - [読み取り専用]"
    );
  });

  it("createProject refuses to overwrite an existing .pergamum file", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Existing Secret.pergamum"
    );
    await fs.writeFile(projectFilePath, "existing content", "utf8");
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject
    );

    await expect(createProjectHandler({ sender: {} })).resolves.toBeNull();

    await expect(fs.readFile(projectFilePath, "utf8")).resolves.toBe(
      "existing content"
    );
    expect(electronMock.showMessageBox).toHaveBeenCalledTimes(1);
    expectDialogHasNoUnsafeSurface([
      projectRootPath,
      projectFilePath,
      "Existing Secret.pergamum",
      "Existing Secret"
    ]);
  });

  it.each([
    [
      "project config",
      async (rootPath: string) => {
        await fs.writeFile(
          path.join(rootPath, projectConfigFileName),
          '{"name":"old"}\n',
          "utf8"
        );
      }
    ],
    [
      "project recovery directory",
      async (rootPath: string) => {
        await fs.mkdir(path.join(rootPath, ".pergamum_recovery"));
      }
    ]
  ] as const)(
    "createProject shows a warning confirmation when an existing %s is found",
    async (_label, seedConflict) => {
      const projectFilePath = path.join(projectRootPath, "Warned.pergamum");
      await seedConflict(projectRootPath);
      electronMock.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: projectFilePath
      });
      electronMock.showMessageBox.mockResolvedValue({
        response: 1,
        checkboxChecked: false
      });

      const createProjectHandler = registeredHandler(
        PROJECT_CHANNELS.createProject
      );

      await expect(createProjectHandler({ sender: {} })).resolves.toBeNull();

      expect(electronMock.showMessageBox).toHaveBeenCalledTimes(1);
      const options = electronMock.showMessageBox.mock.calls[0].at(-1);

      expect(options).toMatchObject({
        type: "warning",
        message: projectConflictWarningMessage,
        buttons: ["意味を理解して同意", "キャンセル"],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      });
      expectDialogHasNoUnsafeSurface([
        projectRootPath,
        projectFilePath,
        "Warned.pergamum",
        "Warned"
      ]);
      await expect(fs.access(projectFilePath)).rejects.toMatchObject({
        code: "ENOENT"
      });
    }
  );

  it("createProject warning cancel creates neither DB nor pergamum.json", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Cancel Warned.pergamum"
    );
    await fs.mkdir(path.join(projectRootPath, ".pergamum_recovery"));
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });
    electronMock.showMessageBox.mockResolvedValue({
      response: 1,
      checkboxChecked: false
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject
    );

    await expect(createProjectHandler({ sender: {} })).resolves.toBeNull();
    await expect(fs.access(projectFilePath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(
      fs.access(path.join(projectRootPath, projectConfigFileName))
    ).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("createProject warning confirm proceeds and overwrites pergamum.json", async () => {
    const projectFilePath = path.join(projectRootPath, "Confirmed.pergamum");
    await fs.writeFile(
      path.join(projectRootPath, projectConfigFileName),
      '{"name":"old"}\n',
      "utf8"
    );
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });
    electronMock.showMessageBox.mockResolvedValue({
      response: 0,
      checkboxChecked: false
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject
    );
    const project = await createProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Confirmed"
    });
    await expect(fs.access(projectFilePath)).resolves.toBeUndefined();
    await expect(
      fs.readFile(path.join(projectRootPath, projectConfigFileName), "utf8")
    ).resolves.toBe('{\n  "name": "Confirmed"\n}\n');
  });

  it("openProject returns null when the .pergamum open dialog is canceled", async () => {
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: true,
      filePaths: []
    });

    await expect(openProjectHandler({ sender: {} })).resolves.toBeNull();
    expect(electronMock.showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: ["openFile"],
        filters: [{ name: "Pergamum Project", extensions: ["pergamum"] }]
      })
    );
  });

  it("openProject safely rejects a selected path without the .pergamum extension", async () => {
    const projectFilePath = path.join(projectRootPath, "Wrong Open Secret.txt");
    await fs.writeFile(projectFilePath, "not a project", "utf8");
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);

    await expect(openProjectHandler({ sender: {} })).resolves.toBeNull();

    await expectSettingsJsonMissing(userDataPath);
    expectDialogHasNoUnsafeSurface([
      projectRootPath,
      projectFilePath,
      "Wrong Open Secret.txt",
      "Wrong Open Secret"
    ]);
  });

  it("openProject opens a valid .pergamum file and uses DB metadata as the project name", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Filename Label.pergamum"
    );
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Metadata Project Name"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    await fs.writeFile(
      path.join(projectRootPath, projectConfigFileName),
      '{"name":"Config Name"}\n',
      "utf8"
    );
    await fs.writeFile(path.join(projectRootPath, "chapter.md"), "# Chapter\n");
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    const project = await openProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Metadata Project Name",
      config: {
        name: "Config Name"
      },
      documents: [
        {
          relativePath: "chapter.md",
          name: "chapter.md"
        }
      ]
    });
    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(path.resolve(projectFilePath));
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
    const openedLockDirectoryStats = await fs.stat(
      projectWriteLockDirectoryPath(projectFilePath)
    );
    expect(openedLockDirectoryStats.isDirectory()).toBe(true);
    await expect(readRecentProjects(userDataPath)).resolves.toMatchObject([
      {
        projectId: metadata.projectId,
        projectName: "Metadata Project Name",
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath,
        schemaVersion: metadata.schemaVersion
      }
    ]);
  });

  it("openProject updates the window title from DB metadata project name", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Filename Title.pergamum"
    );
    const titleWindow = createTitleWindowMock();
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Metadata Title"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      undefined,
      () => titleWindow
    );

    await openProjectHandler({ sender: {} });

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - Metadata Title -"
    );
  });

  it("openProject keeps readWrite access when write ownership is acquired", async () => {
    const projectFilePath = path.join(projectRootPath, "Owned Open.pergamum");
    const ownershipManager = createWriteOwnershipManager({
      kind: "owned"
    });
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Owned Project"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      ownershipManager
    );
    const project = await openProjectHandler({ sender: {} });

    expect(ownershipManager.acquire).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      {
        projectId: expect.any(String),
        sessionId: "session"
      }
    );
    expect(project).toMatchObject({
      accessMode: defaultProjectAccessMode,
      name: "Owned Project"
    });
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
  });

  it("openProject waits for confirmation when write ownership is unavailable", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Unavailable Open.pergamum"
    );
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Unavailable Project"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      ownershipManager
    );
    const result = await openProjectHandler({ sender: {} });

    expect(ownershipManager.acquire).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      {
        projectId: expect.any(String),
        sessionId: "session"
      }
    );
    const pending = expectPendingReadOnlyProjectOpen(result);
    expect(pending.project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Unavailable Project"
    });
    expect(currentProjectRootPath()).toBeNull();
    expect(currentActiveProjectFilePath()).toBeNull();
    expect(currentProjectAccessMode()).toBeNull();
    await expectSettingsJsonMissing(userDataPath);

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Unavailable Project"
    });
    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(path.resolve(projectFilePath));
    expect(currentProjectAccessMode()).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });
    await expect(readRecentProjects(userDataPath)).resolves.toMatchObject([
      {
        projectName: "Unavailable Project",
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath
      }
    ]);
  });

  it("openProject confirms read-only fallback when the lock directory already exists", async () => {
    const projectFilePath = path.join(projectRootPath, "Locked Open.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Locked Open"
    });
    await created.close();
    await fs.mkdir(lockDirectoryPath);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    const result = await openProjectHandler({ sender: {} });

    const pending = expectPendingReadOnlyProjectOpen(result);
    expect(pending.project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Locked Open"
    });
    expect(currentProjectAccessMode()).toBeNull();
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Locked Open"
    });
    expect(currentProjectAccessMode()).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();
  });

  it("openProject recovers a provably dead stale write lock without read-only confirmation", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Recovered Lock.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Recovered Lock"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: metadata.projectId,
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await seedProjectWriteLock(projectFilePath, staleOwner);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const ownershipManager = new ProjectWriteLockOwnershipManager(
      realProjectWriteLockFileSystem(),
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );
    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      logger,
      ownershipManager,
      undefined,
      undefined,
      "0198d95f-97d8-7000-8000-000000000302"
    );
    const project = await openProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Recovered Lock"
    });
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
    const liveOwner = parseProjectLockOwnerMetadata(
      JSON.parse(
        await fs.readFile(
          projectLockOwnerMetadataPath(lockDirectoryPath),
          "utf8"
        )
      )
    );
    expect(liveOwner).toMatchObject({
      projectId: metadata.projectId,
      sessionId: "session",
      pid: 4242,
      hostname: "fresh-host"
    });
    expect(await listProjectWriteLockArchives(projectFilePath)).toHaveLength(1);
  });

  it("openProject includes lock owner metadata in the pending read-only result when readable", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Locked Owner.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Locked Owner"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    await fs.mkdir(lockDirectoryPath);
    await fs.writeFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      `${JSON.stringify(
        createProjectLockOwnerMetadata({
          projectId: metadata.projectId,
          sessionId: "session-owner",
          pid: process.pid,
          hostname: "SECRET_HOST",
          appVersion: "9.8.7-test",
          now: new Date(2026, 7, 25, 8, 21, 0)
        }),
        null,
        2
      )}\n`,
      "utf8"
    );
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      logger
    );
    const pending = expectPendingReadOnlyProjectOpen(
      await openProjectHandler({ sender: {} })
    );

    expect(pending.readOnlyReason).toBe("lockUnavailable");
    expect(pending.lockOwner).toEqual({
      hostname: "SECRET_HOST",
      openedAt: "2026-08-25 08:21:00"
    });

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
      logger
    );
    await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expectNoUnsafeSurface(logger, ["SECRET_HOST"]);
  });

  it("openProject falls back to generic read-only confirmation when lock owner metadata is malformed", async () => {
    const projectFilePath = path.join(projectRootPath, "Malformed Owner.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Malformed Owner"
    });
    await created.close();
    await fs.mkdir(lockDirectoryPath);
    await fs.writeFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      "{not-json",
      "utf8"
    );
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    const pending = expectPendingReadOnlyProjectOpen(
      await openProjectHandler({ sender: {} })
    );

    expect(pending.readOnlyReason).toBe("lockUnavailable");
    expect(pending.lockOwner).toBeNull();
  });

  it("openProject falls back when lock owner hostname or createdAt is invalid", async () => {
    const invalidCases = [
      {
        projectName: "Invalid Hostname",
        meta: {
          schemaVersion: 1,
          projectId: "project-id",
          sessionId: "session-id",
          pid: 238,
          hostname: 123,
          appVersion: "9.8.7-test",
          createdAt: new Date(2026, 7, 25, 8, 21, 0).toISOString(),
          updatedAt: new Date(2026, 7, 25, 8, 21, 0).toISOString()
        }
      },
      {
        projectName: "Invalid CreatedAt",
        meta: {
          schemaVersion: 1,
          projectId: "project-id",
          sessionId: "session-id",
          pid: 238,
          hostname: "writer-host",
          appVersion: "9.8.7-test",
          createdAt: "not-a-date",
          updatedAt: new Date(2026, 7, 25, 8, 21, 0).toISOString()
        }
      }
    ];

    for (const { projectName, meta } of invalidCases) {
      const caseRootPath = path.join(projectRootPath, projectName);
      await fs.mkdir(caseRootPath);
      const projectFilePath = path.join(caseRootPath, `${projectName}.pergamum`);
      const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
      const created = await createProjectDatabase({
        projectFilePath,
        projectName
      });
      await created.close();
      await fs.mkdir(lockDirectoryPath);
      await fs.writeFile(
        projectLockOwnerMetadataPath(lockDirectoryPath),
        `${JSON.stringify(meta)}\n`,
        "utf8"
      );
      electronMock.showOpenDialog.mockResolvedValueOnce({
        canceled: false,
        filePaths: [projectFilePath]
      });

      const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
      const pending = expectPendingReadOnlyProjectOpen(
        await openProjectHandler({ sender: {} })
      );

      expect(pending.lockOwner).toBeNull();
    }
  });

  it("canceling a pending read-only open keeps the current project unchanged", async () => {
    const secondProjectRootPath = path.join(projectRootPath, "cancel-root");
    await fs.mkdir(secondProjectRootPath);
    const firstProjectFilePath = path.join(
      projectRootPath,
      "Current Project.pergamum"
    );
    const secondProjectFilePath = path.join(
      secondProjectRootPath,
      "Locked Project.pergamum"
    );
    const secondLockDirectoryPath = projectWriteLockDirectoryPath(
      secondProjectFilePath
    );
    const firstCreated = await createProjectDatabase({
      projectFilePath: firstProjectFilePath,
      projectName: "Current Project"
    });
    await firstCreated.close();
    const secondCreated = await createProjectDatabase({
      projectFilePath: secondProjectFilePath,
      projectName: "Locked Project"
    });
    await secondCreated.close();
    await fs.mkdir(secondLockDirectoryPath);
    electronMock.showOpenDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [firstProjectFilePath]
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [secondProjectFilePath]
      });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    const firstProject = await openProjectHandler({ sender: {} });

    expect(firstProject).toMatchObject({
      accessMode: defaultProjectAccessMode,
      name: "Current Project"
    });
    expect(currentActiveProjectFilePath()).toBe(
      path.resolve(firstProjectFilePath)
    );

    const pendingResult = await openProjectHandler({ sender: {} });
    const pending = expectPendingReadOnlyProjectOpen(pendingResult);

    expect(pending.project).toMatchObject({
      activeProjectFilePath: path.resolve(secondProjectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Locked Project"
    });
    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(
      path.resolve(firstProjectFilePath)
    );
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);

    const cancelReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.cancelReadOnlyProjectOpen
    );
    await cancelReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(
      path.resolve(firstProjectFilePath)
    );
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
    await expect(fs.access(secondLockDirectoryPath)).resolves.toBeUndefined();
    await expect(readRecentProjects(userDataPath)).resolves.toHaveLength(1);
  });

  it("releaseCurrentProjectWriteOwnership removes the owned lock directory", async () => {
    const projectFilePath = path.join(projectRootPath, "Release Open.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Release Open"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    const project = await openProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      accessMode: defaultProjectAccessMode,
      name: "Release Open"
    });
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();

    await releaseCurrentProjectWriteOwnership();

    expect(currentProjectAccessMode()).toBeNull();
    await expect(fs.access(lockDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("releaseCurrentProjectWriteOwnership resets the window title to the default title", async () => {
    const projectFilePath = path.join(projectRootPath, "Close Title.pergamum");
    const titleWindow = createTitleWindowMock();
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Close Title"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      undefined,
      () => titleWindow
    );
    await openProjectHandler({ sender: {} });

    titleWindow.setTitle.mockClear();
    await releaseCurrentProjectWriteOwnership();

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - a novel IDE -"
    );
  });

  it("closeCurrentProject returns noProject when no project is active", async () => {
    await expect(closeCurrentProject()).resolves.toEqual({
      status: "noProject"
    });
  });

  it("closeCurrentProject releases ownership, clears state, and updates the window title", async () => {
    const projectFilePath = path.join(projectRootPath, "Close Success.pergamum");
    const titleWindow = createTitleWindowMock();
    const ownership: ProjectWriteOwnership = { kind: "owned" };
    const ownershipManager = createWriteOwnershipManager(ownership);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Close Success"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      ownershipManager,
      () => titleWindow
    );
    await openProjectHandler({ sender: {} });
    titleWindow.setTitle.mockClear();

    await expect(closeCurrentProject()).resolves.toEqual({
      status: "closed"
    });

    expect(ownershipManager.release).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      ownership
    );
    expect(currentProjectRootPath()).toBeNull();
    expect(currentActiveProjectFilePath()).toBeNull();
    expect(currentProjectAccessMode()).toBeNull();
    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - a novel IDE -"
    );
  });

  it("closeCurrentProject returns releaseFailed and keeps main project state when release throws", async () => {
    const projectFilePath = path.join(projectRootPath, "Close Failure.pergamum");
    const ownership: ProjectWriteOwnership = { kind: "owned" };
    const ownershipManager = createWriteOwnershipManager(ownership);
    ownershipManager.release.mockRejectedValue(new Error("release failed"));
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Close Failure"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      ownershipManager
    );
    await openProjectHandler({ sender: {} });

    await expect(closeCurrentProject()).resolves.toEqual({
      status: "failed",
      reason: "releaseFailed"
    });

    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(path.resolve(projectFilePath));
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
  });

  it("releaseCurrentProjectWriteOwnership keeps shutdown cleanup best-effort when release throws", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Shutdown Best Effort.pergamum"
    );
    const ownership: ProjectWriteOwnership = { kind: "owned" };
    const ownershipManager = createWriteOwnershipManager(ownership);
    ownershipManager.release.mockRejectedValue(new Error("release failed"));
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Shutdown Best Effort"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      ownershipManager
    );
    await openProjectHandler({ sender: {} });

    await expect(releaseCurrentProjectWriteOwnership()).resolves.toBeUndefined();

    expect(ownershipManager.release).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      ownership
    );
    expect(currentProjectRootPath()).toBeNull();
    expect(currentActiveProjectFilePath()).toBeNull();
    expect(currentProjectAccessMode()).toBeNull();
  });

  it("project switch releases the previous owned lock and owns the new one", async () => {
    const secondProjectRootPath = path.join(projectRootPath, "second-root");
    await fs.mkdir(secondProjectRootPath);
    const firstProjectFilePath = path.join(
      projectRootPath,
      "First Switch.pergamum"
    );
    const secondProjectFilePath = path.join(
      secondProjectRootPath,
      "Second Switch.pergamum"
    );
    const firstLockDirectoryPath = projectWriteLockDirectoryPath(
      firstProjectFilePath
    );
    const secondLockDirectoryPath = projectWriteLockDirectoryPath(
      secondProjectFilePath
    );
    const firstCreated = await createProjectDatabase({
      projectFilePath: firstProjectFilePath,
      projectName: "First Switch"
    });
    await firstCreated.close();
    const secondCreated = await createProjectDatabase({
      projectFilePath: secondProjectFilePath,
      projectName: "Second Switch"
    });
    await secondCreated.close();
    electronMock.showOpenDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [firstProjectFilePath]
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [secondProjectFilePath]
      });

    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);

    await openProjectHandler({ sender: {} });
    await expect(fs.access(firstLockDirectoryPath)).resolves.toBeUndefined();

    const secondProject = await openProjectHandler({ sender: {} });

    expect(secondProject).toMatchObject({
      accessMode: defaultProjectAccessMode,
      name: "Second Switch"
    });
    await expect(fs.access(firstLockDirectoryPath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(fs.access(secondLockDirectoryPath)).resolves.toBeUndefined();
  });

  it("project switch updates the window title to the next project", async () => {
    const secondProjectRootPath = path.join(projectRootPath, "title-switch");
    await fs.mkdir(secondProjectRootPath);
    const firstProjectFilePath = path.join(
      projectRootPath,
      "First Title.pergamum"
    );
    const secondProjectFilePath = path.join(
      secondProjectRootPath,
      "Second Title.pergamum"
    );
    const titleWindow = createTitleWindowMock();
    const firstCreated = await createProjectDatabase({
      projectFilePath: firstProjectFilePath,
      projectName: "First Title"
    });
    await firstCreated.close();
    const secondCreated = await createProjectDatabase({
      projectFilePath: secondProjectFilePath,
      projectName: "Second Title"
    });
    await secondCreated.close();
    electronMock.showOpenDialog
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [firstProjectFilePath]
      })
      .mockResolvedValueOnce({
        canceled: false,
        filePaths: [secondProjectFilePath]
      });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      createLoggerMock(),
      undefined,
      () => titleWindow
    );

    await openProjectHandler({ sender: {} });
    await openProjectHandler({ sender: {} });

    expect(titleWindow.setTitle.mock.calls.map(([title]) => title)).toEqual([
      "Pergamum - First Title -",
      "Pergamum - Second Title -"
    ]);
  });

  it("openProject rejects invalid .pergamum without migration or repair", async () => {
    const logger = createLoggerMock();
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const projectFilePath = path.join(
      projectRootPath,
      "Invalid Secret.pergamum"
    );
    const emptyDatabase = new Database(projectFilePath);
    emptyDatabase.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      logger
    );

    await expectSanitizedProjectRejection(
      openProjectHandler({ sender: {} }) as Promise<unknown>,
      "unknown",
      [projectRootPath, projectFilePath, "Invalid Secret.pergamum"]
    );

    const verifyDatabase = new Database(projectFilePath);
    const userVersion = verifyDatabase.pragma("user_version", {
      simple: true
    });
    const tables = verifyDatabase
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all();
    verifyDatabase.close();

    expect(userVersion).toBe(0);
    expect(tables).toEqual([]);
    await expectSettingsJsonMissing(userDataPath);
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Invalid Secret.pergamum"
    ]);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("openStartupProject returns no request when no startup path was captured", async () => {
    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject
    );

    await expect(openStartupProjectHandler({ sender: {} })).resolves.toEqual({
      kind: "noStartupProjectOpen"
    });
    expect(electronMock.showOpenDialog).not.toHaveBeenCalled();
    expect(currentProjectRootPath()).toBeNull();
  });

  it("openStartupProject opens a valid captured .pergamum file without showing the open dialog", async () => {
    const projectFilePath = path.join(projectRootPath, "Startup Open.pergamum");
    await fs.writeFile(path.join(projectRootPath, "startup.md"), "# Startup\n");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Startup Open"
    });
    await created.close();

    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      createLoggerMock(),
      undefined,
      undefined,
      projectFilePath
    );
    const project = expectStartupProjectOpenResult(
      await openStartupProjectHandler({ sender: {} })
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Startup Open",
      documents: [
        {
          relativePath: "startup.md",
          name: "startup.md"
        }
      ]
    });
    expect(electronMock.showOpenDialog).not.toHaveBeenCalled();
    expect(currentActiveProjectFilePath()).toBe(path.resolve(projectFilePath));
    await expect(readRecentProjects(userDataPath)).resolves.toHaveLength(1);
  });

  it("openStartupProject consumes the captured project path only once", async () => {
    const projectFilePath = path.join(projectRootPath, "Startup Once.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Startup Once"
    });
    await created.close();

    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      createLoggerMock(),
      undefined,
      undefined,
      projectFilePath
    );

    expectStartupProjectOpenResult(
      await openStartupProjectHandler({ sender: {} })
    );
    await expect(openStartupProjectHandler({ sender: {} })).resolves.toEqual({
      kind: "noStartupProjectOpen"
    });
  });

  it("openStartupProject does not treat a directory ending in .pergamum as a project file", async () => {
    const projectDirectoryPath = path.join(
      projectRootPath,
      "Startup Directory.pergamum"
    );
    await fs.mkdir(projectDirectoryPath);
    const ownershipManager = createWriteOwnershipManager({ kind: "owned" });

    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      createLoggerMock(),
      ownershipManager,
      undefined,
      projectDirectoryPath
    );

    expectStartupProjectOpenResult(
      await openStartupProjectHandler({ sender: {} })
    );
    expect(ownershipManager.acquire).not.toHaveBeenCalled();
    expect(currentProjectRootPath()).toBeNull();
    await expectSettingsJsonMissing(userDataPath);
  });

  it("openStartupProject converts a missing .pergamum file into a controlled failure result without unsafe path surfaces", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Missing Startup.pergamum");
    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      logger,
      undefined,
      undefined,
      projectFilePath
    );

    expectStartupProjectOpenFailedResult(
      await openStartupProjectHandler({ sender: {} }),
      "unknown"
    );
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Missing Startup.pergamum"
    ]);
    expect(currentProjectRootPath()).toBeNull();
  });

  it("openStartupProject converts an invalid startup path into a controlled failure result", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Startup Draft.md");
    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      logger,
      undefined,
      undefined,
      projectFilePath
    );

    expectStartupProjectOpenFailedResult(
      await openStartupProjectHandler({ sender: {} }),
      "unknown"
    );
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Startup Draft.md"
    ]);
    expect(currentProjectRootPath()).toBeNull();
  });

  it("openStartupProject waits for read-only confirmation when write ownership is unavailable", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Startup Readonly.pergamum"
    );
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Startup Readonly"
    });
    await created.close();

    const openStartupProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openStartupProject,
      createLoggerMock(),
      ownershipManager,
      undefined,
      projectFilePath
    );
    const pending = expectPendingReadOnlyProjectOpen(
      expectStartupProjectOpenResult(
        await openStartupProjectHandler({ sender: {} })
      )
    );

    expect(pending.project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Startup Readonly"
    });
    expect(currentProjectAccessMode()).toBeNull();

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Startup Readonly"
    });
    expect(currentProjectAccessMode()).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });
  });

  it("openRecentProject opens a registered .pergamum entry by projectFilePath and refreshes recent projects", async () => {
    const projectFilePath = path.join(projectRootPath, "Recent File.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Recent Metadata Name"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    await fs.writeFile(
      path.join(projectRootPath, projectConfigFileName),
      '{"name":"Config Name"}\n',
      "utf8"
    );
    await writeRecentProjects(userDataPath, [
      {
        projectId: metadata.projectId,
        projectName: metadata.projectName,
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath,
        schemaVersion: metadata.schemaVersion,
        lastOpenedAt: "2026-08-22T00:00:00.000Z"
      }
    ]);

    const openRecentProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openRecentProject
    );
    const project = await openRecentProjectHandler(
      { sender: {} },
      { projectFilePath: path.resolve(projectFilePath) }
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Recent Metadata Name",
      config: {
        name: "Config Name"
      }
    });
    const recentProjects = await readRecentProjects(userDataPath);
    expect(recentProjects).toHaveLength(1);
    const refreshedRecentProject = recentProjects[0];
    expect(refreshedRecentProject).toMatchObject({
      projectId: metadata.projectId,
      projectName: metadata.projectName,
      projectFilePath: path.resolve(projectFilePath),
      projectRootPath,
      schemaVersion: metadata.schemaVersion
    });
    expect(refreshedRecentProject?.lastOpenedAt).not.toBe(
      "2026-08-22T00:00:00.000Z"
    );
    expect(currentProjectAccessMode()).toEqual(defaultProjectAccessMode);
  });

  it("openRecentProject updates the window title from DB metadata project name", async () => {
    const projectFilePath = path.join(projectRootPath, "Recent Title.pergamum");
    const titleWindow = createTitleWindowMock();
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Recent Title Metadata"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    await writeRecentProjects(userDataPath, [
      {
        projectId: metadata.projectId,
        projectName: metadata.projectName,
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath,
        schemaVersion: metadata.schemaVersion,
        lastOpenedAt: "2026-08-22T00:00:00.000Z"
      }
    ]);

    const openRecentProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openRecentProject,
      createLoggerMock(),
      undefined,
      () => titleWindow
    );
    await openRecentProjectHandler(
      { sender: {} },
      { projectFilePath: path.resolve(projectFilePath) }
    );

    expect(titleWindow.setTitle).toHaveBeenCalledWith(
      "Pergamum - Recent Title Metadata -"
    );
  });

  it("openRecentProject waits for confirmation when write ownership is unavailable", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Recent Readonly.pergamum"
    );
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Recent Readonly"
    });
    const metadata = await readProjectMetadata(created);
    await created.close();
    await writeRecentProjects(userDataPath, [
      {
        projectId: metadata.projectId,
        projectName: metadata.projectName,
        projectFilePath: path.resolve(projectFilePath),
        projectRootPath,
        schemaVersion: metadata.schemaVersion,
        lastOpenedAt: "2026-08-22T00:00:00.000Z"
      }
    ]);

    const openRecentProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openRecentProject,
      createLoggerMock(),
      ownershipManager
    );
    const result = await openRecentProjectHandler(
      { sender: {} },
      { projectFilePath: path.resolve(projectFilePath) }
    );

    expect(ownershipManager.acquire).toHaveBeenCalledWith(
      path.resolve(projectFilePath),
      {
        projectId: expect.any(String),
        sessionId: "session"
      }
    );
    const pending = expectPendingReadOnlyProjectOpen(result);
    expect(pending.project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Recent Readonly"
    });
    expect(currentProjectAccessMode()).toBeNull();

    const confirmReadOnlyProjectOpenHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    const project = await confirmReadOnlyProjectOpenHandler(
      { sender: {} },
      { token: pending.token }
    );

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      },
      name: "Recent Readonly"
    });
    expect(currentProjectAccessMode()).toEqual({
      kind: "readOnly",
      reason: "writeLockUnavailable"
    });
  });

  it("openRecentProject rejects legacy database recent targets without opening or refreshing them", async () => {
    const legacyDatabasePath = path.join(projectRootPath, "pergamum.db");
    await writeRecentProjects(userDataPath, [
      {
        projectId: "legacy-project",
        projectName: "Legacy Secret",
        projectFilePath: legacyDatabasePath,
        projectRootPath,
        schemaVersion: currentProjectDatabaseSchemaVersion,
        lastOpenedAt: "2026-08-22T00:00:00.000Z"
      }
    ]);

    const openRecentProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openRecentProject
    );

    await expectSanitizedProjectRejection(
      openRecentProjectHandler(
        { sender: {} },
        { projectFilePath: legacyDatabasePath }
      ) as Promise<unknown>,
      "unknown",
      [projectRootPath, legacyDatabasePath, "pergamum.db", "Legacy Secret"]
    );
    await expect(fs.access(legacyDatabasePath)).rejects.toMatchObject({
      code: "ENOENT"
    });
    await expect(readRecentProjects(userDataPath)).resolves.toMatchObject([
      {
        projectFilePath: legacyDatabasePath,
        lastOpenedAt: "2026-08-22T00:00:00.000Z"
      }
    ]);
  });

  it("createProject does not expose raw details when recent project recording fails", async () => {
    const logger = createLoggerMock();
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const projectFilePath = path.join(projectRootPath, "Warn Secret.pergamum");
    const invalidUserDataPath = path.join(projectRootPath, "known.md");
    await fs.writeFile(invalidUserDataPath, "# Known\n");
    electronMock.getPath.mockReturnValue(invalidUserDataPath);
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      logger
    );
    const project = await createProjectHandler({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      accessMode: defaultProjectAccessMode,
      name: "Warn Secret"
    });
    const warnings = consoleWarnSpy.mock.calls.map((call) => call.join(" "));
    expect(warnings).toEqual(["Could not record recent project."]);
    expect(warnings.join("\n")).not.toContain(projectRootPath);
    expect(warnings.join("\n")).not.toContain(projectFilePath);
    expect(warnings.join("\n")).not.toContain("Warn Secret");
    expect(warnings.join("\n")).not.toContain("known.md");
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Warn Secret.pergamum",
      "Warn Secret",
      "known.md"
    ]);
  });

  it("createProject sanitizes raw write errors in logs and console output", async () => {
    const logger = createLoggerMock();
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const projectFilePath = path.join(projectRootPath, "Leaky Secret.pergamum");
    const rawError = Object.assign(
      new Error(
        `EACCES: denied '${projectFilePath}' '${projectConfigFileName}' Leaky Secret`
      ),
      {
        code: "EACCES",
        path: projectFilePath
      }
    );
    const writeFileSpy = vi
      .spyOn(fs, "writeFile")
      .mockRejectedValueOnce(rawError);
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });

    const createProjectHandler = registeredHandler(
      PROJECT_CHANNELS.createProject,
      logger
    );

    await expectSanitizedProjectRejection(
      createProjectHandler({ sender: {} }) as Promise<unknown>,
      "permissionDenied",
      [
        projectRootPath,
        projectFilePath,
        "Leaky Secret.pergamum",
        projectConfigFileName,
        "Leaky Secret",
        "EACCES"
      ]
    );

    writeFileSpy.mockRestore();
    expectNoUnsafeSurface(logger, [
      projectRootPath,
      projectFilePath,
      "Leaky Secret.pergamum",
      projectConfigFileName,
      "Leaky Secret",
      "EACCES"
    ]);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("lists only visible File Explorer root children without reading nested folders", async () => {
    const projectFilePath = path.join(projectRootPath, "Explorer.pergamum");
    await fs.mkdir(path.join(projectRootPath, "Drafts"));
    await fs.mkdir(path.join(projectRootPath, "Drafts", "Deep"));
    await fs.writeFile(path.join(projectRootPath, "chapter.md"), "# Chapter\n");
    await fs.writeFile(path.join(projectRootPath, "notes.txt"), "notes\n");
    await fs.writeFile(
      path.join(projectRootPath, "Drafts", "nested.md"),
      "# Nested\n"
    );
    await fs.writeFile(
      path.join(projectRootPath, "Drafts", "Deep", "deep.md"),
      "# Deep\n"
    );
    await fs.writeFile(path.join(projectRootPath, projectConfigFileName), "{}\n");
    await fs.mkdir(path.join(projectRootPath, ".pergamum_recovery"));
    await fs.writeFile(
      path.join(projectRootPath, ".pergamum_recovery", "candidate.txt"),
      "recovery\n"
    );
    await fs.mkdir(path.join(projectRootPath, ".git"));
    await fs.writeFile(path.join(projectRootPath, ".DS_Store"), "");
    await fs.writeFile(path.join(projectRootPath, "Thumbs.db"), "");
    await fs.writeFile(path.join(projectRootPath, "desktop.ini"), "");
    await fs.mkdir(
      path.join(projectRootPath, ".pergamum.lock.stale-2026-08-30T00-00-00Z")
    );
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    const rootResult = expectFileExplorerOk(
      await listFileExplorerChildrenHandler(
        { sender: {} },
        { directoryRelativePath: null }
      )
    );

    expect(rootResult.entries).toEqual([
      {
        kind: "folder",
        name: "Drafts",
        relativePath: "Drafts"
      },
      {
        kind: "file",
        name: "chapter.md",
        relativePath: "chapter.md"
      },
      {
        kind: "file",
        name: "notes.txt",
        relativePath: "notes.txt"
      }
    ]);
    expect(JSON.stringify(rootResult)).not.toContain("nested.md");
    expect(JSON.stringify(rootResult)).not.toContain("Explorer.pergamum");
    expect(JSON.stringify(rootResult)).not.toContain(projectConfigFileName);
    expect(JSON.stringify(rootResult)).not.toContain(".pergamum.lock");
    expect(JSON.stringify(rootResult)).not.toContain(".pergamum_recovery");
    expect(JSON.stringify(rootResult)).not.toContain(".git");
    expect(JSON.stringify(rootResult)).not.toContain(".DS_Store");
    expect(JSON.stringify(rootResult)).not.toContain("Thumbs.db");
    expect(JSON.stringify(rootResult)).not.toContain("desktop.ini");
  });

  it("registers Markdown files discovered by File Explorer listing as project documents", async () => {
    const projectFilePath = path.join(projectRootPath, "Explorer Late.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Late"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const readProjectDocumentHandler = registeredHandler(
      PROJECT_CHANNELS.readProjectDocument
    );
    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    await fs.writeFile(path.join(projectRootPath, "late.md"), "# Late\n");
    await fs.writeFile(
      path.join(projectRootPath, "late.markdown"),
      "# Late Markdown\n"
    );
    await fs.writeFile(path.join(projectRootPath, "notes.txt"), "notes\n");

    await expect(
      readProjectDocumentHandler({ sender: {} }, { relativePath: "late.md" })
    ).rejects.toMatchObject({ name: "PergamumFileIoError" });

    const rootResult = expectFileExplorerOk(
      await listFileExplorerChildrenHandler(
        { sender: {} },
        { directoryRelativePath: null }
      )
    );

    expect(rootResult.entries).toEqual([
      {
        kind: "file",
        name: "late.markdown",
        relativePath: "late.markdown"
      },
      {
        kind: "file",
        name: "late.md",
        relativePath: "late.md"
      },
      {
        kind: "file",
        name: "notes.txt",
        relativePath: "notes.txt"
      }
    ]);
    await expect(
      readProjectDocumentHandler({ sender: {} }, { relativePath: "late.md" })
    ).resolves.toMatchObject({
      relativePath: "late.md",
      content: "# Late\n"
    });
    await expect(
      readProjectDocumentHandler(
        { sender: {} },
        { relativePath: "late.markdown" }
      )
    ).resolves.toMatchObject({
      relativePath: "late.markdown",
      content: "# Late Markdown\n"
    });
    await expect(
      readProjectDocumentHandler({ sender: {} }, { relativePath: "notes.txt" })
    ).rejects.toMatchObject({ name: "PergamumFileIoError" });
  });

  it("lists only the requested folder direct children for File Explorer expansion", async () => {
    const projectFilePath = path.join(projectRootPath, "Explorer Nested.pergamum");
    await fs.mkdir(path.join(projectRootPath, "Drafts"));
    await fs.mkdir(path.join(projectRootPath, "Drafts", "Deep"));
    await fs.writeFile(
      path.join(projectRootPath, "Drafts", "nested.md"),
      "# Nested\n"
    );
    await fs.writeFile(
      path.join(projectRootPath, "Drafts", "Deep", "deep.md"),
      "# Deep\n"
    );
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Nested"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    const draftsResult = expectFileExplorerOk(
      await listFileExplorerChildrenHandler(
        { sender: {} },
        { directoryRelativePath: "Drafts" }
      )
    );

    expect(draftsResult.directoryRelativePath).toBe("Drafts");
    expect(draftsResult.entries).toEqual([
      {
        kind: "folder",
        name: "Deep",
        relativePath: "Drafts/Deep"
      },
      {
        kind: "file",
        name: "nested.md",
        relativePath: "Drafts/nested.md"
      }
    ]);
    expect(JSON.stringify(draftsResult)).not.toContain("deep.md");
  });

  it("refuses outside-root and non-directory File Explorer listing requests", async () => {
    const projectFilePath = path.join(projectRootPath, "Explorer Safety.pergamum");
    await fs.writeFile(path.join(projectRootPath, "chapter.md"), "# Chapter\n");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Safety"
    });
    await created.close();

    const listBeforeOpenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    await expect(
      listBeforeOpenHandler({ sender: {} }, { directoryRelativePath: null })
    ).resolves.toEqual({
      kind: "unavailable",
      directoryRelativePath: null,
      reason: "noProject"
    });

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    await expect(
      listBeforeOpenHandler({ sender: {} }, { directoryRelativePath: ".." })
    ).resolves.toEqual({
      kind: "unavailable",
      directoryRelativePath: null,
      reason: "outsideProjectRoot"
    });
    await expect(
      listBeforeOpenHandler({ sender: {} }, { directoryRelativePath: "chapter.md" })
    ).resolves.toEqual({
      kind: "unavailable",
      directoryRelativePath: "chapter.md",
      reason: "notDirectory"
    });
    await expect(listBeforeOpenHandler({ sender: {} }, {})).resolves.toEqual({
      kind: "unavailable",
      directoryRelativePath: null,
      reason: "invalidRequest"
    });
  });

  it("rejects direct File Explorer list requests for reserved / hidden path segments without scanning", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Explorer Reserved.pergamum"
    );
    // The reserved-segment guard rejects before touching the filesystem, so
    // none of these paths need to exist on disk.
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Reserved"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );

    const readdirSpy = vi.spyOn(fs, "readdir");
    const lstatSpy = vi.spyOn(fs, "lstat");

    for (const directoryRelativePath of [
      ".git",
      ".pergamum_recovery",
      ".pergamum.lock",
      ".pergamum.lock.stale-20260830T000000Z",
      "pergamum.json",
      ".DS_Store",
      "Thumbs.db",
      "desktop.ini",
      "foo/.git",
      "foo/.pergamum_recovery"
    ]) {
      readdirSpy.mockClear();
      lstatSpy.mockClear();

      await expect(
        listFileExplorerChildrenHandler(
          { sender: {} },
          { directoryRelativePath }
        )
      ).resolves.toEqual({
        kind: "unavailable",
        directoryRelativePath: null,
        reason: "reserved"
      });

      expect(readdirSpy).not.toHaveBeenCalled();
      expect(lstatSpy).not.toHaveBeenCalled();
    }

    readdirSpy.mockRestore();
    lstatSpy.mockRestore();
  });

  it("returns an unavailable File Explorer result when a folder cannot be read", async () => {
    const logger = createLoggerMock();
    const projectFilePath = path.join(projectRootPath, "Explorer Unreadable.pergamum");
    const rawPath = path.join(projectRootPath, "secret-folder");
    const rawError = Object.assign(
      new Error(`EACCES: denied '${rawPath}'`),
      {
        code: "EACCES",
        path: rawPath
      }
    );
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Unreadable"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(
      PROJECT_CHANNELS.openProject,
      logger
    );
    await openProjectHandler({ sender: {} });
    const readdirSpy = vi.spyOn(fs, "readdir").mockRejectedValueOnce(rawError);

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren,
      logger
    );

    await expect(
      listFileExplorerChildrenHandler(
        { sender: {} },
        { directoryRelativePath: null }
      )
    ).resolves.toEqual({
      kind: "unavailable",
      directoryRelativePath: null,
      reason: "unreadable"
    });
    expectNoUnsafeSurface(logger, [rawPath, projectRootPath]);
    readdirSpy.mockRestore();
  });

  it("does not follow symlink-like File Explorer entries", async () => {
    const projectFilePath = path.join(projectRootPath, "Explorer Symlink.pergamum");
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Symlink"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });
    const readdirSpy = vi.spyOn(fs, "readdir").mockResolvedValueOnce([
      fakeDirent("Visible", "directory"),
      fakeDirent("visible.md", "file"),
      fakeDirent("Linked", "symlink")
    ] as Dirent[]);

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    const rootResult = expectFileExplorerOk(
      await listFileExplorerChildrenHandler(
        { sender: {} },
        { directoryRelativePath: null }
      )
    );

    expect(rootResult.entries).toEqual([
      {
        kind: "folder",
        name: "Visible",
        relativePath: "Visible"
      },
      {
        kind: "file",
        name: "visible.md",
        relativePath: "visible.md"
      }
    ]);
    expect(JSON.stringify(rootResult)).not.toContain("Linked");
    readdirSpy.mockRestore();
  });

  it("refuses direct File Explorer requests below a symlink-like path before scanning it", async () => {
    const projectFilePath = path.join(
      projectRootPath,
      "Explorer Symlink Request.pergamum"
    );
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "Explorer Symlink Request"
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    const openProjectHandler = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProjectHandler({ sender: {} });
    const lstatSpy = vi
      .spyOn(fs, "lstat")
      .mockResolvedValueOnce(fakeStats("symlink"));
    const readdirSpy = vi.spyOn(fs, "readdir");

    const listFileExplorerChildrenHandler = registeredHandler(
      PROJECT_CHANNELS.listFileExplorerChildren
    );
    const result = await listFileExplorerChildrenHandler(
      { sender: {} },
      { directoryRelativePath: "Linked/child" }
    );

    expect(result).toEqual({
      kind: "unavailable",
      directoryRelativePath: "Linked/child",
      reason: "notDirectory"
    });
    expect(readdirSpy).not.toHaveBeenCalled();
    lstatSpy.mockRestore();
    readdirSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // #307: File Explorer "New File" / "New Folder"
  // -------------------------------------------------------------------------

  async function openExplorerProject(name: string): Promise<void> {
    const projectFilePath = path.join(projectRootPath, `${name}.pergamum`);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: name
    });
    await created.close();
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });
    await registeredHandler(PROJECT_CHANNELS.openProject)({ sender: {} });
  }

  async function openReadOnlyExplorerProject(name: string): Promise<void> {
    const projectFilePath = path.join(projectRootPath, `${name}.pergamum`);
    const ownershipManager = createWriteOwnershipManager({
      kind: "unavailable",
      reason: "lockUnavailable"
    });
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: projectFilePath
    });
    const pending = expectPendingReadOnlyProjectOpen(
      await registeredHandler(
        PROJECT_CHANNELS.createProject,
        createLoggerMock(),
        ownershipManager
      )({ sender: {} })
    );
    await registeredHandler(PROJECT_CHANNELS.confirmReadOnlyProjectOpen)(
      { sender: {} },
      { token: pending.token }
    );
  }

  function createFileHandler(): (...args: unknown[]) => unknown {
    return registeredHandler(
      PROJECT_CHANNELS.createFileExplorerMarkdownFile
    );
  }

  function createFolderHandler(): (...args: unknown[]) => unknown {
    return registeredHandler(PROJECT_CHANNELS.createFileExplorerFolder);
  }

  it("registers the File Explorer create IPC channels", () => {
    registerProjectIpc(createLoggerMock());

    expect(
      electronMock.handle.mock.calls.map(([channel]) => channel)
    ).toEqual(
      expect.arrayContaining([
        PROJECT_CHANNELS.createFileExplorerMarkdownFile,
        PROJECT_CHANNELS.createFileExplorerFolder
      ])
    );
  });

  it("creates an empty Markdown file and makes it a readable project document", async () => {
    await openExplorerProject("Create MD");
    await fs.mkdir(path.join(projectRootPath, "Drafts"));

    const result = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: "Drafts", name: "chapter-01" }
    )) as { ok: boolean; entry?: { relativePath: string; name: string } };

    expect(result).toEqual({
      ok: true,
      entry: {
        kind: "file",
        name: "chapter-01.md",
        relativePath: "Drafts/chapter-01.md"
      }
    });
    await expect(
      fs.readFile(path.join(projectRootPath, "Drafts", "chapter-01.md"), "utf8")
    ).resolves.toBe("");

    const document = (await registeredHandler(
      PROJECT_CHANNELS.readProjectDocument
    )({ sender: {} }, { relativePath: "Drafts/chapter-01.md" })) as {
      content: string;
    };
    expect(document.content).toBe("");
  });

  it("keeps a supported extension and appends .md otherwise", async () => {
    await openExplorerProject("Create Ext");

    const kept = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "notes.markdown" }
    )) as { ok: boolean; entry?: { name: string } };
    expect(kept.entry?.name).toBe("notes.markdown");

    const rejected = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "notes.txt" }
    )) as { ok: boolean; reason?: string };
    expect(rejected).toEqual({ ok: false, reason: "unsupportedExtension" });
    await expect(
      fs.access(path.join(projectRootPath, "notes.txt"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates a folder without recursion and never overwrites", async () => {
    await openExplorerProject("Create Folder");

    const first = (await createFolderHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "Chapters" }
    )) as { ok: boolean; entry?: { kind: string; relativePath: string } };
    expect(first).toEqual({
      ok: true,
      entry: { kind: "folder", name: "Chapters", relativePath: "Chapters" }
    });
    expect(
      (await fs.lstat(path.join(projectRootPath, "Chapters"))).isDirectory()
    ).toBe(true);

    // Re-create → EEXIST → alreadyExists (never truncates).
    const second = (await createFolderHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "Chapters" }
    )) as { ok: boolean; reason?: string };
    expect(second).toEqual({ ok: false, reason: "alreadyExists" });

    // Non-recursive: a missing parent is targetDirectoryMissing, not mkdir -p.
    const nested = (await createFolderHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: "Missing", name: "Deep" }
    )) as { ok: boolean; reason?: string };
    expect(nested.ok).toBe(false);
    expect(["targetDirectoryMissing", "outsideProjectRoot"]).toContain(
      nested.reason
    );
    await expect(
      fs.access(path.join(projectRootPath, "Missing"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects overwriting an existing file", async () => {
    await openExplorerProject("Create Overwrite");
    await fs.writeFile(
      path.join(projectRootPath, "chapter.md"),
      "EXISTING_MANUSCRIPT_MARKER"
    );

    const result = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "chapter.md" }
    )) as { ok: boolean; reason?: string };

    expect(result).toEqual({ ok: false, reason: "alreadyExists" });
    await expect(
      fs.readFile(path.join(projectRootPath, "chapter.md"), "utf8")
    ).resolves.toBe("EXISTING_MANUSCRIPT_MARKER");
  });

  it("rejects reserved names without touching the filesystem", async () => {
    await openExplorerProject("Create Reserved");
    const writeSpy = vi.spyOn(fs, "writeFile");
    const mkdirSpy = vi.spyOn(fs, "mkdir");

    for (const name of [".pergamum", "pergamum.json", ".git", "Thumbs.db"]) {
      const fileResult = (await createFileHandler()(
        { sender: {} },
        { parentDirectoryRelativePath: null, name }
      )) as { ok: boolean; reason?: string };
      expect(fileResult.ok).toBe(false);
      expect(["reservedName", "invalidName"]).toContain(fileResult.reason);

      const folderResult = (await createFolderHandler()(
        { sender: {} },
        { parentDirectoryRelativePath: null, name }
      )) as { ok: boolean; reason?: string };
      expect(folderResult.ok).toBe(false);
    }

    expect(writeSpy).not.toHaveBeenCalled();
    expect(mkdirSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
    mkdirSpy.mockRestore();
  });

  it("rejects a create outside the project root", async () => {
    await openExplorerProject("Create Outside");

    const result = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: "../escape", name: "leak.md" }
    )) as { ok: boolean; reason?: string };

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("outsideProjectRoot");
  });

  it("refuses to create under a symlink-like parent", async () => {
    await openExplorerProject("Create Symlink");
    const lstatSpy = vi
      .spyOn(fs, "lstat")
      .mockResolvedValue(fakeStats("symlink"));

    const result = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: "Linked", name: "leak.md" }
    )) as { ok: boolean; reason?: string };

    expect(result).toEqual({ ok: false, reason: "notDirectory" });
    lstatSpy.mockRestore();
  });

  it("refuses to create when the current project is read-only", async () => {
    await openReadOnlyExplorerProject("Create Readonly");
    const writeSpy = vi.spyOn(fs, "writeFile");

    const result = (await createFileHandler()(
      { sender: {} },
      { parentDirectoryRelativePath: null, name: "chapter.md" }
    )) as { ok: boolean; reason?: string };

    expect(result).toEqual({ ok: false, reason: "readOnlyProject" });
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });

  it("maps raw filesystem errors to stable reasons and never leaks the message", async () => {
    await openExplorerProject("Create Errors");
    const cases: Array<[string, string]> = [
      ["EACCES", "permissionDenied"],
      ["ENOSPC", "noSpace"],
      ["EROFS", "readOnlyFilesystem"],
      ["ENAMETOOLONG", "nameTooLong"],
      ["EWEIRD", "unknown"]
    ];

    for (const [code, reason] of cases) {
      const writeSpy = vi
        .spyOn(fs, "writeFile")
        .mockRejectedValueOnce(
          Object.assign(new Error(`${code}: SECRET_RAW_PATH /etc/passwd`), {
            code
          })
        );

      const result = (await createFileHandler()(
        { sender: {} },
        { parentDirectoryRelativePath: null, name: `err-${code}.md` }
      )) as { ok: boolean; reason?: string };

      expect(result).toEqual({ ok: false, reason });
      expect(JSON.stringify(result)).not.toContain("SECRET_RAW_PATH");
      writeSpy.mockRestore();
    }
  });

  it("returns invalidName for a malformed create request", async () => {
    await openExplorerProject("Create Malformed");

    await expect(
      createFileHandler()({ sender: {} }, { name: 42 })
    ).resolves.toEqual({ ok: false, reason: "invalidName" });
  });

  // -------------------------------------------------------------------------
  // #274: openProjectByFilePath — cold-start Session restore project reopen
  // -------------------------------------------------------------------------

  async function makeValidProject(name: string): Promise<{
    projectFilePath: string;
    projectId: string;
  }> {
    const projectFilePath = path.join(projectRootPath, `${name}.pergamum`);
    await fs.writeFile(path.join(projectRootPath, `${name}.md`), `# ${name}\n`);
    const created = await createProjectDatabase({ projectFilePath, projectName: name });
    await created.close();
    const opened = await openProjectDatabase(projectFilePath);
    const metadata = await readProjectMetadata(opened);
    await opened.close();

    return { projectFilePath, projectId: metadata.projectId };
  }

  it("openProjectByFilePath reopens a project when the saved identity matches", async () => {
    const { projectFilePath, projectId } = await makeValidProject("Restore Match");
    const handler = registeredHandler(PROJECT_CHANNELS.openProjectByFilePath);

    const result = (await handler(
      { sender: {} },
      { projectFilePath, expectedProjectId: projectId }
    )) as { kind: string; result?: unknown };

    expect(result.kind).toBe("opened");
    expect(result.result).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: path.resolve(projectFilePath),
      name: "Restore Match"
    });
    expect(electronMock.showOpenDialog).not.toHaveBeenCalled();
  });

  it("openProjectByFilePath reports identityMismatch for a different project at the path", async () => {
    const { projectFilePath } = await makeValidProject("Restore Mismatch");
    const handler = registeredHandler(PROJECT_CHANNELS.openProjectByFilePath);

    const result = (await handler(
      { sender: {} },
      {
        projectFilePath,
        expectedProjectId: "0190a000-0000-7000-8000-0000000000ff"
      }
    )) as { kind: string };

    expect(result.kind).toBe("identityMismatch");
    // The mismatched reopen must not leave the project open / owned.
    expect(currentActiveProjectFilePath()).toBeNull();
  });

  it("openProjectByFilePath returns a controlled failure for a missing .pergamum", async () => {
    const handler = registeredHandler(PROJECT_CHANNELS.openProjectByFilePath);

    const result = (await handler(
      { sender: {} },
      {
        projectFilePath: path.join(projectRootPath, "Gone.pergamum"),
        expectedProjectId: "0190a000-0000-7000-8000-0000000000ff"
      }
    )) as { kind: string; reason?: string };

    expect(result.kind).toBe("failed");
    expect(typeof result.reason).toBe("string");
  });
});

function createLoggerMock(): DebugLogger & {
  log: ReturnType<typeof vi.fn>;
} {
  return {
    enabled: true,
    sessionId: "session",
    currentFilePath: null,
    getSnapshot: vi.fn(),
    subscribe: vi.fn(),
    log: vi.fn<DebugLogger["log"]>(),
    logRendererRequest: vi.fn(),
    openFileSink: vi.fn(),
    flushAndClose: vi.fn(),
    projectRefForKey: vi.fn(() => "project:session:001"),
    documentRefForKey: vi.fn(() => "document:session:001"),
    isKnownProjectRef: vi.fn(() => true),
    isKnownDocumentRef: vi.fn(() => true)
  };
}

function createWriteOwnershipManager(
  ownership: ProjectWriteOwnership
): ProjectWriteOwnershipManager & {
  acquire: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    acquire: vi.fn().mockResolvedValue(ownership),
    release: vi.fn().mockResolvedValue(undefined)
  };
}

function expectFileExplorerOk(
  value: unknown
): Extract<ListFileExplorerChildrenResult, { kind: "ok" }> {
  expect(value).toMatchObject({
    kind: "ok",
    entries: expect.any(Array)
  });

  return value as Extract<ListFileExplorerChildrenResult, { kind: "ok" }>;
}

function fakeDirent(
  name: string,
  kind: "directory" | "file" | "symlink"
): Dirent {
  return {
    name,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isDirectory: () => kind === "directory",
    isFIFO: () => false,
    isFile: () => kind === "file",
    isSocket: () => false,
    isSymbolicLink: () => kind === "symlink"
  } as Dirent;
}

function fakeStats(
  kind: "directory" | "file" | "symlink"
): Awaited<ReturnType<typeof fs.lstat>> {
  return {
    isDirectory: () => kind === "directory",
    isSymbolicLink: () => kind === "symlink"
  } as Awaited<ReturnType<typeof fs.lstat>>;
}

function realProjectWriteLockFileSystem(
  overrides: Partial<ProjectWriteLockFileSystem> = {}
): ProjectWriteLockFileSystem {
  return {
    mkdir: (dirPath) => fs.mkdir(dirPath).then(() => undefined),
    writeFile: (targetPath, data, options) =>
      fs.writeFile(targetPath, data, options),
    open: async (targetPath, flags) => {
      const handle = await fs.open(targetPath, flags);

      return {
        writeFile: (data, encoding) => handle.writeFile(data, encoding),
        close: () => handle.close()
      };
    },
    unlink: (targetPath) => fs.unlink(targetPath),
    rmdir: (dirPath) => fs.rmdir(dirPath),
    readFile: (targetPath, encoding) => fs.readFile(targetPath, encoding),
    rename: (fromPath, toPath) =>
      fs.rename(fromPath, toPath).then(() => undefined),
    stat: async (targetPath) => {
      const stats = await fs.stat(targetPath);
      return { isDirectory: () => stats.isDirectory() };
    },
    ...overrides
  };
}

async function seedProjectWriteLock(
  projectFilePath: string,
  owner: ProjectLockOwnerMetadata
): Promise<void> {
  const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);

  await fs.mkdir(lockDirectoryPath);
  await fs.writeFile(
    projectLockOwnerMetadataPath(lockDirectoryPath),
    `${JSON.stringify(owner, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    projectLockOwnerHandlePath(lockDirectoryPath),
    projectLockOwnerHandleContent,
    "utf8"
  );
}

async function listProjectWriteLockArchives(
  projectFilePath: string
): Promise<string[]> {
  const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
  const entries = await fs.readdir(path.dirname(lockDirectoryPath));

  return entries.filter((name) => name.startsWith(".pergamum.lock.stale-"));
}

function createTitleWindowMock(): { setTitle: ReturnType<typeof vi.fn> } {
  return {
    setTitle: vi.fn()
  };
}

function expectPendingReadOnlyProjectOpen(
  value: unknown
): PendingReadOnlyProjectOpen {
  expect(value).toMatchObject({
    kind: "pendingReadOnlyProjectOpen",
    token: expect.any(String),
    readOnlyReason: expect.stringMatching(/^(lockUnavailable|lockSetupFailed)$/),
    project: {
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      }
    }
  });
  expect(value).toHaveProperty("lockOwner");

  return value as PendingReadOnlyProjectOpen;
}

function expectStartupProjectOpenResult(value: unknown): ProjectOpenResult {
  expect(value).toMatchObject({
    kind: "startupProjectOpenResult"
  });

  return (value as { result: ProjectOpenResult }).result;
}

function expectStartupProjectOpenFailedResult(
  value: unknown,
  reason: string
): void {
  expect(value).toMatchObject({
    kind: "startupProjectOpenFailed",
    reason,
    message: `File I/O failed: ${reason}`
  });
}

function registeredHandler(
  channel: string,
  logger: DebugLogger = createLoggerMock(),
  writeOwnershipManager?: ProjectWriteOwnershipManager,
  windowTitleTargetProvider?: ProjectWindowTitleTargetProvider,
  startupProjectFilePath?: string | null,
  instanceRunId?: string
): (...args: unknown[]) => unknown {
  registerProjectIpc(
    logger,
    writeOwnershipManager,
    windowTitleTargetProvider,
    startupProjectFilePath,
    instanceRunId
  );

  const registration = electronMock.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  );

  if (!registration) {
    throw new Error(`Handler was not registered for ${channel}.`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}

function settingsJsonPath(userDataPath: string): string {
  return path.join(userDataPath, "settings.json");
}

async function readRecentProjects(
  userDataPath: string
): Promise<
  Array<Record<string, unknown>>
> {
  const settings = JSON.parse(
    await fs.readFile(settingsJsonPath(userDataPath), "utf8")
  ) as {
    recentProjects: Array<Record<string, unknown>>;
  };

  return settings.recentProjects;
}

async function writeRecentProjects(
  userDataPath: string,
  recentProjects: Array<Record<string, unknown>>
): Promise<void> {
  await fs.writeFile(
    settingsJsonPath(userDataPath),
    `${JSON.stringify({
      preview: { renderer: "markdown" },
      recentProjects
    })}\n`,
    "utf8"
  );
}

async function expectSettingsJsonMissing(userDataPath: string): Promise<void> {
  await expect(
    fs.access(settingsJsonPath(userDataPath))
  ).rejects.toMatchObject({
    code: "ENOENT"
  });
}

async function expectSanitizedProjectRejection(
  promise: Promise<unknown>,
  reason: string,
  disallowedText: readonly string[]
): Promise<void> {
  const rejection = await promise.then(
    () => {
      throw new Error("Expected promise to reject.");
    },
    (error: unknown) => error
  );

  expect(rejection).toMatchObject({
    name: "PergamumFileIoError",
    message: `File I/O failed: ${reason}`,
    code: "PERGAMUM_FILE_IO_FAILED",
    reason
  });

  const safeErrorSurface = `${String(rejection)}\n${JSON.stringify(rejection)}`;

  for (const text of disallowedText) {
    expect(safeErrorSurface).not.toContain(text);
  }
}

function expectNoUnsafeSurface(
  logger: { log: ReturnType<typeof vi.fn> },
  disallowedText: readonly string[]
): void {
  const serializedLogs = JSON.stringify(
    logger.log.mock.calls.map(([entry]) => entry)
  );

  for (const text of disallowedText) {
    expect(serializedLogs).not.toContain(text);
  }
}

function expectDialogHasNoUnsafeSurface(
  disallowedText: readonly string[]
): void {
  const serializedDialogs = JSON.stringify(
    electronMock.showMessageBox.mock.calls
  );

  for (const text of disallowedText) {
    expect(serializedDialogs).not.toContain(text);
  }
}
