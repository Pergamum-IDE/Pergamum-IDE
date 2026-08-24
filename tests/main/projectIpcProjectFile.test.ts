import { promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultProjectAccessMode,
  PROJECT_CHANNELS,
  type PendingReadOnlyProjectOpen
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
  getPath: vi.fn()
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
    getPath: electronMock.getPath
  }
}));

import {
  currentActiveProjectFilePath,
  currentProjectAccessMode,
  currentProjectRootPath,
  defaultProjectWriteOwnershipManager,
  projectAccessModeFromWriteOwnership,
  projectWriteLockDirectoryPath,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectWindowTitle,
  type ProjectWriteOwnership,
  type ProjectWriteOwnershipManager,
  type ProjectWindowTitleTargetProvider,
  registerProjectIpc
} from "../../src/main/projectIpc";

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
      projectFilePath
    );

    expect(ownership).toEqual({ kind: "owned" });
    const lockDirectoryStats = await fs.stat(lockDirectoryPath);
    expect(lockDirectoryStats.isDirectory()).toBe(true);

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
      reason: "lockUnavailable"
    });

    await defaultProjectWriteOwnershipManager.release(
      projectFilePath,
      ownership
    );
    await expect(fs.access(lockDirectoryPath)).resolves.toBeUndefined();
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
        PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
        PROJECT_CHANNELS.cancelReadOnlyProjectOpen
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
      path.resolve(projectFilePath)
    );
    const pending = expectPendingReadOnlyProjectOpen(result);
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
      path.resolve(projectFilePath)
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
      path.resolve(projectFilePath)
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
      path.resolve(projectFilePath)
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
    project: {
      accessMode: {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      }
    }
  });

  return value as PendingReadOnlyProjectOpen;
}

function registeredHandler(
  channel: string,
  logger: DebugLogger = createLoggerMock(),
  writeOwnershipManager?: ProjectWriteOwnershipManager,
  windowTitleTargetProvider?: ProjectWindowTitleTargetProvider
): (...args: unknown[]) => unknown {
  registerProjectIpc(
    logger,
    writeOwnershipManager,
    windowTitleTargetProvider
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
