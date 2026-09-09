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
  registerProjectIpc,
  releaseCurrentProjectWriteOwnership,
  setProjectWindowTitleTargetProvider
} from "../../src/main/projectIpc";

function createLoggerMock(): DebugLogger {
  return {
    enabled: false,
    sessionId: "text-import-ipc-test-session",
    currentFilePath: null,
    getSnapshot: () => ({
      enabled: false,
      sessionId: "text-import-ipc-test-session",
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

describe("text import project IPC (#420 Step 1)", () => {
  let projectRootPath: string;
  let externalRootPath: string;
  let userDataPath: string;

  beforeEach(async () => {
    projectRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-text-import-ipc-project-")
    );
    externalRootPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-text-import-ipc-source-")
    );
    userDataPath = await fs.mkdtemp(
      path.join(os.tmpdir(), "pergamum-text-import-ipc-user-")
    );
    electronMock.handle.mockReset();
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
    electronMock.showMessageBox.mockReset();
    electronMock.getPath.mockReturnValue(userDataPath);
    electronMock.getVersion.mockReturnValue("9.8.7-test");
    registerProjectIpc(createLoggerMock());
  });

  afterEach(async () => {
    await closeCurrentProject();
    await releaseCurrentProjectWriteOwnership();
    setProjectWindowTitleTargetProvider(null);
    await fs.rm(projectRootPath, { recursive: true, force: true });
    await fs.rm(externalRootPath, { recursive: true, force: true });
    await fs.rm(userDataPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function openProject(name: string): Promise<string> {
    const projectFilePath = path.join(projectRootPath, `${name}.pergamum`);
    const created = await createProjectDatabase({
      projectFilePath,
      projectName: name
    });
    await created.close();
    await fs.mkdir(path.join(projectRootPath, "chapters"));
    electronMock.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [projectFilePath]
    });

    await registeredHandler(PROJECT_CHANNELS.openProject)({ sender: {} });
    const openedProjectId = currentProjectId();

    if (!openedProjectId) {
      throw new Error("Project was not opened.");
    }

    return openedProjectId;
  }

  it("registers dry-run, preview, and execute IPC channels", () => {
    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expect.arrayContaining([
        PROJECT_CHANNELS.dryRunTextImport,
        PROJECT_CHANNELS.previewTextImportFile,
        PROJECT_CHANNELS.previewTextImportFiles,
        PROJECT_CHANNELS.executeTextImport
      ])
    );
  });

  it("registers the getCurrentProjectId IPC channel (#420 Step 3)", () => {
    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expect.arrayContaining([PROJECT_CHANNELS.getCurrentProjectId])
    );
  });

  it("registers the pickTextImportSources IPC channel (#420 Step 6)", () => {
    expect(electronMock.handle.mock.calls.map(([channel]) => channel)).toEqual(
      expect.arrayContaining([PROJECT_CHANNELS.pickTextImportSources])
    );
  });

  it("pickTextImportSources IPC returns the chosen paths, or [] on cancel (#420 Step 6)", async () => {
    electronMock.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["C:\\Import\\a.txt", "C:\\Import\\b.txt"]
    });
    await expect(
      registeredHandler(PROJECT_CHANNELS.pickTextImportSources)(
        { sender: {} },
        { kind: "files" }
      )
    ).resolves.toEqual({ paths: ["C:\\Import\\a.txt", "C:\\Import\\b.txt"] });

    const filesOptions = electronMock.showOpenDialog.mock.calls.at(-1)?.[0];
    expect(filesOptions.properties).toEqual(["openFile", "multiSelections"]);

    electronMock.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ["C:\\Import\\chapters"]
    });
    await expect(
      registeredHandler(PROJECT_CHANNELS.pickTextImportSources)(
        { sender: {} },
        { kind: "folders" }
      )
    ).resolves.toEqual({ paths: ["C:\\Import\\chapters"] });
    const folderOptions = electronMock.showOpenDialog.mock.calls.at(-1)?.[0];
    expect(folderOptions.properties).toEqual([
      "openDirectory",
      "multiSelections"
    ]);

    electronMock.showOpenDialog.mockResolvedValueOnce({
      canceled: true,
      filePaths: []
    });
    await expect(
      registeredHandler(PROJECT_CHANNELS.pickTextImportSources)(
        { sender: {} },
        { kind: "files" }
      )
    ).resolves.toEqual({ paths: [] });
  });

  it("getCurrentProjectId IPC returns null with no project open and the id once opened (#420 Step 3)", async () => {
    await expect(
      registeredHandler(PROJECT_CHANNELS.getCurrentProjectId)({ sender: {} })
    ).resolves.toBeNull();

    const openedProjectId = await openProject("CurrentId");

    await expect(
      registeredHandler(PROJECT_CHANNELS.getCurrentProjectId)({ sender: {} })
    ).resolves.toBe(openedProjectId);

    await closeCurrentProject();

    await expect(
      registeredHandler(PROJECT_CHANNELS.getCurrentProjectId)({ sender: {} })
    ).resolves.toBeNull();
  });

  it("dryRunTextImport IPC returns a plan without writing project files", async () => {
    const openedProjectId = await openProject("DryRun");
    const sourcePath = path.join(externalRootPath, "foo.txt");
    await fs.writeFile(sourcePath, "本文", "utf8");

    await expect(
      registeredHandler(PROJECT_CHANNELS.dryRunTextImport)(
        { sender: {} },
        {
          projectId: openedProjectId,
          destinationFolderProjectRelativePath: "chapters",
          sourcePaths: [sourcePath]
        }
      )
    ).resolves.toMatchObject({
      ok: true,
      files: [
        {
          sourcePath,
          targetProjectRelativePath: "chapters/foo.md",
          skipped: false
        }
      ]
    });
    await expect(
      fs.access(path.join(projectRootPath, "chapters", "foo.md"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("previewTextImportFile IPC reads an external file with the requested encoding", async () => {
    const sourcePath = path.join(externalRootPath, "sjis.txt");
    await fs.writeFile(
      sourcePath,
      Uint8Array.from([
        0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x87, 0x40
      ])
    );

    await expect(
      registeredHandler(PROJECT_CHANNELS.previewTextImportFile)(
        { sender: {} },
        { sourcePath, encoding: "shiftJis" }
      )
    ).resolves.toMatchObject({
      ok: true,
      previewHead: "日本語①",
      previewTail: "日本語①",
      bomKind: "none"
    });
  });

  it("previewTextImportFiles IPC keeps per-file failures inside an ok batch", async () => {
    const utf8Path = path.join(externalRootPath, "utf8.txt");
    const invalidPath = path.join(externalRootPath, "invalid.txt");
    const missingPath = path.join(externalRootPath, "missing.txt");
    await fs.writeFile(utf8Path, "本文", "utf8");
    await fs.writeFile(invalidPath, Uint8Array.from([0xff]));

    await expect(
      registeredHandler(PROJECT_CHANNELS.previewTextImportFiles)(
        { sender: {} },
        {
          files: [
            { id: "ok", sourcePath: utf8Path, encoding: "utf8" },
            { id: "bad", sourcePath: invalidPath, encoding: "utf8" },
            { id: "missing", sourcePath: missingPath, encoding: "utf8" }
          ]
        }
      )
    ).resolves.toMatchObject({
      ok: true,
      files: [
        {
          ok: true,
          id: "ok",
          sourcePath: utf8Path,
          encoding: "utf8",
          previewHead: "本文",
          previewTail: "本文"
        },
        {
          ok: false,
          id: "bad",
          sourcePath: invalidPath,
          encoding: "utf8",
          reason: "decodeFailed"
        },
        {
          ok: false,
          id: "missing",
          sourcePath: missingPath,
          encoding: "utf8",
          reason: "sourceMissing"
        }
      ]
    });
  });

  it("previewTextImportFiles IPC uses top-level failure only for invalid requests", async () => {
    await expect(
      registeredHandler(PROJECT_CHANNELS.previewTextImportFiles)(
        { sender: {} },
        { files: [{ id: "bad", sourcePath: "C:\\tmp\\bad.txt", encoding: "auto" }] }
      )
    ).resolves.toEqual({ ok: false, reason: "invalidRequest" });
  });

  it("executeTextImport IPC writes and registers imported Markdown documents", async () => {
    const openedProjectId = await openProject("Execute");
    const sourcePath = path.join(externalRootPath, "foo.txt");
    await fs.writeFile(sourcePath, "本文", "utf8");

    await expect(
      registeredHandler(PROJECT_CHANNELS.executeTextImport)(
        { sender: {} },
        {
          projectId: openedProjectId,
          destinationFolderProjectRelativePath: "chapters",
          files: [
            {
              sourcePath,
              targetProjectRelativePath: "chapters/foo.md",
              encoding: "utf8"
            }
          ],
          normalizeLineEndings: true,
          targetLineEnding: "lf"
        }
      )
    ).resolves.toMatchObject({
      ok: true,
      imported: [
        {
          sourcePath,
          targetProjectRelativePath: "chapters/foo.md"
        }
      ],
      skipped: [],
      failed: []
    });

    await expect(
      registeredHandler(PROJECT_CHANNELS.readProjectDocument)(
        { sender: {} },
        { relativePath: "chapters/foo.md" }
      )
    ).resolves.toMatchObject({
      relativePath: "chapters/foo.md",
      content: "本文"
    });
  });
});
