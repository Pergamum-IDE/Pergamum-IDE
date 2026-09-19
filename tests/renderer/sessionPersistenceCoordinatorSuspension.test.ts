import { describe, expect, it } from "vitest";
import {
  SessionPersistenceCoordinator,
  SESSION_PERSISTENCE_SLOW_IO_THRESHOLD_MS,
  type SessionPersistenceScheduler
} from "../../src/renderer/session/sessionPersistenceCoordinator";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { RendererSessionSnapshot } from "../../src/shared/session";
import {
  formatSessionPersistenceTechnicalInfo,
  parseSessionLockFailureDetails,
  SessionStorageFailureError,
  SESSION_STORAGE_FAILURE_CODE,
  type SessionStorageFailureReason
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
  onSuspended?: (
    reason: SessionStorageFailureReason,
    details?: { consecutiveFailures?: number; error?: unknown }
  ) => void;
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
    onSuspended: (reason, details) => {
      suspensions.push(reason);
      options?.onSuspended?.(reason, details);
    },
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

  it("transient storage failures require 3 consecutive failures before moving ACTIVE → SUSPENDED", async () => {
    let failCount = 0;
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => {
        failCount += 1;
        return Promise.reject(new SessionStorageFailureError("lockUnavailable"));
      }
    });

    expect(coordinator.getState()).toBe("active");

    // Failure 1 (user input)
    coordinator.updateSessionInputs(inputs("/a.md", 1));
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000); // Pre-SUSPENDED retry timer scheduled

    // Failure 2 (timer retry without user input)
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000);

    // Failure 3 -> SUSPENDED (timer retry without user input)
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["lockUnavailable"]);
  });

  it("resets strike counter and stops pre-SUSPENDED retry timer when a retry succeeds before SUSPENDED", async () => {
    let failCount = 0;
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => {
        failCount += 1;
        if (failCount === 1) {
          return Promise.reject(new SessionStorageFailureError("lockUnavailable"));
        }
        return Promise.resolve();
      }
    });

    coordinator.updateSessionInputs(inputs("/a.md", 1));
    scheduler.flush();
    await tick();

    expect(failCount).toBe(1);
    expect(coordinator.getState()).toBe("active");
    expect(scheduler.pendingDelay()).toBe(2000);

    // Pre-SUSPENDED retry timer fires, second write succeeds
    coordinator.updateSessionInputs(inputs("/b.md", 2));
    scheduler.flush();
    await tick();

    expect(failCount).toBe(2);
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBeNull();
  });

  it("treats slowIo as a transient error requiring 3 consecutive failures before moving ACTIVE → SUSPENDED", async () => {
    let failCount = 0;
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => {
        failCount += 1;
        return Promise.reject(new SessionStorageFailureError("slowIo"));
      }
    });

    expect(coordinator.getState()).toBe("active");

    // Failure 1 (user input) — keeps ACTIVE, schedules pre-SUSPENDED retry
    coordinator.updateSessionInputs(inputs("/a.md", 1));
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000);

    // Failure 2 (timer retry)
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBe(2000);

    // Failure 3 -> SUSPENDED
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["slowIo"]);
  });

  it("resets slowIo strike counter when a write succeeds before 3 failures", async () => {
    let failCount = 0;
    const { coordinator, scheduler, suspensions } = setup({
      persist: () => {
        failCount += 1;
        if (failCount === 1) {
          return Promise.reject(new SessionStorageFailureError("slowIo"));
        }
        return Promise.resolve();
      }
    });

    coordinator.updateSessionInputs(inputs("/slow.md", 1));
    scheduler.flush();
    await tick();

    expect(failCount).toBe(1);
    expect(coordinator.getState()).toBe("active");
    expect(scheduler.pendingDelay()).toBe(2000);

    // Retry succeeds
    coordinator.updateSessionInputs(inputs("/recovered.md", 2));
    scheduler.flush();
    await tick();

    expect(failCount).toBe(2);
    expect(coordinator.getState()).toBe("active");
    expect(suspensions).toEqual([]);
    expect(scheduler.pendingDelay()).toBeNull();
  });

  it("recovers SUSPENDED → ACTIVE when background transient retry succeeds", async () => {
    let fail = true;
    const scheduler = manualScheduler();
    const suspensions: string[] = [];
    let recoveredCount = 0;

    const coordinator = new SessionPersistenceCoordinator({
      sessionId: SESSION_ID,
      transport: {
        persist: () =>
          fail
            ? Promise.reject(new SessionStorageFailureError("lockUnavailable"))
            : Promise.resolve(),
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler,
      onSuspended: (r) => suspensions.push(r),
      onResumed: () => {
        recoveredCount += 1;
      },
      transientRetryIntervalMs: 1_000
    });

    // Cause 3 failures to trigger suspension
    for (let i = 1; i <= 3; i++) {
      coordinator.updateSessionInputs(inputs("/a.md", i));
      scheduler.flush();
      await tick();
    }
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["lockUnavailable"]);

    // Fix the transient issue
    fail = false;

    // Fast-forward retry timer (1000ms)
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("active");
    expect(recoveredCount).toBe(1);
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

  it("suspendFromStorageFailure() (main-driven) suspends; idempotent for same reason, notifies on reason change", () => {
    const { coordinator, suspensions } = setup();
    coordinator.suspendFromStorageFailure("diskFull");
    coordinator.suspendFromStorageFailure("diskFull");
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["diskFull"]);

    coordinator.suspendFromStorageFailure("ioError");
    expect(suspensions).toEqual(["diskFull", "ioError"]);
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

    // Strike 1
    scheduler.flush(); // 1st slow-I/O timer fires (strike 1/3)
    await tick();
    expect(coordinator.getState()).toBe("active");

    // Strike 2
    scheduler.flush(); // preSuspendRetryTimer fires → attemptPreSuspendRetry
    await tick();
    scheduler.flush(); // 2nd slow-I/O timer fires (strike 2/3)
    await tick();
    expect(coordinator.getState()).toBe("active");

    // Strike 3
    scheduler.flush(); // preSuspendRetryTimer fires → attemptPreSuspendRetry
    await tick();
    scheduler.flush(); // 3rd slow-I/O timer fires (strike 3/3 → SUSPENDED)
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
    scheduler.flush();
    await tick();
    expect(coordinator.getState()).toBe("active"); // recovered after in-flight slow write succeeded
    expect(persistCount).toBe(2); // debounced inputs flushed after recovery
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
    scheduler.flush(); // debounce → persist starts
    await tick();
    // Strike 1
    scheduler.flush(); // 1st slow-io
    await tick();
    // Strike 2
    scheduler.flush(); // preSuspendRetryTimer
    await tick();
    scheduler.flush(); // 2nd slow-io
    await tick();
    // Strike 3
    scheduler.flush(); // preSuspendRetryTimer
    await tick();
    scheduler.flush(); // 3rd slow-io → SUSPENDED, in-flight promise retained
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

  it("passes the rejected Error object to onSuspended in details.error when moving ACTIVE → SUSPENDED", async () => {
    let capturedDetails:
      | { consecutiveFailures?: number; error?: unknown }
      | undefined;
    const persistError = new SessionStorageFailureError(
      "lockUnavailable",
      JSON.stringify({
        dirMtimeMs: 1726710900000,
        markerCount: 1,
        markers: [{ pid: 99999, acquiredAt: 1726710900000 }]
      })
    );

    const { coordinator, scheduler } = setup({
      persist: () => Promise.reject(persistError),
      onSuspended: (_reason, details) => {
        capturedDetails = details;
      }
    });

    coordinator.updateSessionInputs(inputs("/a.md", 1));
    scheduler.flush();
    await tick(); // 1st failure

    scheduler.flush();
    await tick(); // 2nd failure

    scheduler.flush();
    await tick(); // 3rd failure → SUSPENDED

    expect(coordinator.getState()).toBe("suspended");
    expect(capturedDetails).toBeDefined();
    expect(capturedDetails?.consecutiveFailures).toBe(3);
    expect(capturedDetails?.error).toBe(persistError);
  });

  it("end-to-end: passes Main error through Coordinator to onSuspended and formats lock diagnostics in copy technical info", async () => {
    const mainIpcError = new Error(
      `Error invoking remote method 'session:persistSession': Error: PERGAMUM_SESSION_STORAGE_FAILURE:lockUnavailable: ${JSON.stringify({
        lockDirPath: "C:\\secret\\sessions\\manifest.lock",
        dirMtimeMs: 1726710900000,
        markerCount: 1,
        markers: [
          {
            token: "secret-token",
            pid: 99999,
            hostname: "secret-pc",
            acquiredAt: 1726710900000
          }
        ]
      })}`
    );

    let suspendedReason: string | undefined;
    let suspendedDetails: { consecutiveFailures?: number; error?: unknown } | undefined;

    const { coordinator, scheduler } = setup({
      persist: () => Promise.reject(mainIpcError),
      onSuspended: (reason, details) => {
        suspendedReason = reason;
        suspendedDetails = details;
      }
    });

    coordinator.updateSessionInputs(inputs("/doc.md", 1));
    scheduler.flush();
    await tick(); // 1st failure
    scheduler.flush();
    await tick(); // 2nd failure
    scheduler.flush();
    await tick(); // 3rd failure → SUSPENDED

    expect(coordinator.getState()).toBe("suspended");
    expect(suspendedReason).toBe("lockUnavailable");
    expect(suspendedDetails?.error).toBe(mainIpcError);

    // Replicate App.tsx showSessionPersistenceSuspendedDialog formatting:
    const lockDetails = suspendedDetails?.error
      ? parseSessionLockFailureDetails(suspendedDetails.error)
      : null;

    const technicalInfo = formatSessionPersistenceTechnicalInfo({
      timestamp: "2026-09-19T11:00:00.000Z",
      appVersion: "0.80.0",
      reason: "lockUnavailable",
      consecutiveFailures: suspendedDetails?.consecutiveFailures ?? 1,
      lockDetails
    });

    expect(technicalInfo).toContain("Pergamum Session Persistence Failure");
    expect(technicalInfo).toContain("Reason: lockUnavailable");
    expect(technicalInfo).toContain("Consecutive Failures: 3");
    expect(technicalInfo).toContain("Lock Dir mtime: 2024-09-19T01:55:00.000Z (1726710900000)");
    expect(technicalInfo).toContain("Marker Count: 1");
    expect(technicalInfo).toContain("Marker #1: pid=99999, acquiredAt=2024-09-19T01:55:00.000Z (1726710900000)");

    // Sensitive info excluded
    expect(technicalInfo).not.toContain("secret-pc");
    expect(technicalInfo).not.toContain("manifest.lock");
    expect(technicalInfo).not.toContain("secret-token");
  });

  it("end-to-end: non-lockUnavailable failures propagate error but omit lock diagnostics lines from technical info", async () => {
    const mainIpcError = new Error(
      "Error invoking remote method 'session:persistSession': Error: PERGAMUM_SESSION_STORAGE_FAILURE:manifestNotMutable: present manifest cannot be safely overwritten"
    );

    let suspendedReason: string | undefined;
    let suspendedDetails: { consecutiveFailures?: number; error?: unknown } | undefined;

    const { coordinator, scheduler } = setup({
      persist: () => Promise.reject(mainIpcError),
      onSuspended: (reason, details) => {
        suspendedReason = reason;
        suspendedDetails = details;
      }
    });

    coordinator.updateSessionInputs(inputs("/doc.md", 1));
    scheduler.flush();
    await tick();

    expect(coordinator.getState()).toBe("suspended");
    expect(suspendedReason).toBe("manifestNotMutable");
    expect(suspendedDetails?.error).toBe(mainIpcError);

    const lockDetails = suspendedDetails?.error
      ? parseSessionLockFailureDetails(suspendedDetails.error)
      : null;

    const technicalInfo = formatSessionPersistenceTechnicalInfo({
      timestamp: "2026-09-19T11:00:00.000Z",
      appVersion: "0.80.0",
      reason: "manifestNotMutable",
      consecutiveFailures: suspendedDetails?.consecutiveFailures ?? 1,
      lockDetails
    });

    expect(technicalInfo).toContain("Reason: manifestNotMutable");
    expect(technicalInfo).toContain("Consecutive Failures: 1");
    expect(technicalInfo).not.toContain("Lock Dir mtime");
    expect(technicalInfo).not.toContain("Marker Count");
    expect(technicalInfo).not.toContain("Marker #");
  });

  it("notifies onSuspended again if a DIFFERENT failure code occurs while already suspended (without needing onResumed)", () => {
    const { coordinator, suspensions } = setup();

    coordinator.suspendFromStorageFailure("manifestNotMutable");
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["manifestNotMutable"]);

    // Subsequent failure with same reason while suspended -> suppressed
    coordinator.suspendFromStorageFailure("manifestNotMutable");
    expect(suspensions).toEqual(["manifestNotMutable"]);

    // Subsequent failure with different reason while suspended -> notifies new reason
    coordinator.suspendFromStorageFailure("diskFull");
    expect(coordinator.getState()).toBe("suspended");
    expect(suspensions).toEqual(["manifestNotMutable", "diskFull"]);
  });
});

