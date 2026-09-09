import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROJECT_CHANNELS, type UpdateProjectNameResult } from "../../src/shared/api";
import type { DebugLogger } from "../../src/main/debugLogger";
import { projectConfigFileName } from "../../src/main/projectConfigStore";
import {
  createProjectDatabase,
  openProjectDatabase,
  readProjectMetadata,
  updateProjectMetadataName
} from "../../src/main/projectDatabase";

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
  closeCurrentProject,
  currentProjectId,
  currentProjectName,
  projectWriteLockDirectoryPath,
  registerProjectIpc,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider,
  updateCurrentProjectName,
  type ProjectMetadataNameUpdater,
  type ProjectWindowTitleTargetProvider,
  type ProjectWindowTitleUpdater
} from "../../src/main/projectIpc";

function createLoggerMock(): DebugLogger {
  return {
    enabled: false,
    sessionId: "rename-ipc-test-session",
    currentFilePath: null,
    getSnapshot: () => ({
      enabled: false,
      sessionId: "rename-ipc-test-session",
      events: [],
      uiDroppedEventCount: 0,
      uiBufferLimit: 0
    }),
    subscribe: () => () => undefined,
    log: vi.fn(),
    logRendererRequest: vi.fn(),
    openFileSink: vi.fn(),
    flushAndClose: vi.fn(),
    projectRefForKey: (key) => `project:${key}`,
    documentRefForKey: (key) => `document:${key}`,
    isKnownProjectRef: () => true,
    isKnownDocumentRef: () => true
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

function settingsJsonPath(userDataPath: string): string {
  return path.join(userDataPath, "settings.json");
}

async function readRecentProjects(
  userDataPath: string
): Promise<Array<Record<string, unknown>>> {
  const settings = JSON.parse(
    await fs.readFile(settingsJsonPath(userDataPath), "utf8")
  ) as {
    recentProjects: Array<Record<string, unknown>>;
  };

  return settings.recentProjects;
}

describe("project IPC updateProjectName (#422)", () => {
  let projectRootPath: string;
  let userDataPath: string;
  let windowTitleProviderCalls = 0;
  const mockSetTitle = vi.fn();

  const windowTitleTargetProvider: ProjectWindowTitleTargetProvider = () => {
    windowTitleProviderCalls += 1;
    return {
      setTitle: mockSetTitle,
      setRepresentedFilename: vi.fn(),
      setDocumentEdited: vi.fn()
    } as any;
  };

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-rename-ipc-project-")
    );
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-rename-ipc-user-")
    );
    windowTitleProviderCalls = 0;
    mockSetTitle.mockReset();
    electronMock.handle.mockReset();
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
    electronMock.showMessageBox.mockReset();
    electronMock.getPath.mockReturnValue(userDataPath);
    electronMock.getVersion.mockReturnValue("1.0.0-test");
    registerProjectIpc(createLoggerMock(), undefined, windowTitleTargetProvider);
  });

  afterEach(async () => {
    await closeCurrentProject();
    await releaseCurrentProjectWriteOwnership();
    setProjectWindowTitleTargetProvider(null);
    await fs.rm(projectRootPath, { recursive: true, force: true });
    await fs.rm(userDataPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function openTestProject(name: string): Promise<{
    projectFilePath: string;
    projectId: string;
  }> {
    const projectFilePath = path.join(projectRootPath, `${name}.pergamum`);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: name
    });
    await created.close();
    await fs.writeFile(
      path.join(projectRootPath, projectConfigFileName),
      JSON.stringify({ legacyName: "ignored" }),
      "utf8"
    );

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    await registeredHandler(PROJECT_CHANNELS.openProject)({ sender: {} });
    const openedProjectId = currentProjectId();
    if (!openedProjectId) {
      throw new Error("Project was not opened.");
    }

    return { projectFilePath, projectId: openedProjectId };
  }

  it("succeeds for read-write project, updates metadata, state, recentProjects, and window title", async () => {
    const { projectFilePath, projectId } = await openTestProject("Initial Project");
    const initialTitleCalls = windowTitleProviderCalls;

    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { projectId, name: "  Renamed Project Name  " }
    )) as UpdateProjectNameResult;

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");

    expect(result.project.name).toBe("Renamed Project Name");
    expect(result.project.activeProjectFilePath).toBe(path.resolve(projectFilePath));
    expect(result.project.rootPath).toBe(projectRootPath);

    // Database metadata is updated
    const db = await openProjectDatabase(projectFilePath);
    const metadata = await readProjectMetadata(db);
    await db.close();
    expect(metadata.projectName).toBe("Renamed Project Name");

    // Recent projects updated
    const recents = await readRecentProjects(userDataPath);
    expect(recents[0]).toMatchObject({
      projectName: "Renamed Project Name",
      projectFilePath: path.resolve(projectFilePath)
    });

    // Window title update requested
    expect(windowTitleProviderCalls).toBeGreaterThan(initialTitleCalls);

    // Physical paths unchanged
    await expect(fs.access(projectFilePath)).resolves.toBeUndefined();

    // pergamum.json does NOT contain a "name" property
    const configContent = JSON.parse(
      await fs.readFile(path.join(projectRootPath, projectConfigFileName), "utf8")
    );
    expect(configContent.name).toBeUndefined();
  });

  it("rejects when no project is open", async () => {
    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { name: "New Name" }
    )) as UpdateProjectNameResult;

    expect(result).toEqual({ ok: false, reason: "noProject" });
  });

  it("rejects when projectId does not match current open project", async () => {
    await openTestProject("Active Project");

    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { projectId: "00000000-0000-7000-8000-000000000000", name: "New Name" }
    )) as UpdateProjectNameResult;

    expect(result).toEqual({ ok: false, reason: "projectMismatch" });
  });

  it("rejects when current project is read-only", async () => {
    const projectFilePath = path.join(projectRootPath, "ReadOnly.pergamum");
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: "ReadOnly"
    });
    await created.close();
    await fs.mkdir(lockDirectoryPath);

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const openResult = await registeredHandler(PROJECT_CHANNELS.openProject)({
      sender: {}
    });
    const confirmHandler = registeredHandler(
      PROJECT_CHANNELS.confirmReadOnlyProjectOpen
    );
    await confirmHandler({ sender: {} }, { token: (openResult as any).token });

    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { name: "Attempted Rename" }
    )) as UpdateProjectNameResult;

    expect(result).toEqual({ ok: false, reason: "readOnlyProject" });
  });

  it("rejects invalid project names (empty, whitespace, control chars)", async () => {
    const { projectId } = await openTestProject("Valid Project");

    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);

    const emptyResult = (await handler(
      { sender: {} },
      { projectId, name: "   " }
    )) as UpdateProjectNameResult;
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.reason).toBe("invalidName");

    const ctrlResult = (await handler(
      { sender: {} },
      { projectId, name: "Name\nWithNewline" }
    )) as UpdateProjectNameResult;
    expect(ctrlResult.ok).toBe(false);
    if (!ctrlResult.ok) expect(ctrlResult.reason).toBe("invalidName");
  });

  it("allows filename-invalid characters in logical rename", async () => {
    const { projectId, projectFilePath } = await openTestProject("Filename Allowed");

    const complexName = "第一部：迷子たちと千年領主 / Chapter: 1 <Final> ?!";
    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { projectId, name: complexName }
    )) as UpdateProjectNameResult;

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.project.name).toBe(complexName);

    const db = await openProjectDatabase(projectFilePath);
    const metadata = await readProjectMetadata(db);
    await db.close();
    expect(metadata.projectName).toBe(complexName);
  });

  it("reopening uses DB metadata.project_name even if pergamum.json has a conflicting legacy name", async () => {
    const { projectId, projectFilePath } = await openTestProject("Before Reopen");

    // Perform logical rename
    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const updateResult = (await handler(
      { sender: {} },
      { projectId, name: "Renamed In DB" }
    )) as UpdateProjectNameResult;
    expect(updateResult.ok).toBe(true);

    // Write a contradictory legacy name into pergamum.json
    await fs.writeFile(
      path.join(projectRootPath, projectConfigFileName),
      JSON.stringify({ name: "Legacy Conflicting Name" }),
      "utf8"
    );

    // Close and reopen the project
    await closeCurrentProject();
    await releaseCurrentProjectWriteOwnership();

    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    const reopenResult = (await registeredHandler(PROJECT_CHANNELS.openProject)({
      sender: {}
    })) as any;

    // Must use DB metadata.project_name, ignoring pergamum.json.name
    expect(reopenResult.name).toBe("Renamed In DB");
    expect(reopenResult.activeProjectFilePath).toBe(path.resolve(projectFilePath));
    expect(reopenResult.rootPath).toBe(projectRootPath);
  });

  it("rejects and does not corrupt state if project was closed during in-flight rename (P0)", async () => {
    const { projectId } = await openTestProject("Project Before Close");

    let callsAfterClose = 0;
    const closeDuringUpdate: ProjectMetadataNameUpdater = async (
      targetPath,
      newName,
      logger
    ) => {
      const db = await openProjectDatabase(targetPath, logger);
      const metadata = await updateProjectMetadataName(db, newName, logger);
      await db.close();

      // Project is closed while rename is in flight
      await closeCurrentProject();
      await releaseCurrentProjectWriteOwnership();
      callsAfterClose = windowTitleProviderCalls;

      return metadata;
    };

    const result = await updateCurrentProjectName(
      { projectId, name: "Renamed While Closing" },
      createLoggerMock(),
      closeDuringUpdate
    );

    expect(result).toEqual({
      ok: false,
      reason: "projectMismatch",
      message:
        "The active project changed while the project name was being updated."
    });

    // State is null (closed), not corrupted or revived
    expect(currentProjectId()).toBeNull();
    expect(currentProjectName()).toBeNull();

    // Window title was NOT updated for the closed project rename
    expect(windowTitleProviderCalls).toBe(callsAfterClose);
    expect(mockSetTitle).not.toHaveBeenCalledWith(
      expect.stringContaining("Renamed While Closing")
    );
  });

  it("rejects and does not corrupt new project state if project switched during in-flight rename (P0)", async () => {
    const project1 = await openTestProject("Project One");

    let project2Id = "";
    let callsAfterSwitch = 0;
    const switchDuringUpdate: ProjectMetadataNameUpdater = async (
      targetPath,
      newName,
      logger
    ) => {
      const db = await openProjectDatabase(targetPath, logger);
      const metadata = await updateProjectMetadataName(db, newName, logger);
      await db.close();

      // Project switch occurs while update was in flight!
      await closeCurrentProject();
      await releaseCurrentProjectWriteOwnership();
      const p2 = await openTestProject("Project Two");
      project2Id = p2.projectId;
      callsAfterSwitch = windowTitleProviderCalls;

      return metadata;
    };

    const result = await updateCurrentProjectName(
      { projectId: project1.projectId, name: "Renamed Project One" },
      createLoggerMock(),
      switchDuringUpdate
    );

    expect(result).toEqual({
      ok: false,
      reason: "projectMismatch",
      message:
        "The active project changed while the project name was being updated."
    });

    // Active project is still Project Two with its own untouched name
    expect(currentProjectId()).toBe(project2Id);
    expect(currentProjectName()).toBe("Project Two");

    // Recents should have Project Two as top, Project One's name should not have overwritten Project Two
    const recents = await readRecentProjects(userDataPath);
    expect(recents[0]?.projectName).toBe("Project Two");

    // Window title was NOT updated with Project One's stale rename
    expect(windowTitleProviderCalls).toBe(callsAfterSwitch);
    expect(mockSetTitle).not.toHaveBeenCalledWith(
      expect.stringContaining("Renamed Project One")
    );
  });

  it("does not throw and returns clean snapshot without accessing null state if project closed during title update await (P0)", async () => {
    const project1 = await openTestProject("Project Before Title Close");

    const closeDuringTitleUpdate: ProjectWindowTitleUpdater = async () => {
      // While title update is in flight, project is closed!
      await closeCurrentProject();
      await releaseCurrentProjectWriteOwnership();
    };

    const result = await updateCurrentProjectName(
      { projectId: project1.projectId, name: "Renamed Title Close" },
      createLoggerMock(),
      undefined,
      closeDuringTitleUpdate
    );

    // In snapshot approach, the rename succeeded and response is cleanly based on snapshot
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");

    expect(result.project.name).toBe("Renamed Title Close");
    expect(result.project.activeProjectFilePath).toBe(path.resolve(project1.projectFilePath));
    expect(result.project.rootPath).toBe(projectRootPath);

    // Current project state remains null, not revived or corrupted
    expect(currentProjectId()).toBeNull();
    expect(currentProjectName()).toBeNull();

    // Recent projects contains clean entry for Project 1, not mixed with null
    const recents = await readRecentProjects(userDataPath);
    expect(recents[0]).toMatchObject({
      projectName: "Renamed Title Close",
      projectFilePath: path.resolve(project1.projectFilePath),
      projectRootPath
    });
  });

  it("does not corrupt new project state and does not create mixed payloads if project switched during title update await (P0)", async () => {
    const project1 = await openTestProject("Project Before Title Switch");

    let project2Id = "";
    let project2FilePath = "";
    const switchDuringTitleUpdate: ProjectWindowTitleUpdater = async () => {
      // While title update is in flight, user switches to Project Two!
      await closeCurrentProject();
      await releaseCurrentProjectWriteOwnership();
      const p2 = await openTestProject("Project Two");
      project2Id = p2.projectId;
      project2FilePath = p2.projectFilePath;
    };

    const result = await updateCurrentProjectName(
      { projectId: project1.projectId, name: "Renamed Title Switch" },
      createLoggerMock(),
      undefined,
      switchDuringTitleUpdate
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");

    // Response payload is strictly from Project 1's snapshot (not mixed with Project 2)
    expect(result.project.name).toBe("Renamed Title Switch");
    expect(result.project.activeProjectFilePath).toBe(path.resolve(project1.projectFilePath));
    expect(result.project.rootPath).toBe(projectRootPath);

    // New project state is untouched and not contaminated
    expect(currentProjectId()).toBe(project2Id);
    expect(currentProjectName()).toBe("Project Two");

    // Recent projects contains clean entries:
    // Project 1's entry has Project 1's path and root (never Project 2's path/root)
    const recents = await readRecentProjects(userDataPath);
    const p1Recent = recents.find((r) => r.projectId === project1.projectId);
    expect(p1Recent).toMatchObject({
      projectName: "Renamed Title Switch",
      projectFilePath: path.resolve(project1.projectFilePath),
      projectRootPath
    });

    // Project 2's entry has Project 2's path and root (never Project 1's name)
    const p2Recent = recents.find((r) => r.projectId === project2Id);
    expect(p2Recent).toMatchObject({
      projectName: "Project Two",
      projectFilePath: path.resolve(project2FilePath),
      projectRootPath
    });
  });

  it("builds returned project synchronously from activeState without rediscovering documents on disk (P0)", async () => {
    const { projectId, projectFilePath } = await openTestProject("Project For Sync Snapshot");

    // Write a new document on disk directly, bypassing IPC registration
    await fs.writeFile(
      path.join(projectRootPath, "untracked-on-disk.md"),
      "# Untracked\n"
    );

    const handler = registeredHandler(PROJECT_CHANNELS.updateProjectName);
    const result = (await handler(
      { sender: {} },
      { projectId, name: "Renamed Without Discovery" }
    )) as UpdateProjectNameResult;

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected ok");

    // Returned project name is updated
    expect(result.project.name).toBe("Renamed Without Discovery");
    expect(result.project.activeProjectFilePath).toBe(path.resolve(projectFilePath));
    expect(result.project.rootPath).toBe(projectRootPath);
    expect(result.project.accessMode).toEqual({ kind: "readWrite" });

    // Documents list must NOT contain the untracked file (proves no discoverMarkdownFiles was performed)
    const docRelativePaths = result.project.documents.map((d) => d.relativePath);
    expect(docRelativePaths).not.toContain("untracked-on-disk.md");
  });
});

