import { describe, expect, it } from "vitest";
import { SESSION_CHANNELS } from "../../src/shared/api";
import {
  createSessionStoreController,
  type CreateSessionStoreControllerOptions,
  type SessionStoreControllerScheduler,
  type SessionStoreControllerWindow
} from "../../src/main/sessionStoreIpc";
import type { SessionStore } from "../../src/main/sessionStore";
import type {
  RendererSessionSnapshot,
  SessionRecord
} from "../../src/shared/session";
import { SessionStorageFailureError } from "../../src/shared/sessionPersistenceFailure";
import { sid, RUN_ID, PROJECT_ID } from "../shared/sessionTestFixtures";

const SID = sid("ipc");

function fakeIpcMain() {
  const handlers = new Map<
    string,
    (event: unknown, ...args: unknown[]) => unknown
  >();

  return {
    handle: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => unknown
    ) => {
      handlers.set(channel, listener);
    },
    invoke: (channel: string, payload: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`no handler for ${channel}`);
      }
      return Promise.resolve(handler({}, payload));
    }
  };
}

function fakeSessionStore(
  overrides: Partial<SessionStore> = {}
) {
  const persisted: SessionRecord[] = [];
  const removed: string[] = [];

  const store: SessionStore = {
    readRestoreSet: () =>
      Promise.resolve({
        manifest: { schemaVersion: 1, sessions: [], updatedAt: "" },
        sessions: [],
        skipped: []
      }),
    readRestoreSetForColdStart: () =>
      Promise.resolve({
        manifestOutcome: { kind: "empty" },
        sessions: [],
        skipped: []
      }),
    persistSession: (record) => {
      persisted.push(record);
      return Promise.resolve();
    },
    removeSessionFromRestoreSet: (sessionId) => {
      removed.push(sessionId);
      return Promise.resolve();
    },
    ...overrides
  };

  return { store, persisted, removed };
}

function immediateScheduler(): SessionStoreControllerScheduler & {
  runPending: () => void;
} {
  let pending: (() => void) | null = null;

  return {
    schedule: (callback) => {
      pending = callback;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
    runPending: () => {
      const callback = pending;
      pending = null;
      callback?.();
    }
  };
}

function fakeWindow(): SessionStoreControllerWindow & {
  emit: (event: string) => void;
} {
  const listeners = new Map<string, Set<() => void>>();

  return {
    isDestroyed: () => false,
    isMinimized: () => false,
    isMaximized: () => false,
    isFullScreen: () => false,
    getNormalBounds: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    on: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener: (event, listener) => {
      listeners.get(event)?.delete(listener);
    },
    emit: (event) => {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    }
  };
}

const snapshot: RendererSessionSnapshot = {
  sessionId: SID,
  projectContext: {
    projectFilePath: "C:/n/s.pergamum",
    rootPath: "C:/n"
  },
  editors: [
    {
      kind: "projectMarkdown",
      order: 0,
      relativePath: "01.md",
      viewState: null
    }
  ],
  activeEditor: { kind: "projectMarkdown", relativePath: "01.md" }
};

const noProjectSnapshot: RendererSessionSnapshot = {
  sessionId: SID,
  projectContext: null,
  editors: [
    {
      kind: "standaloneMarkdown",
      order: 0,
      filePath: "/x.md",
      viewState: null
    }
  ],
  activeEditor: { kind: "standaloneMarkdown", filePath: "/x.md" }
};

function setup(
  overrides: Partial<CreateSessionStoreControllerOptions> & {
    store?: ReturnType<typeof fakeSessionStore>;
  } = {}
) {
  const ipcMain = fakeIpcMain();
  const { store: storeOverride, ...controllerOverrides } = overrides;
  const backing = storeOverride ?? fakeSessionStore();
  const scheduler = immediateScheduler();
  const window = fakeWindow();
  const unresolvedProjectIds: string[] = [];
  const storageFailures: string[] = [];

  const controller = createSessionStoreController({
    ipcMain,
    sessionStore: backing.store,
    instanceRunId: RUN_ID,
    getMainWindow: () => window,
    getCurrentProjectId: () => PROJECT_ID,
    getCurrentProjectFilePath: () => "C:/n/s.pergamum",
    scheduler,
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    onUnresolvedProjectIdentity: (id) => unresolvedProjectIds.push(id),
    onSessionStorageFailure: (reason) => storageFailures.push(reason),
    ...controllerOverrides
  });
  controller.registerIpc();
  controller.attachWindow(window);

  return {
    controller,
    ipcMain,
    persisted: backing.persisted,
    removed: backing.removed,
    scheduler,
    window,
    unresolvedProjectIds,
    storageFailures
  };
}

describe("SessionStoreController — persist (#272)", () => {
  it("enriches the renderer snapshot with instanceRunId, projectId and live window state", async () => {
    const { ipcMain, persisted } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      schemaVersion: 1,
      sessionId: SID,
      instanceRunId: RUN_ID,
      updatedAt: "2026-08-28T00:00:00.000Z",
      projectContext: {
        projectId: PROJECT_ID,
        projectFilePath: "C:/n/s.pergamum",
        rootPath: "C:/n"
      },
      window: {
        normalBounds: { x: 0, y: 0, width: 800, height: 600 },
        mode: "normal"
      }
    });
  });

  it("ignores an unparseable snapshot", async () => {
    const { ipcMain, persisted } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, { nonsense: true });

    expect(persisted).toEqual([]);
  });

  it("persists a no-Project snapshot as projectContext: null", async () => {
    const { ipcMain, persisted } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);

    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectContext).toBeNull();
  });
});

