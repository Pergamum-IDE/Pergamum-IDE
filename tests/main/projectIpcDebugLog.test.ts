import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_CHANNELS } from "../../src/shared/api";
import type { DebugLogger } from "../../src/main/debugLogger";
import { createProjectDatabase } from "../../src/main/projectDatabase";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn(() => undefined),
  showOpenDialog: vi.fn(),
  getPath: vi.fn(),
  getVersion: vi.fn()
}));

const atomicWriteMock = vi.hoisted(() => ({
  writeFileAtomic: vi.fn<(target: string, data: string) => Promise<void>>()
}));

vi.mock("../../src/main/atomicFileWrite", () => ({
  writeFileAtomic: atomicWriteMock.writeFileAtomic
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents
  },
  dialog: {
    showOpenDialog: electronMock.showOpenDialog
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
  currentProjectRootPath,
  ProjectWriteLockOwnershipManager,
  projectWriteLockDirectoryPath,
  releaseCurrentProjectWriteOwnership,
  registerProjectIpc,
  requireCurrentActiveProjectFilePath,
  requireCurrentProjectRootPath,
  type ProjectWriteLockFileSystem
} from "../../src/main/projectIpc";
import {
  createProjectLockOwnerMetadata,
  projectLockOwnerHandleContent,
  projectLockOwnerHandlePath,
  projectLockOwnerMetadataPath
} from "../../src/main/projectLockOwnerMetadata";

describe("project IPC debug logging", () => {
  let projectRootPath: string;
  let projectFilePath: string;
  let userDataPath: string;

  beforeEach(async () => {
    electronMock.handle.mockClear();
    electronMock.fromWebContents.mockReset().mockReturnValue(undefined);
    electronMock.showOpenDialog.mockReset();
    electronMock.getPath.mockReset();
    electronMock.getVersion.mockReset().mockReturnValue("9.8.7-test");
    atomicWriteMock.writeFileAtomic.mockReset();
    atomicWriteMock.writeFileAtomic.mockResolvedValue(undefined);
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-ipc-debug-")
    );
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-project-ipc-user-data-")
    );
    electronMock.getPath.mockReturnValue(userDataPath);
    projectFilePath = path.join(projectRootPath, "Debug Project.pergamum");
    await fs.writeFile(path.join(projectRootPath, "known.md"), "# Known\n");
    const database = await createProjectDatabase({
      projectFilePath,
      projectName: "Debug Project"
    });
    await database.close();
  });

  afterEach(async () => {
    await releaseCurrentProjectWriteOwnership();
    await fs.rm(projectRootPath, {
      recursive: true,
      force: true
    });
    await fs.rm(userDataPath, {
      recursive: true,
      force: true
    });
  });

  it("logs a nonexistent project document open failure exactly once", async () => {
    const logger = createLoggerMock();
    registerProjectIpc(logger);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProject({ sender: {} });
    logger.log.mockClear();

    const readProjectDocument = registeredHandler(
      PROJECT_CHANNELS.readProjectDocument
    );
    await expectSanitizedFileIoRejection(
      readProjectDocument(
        { sender: {} },
        { relativePath: "missing-secret-title.md" }
      ) as Promise<unknown>,
      "unknown",
      [projectRootPath, "missing-secret-title"]
    );

    const documentOpenFailureLogs = logger.log.mock.calls
      .map(([input]) => input)
      .filter((input) => input.event === "document.open.failed");

    expect(documentOpenFailureLogs).toHaveLength(1);
    expect(documentOpenFailureLogs[0]).toMatchObject({
      level: "error",
      event: "document.open.failed",
      details: {
        projectRef: "project:session:001",
        documentRef: "document:session:001",
        pathKind: "projectFile",
        extension: ".md",
        pathDepth: 1,
        operation: "read",
        result: "failed",
        reason: "unknown"
      }
    });
    expect(JSON.stringify(documentOpenFailureLogs[0].details)).not.toContain(
      "missing-secret-title"
    );
  });

  it("sets active project file state when opening a .pergamum project", async () => {
    const logger = createLoggerMock();
    registerProjectIpc(logger);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
    const project = await openProject({ sender: {} });

    expect(project).toMatchObject({
      rootPath: projectRootPath,
      activeProjectFilePath: projectFilePath
    });
    expect(currentProjectRootPath()).toBe(projectRootPath);
    expect(requireCurrentProjectRootPath()).toBe(projectRootPath);
    expect(currentActiveProjectFilePath()).toBe(projectFilePath);
    expect(requireCurrentActiveProjectFilePath()).toBe(projectFilePath);
  });

  it("logs stale project write lock recovery without exposing raw paths or contents", async () => {
    const logger = createLoggerMock();
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const staleOwner = createProjectLockOwnerMetadata({
      projectId: "0198d95f-97d8-7000-8000-0000000000aa",
      sessionId: "stale-session",
      pid: 62368,
      hostname: "stale-host",
      appVersion: "0.60.0",
      now: new Date(2026, 7, 29, 8, 6, 16)
    });
    await fs.mkdir(lockDirectoryPath);
    await fs.writeFile(
      projectLockOwnerMetadataPath(lockDirectoryPath),
      `${JSON.stringify(staleOwner, null, 2)}\n`,
      "utf8"
    );
    await fs.writeFile(
      projectLockOwnerHandlePath(lockDirectoryPath),
      projectLockOwnerHandleContent,
      "utf8"
    );
    const ownershipManager = new ProjectWriteLockOwnershipManager(
      fs as unknown as ProjectWriteLockFileSystem,
      {
        now: () => new Date("2026-08-29T10:00:00.000Z"),
        hostname: () => "fresh-host",
        appVersion: () => "9.8.7-test",
        pid: () => 4242
      },
      { probeProcessLiveness: () => "dead" }
    );
    registerProjectIpc(
      logger,
      ownershipManager,
      undefined,
      undefined,
      "0198d95f-97d8-7000-8000-000000000302"
    );
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProject({ sender: {} });

    const events = logger.log.mock.calls.map(([input]) => input.event);
    expect(events).toEqual(
      expect.arrayContaining([
        "project.writeLock.stale.detected",
        "project.writeLock.stale.archived",
        "project.writeLock.reacquire.succeeded",
        "project.open.succeeded"
      ])
    );
    expect(events.indexOf("project.writeLock.stale.detected")).toBeLessThan(
      events.indexOf("project.writeLock.stale.archived")
    );
    expect(events.indexOf("project.writeLock.stale.archived")).toBeLessThan(
      events.indexOf("project.writeLock.reacquire.succeeded")
    );

    const staleEvents = logger.log.mock.calls
      .map(([input]) => input)
      .filter((input) => String(input.event).startsWith("project.writeLock."));

    expect(staleEvents).toHaveLength(3);
    expect(staleEvents[0]).toMatchObject({
      level: "debug",
      event: "project.writeLock.stale.detected",
      details: {
        result: "ignored",
        instanceRunId: "0198d95f-97d8-7000-8000-000000000302",
        ownerPid: 62368,
        ownerAppVersion: "0.60.0",
        ownerCreatedAt: staleOwner.createdAt
      }
    });

    const serializedLogs = JSON.stringify(staleEvents);
    expect(serializedLogs).not.toContain(projectRootPath);
    expect(serializedLogs).not.toContain(projectFilePath);
    expect(serializedLogs).not.toContain("Debug Project");
    expect(serializedLogs).not.toContain("known.md");
    expect(serializedLogs).not.toContain(projectLockOwnerHandleContent);
  });

  it("does not write raw project details to console when recent project recording fails", async () => {
    const logger = createLoggerMock();
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const invalidUserDataPath = path.join(projectRootPath, "known.md");

    registerProjectIpc(logger);
    electronMock.getPath.mockReturnValue(invalidUserDataPath);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    let warnings: string[] = [];
    try {
      const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
      await openProject({ sender: {} });
      warnings = consoleWarnSpy.mock.calls.map((call) => call.join(" "));
    } finally {
      consoleWarnSpy.mockRestore();
    }

    expect(warnings).toEqual(["Could not record recent project."]);
    expect(warnings.join("\n")).not.toContain(projectRootPath);
    expect(warnings.join("\n")).not.toContain(projectFilePath);
    expect(warnings.join("\n")).not.toContain("Debug Project");
    expect(warnings.join("\n")).not.toContain(invalidUserDataPath);
    expect(warnings.join("\n")).not.toContain("known.md");
  });

  it("throws a sanitized project document read failure without exposing the raw path", async () => {
    const logger = createLoggerMock();
    registerProjectIpc(logger);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProject({ sender: {} });
    logger.log.mockClear();

    const rawPath = path.join(projectRootPath, "known.md");
    const readError = Object.assign(
      new Error(`EPERM: operation not permitted, open '${rawPath}'`),
      { code: "EPERM", path: rawPath }
    );
    const readFileSpy = vi.spyOn(fs, "readFile").mockRejectedValueOnce(
      readError
    );

    try {
      const readProjectDocument = registeredHandler(
        PROJECT_CHANNELS.readProjectDocument
      );

      await expectSanitizedFileIoRejection(
        readProjectDocument(
          { sender: {} },
          { relativePath: "known.md" }
        ) as Promise<unknown>,
        "permissionDenied",
        [rawPath, projectRootPath]
      );
    } finally {
      readFileSpy.mockRestore();
    }

    const documentOpenFailureLogs = logger.log.mock.calls
      .map(([input]) => input)
      .filter((input) => input.event === "document.open.failed");

    expect(documentOpenFailureLogs).toHaveLength(1);
    expect(documentOpenFailureLogs[0]).toMatchObject({
      level: "error",
      event: "document.open.failed",
      details: {
        projectRef: "project:session:001",
        documentRef: "document:session:001",
        operation: "read",
        result: "failed",
        reason: "permissionDenied"
      }
    });
    expect(JSON.stringify(documentOpenFailureLogs[0].details)).not.toContain(
      rawPath
    );
  });

  it("throws a sanitized project document save failure without exposing the raw path", async () => {
    const logger = createLoggerMock();
    registerProjectIpc(logger);
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openProject = registeredHandler(PROJECT_CHANNELS.openProject);
    await openProject({ sender: {} });
    logger.log.mockClear();

    const rawPath = path.join(projectRootPath, "known.md");
    const manuscriptMarker = "SECRET_MANUSCRIPT_TEXT_MARKER";
    const writeError = Object.assign(
      new Error(`EPERM: operation not permitted, open '${rawPath}'`),
      { code: "EPERM", path: rawPath }
    );
    // The atomic writer rejects (temp write / fsync / rename failure); it
    // propagates the original fs error with its `.code`, so the save path
    // still surfaces a sanitized, non-cleaning file I/O failure.
    atomicWriteMock.writeFileAtomic.mockRejectedValueOnce(writeError);

    const saveProjectDocument = registeredHandler(
      PROJECT_CHANNELS.saveProjectDocument
    );

    await expectSanitizedFileIoRejection(
      saveProjectDocument(
        { sender: {} },
        {
          relativePath: "known.md",
          content: manuscriptMarker
        }
      ) as Promise<unknown>,
      "permissionDenied",
      [rawPath, projectRootPath, manuscriptMarker]
    );

    const documentSaveFailureLogs = logger.log.mock.calls
      .map(([input]) => input)
      .filter((input) => input.event === "document.save.failed");

    expect(documentSaveFailureLogs).toHaveLength(1);
    expect(documentSaveFailureLogs[0]).toMatchObject({
      level: "error",
      event: "document.save.failed",
      details: {
        projectRef: "project:session:001",
        documentRef: "document:session:001",
        editorIdKind: "projectDocument",
        saveTargetKind: "projectDocument",
        operation: "write",
        result: "failed",
        reason: "permissionDenied"
      }
    });
    expect(JSON.stringify(documentSaveFailureLogs[0].details)).not.toContain(
      rawPath
    );
    expect(JSON.stringify(documentSaveFailureLogs[0].details)).not.toContain(
      manuscriptMarker
    );
  });
});

function createLoggerMock(): DebugLogger & {
  log: ReturnType<typeof vi.fn<DebugLogger["log"]>>;
} {
  return {
    enabled: true,
    sessionId: "session",
    currentFilePath: null,
    log: vi.fn<DebugLogger["log"]>(),
    getSnapshot: vi.fn(() => ({
      enabled: true,
      sessionId: "session",
      events: [],
      uiDroppedEventCount: 0,
      uiBufferLimit: 1000
    })),
    subscribe: vi.fn(() => () => undefined),
    logRendererRequest: vi.fn(),
    openFileSink: vi.fn(),
    flushAndClose: vi.fn(),
    projectRefForKey: vi.fn(() => "project:session:001"),
    documentRefForKey: vi.fn(() => "document:session:001"),
    isKnownProjectRef: vi.fn(() => true),
    isKnownDocumentRef: vi.fn(() => true)
  };
}

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  const registration = electronMock.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  );

  if (!registration) {
    throw new Error(`Handler was not registered for ${channel}.`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}

async function expectSanitizedFileIoRejection(
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
