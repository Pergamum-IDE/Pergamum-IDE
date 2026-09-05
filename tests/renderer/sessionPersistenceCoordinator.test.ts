import { describe, expect, it, vi } from "vitest";
import {
  SessionPersistenceCoordinator,
  type CaptureActiveEditorViewState,
  type SessionPersistenceScheduler,
  type SessionPersistenceTransport
} from "../../src/renderer/session/sessionPersistenceCoordinator";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { EditorViewState } from "../../src/renderer/editorViewState";
import type { RendererSessionSnapshot } from "../../src/shared/session";
import { SessionStorageFailureError } from "../../src/shared/sessionPersistenceFailure";

const SESSION_ID = "session-1";

/** Let the coordinator's internal flush microtask chain settle. */
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

function recordingTransport(): SessionPersistenceTransport & {
  persisted: RendererSessionSnapshot[];
  dropped: string[];
} {
  const persisted: RendererSessionSnapshot[] = [];
  const dropped: string[] = [];

  return {
    persisted,
    dropped,
    persist: (snapshot) => {
      persisted.push(snapshot);
    },
    dropFromRestoreSet: (sessionId) => {
      dropped.push(sessionId);
    }
  };
}

function inputs(
  editors: SessionSnapshotInputs["editors"] = [],
  projectContext: SessionSnapshotInputs["projectContext"] = null
): SessionSnapshotInputs {
  return {
    sessionId: SESSION_ID,
    projectContext,
    editors,
    activeEditor: null
  };
}

function markdownEditorInput(
  filePath: string,
  order = 0
): SessionSnapshotInputs["editors"][number] {
  return {
    editor: {
      kind: "standaloneMarkdown",
      order,
      filePath,
      viewState: null
    },
    viewStateKey: `key:${filePath}`
  };
}

function viewState(char: string): EditorViewState {
  return {
    contentDigest: { algorithm: "sha256", digest: char.repeat(64) },
    selection: { anchor: 0, head: 0 },
    scroll: null
  };
}

function setup(options?: {
  capture?: CaptureActiveEditorViewState;
  now?: () => number;
  debounceMs?: number;
  maxDeferMs?: number;
}) {
  const scheduler = manualScheduler();
  const transport = recordingTransport();
  const capture = vi.fn<CaptureActiveEditorViewState>(
    options?.capture ?? (() => null)
  );

  const coordinator = new SessionPersistenceCoordinator({
    sessionId: SESSION_ID,
    transport,
    captureActiveEditorViewState: capture,
    scheduler,
    now: options?.now,
    debounceMs: options?.debounceMs ?? 400,
    maxDeferMs: options?.maxDeferMs ?? 2000
  });

  return { coordinator, scheduler, transport, capture };
}