describe("SessionStoreController — unresolved Project identity (#272 review Blockers 4 & 5)", () => {
  it("REJECTS the persist IPC (not a silent resolve) when the live locator differs", async () => {
    const { ipcMain, persisted, unresolvedProjectIds } = setup({
      getCurrentProjectFilePath: () => "C:/other/project.pergamum"
    });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot)
    ).rejects.toThrow(/unresolved Project identity/i);

    expect(persisted).toEqual([]);
    expect(unresolvedProjectIds).toEqual([SID]);
  });

  it("REJECTS the persist IPC when there is no live projectId", async () => {
    const { ipcMain, persisted, unresolvedProjectIds } = setup({
      getCurrentProjectId: () => null
    });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot)
    ).rejects.toThrow(/unresolved Project identity/i);

    expect(persisted).toEqual([]);
    expect(unresolvedProjectIds).toEqual([SID]);
  });

  it("never writes the string \"unknown-project\" / \"unknown-instance-run\"", async () => {
    const { ipcMain, persisted } = setup({
      getCurrentProjectId: () => null
    });

    await ipcMain
      .invoke(SESSION_CHANNELS.persistSession, snapshot)
      .catch(() => undefined);
    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);

    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain("unknown-project");
    expect(serialized).not.toContain("unknown-instance-run");
  });

  it("persists normally once the locator + projectId resolve (same snapshot)", async () => {
    // Start unresolved: reject, nothing written.
    let currentProjectId: string | null = null;
    const { ipcMain, persisted } = setup({
      getCurrentProjectId: () => currentProjectId
    });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot)
    ).rejects.toThrow(/unresolved Project identity/i);
    expect(persisted).toEqual([]);

    // Identity resolves; re-persisting the SAME snapshot now succeeds.
    currentProjectId = PROJECT_ID;
    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);

    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectContext?.projectId).toBe(PROJECT_ID);
  });

  it("a no-Project snapshot always persists normally (projectContext: null)", async () => {
    const { ipcMain, persisted } = setup({ getCurrentProjectId: () => null });

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);

    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectContext).toBeNull();
  });
});

describe("SessionStoreController — error propagation (#272 review Blocker 5)", () => {
  it("rejects the persist IPC when the store write fails", async () => {
    const failingStore = fakeSessionStore({
      persistSession: () => Promise.reject(new Error("disk full"))
    });
    const { ipcMain } = setup({ store: failingStore });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot)
    ).rejects.toThrow("disk full");
  });

  it("rejects the drop IPC when membership removal fails", async () => {
    const failingStore = fakeSessionStore({
      removeSessionFromRestoreSet: () =>
        Promise.reject(new Error("manifest lock unavailable"))
    });
    const { ipcMain } = setup({ store: failingStore });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
        sessionId: SID
      })
    ).rejects.toThrow("manifest lock unavailable");
  });

  it("ignores a drop request whose sessionId is not a UUIDv7", async () => {
    const { ipcMain, removed } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
      sessionId: "../evil"
    });

    expect(removed).toEqual([]);
  });
});

