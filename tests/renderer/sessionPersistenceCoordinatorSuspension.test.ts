import { describe, expect, it } from "vitest";
import {
  SessionPersistenceCoordinator,
  SESSION_PERSISTENCE_SLOW_IO_THRESHOLD_MS,
  type SessionPersistenceScheduler
} from "../../src/renderer/session/sessionPersistenceCoordinator";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { RendererSessionSnapshot } from "../../src/shared/session";
import {
  SessionStorageFailureError,
  SESSION_STORAGE_FAILURE_CODE
} from "../../src/shared/sessionPersistenceFailure";

const SESSION_ID = "session-1";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function manualScheduler(): SessionPersistenceScheduler & {
  flush: () => void;
  pendingDelay: () => number | null;
} {
  const pendingBox: {
    current: { callback: () => void; delay: number } | null;
  } = { current: null };
  return {
    schedule: (callback, delayMs) => {
      pendingBox.current = { callback, delay: delayMs };
      return pendingBox.current;
    },
    cancel: () => {
      pendingBox.current = null;
    },
    flush: () => {
      const current = pendingBox.current;
      pendingBox.current = null;
      current?.callback();
    },
    pendingDelay: () => pendingBox.current?.delay ?? null
  };
}

function inputs(filePath: string, order = 0): SessionSnapshotInputs {
  return {
    sessionId: SESSION_ID,
    projectContext: null,
    editors: [
      {
        editor: {
          kind: "standaloneMarkdown",
          order,
          filePath,
          viewState: null
        },
        viewStateKey: `key:${filePath}`
      }
    ],
    activeEditor: null
  };
}

function setup(options?: {
  persist?: (s: RendererSessionSnapshot) => void | Promise<void>;
  slowIoThresholdMs?: number;
}) {
  const scheduler = manualScheduler();
  const suspensions: string[] = [];
  const persistArgs: string[] = [];

  const coordinator = new SessionPersistenceCoordinator({
    sessionId: SESSION_ID,
    transport: {
      persist: (s) => {
        persistArgs.push(
          (s.editors[0] as { filePath?: string } | undefined)?.filePath ?? "?"
        );
        return options?.persist ? options.persist(s) : Promise.resolve();
      },
      dropFromRestoreSet: () => undefined
    },
    captureActiveEditorViewState: () => null,
    scheduler,
    onSuspended: (reason) => suspensions.push(reason),
    slowIoThresholdMs: options?.slowIoThresholdMs
  });

  return { coordinator, scheduler, suspensions, persistArgs };
}

describe("SessionPersistenceCoordinator — SUSPENDED on storage failure (#272 PO decision)", () => {
  it("a storage-class persist failure: ACTIVE → SUSPENDED, onSuspended fired once with the reason", async () => {
    const { coordinator, scheduler, suspensions } = setup({
      persist: () =>
        Promise.reject(new SessionStorageFailureError("diskFull", "ENOSPC"))
    });

    expect(coordinator.getState()).toBe("active");

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["diskFull"]);
  });

  it("after SUSPENDED, continuous persistence stops — repeated updates cause no I/O and no more callbacks", async () => {
    const { coordinator, scheduler, suspensions, persistArgs } = setup({
      persist: () => Promise.reject(new SessionStorageFailureError("ioError"))
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();
    expect(persistArgs).toHaveLength(1);

    for (let i = 0; i < 30; i += 1) {
      coordinator.updateSessionInputs(inputs("/a.md", i));
    }
    scheduler.flush();
    await tick();

    expect(persistArgs).toHaveLength(1);
    expect(suspensions).toEqual(["ioError"]);
    expect(scheduler.pendingDelay()).toBeNull();
  });

  it("onSuspended fires exactly once across repeated failures", async () => {
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => Promise.reject(new SessionStorageFailureError("writeFailed"))
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();
    await coordinator.commitNow(inputs("/a.md", 2)).catch(() => undefined);
    await tick();

    expect(suspensions).toHaveLength(1);
  });

  it("a transient (unresolved Project identity) failure does NOT suspend and stays retryable", async () => {
    const transient = Object.assign(
      new Error("Session not persisted: unresolved Project identity."),
      { name: "UnresolvedProjectIdentityError" }
    );
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => Promise.reject(transient)
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    coordinator.updateSessionInputs(inputs("/a.md", 1));
    expect(scheduler.pendingDelay()).not.toBeNull();
  });

  it("recognizes an IPC-flattened storage-failure message", async () => {
    const flattened = new Error(
      `Error invoking remote method 'session:persistSession': Error: ${SESSION_STORAGE_FAILURE_CODE}:permissionDenied: EROFS`
    );
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => Promise.reject(flattened)
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["permissionDenied"]);
  });

  it("suspendFromStorageFailure() (main-driven) suspends; idempotent", () => {
    const { coordinator, suspensions } = setup();
    coordinator.suspendFromStorageFailure("diskFull");
    coordinator.suspendFromStorageFailure("ioError");
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["diskFull"]);
  });

  it("commitNow STILL runs while SUSPENDED and still rejects on storage failure", async () => {
    const { coordinator, scheduler, persistArgs } = setup({
      persist: () => Promise.reject(new SessionStorageFailureError("diskFull"))
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    const before = persistArgs.length;

    await expect(
      coordinator.commitNow(inputs("/b.md"))
    ).rejects.toMatchObject({ code: SESSION_STORAGE_FAILURE_CODE });
    expect(persistArgs.length).toBeGreaterThan(before);
  });

  it("dropFromRestoreSet storage failure suspends AND rejects (non-final Window Close declines)", async () => {
    const scheduler = manualScheduler();
    const suspensions: string[] = [];
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () => undefined,
        dropFromRestoreSet: () =>
          Promise.reject(new SessionStorageFailureError("lockUnavailable"))
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      onSuspended: (r) => suspensions.push(r)
    });
    coordinator.updateSessionInputs(inputs("/a.md"));

    await expect(coordinator.dropFromRestoreSet()).rejects.toMatchObject({
      code: SESSION_STORAGE_FAILURE_CODE
    });
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["lockUnavailable"]);
  });

  it("a fresh coordinator starts ACTIVE (suspension is per-run only)", () => {
    const a = setup();
    a.coordinator.suspendFromStorageFailure("diskFull");
    expect(a.coordinator.getState()).toBe("suspended");
    expect(setup().coordinator.getState()).toBe("active");
  });
});