describe("SessionPersistenceCoordinator (#272)", () => {
  it("debounces: many rapid updates produce a single persist", async () => {
    const { coordinator, scheduler, transport } = setup();

    for (let i = 0; i < 20; i += 1) {
      coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    }
    expect(transport.persisted).toHaveLength(0);

    scheduler.flush();
    await tick();

    expect(transport.persisted).toHaveLength(1);
    expect(transport.persisted[0].editors[0]).toMatchObject({
      filePath: "/a.md"
    });
  });

  it("captures Editor View State at most once per flush, never per update", async () => {
    const { coordinator, scheduler, capture } = setup({
      capture: () => ({ key: "key:/a.md", viewState: viewState("a") })
    });

    for (let i = 0; i < 10; i += 1) {
      coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    }
    expect(capture).not.toHaveBeenCalled();

    scheduler.flush();
    await tick();

    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("coalescing ceiling: forces a flush within maxDeferMs of continuous activity", async () => {
    let clock = 0;
    const { coordinator, scheduler } = setup({
      now: () => clock,
      debounceMs: 400,
      maxDeferMs: 1000
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    expect(scheduler.pendingDelay()).toBe(400);

    clock = 900;
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    // Only 100ms of ceiling budget left, so the debounce is clamped down.
    expect(scheduler.pendingDelay()).toBe(100);
  });

  it("does not persist again when the flushed snapshot is unchanged", async () => {
    const { coordinator, scheduler, transport } = setup();

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(transport.persisted).toHaveLength(1);

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(transport.persisted).toHaveLength(1);
  });

  it("persists again when a captured view state digest changes (e.g. after typing)", async () => {
    let current = viewState("a");
    const { coordinator, scheduler, transport } = setup({
      capture: () => ({ key: "key:/a.md", viewState: current })
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(transport.persisted).toHaveLength(1);

    current = viewState("b");
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();

    expect(transport.persisted).toHaveLength(2);
    expect(transport.persisted[1].editors[0].viewState).toEqual(viewState("b"));
  });

  it("remembers the last view state of a non-active editor across a tab switch", async () => {
    let active: ReturnType<CaptureActiveEditorViewState> = {
      key: "key:/a.md",
      viewState: viewState("a")
    };
    const { coordinator, scheduler, transport } = setup({
      capture: () => active
    });

    const twoTabs = inputs([
      markdownEditorInput("/a.md", 0),
      markdownEditorInput("/b.md", 1)
    ]);

    coordinator.updateSessionInputs(twoTabs);
    scheduler.flush();
    await tick();

    // Switch active tab to /b.md; capture now returns b's state.
    active = { key: "key:/b.md", viewState: viewState("b") };
    coordinator.updateSessionInputs(twoTabs);
    scheduler.flush();
    await tick();

    const last = transport.persisted.at(-1)!;
    expect(last.editors[0].viewState).toEqual(viewState("a")); // remembered
    expect(last.editors[1].viewState).toEqual(viewState("b"));
  });

  it("drops a cached view state when its editor closes", async () => {
    let active: ReturnType<CaptureActiveEditorViewState> = {
      key: "key:/a.md",
      viewState: viewState("a")
    };
    const { coordinator, scheduler, transport } = setup({
      capture: () => active
    });

    coordinator.updateSessionInputs(
      inputs([markdownEditorInput("/a.md", 0), markdownEditorInput("/b.md", 1)])
    );
    scheduler.flush();
    await tick();

    // /a.md closes; only /b.md remains, active.
    active = { key: "key:/b.md", viewState: viewState("b") };
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md", 0)]));
    scheduler.flush();
    await tick();

    const last = transport.persisted.at(-1)!;
    expect(last.editors).toHaveLength(1);
    expect(last.editors[0]).toMatchObject({ filePath: "/b.md" });
  });

  it("dropFromRestoreSet stops persistence and notifies the transport", async () => {
    const { coordinator, scheduler, transport } = setup();

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    coordinator.dropFromRestoreSet();

    expect(transport.dropped).toEqual([SESSION_ID]);

    // No further scheduling / persistence.
    scheduler.flush();
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md")]));
    scheduler.flush();
    await tick();

    expect(transport.persisted).toHaveLength(0);
  });

  it("flushNow persists immediately without waiting for the scheduler", async () => {
    const { coordinator, transport } = setup();

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    await coordinator.flushNow();

    expect(transport.persisted).toHaveLength(1);
  });

  it("dispose stops all further work", async () => {
    const { coordinator, scheduler, transport } = setup();

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    coordinator.dispose();
    scheduler.flush();
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md")]));
    await tick();

    expect(transport.persisted).toHaveLength(0);
  });

  it("retries on the next change after a failed persist", async () => {
    const scheduler = manualScheduler();
    let failNext = true;
    const persisted: RendererSessionSnapshot[] = [];
    const transport: SessionPersistenceTransport = {
      persist: (snapshot) => {
        if (failNext) {
          failNext = false;
          return Promise.reject(new Error("offline"));
        }
        persisted.push(snapshot);
        return Promise.resolve();
      },
      dropFromRestoreSet: () => undefined
    };
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(0);

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md", 1)]));
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(1);
  });

  it("a rejected persist does NOT mark the snapshot durable — the SAME snapshot re-persists once the transport recovers (#272 review Blocker 5)", async () => {
    const scheduler = manualScheduler();
    let identityResolved = false;
    const persisted: RendererSessionSnapshot[] = [];
    const transport: SessionPersistenceTransport = {
      persist: (snapshot) => {
        if (!identityResolved) {
          return Promise.reject(
            new Error("unresolved Project identity")
          );
        }
        persisted.push(snapshot);
        return Promise.resolve();
      },
      dropFromRestoreSet: () => undefined
    };
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport,
      captureActiveEditorViewState: () => null,
      scheduler
    });

    const projectSnapshot = inputs(
      [markdownEditorInput("/proj.md")],
      { projectFilePath: "P", rootPath: "R" }
    );

    coordinator.updateSessionInputs(projectSnapshot);
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(0);

    // Identity resolves; the very same snapshot is fed again (no editor
    // change) and must now be persisted — proving lastPersistedSerialization
    // was never advanced by the failed attempt.
    identityResolved = true;
    coordinator.updateSessionInputs(projectSnapshot);
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectContext).toEqual({
      projectFilePath: "P",
      rootPath: "R"
    });
  });
});

describe("SessionPersistenceCoordinator — outgoing View State on tab switch (#272 review Blocker 3)", () => {
  it("keeps editor A's latest View State when the user switches to B before the debounce fires", async () => {
    // Only B is "active" at flush time (capture pulls the active editor),
    // so without the boundary hook A's edit would be lost.
    const { coordinator, scheduler, transport, capture } = setup({
      capture: () => ({ key: "key:/b.md", viewState: viewState("b") })
    });

    const twoTabs = inputs([
      markdownEditorInput("/a.md", 0),
      markdownEditorInput("/b.md", 1)
    ]);

    coordinator.updateSessionInputs(twoTabs);

    // A changed, then the tab switch: MarkdownEditor reports A's final state
    // at the switch boundary (NOT per keystroke).
    coordinator.recordEditorViewState("key:/a.md", viewState("a"));

    scheduler.flush();
    await tick();

    const last = transport.persisted.at(-1)!;
    expect(last.editors[0].viewState).toEqual(viewState("a")); // A preserved
    expect(last.editors[1].viewState).toEqual(viewState("b")); // B captured
    // Capture (SHA-256) still ran at most once for the flush.
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("preserves each outgoing editor across a rapid A -> B -> C switch", async () => {
    let active: ReturnType<CaptureActiveEditorViewState> = {
      key: "key:/c.md",
      viewState: viewState("c")
    };
    const { coordinator, scheduler, transport } = setup({
      capture: () => active
    });

    const threeTabs = inputs([
      markdownEditorInput("/a.md", 0),
      markdownEditorInput("/b.md", 1),
      markdownEditorInput("/c.md", 2)
    ]);
    coordinator.updateSessionInputs(threeTabs);

    coordinator.recordEditorViewState("key:/a.md", viewState("a")); // leave A
    coordinator.recordEditorViewState("key:/b.md", viewState("b")); // leave B
    active = { key: "key:/c.md", viewState: viewState("c") };

    scheduler.flush();
    await tick();

    const last = transport.persisted.at(-1)!;
    expect(last.editors.map((e) => e.viewState)).toEqual([
      viewState("a"),
      viewState("b"),
      viewState("c")
    ]);
  });

  it("captures the editor's final View State on close (recorded, then pruned once it leaves the set)", async () => {
    const { coordinator, scheduler, transport } = setup({
      capture: () => null
    });

    coordinator.updateSessionInputs(
      inputs([markdownEditorInput("/a.md", 0), markdownEditorInput("/b.md", 1)])
    );
    // /a.md closes: MarkdownEditor reports its final state at the unmount
    // boundary, then the next inputs no longer reference it.
    coordinator.recordEditorViewState("key:/a.md", viewState("a"));
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md", 0)]));

    scheduler.flush();
    await tick();

    const last = transport.persisted.at(-1)!;
    expect(last.editors).toHaveLength(1);
    expect(last.editors[0]).toMatchObject({ filePath: "/b.md" });
  });

  it("recordEditorViewState is not a per-keystroke path — the caller only invokes it at switch/close", () => {
    // The coordinator has no keystroke input at all; recordEditorViewState
    // is a discrete call. This test documents that contract: N calls == N
    // boundary events, never one-per-character.
    const { coordinator, capture } = setup();
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));

    coordinator.recordEditorViewState("key:/a.md", viewState("a"));
    coordinator.recordEditorViewState("key:/a.md", viewState("b"));

    // No flush yet -> capture/SHA-256 never ran despite two record calls.
    expect(capture).not.toHaveBeenCalled();
  });
});

describe("SessionPersistenceCoordinator — explicit commit boundary (#272 review Blocker 5)", () => {
  it("commitNow persists the given (post-close) inputs immediately, without the debounce", async () => {
    const { coordinator, scheduler, transport } = setup();

    // Pre-close state is pending on the debounce timer.
    coordinator.updateSessionInputs(
      inputs(
        [markdownEditorInput("/proj.md")],
        { projectFilePath: "P", rootPath: "R" }
      )
    );
    expect(scheduler.pendingDelay()).not.toBeNull();
    expect(transport.persisted).toHaveLength(0);

    // Project Close: commit the post-close inputs right now.
    await coordinator.commitNow(inputs([markdownEditorInput("/standalone.md")]));

    expect(transport.persisted).toHaveLength(1);
    expect(transport.persisted[0].projectContext).toBeNull();
    expect(transport.persisted[0].editors).toEqual([
      expect.objectContaining({ filePath: "/standalone.md" })
    ]);
  });

  it("commitNow cancels the pending debounced flush so the pre-close snapshot is never written", async () => {
    const { coordinator, scheduler, transport } = setup();

    coordinator.updateSessionInputs(
      inputs(
        [markdownEditorInput("/proj.md")],
        { projectFilePath: "P", rootPath: "R" }
      )
    );

    await coordinator.commitNow(inputs([markdownEditorInput("/standalone.md")]));
    expect(scheduler.pendingDelay()).toBeNull();

    // Firing a now-stale timer must not resurrect the pre-close snapshot.
    scheduler.flush();
    await tick();

    expect(transport.persisted).toHaveLength(1);
    expect(transport.persisted[0].projectContext).toBeNull();
  });

  it("commitNow REJECTS when the persist fails (durable commit boundary — never swallowed)", async () => {
    const scheduler = manualScheduler();
    let persistShouldFail = true;
    const persisted: RendererSessionSnapshot[] = [];
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: (s) => {
          if (persistShouldFail) {
            return Promise.reject(new Error("disk full"));
          }
          persisted.push(s);
          return Promise.resolve();
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler
    });

    await expect(
      coordinator.commitNow(inputs([markdownEditorInput("/post-close.md")]))
    ).rejects.toThrow("disk full");
    expect(persisted).toHaveLength(0);

    // The coordinator is still usable afterwards (chain not wedged).
    persistShouldFail = false;
    await coordinator.commitNow(inputs([markdownEditorInput("/post-close.md")]));
    expect(persisted).toHaveLength(1);
  });

  it("commitNow resolves without a redundant write when the snapshot is already durable", async () => {
    const { coordinator, transport } = setup();

    const postClose = inputs([markdownEditorInput("/standalone.md")]);
    await coordinator.commitNow(postClose);
    expect(transport.persisted).toHaveLength(1);

    // Same state again -> no second write, still resolves.
    await expect(coordinator.commitNow(postClose)).resolves.toBeUndefined();
    expect(transport.persisted).toHaveLength(1);
  });

  it("dropFromRestoreSet resolves once the transport confirms removal", async () => {
    const { coordinator, transport } = setup();
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));

    await expect(coordinator.dropFromRestoreSet()).resolves.toBeUndefined();
    expect(transport.dropped).toEqual([SESSION_ID]);
  });

  it("dropFromRestoreSet rejects when the transport fails (caller can decline the close)", async () => {
    const scheduler = manualScheduler();
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () => undefined,
        dropFromRestoreSet: () =>
          Promise.reject(new Error("manifest lock unavailable"))
      },
      captureActiveEditorViewState: () => null,
      scheduler
    });
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));

    await expect(coordinator.dropFromRestoreSet()).rejects.toThrow(
      "manifest lock unavailable"
    );
  });

  it("stops persisting only once the drop is durable — keeps persisting if it failed", async () => {
    const scheduler = manualScheduler();
    const persisted: RendererSessionSnapshot[] = [];
    let dropShouldFail = true;
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: (s) => {
          persisted.push(s);
        },
        dropFromRestoreSet: () =>
          dropShouldFail
            ? Promise.reject(new Error("boom"))
            : Promise.resolve()
      },
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));

    // Failed drop → Session is still in the restore set → keep persisting.
    await coordinator.dropFromRestoreSet().catch(() => undefined);
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md")]));
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(1);

    // Successful drop → stop.
    dropShouldFail = false;
    await coordinator.dropFromRestoreSet();
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/c.md")]));
    scheduler.flush();
    await tick();
    expect(persisted).toHaveLength(1);
  });
});