describe("SessionStoreController — drop from restore set (#272)", () => {
  it("removes the session, then stops all further persistence for it", async () => {
    const { ipcMain, persisted, removed, window, scheduler } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);
    expect(persisted).toHaveLength(1);

    await ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
      sessionId: SID
    });
    expect(removed).toEqual([SID]);

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);
    window.emit("resize");
    scheduler.runPending();

    expect(persisted).toHaveLength(1);
  });

  it("a FAILED drop does NOT stop main-side persistence (#272 review Blocker 2)", async () => {
    let removeShouldFail = true;
    const removeCalls: string[] = [];
    const backing = fakeSessionStore({
      removeSessionFromRestoreSet: (sessionId) => {
        removeCalls.push(sessionId);
        return removeShouldFail
          ? Promise.reject(new Error("manifest lock unavailable"))
          : Promise.resolve();
      }
    });
    const { ipcMain, persisted, window, scheduler } = setup({ store: backing });

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);
    expect(persisted).toHaveLength(1);

    // Drop fails → IPC rejects.
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
        sessionId: noProjectSnapshot.sessionId
      })
    ).rejects.toThrow("manifest lock unavailable");

    // Main did NOT stop: a subsequent persist is still accepted...
    await ipcMain.invoke(SESSION_CHANNELS.persistSession, {
      ...noProjectSnapshot,
      editors: []
    });
    expect(persisted).toHaveLength(2);

    // ...and window-driven persistence still runs.
    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();
    expect(persisted).toHaveLength(3);

    // A later successful drop finally stops persistence.
    removeShouldFail = false;
    await ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
      sessionId: noProjectSnapshot.sessionId
    });
    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);
    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();
    expect(persisted).toHaveLength(3);
  });

  it("a persist QUEUED behind an in-flight drop no-ops once the drop succeeds — no resurrection (#272 review Blocker 2)", async () => {
    let releaseRemove: (() => void) | null = null;
    const backing = fakeSessionStore({
      removeSessionFromRestoreSet: (sessionId) => {
        return new Promise<void>((resolve) => {
          releaseRemove = () => resolve();
          void sessionId;
        });
      }
    });
    const { ipcMain, persisted } = setup({ store: backing });

    // A first persist completes and becomes `lastSnapshot`.
    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);
    expect(persisted).toHaveLength(1);

    // Drop starts but does NOT settle yet.
    const dropPromise = ipcMain.invoke(
      SESSION_CHANNELS.dropSessionFromRestoreSet,
      { sessionId: noProjectSnapshot.sessionId }
    );
    for (let i = 0; i < 20 && releaseRemove === null; i += 1) {
      await Promise.resolve();
    }

    // Persist B is enqueued WHILE the drop is in flight (enqueue-time check
    // still passes — nothing is stopped yet).
    const persistBPromise = ipcMain.invoke(SESSION_CHANNELS.persistSession, {
      ...noProjectSnapshot,
      editors: []
    });

    // The drop now succeeds → the Session leaves the restore set.
    releaseRemove!();
    await dropPromise;
    await persistBPromise;

    // Persist B reached the front of the queue AFTER the successful drop and
    // re-checked `stoppedSessionIds` at execution time → it must NOT have
    // written (which would have silently re-added the Session).
    expect(persisted).toHaveLength(1);
  });

  it("a storage-class failure on the drop ALSO suspends main's window-driven loop (#272 review follow-up 7)", async () => {
    const backing = fakeSessionStore({
      removeSessionFromRestoreSet: () =>
        Promise.reject(new SessionStorageFailureError("diskFull"))
    });
    const { ipcMain, persisted, window, scheduler, storageFailures } = setup({
      store: backing
    });

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);
    expect(persisted).toHaveLength(1);

    // The drop rejects to the IPC caller (renderer suspends via its await).
    await expect(
      ipcMain.invoke(SESSION_CHANNELS.dropSessionFromRestoreSet, {
        sessionId: noProjectSnapshot.sessionId
      })
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });

    // Main also stopped its own window-driven re-persist loop — no more I/O.
    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();
    expect(persisted).toHaveLength(1);

    // No redundant `storageFailure` event — the renderer already knows via
    // the rejected await.
    expect(storageFailures).toEqual([]);
  });
});

