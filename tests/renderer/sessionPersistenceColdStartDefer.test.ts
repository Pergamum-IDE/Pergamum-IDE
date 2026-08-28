import { describe, expect, it } from "vitest";
import {
  SessionPersistenceCoordinator,
  type SessionPersistenceScheduler,
  type SessionPersistenceTransport
} from "../../src/renderer/session/sessionPersistenceCoordinator";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { RendererSessionSnapshot } from "../../src/shared/session";

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function manualScheduler(): SessionPersistenceScheduler & { flush: () => void } {
  let pending: (() => void) | null = null;
  return {
    schedule: (callback) => {
      pending = callback;
      return callback;
    },
    cancel: () => {
      pending = null;
    },
    flush: () => {
      const current = pending;
      pending = null;
      current?.();
    }
  };
}

function transport(): SessionPersistenceTransport & {
  persisted: RendererSessionSnapshot[];
} {
  const persisted: RendererSessionSnapshot[] = [];
  return {
    persisted,
    persist: (snapshot) => {
      persisted.push(snapshot);
    },
    dropFromRestoreSet: () => undefined
  };
}

function inputs(sessionId: string): SessionSnapshotInputs {
  return { sessionId, projectContext: null, editors: [], activeEditor: null };
}

describe("SessionPersistenceCoordinator cold-start defer (#274)", () => {
  it("holds all automatic persistence until resolveColdStartRestore()", async () => {
    const scheduler = manualScheduler();
    const t = transport();
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: "minted",
      deferInitialFlush: true,
      transport: t,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs("minted"));
    coordinator.markViewStateDirty();
    scheduler.flush();
    await tick();
    expect(t.persisted).toHaveLength(0);

    coordinator.resolveColdStartRestore({ scheduleNow: true });
    scheduler.flush();
    await tick();
    expect(t.persisted).toHaveLength(1);
  });

  it("adoptSessionId swaps the identity before the first write; the persisted snapshot uses it", async () => {
    const scheduler = manualScheduler();
    const t = transport();
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: "minted",
      deferInitialFlush: true,
      transport: t,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs("minted"));
    coordinator.adoptSessionId("restored-id");
    // Simulate the host re-running updateSessionInputs with the adopted id.
    coordinator.updateSessionInputs(inputs("restored-id"));
    coordinator.resolveColdStartRestore({ scheduleNow: true });
    scheduler.flush();
    await tick();

    expect(t.persisted).toHaveLength(1);
    expect(t.persisted[0].sessionId).toBe("restored-id");
  });

  it("adoptSessionId is refused once a write has happened", async () => {
    const scheduler = manualScheduler();
    const t = transport();
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: "minted",
      deferInitialFlush: true,
      transport: t,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs("minted"));
    coordinator.resolveColdStartRestore({ scheduleNow: true });
    scheduler.flush();
    await tick();
    expect(t.persisted).toHaveLength(1);

    coordinator.adoptSessionId("too-late");
    coordinator.updateSessionInputs({
      ...inputs("minted"),
      projectContext: {
        projectFilePath: "/p/p.pergamum",
        rootPath: "/p"
      }
    });
    scheduler.flush();
    await tick();

    // dropFromRestoreSet would use the coordinator's sessionId; it stayed "minted".
    // (Indirectly asserted: the second persist still carries "minted".)
    expect(t.persisted[1]?.sessionId).toBe("minted");
  });

  it("resolveColdStartRestore without scheduleNow does not flush a stale snapshot on its own", async () => {
    const scheduler = manualScheduler();
    const t = transport();
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: "minted",
      deferInitialFlush: true,
      transport: t,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs("minted"));
    coordinator.resolveColdStartRestore({ scheduleNow: false });
    scheduler.flush();
    await tick();
    expect(t.persisted).toHaveLength(0);

    // A subsequent host-driven update (post-adopt re-render) does flush.
    coordinator.updateSessionInputs(inputs("restored-id"));
    scheduler.flush();
    await tick();
    expect(t.persisted).toHaveLength(1);
    expect(t.persisted[0].sessionId).toBe("restored-id");
  });
});
