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

    // Store-status resolution seeds it; restore/finalize/discard re-check it.
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
    const discardFn = appSource.slice(
      appSource.indexOf("async function discardRecoveryCandidates"),
      appSource.indexOf("async function handleRecoveryRestoreSelected")
    );
    expect(discardFn).toContain(
      "await refreshRecoveryHasRecoverableCandidates();"
    );

    // Listing the (already previous-run-only) candidates keeps the key in sync.
    expect(appSource).toContain(
      "setRecoveryHasRecoverableCandidates(result.candidates.length > 0)"
    );
  });

  it("gates startup recovery presentation on owner + settled cold start + no open modal, once per process", () => {
    const effect = appSource.slice(
      appSource.indexOf("one-shot startup presentation of previous-run Recovery candidates"),
      appSource.indexOf("createProjectCommandRef.current = createProject;")
    );
    expect(effect).toContain("recoveryAutoShowAttemptedRef.current");
    expect(effect).toContain('recoveryStoreStatusKind !== "owner"');
    expect(effect).toContain("!coldStartRestoreSettled");
    expect(effect).toContain("!coldStartMarkdownLaunchRoutingSettled");
    expect(effect).toContain("!deferredRestoreErrorDialogsReadyRef.current");
    expect(effect).toContain("isAppModalSurfacePendingOrOpen");
    expect(effect).toContain("recoveryAutoShowAttemptedRef.current = true;");
    expect(effect).toContain("window.pergamum.recovery");
    expect(effect).toContain(".evaluateStartupCandidates()");
    expect(effect).toContain('case "autoShow":');
    expect(effect).toContain("showRecoveryCandidateDialog(presentation.candidates, null)");
    expect(effect).toContain(".markCandidatesSeen()");
    expect(effect).toContain('case "reminder":');
    expect(effect).toContain("requestRecoveryReminderToast(presentation.candidateCount)");
  });

  it("requests a non-warning recovery reminder toast with the Recovery command action (#300)", () => {
    const reminderFn = appSource.slice(
      appSource.indexOf("function requestRecoveryReminderToast"),
      appSource.indexOf("function showRecoveryCandidateDialog")
    );

    expect(reminderFn).toContain("notificationController.notify({");
    expect(reminderFn).toContain("notificationToastPriority.recoveryReminder");
    expect(reminderFn).toContain('translate("notification.recoveryCandidatesReminder"');
    expect(reminderFn).toContain('icon: { kind: "preset", name: "recovery" }');
    expect(reminderFn).toContain('kind: "command"');
    expect(reminderFn).toContain("commandId: recoveryCommandIds.showDocuments");
    expect(reminderFn).not.toMatch(/warning|error/i);
  });

  it("only opens the dialog for the Recovery owner", () => {
    const openFn = appSource.slice(
      appSource.indexOf("async function openRecoveryCandidateDialog"),
      appSource.indexOf("function closeRecoveryCandidateDialog")
    );
    expect(openFn).toContain('recoveryStoreStatusKind !== "owner"');
    expect(openFn).toContain("window.pergamum.recovery.listCandidates()");
    expect(openFn).toContain(".markCandidatesSeen()");
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

  it("the candidate dialog exposes explicit discard only through a destructive confirmation", () => {
    const dialogJsx = appSource.slice(
      appSource.indexOf("<RecoveryCandidateDialog"),
      appSource.indexOf("/>", appSource.indexOf("<RecoveryCandidateDialog"))
    );
    expect(dialogJsx).toContain("onDiscardSelected={handleRecoveryDiscardSelected}");
    expect(dialogJsx).toContain("onDiscardAll={handleRecoveryDiscardAll}");
    expect(appSource).toContain("async function handleRecoveryDiscardSelected");
    expect(appSource).toContain("async function handleRecoveryDiscardAll");
    const confirmFn = appSource.slice(
      appSource.indexOf("async function confirmRecoveryDiscard"),
      appSource.indexOf("async function discardRecoveryCandidates")
    );
    expect(confirmFn).toContain("confirmDialog({");
    expect(confirmFn).toContain('tone: "destructive"');
    expect(confirmFn).toContain("dialog.recovery.discardConfirm.message");
    expect(confirmFn).toContain("dialog.recovery.discardAllConfirm.message");
    const discardFn = appSource.slice(
      appSource.indexOf("async function discardRecoveryCandidates"),
      appSource.indexOf("async function handleRecoveryRestoreSelected")
    );
    expect(discardFn).toContain("window.pergamum.recovery.discardCandidates({");
    expect(discardFn).toContain("await refreshRecoveryCandidateDialog();");
    expect(discardFn).toContain("await refreshRecoveryHasRecoverableCandidates();");
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    expect(dialogFile).toContain("dialog.recovery.discardSelected");
    expect(dialogFile).toContain("dialog.recovery.discardAll");
    expect(dialogFile).toContain("onDiscardSelected");
    expect(dialogFile).toContain("onDiscardAll");
  });

  it("keeps the discard delay UI on hourglass/trash icons, with no reload spinner", () => {
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    const styles = readFileSync("src/renderer/styles.css", "utf8");

    expect(dialogFile).toContain(
      "assets/icons/ionicons/dialog/hourglass-outline.svg?url"
    );
    expect(dialogFile).toContain(
      "assets/icons/ionicons/dialog/trash-bin-outline.svg?url"
    );
    expect(dialogFile).not.toContain("reload-outline.svg?url");
    expect(dialogFile).toContain("discardButtonIconStyle");
    expect(styles).toContain("background-color: currentColor");
    expect(styles).toContain("mask: var(--recovery-discard-button-icon)");
    expect(styles).not.toContain("recoveryDiscardPendingSpin");
  });

  it("allows body row selection without double-toggling checkbox clicks", () => {
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );

    expect(dialogFile).toContain(
      "onClick={() => handleRowCheckbox(candidate.recoveryId)}"
    );
    expect(dialogFile).toContain("aria-selected={selected}");
    expect(dialogFile).toContain("event.stopPropagation()");
    expect(dialogFile).toContain('type="checkbox"');
    expect(dialogFile).not.toContain("onKeyDown");
  });

  it("switches the footer close label by candidate count without changing the close handler", () => {
    const dialogFile = readFileSync(
      "src/renderer/recovery/RecoveryCandidateDialog.tsx",
      "utf8"
    );
    const closeLabelBlock = dialogFile.slice(
      dialogFile.indexOf("const closeButtonLabel ="),
      dialogFile.indexOf(
        "return (",
        dialogFile.indexOf("const closeButtonLabel =")
      )
    );

    expect(closeLabelBlock).toContain("candidates.length > 0");
    expect(closeLabelBlock).toContain("dialog.recovery.decideLater");
    expect(closeLabelBlock).toContain("common.close");
    expect(dialogFile).toContain("onClick={onClose}");
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