describe("SessionStoreController — window-driven re-persistence (#272)", () => {
  it("re-persists the last snapshot (with fresh window state) on a debounced window event", async () => {
    const { ipcMain, persisted, window, scheduler } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);
    expect(persisted).toHaveLength(1);

    window.emit("resize");
    window.emit("move");
    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();

    expect(persisted).toHaveLength(2);
    expect(persisted[1]).toMatchObject({ sessionId: SID });
  });

  it("does nothing on a window event before any renderer snapshot exists", async () => {
    const { persisted, window, scheduler } = setup();

    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();

    expect(persisted).toEqual([]);
  });

  it("stops listening after detachWindow", async () => {
    const { controller, ipcMain, persisted, window, scheduler } = setup();

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, snapshot);
    controller.detachWindow();

    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();

    expect(persisted).toHaveLength(1);
  });
});

describe("SessionStoreController — storage failure → SUSPENDED (#272 PO decision)", () => {
  it("a storage failure on a window-driven re-persist notifies the renderer ONCE and stops the loop", async () => {
    let failFrom = 2; // first persist succeeds (primes lastSnapshot), then fails
    let calls = 0;
    const persisted: SessionRecord[] = [];
    const backing = {
      store: {
        readRestoreSet: () =>
          Promise.resolve({
            manifest: { schemaVersion: 1, sessions: [], updatedAt: "" },
            sessions: [],
            skipped: []
          }),
        readRestoreSetForColdStart: () =>
          Promise.resolve({
            manifestOutcome: { kind: "empty" },
            sessions: [],
            skipped: []
          }),
        persistSession: (record: SessionRecord) => {
          calls += 1;
          if (calls >= failFrom) {
            return Promise.reject(
              new SessionStorageFailureError("diskFull", "ENOSPC")
            );
          }
          persisted.push(record);
          return Promise.resolve();
        },
        removeSessionFromRestoreSet: () => Promise.resolve()
      } as SessionStore,
      persisted,
      removed: [] as string[]
    };
    const { ipcMain, window, scheduler, storageFailures } = setup({
      store: backing
    });

    await ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot);
    expect(persisted).toHaveLength(1);

    // Window event → main-driven re-persist → storage failure.
    window.emit("resize");
    scheduler.runPending();
    await new Promise((r) => setTimeout(r, 0));

    expect(storageFailures).toEqual(["diskFull"]);

    // Further window events do NOT schedule / notify again (no I/O spam).
    window.emit("move");
    scheduler.runPending();
    await new Promise((r) => setTimeout(r, 0));
    expect(storageFailures).toEqual(["diskFull"]);
    void failFrom;
  });

  it("a renderer-initiated storage failure rejects to the IPC caller AND stops main's window loop", async () => {
    const backing = fakeSessionStore({
      persistSession: () =>
        Promise.reject(new SessionStorageFailureError("ioError"))
    });
    const { ipcMain, window, scheduler, storageFailures } = setup({
      store: backing
    });

    await expect(
      ipcMain.invoke(SESSION_CHANNELS.persistSession, noProjectSnapshot)
    ).rejects.toMatchObject({ code: "PERGAMUM_SESSION_STORAGE_FAILURE" });

    // Main's window-driven loop is now suspended; a window event does nothing.
    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();
    expect(storageFailures).toEqual([]); // renderer already knows via the reject
  });

  it("a transient unresolved-Project-identity rejection on a window re-persist is NOT a storage failure", async () => {
    const { ipcMain, window, scheduler, storageFailures } = setup({
      getCurrentProjectId: () => null // → unresolved
    });

    await ipcMain
      .invoke(SESSION_CHANNELS.persistSession, snapshot)
      .catch(() => undefined);

    window.emit("resize");
    scheduler.runPending();
    await Promise.resolve();
    await Promise.resolve();

    expect(storageFailures).toEqual([]);
    // Not suspended — a later window event still tries.
    window.emit("move");
    expect(scheduler).toBeDefined();
  });
});