describe("SessionPersistenceCoordinator — slow I/O detection (#272 PO decision)", () => {
  it("uses a named, comfortably-large threshold constant", () => {
    expect(SESSION_PERSISTENCE_SLOW_IO_THRESHOLD_MS).toBeGreaterThanOrEqual(
      5_000
    );
  });

  it("a persist that never settles → SUSPENDED after the threshold; in-flight write not assumed gone; no stacked automatic write", async () => {
    const resolveSlowBox: { current: (() => void) | null } = { current: null };
    const slow = new Promise<void>((resolve) => {
      resolveSlowBox.current = resolve;
    });
    let persistCount = 0;
    const scheduler = manualScheduler();
    const suspensions: string[] = [];

    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () => {
          persistCount += 1;
          return slow;
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      onSuspended: (r) => suspensions.push(r),
      slowIoThresholdMs: 50
    });

    coordinator.updateSessionInputs(inputs("/a.md"));
    scheduler.flush(); // debounce → persist starts
    await tick();
    expect(persistCount).toBe(1);
    expect(coordinator.getState()).toBe("active");

    scheduler.flush(); // slow-I/O timer fires
    await tick();

    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["slowIo"]);

    for (let i = 0; i < 10; i += 1) {
      coordinator.updateSessionInputs(inputs("/a.md", i));
    }
    scheduler.flush();
    await tick();
    expect(persistCount).toBe(1); // never stacked a second write

    resolveSlowBox.current?.();
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    expect(persistCount).toBe(1);
  });

  it("commitNow does not run concurrently with a slow in-flight write; it waits, then reflects the outcome", async () => {
    const resolveSlowBox: { current: (() => void) | null } = { current: null };
    const slow = new Promise<void>((resolve) => {
      resolveSlowBox.current = resolve;
    });
    const persistArgs: string[] = [];
    const scheduler = manualScheduler();

    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: (s) => {
          persistArgs.push(
            (s.editors[0] as { filePath?: string } | undefined)?.filePath ?? "?"
          );
          return persistArgs.length === 1 ? slow : Promise.resolve();
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      slowIoThresholdMs: 50
    });

    coordinator.updateSessionInputs(inputs("/slow.md"));
    scheduler.flush();
    await tick();
    scheduler.flush(); // slow-io → SUSPENDED, in-flight promise retained
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    expect(persistArgs).toEqual(["/slow.md"]);

    const commit = coordinator.commitNow(inputs("/commit.md"));
    await tick();
    scheduler.flush(); // slow-io race for the STILL-pending in-flight write
    await tick();

    await expect(commit).rejects.toMatchObject({
      code: SESSION_STORAGE_FAILURE_CODE
    });
    // commitNow never issued its own concurrent write.
    expect(persistArgs).toEqual(["/slow.md"]);

    resolveSlowBox.current?.();
    await tick();
  });
});
