import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_CHANNELS } from "../../src/shared/api";
import {
  createSessionStoreController,
  type SessionStoreControllerWindow
} from "../../src/main/sessionStoreIpc";
import { createSessionStore } from "../../src/main/sessionStore";
import { isSessionStorageFailure } from "../../src/shared/sessionPersistenceFailure";
import type { RendererSessionSnapshot } from "../../src/shared/session";

class FakeIpcMain {
  private handlers = new Map<
    string,
    (_event: unknown, ...args: unknown[]) => unknown
  >();

  handle(
    channel: string,
    listener: (_event: unknown, ...args: unknown[]) => unknown
  ): void {
    this.handlers.set(channel, listener);
  }

  async invoke(channel: string, payload?: unknown): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }
    return handler({}, payload);
  }
}

function dummySnapshot(
  sessionId = "018f0000-0000-7000-8000-000000000001"
): RendererSessionSnapshot {
  return {
    sessionId,
    projectContext: null,
    editors: [],
    activeEditor: null
  };
}

describe("sessionStoreIpc failure injection (#519)", () => {
  let tmpDir = "";
  let ipcMain: FakeIpcMain;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pergamum-ipc-inject-test-"));
    ipcMain = new FakeIpcMain();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("does NOT register or accept injection when isDebugMode is false", async () => {
    const store = createSessionStore({
      baseDirectory: path.join(tmpDir, "sessions")
    });

    const controller = createSessionStoreController({
      ipcMain,
      sessionStore: store,
      instanceRunId: "018f0000-0000-7000-8000-000000000002",
      isDebugMode: false,
      getMainWindow: () => null,
      getCurrentProjectId: () => null,
      getCurrentProjectFilePath: () => null
    });
    controller.registerIpc();

    await ipcMain.invoke(SESSION_CHANNELS.injectFailure, {
      reason: "manifestNotMutable",
      count: 1
    });

    // Should persist normally without throwing an error
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).resolves.toBeUndefined();
  });

  it("arms failure injection, fails next 1 flush, and automatically clears", async () => {
    const debugLogs: Array<{ event: string; details?: Record<string, unknown> }> = [];
    const store = createSessionStore({
      baseDirectory: path.join(tmpDir, "sessions")
    });

    const controller = createSessionStoreController({
      ipcMain,
      sessionStore: store,
      instanceRunId: "018f0000-0000-7000-8000-000000000002",
      isDebugMode: true,
      logDebug: (event, details) => debugLogs.push({ event, details }),
      getMainWindow: () => null,
      getCurrentProjectId: () => null,
      getCurrentProjectFilePath: () => null
    });
    controller.registerIpc();

    // Arm 1 failure
    await ipcMain.invoke(SESSION_CHANNELS.injectFailure, {
      reason: "manifestNotMutable",
      count: 1
    });

    // 1st flush should fail with manifestNotMutable
    let caught: unknown;
    try {
      await ipcMain.invoke(
        SESSION_CHANNELS.persistSession,
        dummySnapshot()
      );
    } catch (err) {
      caught = err;
    }

    expect(isSessionStorageFailure(caught)).toBe(true);
    expect(debugLogs).toHaveLength(1);
    expect(debugLogs[0].event).toBe("debug.session.failureInjected");
    expect(debugLogs[0].details).toEqual({
      reason: "manifestNotMutable",
      remainingFlushes: 0
    });

    // 2nd flush should succeed (injection was automatically cleared)
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).resolves.toBeUndefined();
  });

  it("injects realistic dummy lock details and dummy PID (99999) for lockUnavailable", async () => {
    const store = createSessionStore({
      baseDirectory: path.join(tmpDir, "sessions")
    });

    const controller = createSessionStoreController({
      ipcMain,
      sessionStore: store,
      instanceRunId: "018f0000-0000-7000-8000-000000000002",
      isDebugMode: true,
      getMainWindow: () => null,
      getCurrentProjectId: () => null,
      getCurrentProjectFilePath: () => null
    });
    controller.registerIpc();

    await ipcMain.invoke(SESSION_CHANNELS.injectFailure, {
      reason: "lockUnavailable",
      count: 1
    });

    let caughtError: unknown;
    try {
      await ipcMain.invoke(
        SESSION_CHANNELS.persistSession,
        dummySnapshot()
      );
    } catch (err) {
      caughtError = err;
    }

    const message = (caughtError as Error).message;
    expect(message).toContain("lockUnavailable");
    expect(message).toContain("99999"); // Fake PID
  });

  it("clears armed failure injection via clearInjection IPC", async () => {
    const store = createSessionStore({
      baseDirectory: path.join(tmpDir, "sessions")
    });

    const controller = createSessionStoreController({
      ipcMain,
      sessionStore: store,
      instanceRunId: "018f0000-0000-7000-8000-000000000002",
      isDebugMode: true,
      getMainWindow: () => null,
      getCurrentProjectId: () => null,
      getCurrentProjectFilePath: () => null
    });
    controller.registerIpc();

    // Arm injection
    await ipcMain.invoke(SESSION_CHANNELS.injectFailure, {
      reason: "diskFull",
      count: 1
    });

    // Clear injection before flush
    await ipcMain.invoke(SESSION_CHANNELS.clearInjection);

    // Flush should now succeed
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).resolves.toBeUndefined();
  });

  it("handles streak command (3 consecutive flushes fail)", async () => {
    const store = createSessionStore({
      baseDirectory: path.join(tmpDir, "sessions")
    });

    const controller = createSessionStoreController({
      ipcMain,
      sessionStore: store,
      instanceRunId: "018f0000-0000-7000-8000-000000000002",
      isDebugMode: true,
      getMainWindow: () => null,
      getCurrentProjectId: () => null,
      getCurrentProjectFilePath: () => null
    });
    controller.registerIpc();

    // Arm 3 consecutive failures
    await ipcMain.invoke(SESSION_CHANNELS.injectFailure, {
      reason: "lockUnavailable",
      count: 3
    });

    // 1st flush fails
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).rejects.toThrow();

    // 2nd flush fails
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).rejects.toThrow();

    // 3rd flush fails
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).rejects.toThrow();

    // 4th flush succeeds
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, dummySnapshot())
    ).resolves.toBeUndefined();
  });

  describe("openSessionsFolder IPC (#519)", () => {
    it("opens sessions folder (userData/sessions) when it exists and returns true", async () => {
      const openedPaths: string[] = [];
      const sessionsDir = path.join(tmpDir, "sessions");
      await fs.mkdir(sessionsDir, { recursive: true });

      const store = createSessionStore({
        baseDirectory: sessionsDir
      });

      const controller = createSessionStoreController({
        ipcMain,
        sessionStore: store,
        instanceRunId: "018f0000-0000-7000-8000-000000000002",
        getUserDataPath: () => tmpDir,
        openPath: async (targetPath) => {
          openedPaths.push(targetPath);
          return ""; // Electron shell.openPath resolves "" on success
        },
        getMainWindow: () => null,
        getCurrentProjectId: () => null,
        getCurrentProjectFilePath: () => null
      });
      controller.registerIpc();

      const result = await ipcMain.invoke(SESSION_CHANNELS.openSessionsFolder);
      expect(result).toBe(true);
      expect(openedPaths).toEqual([sessionsDir]);
      expect(openedPaths[0]).not.toBe(tmpDir); // MUST NOT be userData root
    });

    it("returns false and does NOT call openPath when sessions folder does NOT exist", async () => {
      const openedPaths: string[] = [];

      const store = createSessionStore({
        baseDirectory: path.join(tmpDir, "sessions")
      });

      const controller = createSessionStoreController({
        ipcMain,
        sessionStore: store,
        instanceRunId: "018f0000-0000-7000-8000-000000000002",
        getUserDataPath: () => path.join(tmpDir, "non-existent-user-data"),
        openPath: async (targetPath) => {
          openedPaths.push(targetPath);
          return "";
        },
        getMainWindow: () => null,
        getCurrentProjectId: () => null,
        getCurrentProjectFilePath: () => null
      });
      controller.registerIpc();

      const result = await ipcMain.invoke(SESSION_CHANNELS.openSessionsFolder);
      expect(result).toBe(false);
      expect(openedPaths).toEqual([]);
    });
  });
});

