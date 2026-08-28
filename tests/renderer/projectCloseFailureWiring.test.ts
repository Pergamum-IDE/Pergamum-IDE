import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("renderer explicit project close failure wiring (#271)", () => {
  it("keeps renderer project state when main closeCurrentProject returns failed", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const resetStart = source.indexOf(
      "function resetRendererProjectAfterExplicitClose("
    );
    const commitStart = source.indexOf(
      "async function commitExplicitProjectClose()",
      resetStart
    );
    const closeProjectStart = source.indexOf(
      "async function closeProject()",
      commitStart
    );
    const windowCloseStart = source.indexOf(
      "async function handleLifecycleWindowCloseRequest(",
      closeProjectStart
    );

    expect(resetStart).toBeGreaterThan(-1);
    expect(commitStart).toBeGreaterThan(resetStart);
    expect(closeProjectStart).toBeGreaterThan(commitStart);
    expect(windowCloseStart).toBeGreaterThan(closeProjectStart);

    const resetBlock = source.slice(resetStart, commitStart);
    const commitBlock = source.slice(commitStart, closeProjectStart);
    const closeProjectBlock = source.slice(closeProjectStart, windowCloseStart);
    const failedResultIndex = commitBlock.indexOf(
      'if (result.status === "failed")'
    );

    expect(resetBlock).toContain("removeProjectScopedOpenEditors(");
    expect(resetBlock).toContain("setProject(null)");
    expect(commitBlock).toContain(
      "window.pergamum.projects.closeCurrentProject({"
    );
    expect(failedResultIndex).toBeGreaterThan(-1);
    expect(commitBlock.slice(failedResultIndex)).toContain(
      'key: "status.projectCloseFailed"'
    );
    expect(commitBlock.slice(failedResultIndex)).toContain("return false;");
    expect(commitBlock.slice(failedResultIndex)).not.toContain(
      "resetRendererProjectAfterExplicitClose()"
    );

    const dirtyResolutionIndex = closeProjectBlock.indexOf(
      "const dirtyResolution = await resolveDirtyForLifecycle("
    );
    const tokenIndex = closeProjectBlock.indexOf(
      "const commitBarrierToken = dirtyResolution.commitBarrierToken",
      dirtyResolutionIndex
    );
    // #272 review: the ordering / failure semantics now live in
    // runExplicitProjectCloseCommit; closeProject wires the steps.
    const runCommitIndex = closeProjectBlock.indexOf(
      "await runExplicitProjectCloseCommit({",
      tokenIndex
    );
    const commitPostCloseIndex = closeProjectBlock.indexOf(
      "commitPostCloseSession:",
      runCommitIndex
    );
    const closeInMainIndex = closeProjectBlock.indexOf(
      "closeProjectInMain: () => commitExplicitProjectClose()",
      runCommitIndex
    );
    const applyRendererIndex = closeProjectBlock.indexOf(
      "resetRendererProjectAfterExplicitClose(commitBarrierToken)",
      runCommitIndex
    );

    expect(dirtyResolutionIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(dirtyResolutionIndex);
    expect(runCommitIndex).toBeGreaterThan(tokenIndex);
    // post-close Session commit is wired as the first step.
    expect(commitPostCloseIndex).toBeGreaterThan(runCommitIndex);
    expect(commitPostCloseIndex).toBeLessThan(closeInMainIndex);
    expect(closeInMainIndex).toBeGreaterThan(-1);
    // renderer post-close state is only applied via applyRendererPostCloseState.
    expect(applyRendererIndex).toBeGreaterThan(-1);
    expect(closeProjectBlock).toContain(
      "applyRendererPostCloseState: () =>"
    );

    // runExplicitProjectCloseCommit itself: renderer post-close state is
    // applied ONLY on a successful main close, and the barrier is released
    // on every non-success outcome.
    const helper = readFileSync(
      "src/renderer/explicitProjectCloseCommit.ts",
      "utf8"
    );
    const commitPostClose = helper.indexOf("await steps.commitPostCloseSession()");
    const sessionFailReturn = helper.indexOf(
      'return { status: "sessionCommitFailed"'
    );
    const closeInMain = helper.indexOf("await steps.closeProjectInMain()");
    const applyRenderer = helper.indexOf(
      "steps.applyRendererPostCloseState()"
    );
    const rollback = helper.indexOf("await steps.rollbackSession()");

    expect(commitPostClose).toBeGreaterThan(-1);
    expect(sessionFailReturn).toBeGreaterThan(commitPostClose);
    expect(closeInMain).toBeGreaterThan(sessionFailReturn);
    expect(applyRenderer).toBeGreaterThan(closeInMain);
    expect(rollback).toBeGreaterThan(closeInMain);
    // The session-commit-failure early return happens BEFORE closeProjectInMain.
    expect(sessionFailReturn).toBeLessThan(closeInMain);
  });
});
