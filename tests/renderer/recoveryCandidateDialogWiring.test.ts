import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync("src/renderer/App.tsx", "utf8");

describe("Recovery candidate dialog wiring (#287)", () => {
  it("routes recovery.documents.show through the command registry into openRecoveryCandidateDialog", () => {
    expect(appSource).toContain("registerRecoveryCommands(");
    expect(appSource).toContain(
      "showRecoveryDocuments: () => showRecoveryDocumentsCommandRef.current()"
    );
    expect(appSource).toContain(
      "showRecoveryDocumentsCommandRef.current = () => {"
    );
    expect(appSource).toContain("void openRecoveryCandidateDialog();");
    expect(appSource).toContain("<RecoveryCandidateDialog");
  });

  it("is an app-modal command blocker without going through the confirm/choice controller", () => {
    const blockerBlock = appSource.slice(
      appSource.indexOf("registry.setCommandExecutionBlocker("),
      appSource.indexOf("registry.setOnCommandIgnored(")
    );
    expect(blockerBlock).toContain(
      "isRecoveryCandidateDialogPendingOrOpenRef.current"
    );
    // The dialog is built on InfoDialog, not routed through DialogController.
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    expect(dialogFile).toContain('from "../dialog/InfoDialog"');
    expect(dialogFile).not.toMatch(/DialogController|dialogController/);
  });

  it("gates the show-documents command on both recovery.owner and previous-run candidate availability (#288)", () => {
    const recoveryCommandsSource = readFileSync(
      "src/renderer/recovery/recoveryCommands.ts",
      "utf8"
    );
    // The command's `when` requires BOTH keys — owner alone is true for a
    // clean run and would surface the current run's own dirty backups.
    expect(recoveryCommandsSource).toMatch(
      /allOf:\s*\[[^\]]*"recovery\.owner"[^\]]*"recovery\.hasRecoverableCandidates"/s
    );

    // App publishes the availability into the command context snapshot…
    expect(appSource).toMatch(
      /buildCommandContextSnapshot\(\{[\s\S]*recoveryHasRecoverableCandidates[\s\S]*\}\)/
    );
    expect(appSource).toContain(
      "recoveryOwner: recoveryStoreStatusKind === \"owner\","
    );
    // …fed from a dedicated main-side check (not renderer-side hiding).
    expect(appSource).toContain(
      "window.pergamum.recovery.hasRecoverableCandidates()"
    );
  });

  it("refreshes previous-run candidate availability after store init, listing, restore, and each Recovery backup persist (#288)", () => {
    // A once-created coordinator callback triggers the latest refresh via a ref.
    expect(appSource).toContain(
      "void recoveryHasRecoverableRefreshRef.current();"
    );
    const onPersisted = appSource.slice(
      appSource.indexOf("onPersisted: () => {"),
      appSource.indexOf(
        "const recoveryPayloadCoordinator =",
        appSource.indexOf("onPersisted: () => {")
      )
    );
    expect(onPersisted).toContain('setStatus({ key: "status.recoveryBackupSaved" });');
    expect(onPersisted).toContain(
      "void recoveryHasRecoverableRefreshRef.current();"
    );

    // Store-status resolution seeds it; restore/finalize re-checks it.
    const storeStatusStart = appSource.indexOf(".getStoreStatus()");
    const storeStatusEffect = appSource.slice(
      storeStatusStart,
      appSource.indexOf(".catch(() => {", storeStatusStart)
    );
    expect(storeStatusEffect).toContain(
      "void recoveryHasRecoverableRefreshRef.current();"
    );
    const restoreFn = appSource.slice(
      appSource.indexOf("async function handleRecoveryRestoreSelected"),
      appSource.indexOf("async function getRecoveryReportTextForDialog")
    );
    expect(restoreFn).toContain(
      "await refreshRecoveryHasRecoverableCandidates();"
    );

    // Listing the (already previous-run-only) candidates keeps the key in sync.
    expect(appSource).toContain(
      "setRecoveryHasRecoverableCandidates(result.candidates.length > 0)"
    );
  });

  it("gates the startup auto-show on owner + settled cold start + no open modal, once per process", () => {
    const effect = appSource.slice(
      appSource.indexOf("one-shot startup auto-show of the Recovery candidate"),
      appSource.indexOf("createProjectCommandRef.current = createProject;")
    );
    expect(effect).toContain("recoveryAutoShowAttemptedRef.current");
    expect(effect).toContain('recoveryStoreStatusKind !== "owner"');
    expect(effect).toContain("!coldStartRestoreSettled");
    expect(effect).toContain("!coldStartMarkdownLaunchRoutingSettled");
    expect(effect).toContain("!deferredRestoreErrorDialogsReadyRef.current");
    expect(effect).toContain("isAppModalSurfacePendingOrOpen");
    expect(effect).toContain("recoveryAutoShowAttemptedRef.current = true;");
    expect(effect).toContain("result.candidates.length > 0");
  });

  it("only opens the dialog for the Recovery owner", () => {
    const openFn = appSource.slice(
      appSource.indexOf("async function openRecoveryCandidateDialog"),
      appSource.indexOf("function closeRecoveryCandidateDialog")
    );
    expect(openFn).toContain('recoveryStoreStatusKind !== "owner"');
    expect(openFn).toContain("window.pergamum.recovery.listCandidates()");
  });

  it("close never deletes / finalizes a Recovery row", () => {
    const closeFn = appSource.slice(
      appSource.indexOf("function closeRecoveryCandidateDialog"),
      appSource.indexOf("async function refreshRecoveryCandidateDialog")
    );
    expect(closeFn).not.toMatch(
      /discardCandidates|finalizeRestoredCandidates|deleteDocument/
    );
  });

  it("the candidate dialog has no destructive discard wiring", () => {
    // #287 follow-up: the dialog is recover-or-close only.
    const dialogJsx = appSource.slice(
      appSource.indexOf("<RecoveryCandidateDialog"),
      appSource.indexOf("/>", appSource.indexOf("<RecoveryCandidateDialog"))
    );
    expect(dialogJsx).not.toContain("onDiscardSelected");
    expect(dialogJsx).not.toContain("confirmDiscard");
    expect(appSource).not.toContain("async function handleRecoveryDiscardSelected");
    expect(appSource).not.toContain("async function confirmRecoveryDiscard");
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    expect(dialogFile).not.toContain("dialog.recovery.discardSelected");
    expect(dialogFile).not.toContain("onDiscardSelected");
  });

  it("restore is two-phase: write, open, then finalize only opened rows", () => {
    const restoreFn = appSource.slice(
      appSource.indexOf("async function handleRecoveryRestoreSelected"),
      appSource.indexOf("async function getRecoveryReportTextForDialog")
    );
    const restoreIdx = restoreFn.indexOf(
      "window.pergamum.recovery.restoreCandidates({"
    );
    const readIdx = restoreFn.indexOf(
      "window.pergamum.files.readMarkdownFile("
    );
    const openIdx = restoreFn.indexOf("await openDocument(createFileDocument(file))");
    const finalizeIdx = restoreFn.indexOf(
      "window.pergamum.recovery.finalizeRestoredCandidates({"
    );
    expect(restoreIdx).toBeGreaterThan(-1);
    expect(readIdx).toBeGreaterThan(restoreIdx);
    expect(openIdx).toBeGreaterThan(readIdx);
    expect(finalizeIdx).toBeGreaterThan(openIdx);
    expect(restoreFn).toContain("recoveryIds: openedIds");
  });

  it("opens an in-project recovered file as a project-owned document, standalone otherwise", () => {
    const restoreFn = appSource.slice(
      appSource.indexOf("async function handleRecoveryRestoreSelected"),
      appSource.indexOf("async function getRecoveryReportTextForDialog")
    );
    // The project-owned branch is gated on the main-supplied
    // projectRelativePath plus an actually-open project.
    const branchIdx = restoreFn.indexOf(
      "written.projectRelativePath && project && activeProjectContext"
    );
    const projectReadIdx = restoreFn.indexOf(
      "window.pergamum.projects.readProjectDocument("
    );
    const projectOpenIdx = restoreFn.indexOf("createProjectDocument(");
    const standaloneReadIdx = restoreFn.indexOf(
      "window.pergamum.files.readMarkdownFile("
    );
    const standaloneOpenIdx = restoreFn.indexOf(
      "await openDocument(createFileDocument(file))"
    );

    expect(branchIdx).toBeGreaterThan(-1);
    expect(projectReadIdx).toBeGreaterThan(branchIdx);
    expect(projectOpenIdx).toBeGreaterThan(projectReadIdx);
    // The standalone open remains the else branch, after the project branch.
    expect(standaloneReadIdx).toBeGreaterThan(projectOpenIdx);
    expect(standaloneOpenIdx).toBeGreaterThan(standaloneReadIdx);
    // The project read is handed the project-root-relative path verbatim.
    expect(restoreFn).toMatch(
      /readProjectDocument\(\s*written\.projectRelativePath\s*\)/
    );
  });

  it("Untitled restore asks for a save location and a cancel keeps the row", () => {
    const restoreFn = appSource.slice(
      appSource.indexOf("async function handleRecoveryRestoreSelected"),
      appSource.indexOf("async function getRecoveryReportTextForDialog")
    );
    expect(restoreFn).toContain(
      'candidate.documentType === "markdown.untitled"'
    );
    expect(restoreFn).toContain(
      "window.pergamum.files.selectMarkdownSavePath(defaultPath)"
    );
    expect(restoreFn).toMatch(/if \(!selected\) \{\s*continue;/);
  });
});
