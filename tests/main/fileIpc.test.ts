import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILE_CHANNELS } from "../../src/shared/api";
import type { DebugLogger } from "../../src/main/debugLogger";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn(() => undefined),
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn()
}));

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  realpath: vi.fn(),
  writeFile: vi.fn()
}));

const projectIpcMock = vi.hoisted(() => ({
  currentActiveProjectFilePath: vi.fn<() => string | null>(),
  currentProjectRootPath: vi.fn<() => string | null>(),
  projectWriteLockDirectoryPath: vi.fn((projectFilePath: string) =>
    projectFilePath.replace(/[^\\/]+$/, ".pergamum.lock")
  )
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents
  },
  dialog: {
    showOpenDialog: electronMock.showOpenDialog,
    showSaveDialog: electronMock.showSaveDialog
  },
  ipcMain: {
    handle: electronMock.handle
  }
}));

vi.mock("node:fs", () => ({
  promises: fsMock
}));

vi.mock("../../src/main/projectIpc", () => ({
  currentActiveProjectFilePath: projectIpcMock.currentActiveProjectFilePath,
  currentProjectRootPath: projectIpcMock.currentProjectRootPath,
  projectWriteLockDirectoryPath: projectIpcMock.projectWriteLockDirectoryPath
}));

import { registerFileIpc } from "../../src/main/fileIpc";

function buildLoggerMock(): Pick<DebugLogger, "log" | "documentRefForKey"> & {
  log: ReturnType<typeof vi.fn>;
} {
  return {
    log: vi.fn(),
    documentRefForKey: vi.fn(() => "document:session:001")
  };
}

