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
    const commitCallIndex = closeProjectBlock.indexOf(
      "await commitExplicitProjectClose()",
      tokenIndex
    );
    const resetCallIndex = closeProjectBlock.indexOf(
      "resetRendererProjectAfterExplicitClose(commitBarrierToken)",
      commitCallIndex
    );
    const failedBranchIndex = closeProjectBlock.indexOf(
      "exitLifecycleCommitBarrier(commitBarrierToken)",
      commitCallIndex
    );

    expect(dirtyResolutionIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(dirtyResolutionIndex);
    expect(commitCallIndex).toBeGreaterThan(tokenIndex);
    expect(resetCallIndex).toBeGreaterThan(commitCallIndex);
    expect(failedBranchIndex).toBeGreaterThan(commitCallIndex);
    expect(failedBranchIndex).toBeLessThan(
      closeProjectBlock.indexOf("await showProjectCloseFailedDialog()")
    );
  });
});
