import { describe, expect, it } from "vitest";
import {
  SessionPersistenceCoordinator,
  type SessionPersistenceScheduler
} from "../../src/renderer/session/sessionPersistenceCoordinator";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { RendererSessionSnapshot } from "../../src/shared/session";
import {
  SessionStorageFailureError,
  type SessionStorageFailureReason
} from "../../src/shared/sessionPersistenceFailure";

const SESSION_ID = "session-ordinary-test";

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

describe("SessionPersistenceCoordinator — Ordinary automatic flush retry & suspension (#519)", () => {
  it("ordinary automatic flush for transient error: 3 strikes proceed automatically via pre-suspend timer WITHOUT requiring user interaction", async () => {
    let failCount = 0;
    const scheduler = manualScheduler();
    const suspensions: string[] = [];

    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () => {
          failCount += 1;
          return Promise.reject(new SessionStorageFailureError("lockUnavailable"));
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      onSuspended: (reason) => {
        suspensions.push(reason);
      }
    });

    expect(coordinator.getState()).toBe("active");

    // Strike 1 (triggered by initial session state change)
    coordinator.updateSessionInputs(inputs("/doc1.md", 1));
    scheduler.flush(); // Debounce flush -> 1st persist attempt fails
    await tick();

    expect(failCount).toBe(1);
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000); // 2s pre-suspend retry timer scheduled

    // Strike 2 (NO user interaction — pre-suspend timer fires automatically)
    scheduler.flush(); // Timer fires attemptPreSuspendRetry
    await tick();

    expect(failCount).toBe(2);
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000); // 2s pre-suspend retry timer scheduled again

    // Strike 3 (NO user interaction — pre-suspend timer fires automatically)
    scheduler.flush(); // Timer fires attemptPreSuspendRetry -> 3rd failure
    await tick();

    expect(failCount).toBe(3);
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["lockUnavailable"]);
  });

  it("ordinary automatic flush for non-transient error: suspends immediately on 1st failure", async () => {
    const scheduler = manualScheduler();
    const suspensions: string[] = [];

    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () =>
          Promise.reject(new SessionStorageFailureError("manifestNotMutable")),
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      onSuspended: (reason) => {
        suspensions.push(reason);
      }
    });

    coordinator.updateSessionInputs(inputs("/doc1.md", 1));
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["manifestNotMutable"]);
  });
});