describe("SessionPersistenceCoordinator — caret/selection/scroll-only dirty signal (#272 review Blocker 4)", () => {
  it("markViewStateDirty schedules a coalesced flush but does NO capture / serialize at signal time", () => {
    const { coordinator, scheduler, transport, capture } = setup();

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    const capturesAfterFirstFlush = capture.mock.calls.length;
    const persistsAfterFirstFlush = transport.persisted.length;

    // A burst of pure View-State changes (caret / selection / scroll).
    coordinator.markViewStateDirty();
    coordinator.markViewStateDirty();
    coordinator.markViewStateDirty();

    // Nothing captured or persisted yet — the signal only armed the timer.
    expect(capture.mock.calls.length).toBe(capturesAfterFirstFlush);
    expect(transport.persisted.length).toBe(persistsAfterFirstFlush);
    expect(scheduler.pendingDelay()).not.toBeNull();
  });

  it("a View-State-only change becomes durable: capture runs once, at flush time", async () => {
    let current = viewState("a");
    const { coordinator, scheduler, transport, capture } = setup({
      capture: () => ({ key: "key:/a.md", viewState: current })
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    const persistsBefore = transport.persisted.length;

    // Caret moved → new digest/selection on the next capture.
    current = viewState("b");
    coordinator.markViewStateDirty();
    coordinator.markViewStateDirty();
    const capturesBeforeFlush = capture.mock.calls.length;

    scheduler.flush();
    await tick();

    // Exactly one extra capture (at flush), and one extra persist.
    expect(capture.mock.calls.length).toBe(capturesBeforeFlush + 1);
    expect(transport.persisted.length).toBe(persistsBefore + 1);
  });

  it("rapid dirty signals coalesce into a single flush", async () => {
    let current = viewState("a");
    const { coordinator, scheduler, transport } = setup({
      capture: () => ({ key: "key:/a.md", viewState: current })
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    const persistsBefore = transport.persisted.length;

    current = viewState("b");
    for (let i = 0; i < 50; i += 1) {
      coordinator.markViewStateDirty();
    }
    scheduler.flush();
    await tick();

    expect(transport.persisted.length).toBe(persistsBefore + 1);
  });

  it("a SUSPENDED coordinator ignores the dirty signal — no scheduling, no I/O", () => {
    const { coordinator, scheduler, transport } = setup();

    coordinator.suspendFromStorageFailure("diskFull");
    coordinator.markViewStateDirty();

    expect(scheduler.pendingDelay()).toBeNull();
    expect(transport.persisted).toHaveLength(0);
  });
});

describe("SessionPersistenceCoordinator — ordinary vs durableCommit modes (#272 review follow-up 5)", () => {
  it("an ordinary flush QUEUED on the in-flight chain before a SUSPEND does NOT call transport.persist", async () => {
    const scheduler = manualScheduler();
    const persistCalls: string[] = [];
    const rejectABox: { current: ((error: unknown) => void) | null } = {
      current: null
    };
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: (snapshot) => {
          const firstEditor = snapshot.editors[0];
          const label =
            firstEditor?.kind === "standaloneMarkdown"
              ? firstEditor.filePath
              : "?";
          persistCalls.push(label);
          if (label === "/a.md") {
            return new Promise<void>((_resolve, reject) => {
              rejectABox.current = reject;
            });
          }
          return Promise.resolve();
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler
    });

    // Flush A starts and is now IN FLIGHT (awaiting transport.persist).
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(persistCalls).toEqual(["/a.md"]);

    // Flush B is queued behind A on `flushInFlight` while A is still pending.
    coordinator.updateSessionInputs(inputs([markdownEditorInput("/b.md")]));
    scheduler.flush();
    await tick();

    // A now fails with a storage-class error → SUSPEND.
    rejectABox.current?.(new SessionStorageFailureError("diskFull"));
    await tick();
    await tick();

    // B reached the front of the chain AFTER the SUSPEND transition and must
    // have skipped transport.persist entirely.
    expect(persistCalls).toEqual(["/a.md"]);
    expect(coordinator.getState()).toBe("suspended");
  });

  it("commitNow (durableCommit) DOES call transport.persist while SUSPENDED and rejects if not durable", async () => {
    const scheduler = manualScheduler();
    const persistCalls: RendererSessionSnapshot[] = [];
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: (snapshot) => {
          persistCalls.push(snapshot);
          return Promise.reject(new SessionStorageFailureError("diskFull"));
        },
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler
    });

    coordinator.updateSessionInputs(inputs([markdownEditorInput("/a.md")]));
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    const callsAfterSuspend = persistCalls.length;

    await expect(
      coordinator.commitNow(inputs([markdownEditorInput("/post-close.md")]))
    ).rejects.toBeInstanceOf(SessionStorageFailureError);

    // The durable commit ran despite SUSPENDED.
    expect(persistCalls.length).toBe(callsAfterSuspend + 1);
  });
});
