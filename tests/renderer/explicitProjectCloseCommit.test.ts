import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  runExplicitProjectCloseCommit,
  type ExplicitProjectCloseCommitSteps
} from "../../src/renderer/explicitProjectCloseCommit";
import { SessionPersistenceCoordinator } from "../../src/renderer/session/sessionPersistenceCoordinator";
import { SessionStorageFailureError } from "../../src/shared/sessionPersistenceFailure";
import type { SessionSnapshotInputs } from "../../src/renderer/session/sessionSnapshot";
import type { RendererSessionSnapshot } from "../../src/shared/session";

interface StepConfig {
  commitPostCloseError?: Error;
  mainCloseSucceeds?: boolean;
  rollbackError?: Error;
}

function makeSteps(config: StepConfig = {}): {
  steps: ExplicitProjectCloseCommitSteps;
  calls: string[];
} {
  const calls: string[] = [];

  const steps: ExplicitProjectCloseCommitSteps = {
    commitPostCloseSession: async () => {
      calls.push("commitPostCloseSession");
      if (config.commitPostCloseError) {
        throw config.commitPostCloseError;
      }
    },
    closeProjectInMain: async () => {
      calls.push("closeProjectInMain");
      return config.mainCloseSucceeds ?? true;
    },
    rollbackSession: async () => {
      calls.push("rollbackSession");
      if (config.rollbackError) {
        throw config.rollbackError;
      }
    },
    applyRendererPostCloseState: () => {
      calls.push("applyRendererPostCloseState");
    },
    exitCommitBarrier: () => {
      calls.push("exitCommitBarrier");
    }
  };

  return { steps, calls };
}

describe("runExplicitProjectCloseCommit (#272 review — durable commit boundary)", () => {
  it("normal success: post-close Session commit → main close → renderer post-close state", async () => {
    const { steps, calls } = makeSteps();

    const result = await runExplicitProjectCloseCommit(steps);

    expect(result).toEqual({ status: "closed" });
    expect(calls).toEqual([
      "commitPostCloseSession",
      "closeProjectInMain",
      "applyRendererPostCloseState"
    ]);
    expect(calls).not.toContain("rollbackSession");
    // Barrier handed to the renderer reset, not released here.
    expect(calls).not.toContain("exitCommitBarrier");
  });

  it("post-close Session commit FAILS → main Project Close is NEVER called, Project state kept", async () => {
    const { steps, calls } = makeSteps({
      commitPostCloseError: new Error("disk full")
    });

    const result = await runExplicitProjectCloseCommit(steps);

    expect(result).toEqual({
      status: "sessionCommitFailed",
      error: new Error("disk full")
    });
    expect(calls).not.toContain("closeProjectInMain");
    expect(calls).not.toContain("applyRendererPostCloseState");
    // Commit barrier released; close is not a success.
    expect(calls).toEqual(["commitPostCloseSession", "exitCommitBarrier"]);
  });

  it("main Project Close FAILS after Session pre-commit → rollback awaited, runtime Project kept", async () => {
    const { steps, calls } = makeSteps({ mainCloseSucceeds: false });

    const result = await runExplicitProjectCloseCommit(steps);

    expect(result).toEqual({ status: "mainCloseFailed", rolledBack: true });
    expect(calls).toEqual([
      "commitPostCloseSession",
      "closeProjectInMain",
      "rollbackSession",
      "exitCommitBarrier"
    ]);
    // Renderer never moved to post-close state (Project still open in main).
    expect(calls).not.toContain("applyRendererPostCloseState");
  });

  it("rollback ALSO fails → explicit failure result, never swallowed / never success", async () => {
    const { steps, calls } = makeSteps({
      mainCloseSucceeds: false,
      rollbackError: new Error("rollback write failed")
    });

    const result = await runExplicitProjectCloseCommit(steps);

    expect(result).toEqual({
      status: "mainCloseFailed",
      rolledBack: false,
      rollbackError: new Error("rollback write failed")
    });
    expect(calls).toEqual([
      "commitPostCloseSession",
      "closeProjectInMain",
      "rollbackSession",
      "exitCommitBarrier"
    ]);
    expect(calls).not.toContain("applyRendererPostCloseState");
  });

  it("reports success ONLY when post-close Session commit AND main close both succeeded", async () => {
    const cases: StepConfig[] = [
      { commitPostCloseError: new Error("x") }, // session commit fails
      { commitPostCloseError: new Error("x"), mainCloseSucceeds: false },
      { mainCloseSucceeds: false } // main close fails
    ];

    for (const config of cases) {
      const { steps } = makeSteps(config);
      const result = await runExplicitProjectCloseCommit(steps);
      expect(result.status).not.toBe("closed");
    }

    const { steps } = makeSteps({ mainCloseSucceeds: true });
    expect((await runExplicitProjectCloseCommit(steps)).status).toBe("closed");
  });
});

