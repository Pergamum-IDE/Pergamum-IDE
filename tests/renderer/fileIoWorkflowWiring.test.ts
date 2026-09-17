import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

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

describe("file I/O workflow wiring (#202)", () => {
  it("shows read failures through a one-button app confirm dialog", () => {
    const source = appSource();
    const openFileBlock = sourceBlock(
      source,
      "async function openFile()",
      "const openedDocument = currentDocumentForOpenedFile"
    );
    const dialogBlock = sourceBlock(
      source,
      "async function showFileOpenFailedDialog()",
      "async function showFileSaveFailedDialog()"
    );

    expect(openFileBlock).toContain("await showFileOpenFailedDialog();");
    expect(dialogBlock).toContain('translate("dialog.fileOpenFailed.title")');
    expect(dialogBlock).toContain('translate("dialog.fileOpenFailed.message")');
    expect(dialogBlock).toContain('kind: "error"');
    expect(dialogBlock).toContain("dismissOnBackdropClick: false");
    expect(dialogBlock).toContain('confirmLabel: translate("common.ok")');
    expect(dialogBlock).toContain("cancelLabel: null");
  });

  it("shows project document read failures through the same one-button app confirm dialog", () => {
    const source = appSource();
    const projectDocumentOpenBlock = sourceBlock(
      source,
      "async function activateProjectDocument",
      "async function changeSettings"
    );
    const catchBlock = projectDocumentOpenBlock.slice(
      projectDocumentOpenBlock.indexOf("} catch (error) {")
    );

    expect(catchBlock).toContain("status.documentOpenFailed");
    expect(catchBlock).toContain("await showFileOpenFailedDialog();");
  });

  it("does not leave project document read failures as status-bar-only notifications", () => {
    const source = appSource();
    const projectDocumentOpenBlock = sourceBlock(
      source,
      "async function activateProjectDocument",
      "async function changeSettings"
    );
    const catchBlock = projectDocumentOpenBlock.slice(
      projectDocumentOpenBlock.indexOf("} catch (error) {")
    );

    expect(catchBlock.indexOf("status.documentOpenFailed")).toBeGreaterThan(-1);
    expect(
      catchBlock.indexOf("await showFileOpenFailedDialog();")
    ).toBeGreaterThan(catchBlock.indexOf("status.documentOpenFailed"));
  });

  it("does not add a target project document tab after project document read failure", () => {
    const source = appSource();
    const projectDocumentOpenBlock = sourceBlock(
      source,
      "async function activateProjectDocument",
      "async function changeSettings"
    );
    const catchBlock = projectDocumentOpenBlock.slice(
      projectDocumentOpenBlock.indexOf("} catch (error) {")
    );

    expect(projectDocumentOpenBlock).toContain(
      "const didOpen = await completeInstrumentedDocumentOpen("
    );
    expect(projectDocumentOpenBlock).toContain(
      "openEditorFromExplicitActivation(documentId"
    );
    expect(projectDocumentOpenBlock).toContain(
      "resolvedEditor: createMarkdownCurrentEditor("
    );
    expect(catchBlock).not.toContain("setOpenDocumentsState");
    expect(catchBlock).not.toContain("openOrActivateEditor");
    expect(catchBlock).not.toContain(
      "openFirstProjectDocumentAfterContextSwitch"
    );
  });

  it("shows save failures through a one-button app confirm dialog without marking clean first", () => {
    const source = appSource();
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const dialogBlock = sourceBlock(
      source,
      "async function showFileSaveFailedDialog()",
      "async function selectStandaloneSaveTarget"
    );
    const catchBlock = saveFileBlock.slice(
      saveFileBlock.indexOf("} catch (error) {")
    );

    // #501 slice 6 remediation: the catch block now dispatches through the
    // shared showSaveFailureDialogForReason helper (which itself calls
    // showFileSaveFailedDialog for a non-encoding reason) rather than
    // calling showFileSaveFailedDialog directly.
    expect(catchBlock).toContain("await showSaveFailureDialogForReason(");
    expect(
      catchBlock.indexOf("await showSaveFailureDialogForReason(")
    ).toBeLessThan(catchBlock.lastIndexOf('return "failed";'));
    expect(catchBlock).not.toContain("markCurrentDocumentSaved");
    expect(catchBlock).not.toContain("applyStandaloneSaveResult");
    expect(dialogBlock).toContain('translate("dialog.fileSaveFailed.title")');
    expect(dialogBlock).toContain('translate("dialog.fileSaveFailed.message")');
    expect(dialogBlock).toContain('kind: "error"');
    expect(dialogBlock).toContain("dismissOnBackdropClick: false");
    expect(dialogBlock).toContain('confirmLabel: translate("common.ok")');
    expect(dialogBlock).toContain("cancelLabel: null");
  });

  it("continues saving immediately after the OS save dialog returns a target", () => {
    const source = appSource();
    const selectBlock = sourceBlock(
      source,
      "async function selectStandaloneSaveTarget",
      "async function confirmDeleteGlossaryEntry"
    );

    expect(selectBlock).toContain(
      "window.pergamum.files.selectMarkdownSavePath"
    );
    expect(selectBlock).toContain(
      'return { kind: "selected", path: selected.path };'
    );
    expect(selectBlock).not.toContain("confirmDialog");
  });

  it("routes renderer markdown saving through select/write, not the legacy combined save IPC", () => {
    const source = appSource();
    const selectBlock = sourceBlock(
      source,
      "async function selectStandaloneSaveTarget",
      "async function confirmDeleteGlossaryEntry"
    );
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );

    expect(saveFileBlock).toContain("selectStandaloneSaveTarget");
    expect(selectBlock).toContain(
      "window.pergamum.files.selectMarkdownSavePath"
    );
    expect(saveFileBlock).toContain("window.pergamum.files.writeMarkdown");
    expect(saveFileBlock).not.toContain("window.pergamum.files.saveMarkdown");
  });

  it("#501 slice 6 remediation: detects unencodableCharacters via the shared sanitized-message parser", () => {
    const source = appSource();
    const helperBlock = sourceBlock(
      source,
      "function isUnencodableCharactersSaveError(error: unknown): boolean {",
      "function projectOpenStatus("
    );

    expect(source).toContain(
      'import { sanitizedFileIoErrorReasonFromMessage } from "../shared/sanitizedFileIoErrorMessage";'
    );
    expect(helperBlock).toContain(
      "sanitizedFileIoErrorReasonFromMessage(error.message)"
    );
    expect(helperBlock).toContain('"unencodableCharacters"');
  });

  it("#501 slice 6 remediation: a structured saveProjectDocument failure (not a thrown/caught Error) drives the dialog choice", () => {
    const source = appSource();
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const projectSaveBlock = saveFileBlock.slice(
      saveFileBlock.indexOf(
        "const savedProjectDocument =\n              await window.pergamum.projects.saveProjectDocument("
      )
    );
    const structuredFailureBlock = projectSaveBlock.slice(
      projectSaveBlock.indexOf('if (savedProjectDocument.kind === "failed") {'),
      projectSaveBlock.indexOf("const savedProjectSnapshot =")
    );

    // The branch reads `.kind` / `.reason` off the RESOLVED result — it must
    // not be inside (or depend on) the shared `catch (error)` block below,
    // since that block only ever sees a thrown Error whose message is
    // mangled by Electron on the way back from `ipcMain.handle`.
    expect(structuredFailureBlock).not.toEqual("");
    expect(structuredFailureBlock).toContain(
      "await showSaveFailureDialogForReason(\n                savedProjectDocument.reason\n              );"
    );
    expect(structuredFailureBlock).toContain('return "failed";');
    expect(
      saveFileBlock.indexOf('if (savedProjectDocument.kind === "failed") {')
    ).toBeLessThan(saveFileBlock.indexOf("} catch (error) {"));
    // No document / editor state mutation on this failure path.
    expect(structuredFailureBlock).not.toContain("markCurrentDocumentSaved");
    expect(structuredFailureBlock).not.toContain("replaceSavedDocument");
    expect(structuredFailureBlock).not.toContain(
      "retireRecoverySnapshotAfterSave"
    );
  });

  it("#501 slice 6 remediation: showSaveFailureDialogForReason shows the encoding dialog only for unencodableCharacters, else the generic one", () => {
    const source = appSource();
    const dispatchBlock = sourceBlock(
      source,
      "async function showSaveFailureDialogForReason(",
      "function syncActiveMarkdownBufferToSavedDocument"
    );
    const dialogBlock = sourceBlock(
      source,
      "async function showFileSaveFailedEncodingDialog()",
      "async function showSaveFailureDialogForReason("
    );

    expect(dispatchBlock).toContain('reason === "unencodableCharacters"');
    const ifIndex = dispatchBlock.indexOf(
      'if (reason === "unencodableCharacters") {'
    );
    const encodingCallIndex = dispatchBlock.indexOf(
      "await showFileSaveFailedEncodingDialog();"
    );
    const elseIndex = dispatchBlock.indexOf("} else {");
    const genericCallIndex = dispatchBlock.indexOf(
      "await showFileSaveFailedDialog();"
    );

    expect(ifIndex).toBeGreaterThan(-1);
    expect(encodingCallIndex).toBeGreaterThan(ifIndex);
    expect(elseIndex).toBeGreaterThan(encodingCallIndex);
    expect(genericCallIndex).toBeGreaterThan(elseIndex);

    expect(dialogBlock).toContain(
      'translate("dialog.fileSaveFailedEncoding.title")'
    );
    expect(dialogBlock).toContain(
      'translate("dialog.fileSaveFailedEncoding.message")'
    );
    expect(dialogBlock).toContain('kind: "error"');
    expect(dialogBlock).toContain("dismissOnBackdropClick: false");
    expect(dialogBlock).toContain('confirmLabel: translate("common.ok")');
    expect(dialogBlock).toContain("cancelLabel: null");
  });

  it("#501 slice 6 remediation: the shared catch block also routes through showSaveFailureDialogForReason (defense in depth for standalone save)", () => {
    const source = appSource();
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const catchBlock = saveFileBlock.slice(
      saveFileBlock.indexOf("} catch (error) {")
    );

    expect(catchBlock).toContain("isUnencodableCharactersSaveError(error)");
    expect(catchBlock).toContain("await showSaveFailureDialogForReason(");
    // The dispatch call comes first; `isUnencodableCharactersSaveError`
    // appears as its argument expression.
    expect(
      catchBlock.indexOf("await showSaveFailureDialogForReason(")
    ).toBeLessThan(catchBlock.indexOf("isUnencodableCharactersSaveError(error)"));
  });

  it("#501 slice 6 remediation: a failed save (either dialog) never marks the document clean or replaces its saved state", () => {
    const source = appSource();
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const catchBlock = saveFileBlock.slice(
      saveFileBlock.indexOf("} catch (error) {")
    );

    expect(catchBlock).not.toContain("markCurrentDocumentSaved");
    expect(catchBlock).not.toContain("applyStandaloneSaveResult");
    expect(catchBlock).not.toContain("replaceSavedDocument");
    expect(catchBlock).not.toContain("retireRecoverySnapshotAfterSave");
    expect(catchBlock).toContain('return "failed";');
  });

  it("routes untitled Save through the existing Save As target selection path", () => {
    const source = appSource();
    const saveFileBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const standaloneSaveBlock = sourceBlock(
      saveFileBlock,
      "const existingSavePath =",
      "const savedDocument = applyStandaloneSaveResult"
    );

    expect(standaloneSaveBlock).toContain(
      "standaloneSavePath(documentToSave)"
    );
    expect(standaloneSaveBlock).toContain(
      "await selectStandaloneSaveTarget(documentToSave)"
    );
    expect(standaloneSaveBlock).toContain(
      "await validateStandaloneSaveTargetForSaveAs"
    );
  });
});
