import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync("src/renderer/App.tsx", "utf8");
}

function sourceBlock(
  source: string,
  startNeedle: string,
  endNeedle: string
): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe("renderer lifecycle commit barrier wiring (#271)", () => {
  it("blocks Markdown and Glossary draft mutation through their App ingress guards", () => {
    const source = appSource();
    const markdownBlock = sourceBlock(
      source,
      "function setActiveDocumentContent",
      "function updateActiveGlossaryDraft"
    );
    const glossaryDraftBlock = sourceBlock(
      source,
      "function updateActiveGlossaryDraft",
      "function setActiveGlossaryEntryDescription"
    );

    expect(markdownBlock.indexOf("if (!canMutateActiveWorkingCopy())")).toBeLessThan(
      markdownBlock.indexOf("updateActiveOpenDocument")
    );
    expect(
      glossaryDraftBlock.indexOf("if (!canMutateActiveWorkingCopy())")
    ).toBeLessThan(glossaryDraftBlock.indexOf("updateActiveOpenEditor"));
  });

  it("blocks registry-routed commands at the existing modal execution blocker", () => {
    const source = appSource();
    const blockerBlock = sourceBlock(
      source,
      "registry.setCommandExecutionBlocker(",
      "registry.setOnCommandIgnored("
    );

    expect(blockerBlock).toContain("isLifecycleCommitBarrierActiveNow()");
    expect(blockerBlock).toContain("dialogController.getPendingRequest()");
    expect(blockerBlock).toContain('"app_modal_open"');
  });

  it("updates Glossary save state through the synchronous open documents ref", () => {
    const source = appSource();
    const saveGlossaryBlock = sourceBlock(
      source,
      "async function saveGlossaryEntryByEditorId(",
      "async function deleteActiveGlossaryEntry()"
    );
    const savingStateIndex = saveGlossaryBlock.indexOf(
      "const savingState = updateOpenEditor(\n      openDocumentsStateRef.current,"
    );
    const savingRefIndex = saveGlossaryBlock.indexOf(
      "openDocumentsStateRef.current = savingState",
      savingStateIndex
    );
    const savingSetStateIndex = saveGlossaryBlock.indexOf(
      "setOpenDocumentsState(savingState)",
      savingRefIndex
    );
    const savedStateIndex = saveGlossaryBlock.indexOf(
      "const savedState = updateOpenEditor(\n        openDocumentsStateRef.current,"
    );
    const savedRefIndex = saveGlossaryBlock.indexOf(
      "openDocumentsStateRef.current = savedState",
      savedStateIndex
    );
    const savedSetStateIndex = saveGlossaryBlock.indexOf(
      "setOpenDocumentsState(savedState)",
      savedRefIndex
    );
    const failedStateIndex = saveGlossaryBlock.indexOf(
      "const failedState = updateOpenEditor(\n        openDocumentsStateRef.current,"
    );
    const failedRefIndex = saveGlossaryBlock.indexOf(
      "openDocumentsStateRef.current = failedState",
      failedStateIndex
    );
    const failedSetStateIndex = saveGlossaryBlock.indexOf(
      "setOpenDocumentsState(failedState)",
      failedRefIndex
    );

    expect(saveGlossaryBlock).not.toContain("setOpenDocumentsState((state)");
    expect(savingStateIndex).toBeGreaterThan(-1);
    expect(savingRefIndex).toBeGreaterThan(savingStateIndex);
    expect(savingSetStateIndex).toBeGreaterThan(savingRefIndex);
    expect(savedStateIndex).toBeGreaterThan(-1);
    expect(savedRefIndex).toBeGreaterThan(savedStateIndex);
    expect(savedSetStateIndex).toBeGreaterThan(savedRefIndex);
    expect(failedStateIndex).toBeGreaterThan(-1);
    expect(failedRefIndex).toBeGreaterThan(failedStateIndex);
    expect(failedSetStateIndex).toBeGreaterThan(failedRefIndex);
  });

  it("uses the barrier token returned by dirty resolution for Project Close commit", () => {
    const source = appSource();
    const resolveDirtyBlock = sourceBlock(
      source,
      "async function resolveDirtyForLifecycle(",
      "function resetRendererProjectAfterExplicitClose("
    );
    const resetBlock = sourceBlock(
      source,
      "function resetRendererProjectAfterExplicitClose(",
      "async function commitExplicitProjectClose()"
    );
    const closeProjectBlock = sourceBlock(
      source,
      "async function closeProject()",
      "async function handleLifecycleWindowCloseRequest("
    );
    const dirtyResolutionIndex = closeProjectBlock.indexOf(
      "const dirtyResolution = await resolveDirtyForLifecycle("
    );
    const tokenIndex = closeProjectBlock.indexOf(
      "const commitBarrierToken = dirtyResolution.commitBarrierToken",
      dirtyResolutionIndex
    );
    // #272 review: the commit is orchestrated by runExplicitProjectCloseCommit,
    // which receives the barrier token through its step closures.
    const commitIndex = closeProjectBlock.indexOf(
      "await runExplicitProjectCloseCommit({",
      tokenIndex
    );
    const resetIndex = closeProjectBlock.indexOf(
      "resetRendererProjectAfterExplicitClose(commitBarrierToken)",
      commitIndex
    );
    const failureExitIndex = closeProjectBlock.indexOf(
      "exitLifecycleCommitBarrier(commitBarrierToken)",
      commitIndex
    );
    const operationResetIndex = closeProjectBlock.indexOf(
      "lifecycleOperationInProgressRef.current = false",
      failureExitIndex
    );
    const failureDialogIndex = closeProjectBlock.indexOf(
      "await showProjectCloseFailedDialog()",
      operationResetIndex
    );

    expect(closeProjectBlock).toContain("isLifecycleCommitBarrierActiveNow()");
    expect(resolveDirtyBlock).toContain(
      "Promise<DirtyWorkingCopyResolutionResult>"
    );
    expect(resolveDirtyBlock).toContain(
      "enterCommitBarrier: enterLifecycleCommitBarrier"
    );
    expect(resetBlock).toContain(
      "commitBarrierToken: LifecycleCommitBarrierToken"
    );
    expect(resetBlock).toContain(
      "projectCloseBarrierReleaseAfterCommitRef.current = commitBarrierToken"
    );
    expect(resetBlock).toContain("removeProjectScopedOpenEditors(");
    expect(resetBlock).toContain("setProject(null)");
    expect(dirtyResolutionIndex).toBeGreaterThan(-1);
    expect(tokenIndex).toBeGreaterThan(dirtyResolutionIndex);
    expect(commitIndex).toBeGreaterThan(tokenIndex);
    expect(resetIndex).toBeGreaterThan(commitIndex);
    expect(failureExitIndex).toBeGreaterThan(commitIndex);
    expect(operationResetIndex).toBeGreaterThan(failureExitIndex);
    expect(failureDialogIndex).toBeGreaterThan(operationResetIndex);
  });

  it("keeps Window Close and Quit barriers after successful commit requests and exits on IPC failure", () => {
    const source = appSource();
    const windowCloseBlock = sourceBlock(
      source,
      "async function handleLifecycleWindowCloseRequest(",
      "async function quitApplication()"
    );
    const quitBlock = sourceBlock(
      source,
      "async function quitApplication()",
      "async function reloadSettingsAfterProjectOpen()"
    );
    const windowTokenIndex = windowCloseBlock.indexOf(
      "commitBarrierToken = dirtyResolution.commitBarrierToken"
    );
    const windowRespondIndex = windowCloseBlock.indexOf(
      "window.pergamum.lifecycle.respondWindowCloseRequest(decision)",
      windowTokenIndex
    );
    const windowExitIndex = windowCloseBlock.indexOf(
      "exitLifecycleCommitBarrier(commitBarrierToken)",
      windowRespondIndex
    );
    const quitTokenIndex = quitBlock.indexOf(
      "const commitBarrierToken = dirtyResolution.commitBarrierToken"
    );
    const quitRequestIndex = quitBlock.indexOf(
      "window.pergamum.lifecycle.quitApplication({",
      quitTokenIndex
    );
    const quitExitIndex = quitBlock.indexOf(
      "exitLifecycleCommitBarrier(commitBarrierToken)",
      quitRequestIndex
    );

    expect(windowTokenIndex).toBeGreaterThan(-1);
    expect(windowRespondIndex).toBeGreaterThan(windowTokenIndex);
    expect(windowExitIndex).toBeGreaterThan(windowRespondIndex);
    expect(quitTokenIndex).toBeGreaterThan(-1);
    expect(quitRequestIndex).toBeGreaterThan(quitTokenIndex);
    expect(quitExitIndex).toBeGreaterThan(quitRequestIndex);
  });
});