function registeredHandler(
  channel: string,
  logger?: DebugLogger
): (...args: unknown[]) => unknown {
  registerFileIpc(logger);

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

describe("file IPC", () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.showOpenDialog.mockReset();
    electronMock.showSaveDialog.mockReset();
    fsMock.readFile.mockReset();
    fsMock.realpath.mockReset();
    fsMock.writeFile.mockReset();
    projectIpcMock.currentActiveProjectFilePath.mockReset();
    projectIpcMock.currentProjectRootPath.mockReset();
    projectIpcMock.currentActiveProjectFilePath.mockReturnValue(null);
    projectIpcMock.currentProjectRootPath.mockReturnValue(null);
    projectIpcMock.projectWriteLockDirectoryPath.mockClear();
    fsMock.realpath.mockImplementation(async (filePath: string) => filePath);
  });

  it("allows Save As selection inside the active project for renderer policy validation", async () => {
    projectIpcMock.currentProjectRootPath.mockReturnValue("C:\\Novel");
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "C:\\Novel\\new-document.md"
    });

    const selectMarkdownSavePath = registeredHandler(
      FILE_CHANNELS.selectMarkdownSavePath
    );

    await expect(
      selectMarkdownSavePath(
        {
          sender: {}
        },
        {
          defaultPath: null
        }
      )
    ).resolves.toEqual({ path: "C:\\Novel\\new-document.md" });

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects protected project database Save As targets before disk write", async () => {
    const rawPath = "C:\\Novel\\Novel.PERGAMUM";

    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: rawPath
    });

    const saveMarkdown = registeredHandler(FILE_CHANNELS.saveMarkdown);

    await expect(
      saveMarkdown(
        {
          sender: {}
        },
        {
          path: null,
          content: "content"
        }
      )
    ).resolves.toEqual({ kind: "rejected", reason: "protected" });

    expect(fsMock.writeFile).not.toHaveBeenCalled();
    expect(JSON.stringify(fsMock.writeFile.mock.calls)).not.toContain(rawPath);
  });

  it("rejects protected SQLite sidecar suffixes case-insensitively before disk write", async () => {
    const writeMarkdown = registeredHandler(FILE_CHANNELS.writeMarkdown);

    await expect(
      writeMarkdown(
        { sender: {} },
        {
          path: "C:\\Novel\\Draft.PERGAMUM-WAL",
          content: "content"
        }
      )
    ).resolves.toEqual({ kind: "rejected", reason: "protected" });

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects the current project lock directory and paths under it before disk write", async () => {
    projectIpcMock.currentActiveProjectFilePath.mockReturnValue(
      "C:\\Novel\\Novel.pergamum"
    );

    const writeMarkdown = registeredHandler(FILE_CHANNELS.writeMarkdown);

    await expect(
      writeMarkdown(
        { sender: {} },
        {
          path: "C:\\Novel\\.pergamum.lock",
          content: "content"
        }
      )
    ).resolves.toEqual({ kind: "rejected", reason: "protected" });
    await expect(
      writeMarkdown(
        { sender: {} },
        {
          path: "C:\\Novel\\.pergamum.lock\\state.md",
          content: "content"
        }
      )
    ).resolves.toEqual({ kind: "rejected", reason: "protected" });

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects unverifiable protected-target classification before disk write", async () => {
    projectIpcMock.currentActiveProjectFilePath.mockReturnValue(
      "C:\\Novel\\Novel.pergamum"
    );
    fsMock.realpath.mockRejectedValue(
      Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
    );

    const writeMarkdown = registeredHandler(FILE_CHANNELS.writeMarkdown);

    await expect(
      writeMarkdown(
        { sender: {} },
        {
          path: "D:\\Outside\\chapter.md",
          content: "content"
        }
      )
    ).resolves.toEqual({ kind: "rejected", reason: "unverifiable" });

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("allows standalone Save As outside the active project", async () => {
    projectIpcMock.currentProjectRootPath.mockReturnValue("C:\\Novel");
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "D:\\Outside\\new-document.md"
    });
    fsMock.writeFile.mockResolvedValue(undefined);

    const saveMarkdown = registeredHandler(FILE_CHANNELS.saveMarkdown);

    await expect(
      saveMarkdown(
        {
          sender: {}
        },
        {
          path: null,
          content: "content"
        }
      )
    ).resolves.toEqual({
      kind: "saved",
      path: "D:\\Outside\\new-document.md"
    });

    expect(fsMock.writeFile).toHaveBeenCalledWith(
      "D:\\Outside\\new-document.md",
      "content",
      "utf8"
    );
  });

  it("throws a sanitized legacy saveMarkdown write failure without exposing the raw path", async () => {
    const logger = buildLoggerMock();
    const rawPath = "D:\\Outside\\secret-save.md";
    const manuscriptMarker = "SECRET_MANUSCRIPT_TEXT_MARKER";
    const writeError = Object.assign(
      new Error(`EPERM: operation not permitted, open '${rawPath}'`),
      { code: "EPERM", path: rawPath }
    );

    projectIpcMock.currentProjectRootPath.mockReturnValue(null);
    fsMock.writeFile.mockRejectedValue(writeError);

    const saveMarkdown = registeredHandler(
      FILE_CHANNELS.saveMarkdown,
      logger as unknown as DebugLogger
    );

    await expectSanitizedFileIoRejection(
      saveMarkdown(
        {
          sender: {}
        },
        {
          path: rawPath,
          content: manuscriptMarker
        }
      ) as Promise<unknown>,
      "permissionDenied",
      [rawPath, manuscriptMarker]
    );

    const call = logger.log.mock.calls.find(
      ([entry]) => entry.event === "document.save.failed"
    );

    expect(call?.[0].details).toMatchObject({
      documentRef: "document:session:001",
      editorIdKind: "file",
      saveTargetKind: "standaloneMarkdown",
      operation: "write",
      result: "failed",
      reason: "permissionDenied"
    });
  });

  it("writes standalone Markdown with UTF-8 metadata and safe debug logging", async () => {
    const logger = buildLoggerMock();
    const rawPath = "D:\\Outside\\secret-draft";
    const manuscriptMarker = "alpha\r\nSECRET_MANUSCRIPT_TEXT_MARKER";
    const writeMarkdown = registeredHandler(
      FILE_CHANNELS.writeMarkdown,
      logger as unknown as DebugLogger
    );

    fsMock.writeFile.mockResolvedValue(undefined);

    await expect(
      writeMarkdown(
        { sender: {} },
        {
          path: rawPath,
          content: manuscriptMarker
        }
      )
    ).resolves.toEqual({
      kind: "saved",
      path: "D:\\Outside\\secret-draft.md",
      encoding: "utf8",
      lineEnding: "crlf",
      byteLength: Buffer.byteLength(manuscriptMarker, "utf8"),
      characterLength: manuscriptMarker.length
    });

    expect(fsMock.writeFile).toHaveBeenCalledWith(
      "D:\\Outside\\secret-draft.md",
      manuscriptMarker,
      "utf8"
    );

    const call = logger.log.mock.calls.find(
      ([entry]) => entry.event === "save.succeeded"
    );

    expect(call?.[0].details).toMatchObject({
      documentRef: "document:session:001",
      editorIdKind: "file",
      saveTargetKind: "standaloneMarkdown",
      lineEndingKind: "crlf",
      byteLength: Buffer.byteLength(manuscriptMarker, "utf8"),
      characterLength: manuscriptMarker.length,
      encodingAssumption: "utf8",
      operation: "write",
      result: "succeeded"
    });
    for (const [entry] of logger.log.mock.calls) {
      expect(JSON.stringify(entry)).not.toContain(rawPath);
      expect(JSON.stringify(entry)).not.toContain(manuscriptMarker);
    }
  });

  it("logs standalone Markdown write failure as a non-cleaning file I/O failure", async () => {
    const logger = buildLoggerMock();
    const rawPath = "D:\\Outside\\secret-draft.md";
    const manuscriptMarker = "SECRET_MANUSCRIPT_TEXT_MARKER";
    const writeError = Object.assign(
      new Error(`EACCES: permission denied, open '${rawPath}'`),
      { code: "EACCES", path: rawPath }
    );
    const writeMarkdown = registeredHandler(
      FILE_CHANNELS.writeMarkdown,
      logger as unknown as DebugLogger
    );

    fsMock.writeFile.mockRejectedValue(writeError);

    await expectSanitizedFileIoRejection(
      writeMarkdown(
        { sender: {} },
        {
          path: rawPath,
          content: manuscriptMarker
        }
      ) as Promise<unknown>,
      "permissionDenied",
      [rawPath, manuscriptMarker]
    );

    const call = logger.log.mock.calls.find(
      ([entry]) => entry.event === "document.save.failed"
    );

    expect(call?.[0].details).toMatchObject({
      documentRef: "document:session:001",
      editorIdKind: "file",
      saveTargetKind: "standaloneMarkdown",
      operation: "write",
      result: "failed",
      reason: "permissionDenied"
    });
    for (const [entry] of logger.log.mock.calls) {
      expect(JSON.stringify(entry)).not.toContain(rawPath);
      expect(JSON.stringify(entry)).not.toContain(manuscriptMarker);
    }
  });

  describe("document.open timing (#152)", () => {
    const manuscriptMarker = "SECRET_MANUSCRIPT_TEXT_MARKER_吾輩は猫である";

    it("logs document.open.fileRead.completed with durationMs, fileSizeBytes, and the propagated documentOpenId on a successful open", async () => {
      const logger = buildLoggerMock();

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\Novel\\catfood.md"]
      });
      fsMock.readFile.mockResolvedValue(Buffer.from(manuscriptMarker, "utf8"));

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await openMarkdown(
        { sender: {} },
        { documentOpenId: "documentOpen.1" }
      );

      const call = logger.log.mock.calls.find(
        ([entry]) => entry.event === "document.open.fileRead.completed"
      );

      expect(call).toBeTruthy();
      const details = call?.[0].details;

      expect(details.documentOpenId).toBe("documentOpen.1");
      expect(typeof details.durationMs).toBe("number");
      expect(details.fileSizeBytes).toBe(
        Buffer.byteLength(manuscriptMarker, "utf8")
      );
      expect(details.byteLength).toBe(
        Buffer.byteLength(manuscriptMarker, "utf8")
      );
      expect(details.characterLength).toBe(manuscriptMarker.length);
      expect(details.encodingAssumption).toBe("utf8");
      expect(details.lineEndingKind).toBe("none");
      expect(details.hadBom).toBe(false);
      expect(details.result).toBe("succeeded");
    });

    it("does not include manuscript content anywhere in the logged details", async () => {
      const logger = buildLoggerMock();

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\Novel\\catfood.md"]
      });
      fsMock.readFile.mockResolvedValue(Buffer.from(manuscriptMarker, "utf8"));

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await openMarkdown(
        { sender: {} },
        { documentOpenId: "documentOpen.1" }
      );

      for (const [entry] of logger.log.mock.calls) {
        expect(JSON.stringify(entry)).not.toContain(manuscriptMarker);
      }
    });

    it("does not include the raw absolute path in the logged details", async () => {
      const logger = buildLoggerMock();
      const rawPath = "C:\\Novel\\my-secret-project\\catfood.md";

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [rawPath]
      });
      fsMock.readFile.mockResolvedValue(Buffer.from("content", "utf8"));

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await openMarkdown(
        { sender: {} },
        { documentOpenId: "documentOpen.1" }
      );

      for (const [entry] of logger.log.mock.calls) {
        expect(JSON.stringify(entry)).not.toContain(rawPath);
      }
      expect(logger.documentRefForKey).toHaveBeenCalledWith(rawPath);
    });

    it("omits documentOpenId when the renderer request does not include one, without throwing", async () => {
      const logger = buildLoggerMock();

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ["C:\\Novel\\catfood.md"]
      });
      fsMock.readFile.mockResolvedValue(Buffer.from("content", "utf8"));

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await expect(openMarkdown({ sender: {} }, undefined)).resolves.toEqual({
        path: "C:\\Novel\\catfood.md",
        content: "content",
        metadata: {
          encoding: "utf8",
          lineEnding: "none",
          byteLength: Buffer.byteLength("content", "utf8"),
          characterLength: "content".length,
          hadBom: false
        }
      });

      const call = logger.log.mock.calls.find(
        ([entry]) => entry.event === "document.open.fileRead.completed"
      );

      expect(call?.[0].details.documentOpenId).toBeUndefined();
    });

    it.each([
      ["LF", "alpha\nbeta", "alpha\nbeta", "lf", false],
      ["CRLF", "alpha\r\nbeta", "alpha\r\nbeta", "crlf", false],
      ["CR", "alpha\rbeta", "alpha\rbeta", "cr", false],
      ["mixed", "alpha\r\nbeta\ngamma", "alpha\r\nbeta\ngamma", "mixed", false],
      ["none", "alpha beta", "alpha beta", "none", false],
      [
        "UTF-8 BOM",
        "\ufeffalpha\r\nbeta",
        "alpha\r\nbeta",
        "crlf",
        true
      ]
    ] as const)(
      "decodes UTF-8 and reports %s line ending metadata",
      async (_label, diskContent, expectedContent, expectedLineEnding, hadBom) => {
        const logger = buildLoggerMock();

        electronMock.showOpenDialog.mockResolvedValue({
          canceled: false,
          filePaths: ["C:\\Novel\\catfood.md"]
        });
        fsMock.readFile.mockResolvedValue(Buffer.from(diskContent, "utf8"));

        const openMarkdown = registeredHandler(
          FILE_CHANNELS.openMarkdown,
          logger as unknown as DebugLogger
        );

        await expect(
          openMarkdown({ sender: {} }, { documentOpenId: "documentOpen.2" })
        ).resolves.toEqual({
          path: "C:\\Novel\\catfood.md",
          content: expectedContent,
          metadata: {
            encoding: "utf8",
            lineEnding: expectedLineEnding,
            byteLength: Buffer.byteLength(diskContent, "utf8"),
            characterLength: expectedContent.length,
            hadBom
          }
        });

        const call = logger.log.mock.calls.find(
          ([entry]) => entry.event === "document.open.fileRead.completed"
        );

        expect(call?.[0].details).toMatchObject({
          lineEndingKind: expectedLineEnding,
          byteLength: Buffer.byteLength(diskContent, "utf8"),
          characterLength: expectedContent.length,
          hadBom
        });
      }
    );

    it("includes documentOpenId on the existing document.open.failed event when the read fails", async () => {
      const logger = buildLoggerMock();
      const rawPath = "C:\\Novel\\catfood.md";
      const readError = Object.assign(
        new Error(`EPERM: operation not permitted, open '${rawPath}'`),
        { code: "EPERM", path: rawPath }
      );

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [rawPath]
      });
      fsMock.readFile.mockRejectedValue(readError);

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await expectSanitizedFileIoRejection(
        openMarkdown(
          { sender: {} },
          { documentOpenId: "documentOpen.7" }
        ) as Promise<unknown>,
        "permissionDenied",
        [rawPath]
      );

      const call = logger.log.mock.calls.find(
        ([entry]) => entry.event === "document.open.failed"
      );

      expect(call?.[0].details.documentOpenId).toBe("documentOpen.7");
      expect(call?.[0].details.result).toBe("failed");
    });

    it("does not log a fileRead.completed event when the user cancels the dialog", async () => {
      const logger = buildLoggerMock();

      electronMock.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await expect(
        openMarkdown({ sender: {} }, { documentOpenId: "documentOpen.9" })
      ).resolves.toBeNull();

      expect(logger.log).not.toHaveBeenCalled();
      expect(fsMock.readFile).not.toHaveBeenCalled();
    });
  });

  describe("Open Markdown chooser default directory (#152 follow-up)", () => {
    it("starts the chooser in the active project directory when a project is open", async () => {
      projectIpcMock.currentProjectRootPath.mockReturnValue(
        "C:\\Novel\\my-project"
      );
      electronMock.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const openMarkdown = registeredHandler(FILE_CHANNELS.openMarkdown);

      await openMarkdown({ sender: {} }, {});

      expect(electronMock.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({ defaultPath: "C:\\Novel\\my-project" })
      );
    });

    it("used by both the File menu and Command Palette open paths, since they invoke the same openMarkdown IPC channel — no separate wiring needed", () => {
      // editorCommandIds.openMarkdownDocument (Command Palette / menu) is
      // wired in App.tsx to the same openFile() function that calls
      // window.pergamum.files.openMarkdown(), which invokes this exact
      // handler — so this fix applies to both without extra plumbing.
      expect(FILE_CHANNELS.openMarkdown).toBe("files:openMarkdown");
    });

    it("falls back to no explicit defaultPath (Electron's own default) when no project is open", async () => {
      projectIpcMock.currentProjectRootPath.mockReturnValue(null);
      electronMock.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const openMarkdown = registeredHandler(FILE_CHANNELS.openMarkdown);

      await openMarkdown({ sender: {} }, {});

      const options = electronMock.showOpenDialog.mock.calls[0][0];

      expect(options).not.toHaveProperty("defaultPath");
    });

    it("does not change which files are selectable (filters/properties unaffected)", async () => {
      projectIpcMock.currentProjectRootPath.mockReturnValue("C:\\Novel");
      electronMock.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const openMarkdown = registeredHandler(FILE_CHANNELS.openMarkdown);

      await openMarkdown({ sender: {} }, {});

      expect(electronMock.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: ["openFile"],
          filters: [
            {
              name: "Markdown",
              extensions: ["md", "markdown", "mdown", "mkd"]
            }
          ]
        })
      );
    });

    it("does not log the raw project root path or the raw selected file path", async () => {
      const logger = buildLoggerMock();
      const projectRootPath = "C:\\Users\\name\\my-secret-novel-project";
      const selectedPath = `${projectRootPath}\\chapter1.md`;

      projectIpcMock.currentProjectRootPath.mockReturnValue(projectRootPath);
      electronMock.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [selectedPath]
      });
      fsMock.readFile.mockResolvedValue(Buffer.from("content", "utf8"));

      const openMarkdown = registeredHandler(
        FILE_CHANNELS.openMarkdown,
        logger as unknown as DebugLogger
      );

      await openMarkdown({ sender: {} }, { documentOpenId: "documentOpen.5" });

      for (const [entry] of logger.log.mock.calls) {
        expect(JSON.stringify(entry)).not.toContain(projectRootPath);
        expect(JSON.stringify(entry)).not.toContain(selectedPath);
      }
    });
  });
});