describe("end-to-end: Project Close SUCCESS ⇒ durable Session is post-close (#272 review)", () => {
  const postCloseInputs: SessionSnapshotInputs = {
    sessionId: "0190a000-0000-7000-8000-0000000000c1",
    projectContext: null,
    editors: [
      {
        editor: {
          kind: "standaloneMarkdown",
          order: 0,
          filePath: "/kept.md",
          viewState: null
        },
        viewStateKey: null
      }
    ],
    activeEditor: null
  };

  function coordinatorWith(persist: (s: RendererSessionSnapshot) => Promise<void>) {
    return new SessionPersistenceCoordinator({
      sessionId: postCloseInputs.sessionId,
      transport: { persist, dropFromRestoreSet: () => undefined },
      captureActiveEditorViewState: () => null,
      scheduler: {
        schedule: () => 0,
        cancel: () => undefined
      }
    });
  }

  it("real coordinator: a failed post-close persist blocks the main Project Close", async () => {
    const persisted: RendererSessionSnapshot[] = [];
    let fail = true;
    const coordinator = coordinatorWith((s) => {
      if (fail) return Promise.reject(new Error("offline"));
      persisted.push(s);
      return Promise.resolve();
    });

    const mainClosed: string[] = [];
    const result = await runExplicitProjectCloseCommit({
      commitPostCloseSession: () => coordinator.commitNow(postCloseInputs),
      closeProjectInMain: async () => {
        mainClosed.push("called");
        return true;
      },
      rollbackSession: () => coordinator.commitNow(postCloseInputs),
      applyRendererPostCloseState: () => undefined,
      exitCommitBarrier: () => undefined
    });

    expect(result.status).toBe("sessionCommitFailed");
    expect(mainClosed).toEqual([]); // main Project Close never invoked
    expect(persisted).toEqual([]);

    // And once persistence works, the close proceeds and the durable Session
    // is the post-close one.
    fail = false;
    const ok = await runExplicitProjectCloseCommit({
      commitPostCloseSession: () => coordinator.commitNow(postCloseInputs),
      closeProjectInMain: async () => true,
      rollbackSession: () => coordinator.commitNow(postCloseInputs),
      applyRendererPostCloseState: () => undefined,
      exitCommitBarrier: () => undefined
    });

    expect(ok).toEqual({ status: "closed" });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].projectContext).toBeNull();
    expect(persisted[0].editors).toEqual([
      expect.objectContaining({ filePath: "/kept.md" })
    ]);
  });

  it("a SUSPENDED coordinator still blocks Project Close when the durable commit fails (#272 PO decision)", async () => {
    const suspensions: string[] = [];
    const coordinator = new SessionPersistenceCoordinator({
      sessionId: postCloseInputs.sessionId,
      transport: {
        persist: () =>
          Promise.reject(new SessionStorageFailureError("diskFull")),
        dropFromRestoreSet: () => undefined
      },
      captureActiveEditorViewState: () => null,
      scheduler: { schedule: () => 0, cancel: () => undefined },
      onSuspended: (r) => suspensions.push(r)
    });

    // First: an automatic flush fails → coordinator SUSPENDS.
    coordinator.updateSessionInputs(postCloseInputs);
    await coordinator.flushNow().catch(() => undefined);

    const mainClosed: string[] = [];
    const result = await runExplicitProjectCloseCommit({
      // The explicit commit boundary STILL attempts the durable write even
      // though continuous persistence is SUSPENDED...
      commitPostCloseSession: () => coordinator.commitNow(postCloseInputs),
      closeProjectInMain: async () => {
        mainClosed.push("called");
        return true;
      },
      rollbackSession: () => coordinator.commitNow(postCloseInputs),
      applyRendererPostCloseState: () => undefined,
      exitCommitBarrier: () => undefined
    });

    // ...and because it cannot be made durable, the Project is NOT closed.
    expect(result.status).toBe("sessionCommitFailed");
    expect(mainClosed).toEqual([]);
    expect(suspensions).toEqual(["diskFull"]);
  });
});

describe("explicit Project Close never swallows Session persistence failure (#272 review regression guard)", () => {
  it("App.tsx has no `commitNow(...).catch(...)` swallow on the Project Close path", () => {
    const app = readFileSync("src/renderer/App.tsx", "utf8");

    expect(app).not.toMatch(
      /commitNow\([\s\S]{0,200}?\)\s*\.catch\(/
    );
  });

  it("the commit helper propagates every failure as a typed non-success result", () => {
    const helper = readFileSync(
      "src/renderer/explicitProjectCloseCommit.ts",
      "utf8"
    );
    expect(helper).not.toMatch(/\.catch\(/);
  });
});
