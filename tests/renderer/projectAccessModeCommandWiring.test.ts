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

describe("project access mode command wiring (#211)", () => {
  it("passes project access mode and project-owned editor state into command context", () => {
    const source = appSource();
    const contextBlock = sourceBlock(
      source,
      "const isReadOnlyProject =",
      "commandContextRef.current = commandContext;"
    );

    expect(contextBlock).toContain(
      'project?.accessMode.kind === "readOnly"'
    );
    expect(contextBlock).toContain(
      'project?.accessMode.kind === "readWrite"'
    );
    expect(contextBlock).toContain("isProjectOwnedCurrentEditor");
    expect(contextBlock).toContain(
      'activeMarkdownDocument?.kind === "project"'
    );
    expect(contextBlock).toContain(
      "projectAccessReadWrite: isReadWriteProject"
    );
    expect(contextBlock).toContain(
      "projectAccessReadOnly: isReadOnlyProject"
    );
    expect(contextBlock).toContain(
      "editorDocumentProjectOwned: isProjectOwnedCurrentEditor"
    );
    expect(contextBlock).toContain(
      "activeEditorSaveBlockedByReadOnlyProjectRootForUi"
    );
  });

  it("derives read-only editor interaction only from read-only project-owned editors", () => {
    const source = appSource();
    const contextBlock = sourceBlock(
      source,
      "const isReadOnlyProject =",
      "const canSave ="
    );

    expect(contextBlock).toContain(
      "const isReadOnlyProjectOwnedEditor ="
    );
    expect(contextBlock).toContain(
      "isReadOnlyProject && isProjectOwnedCurrentEditor"
    );
    expect(contextBlock).toContain(
      'activeMarkdownDocument?.kind === "project"'
    );
    expect(contextBlock).toContain('currentEditor?.kind === "glossaryEntry"');
  });

  it("passes read-only editor state into the editor surface", () => {
    const source = appSource();
    const editorSurfaceBlock = sourceBlock(
      source,
      "<EditorSurface",
      "{layout.utilityWindow.open ?"
    );

    expect(editorSurfaceBlock).toContain(
      "isProjectOwnedReadOnly={isEditorReadOnly}"
    );
  });

  it("ignores Markdown content changes while the active editor is a read-only project-owned editor", () => {
    const source = appSource();
    const setActiveDocumentContentBlock = sourceBlock(
      source,
      "function setActiveDocumentContent",
      "function updateActiveGlossaryDraft"
    );

    expect(setActiveDocumentContentBlock).toContain(
      "if (!canMutateActiveWorkingCopy())"
    );
    expect(setActiveDocumentContentBlock).toContain("return;");
    expect(setActiveDocumentContentBlock).toContain(
      "updateCurrentDocumentContent(\n          document,\n          nextContent,\n          nextLineEndingBreaks\n        )"
    );
  });

  it("applies Save As target validation before writing selected standalone targets", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const selectedSaveAsBlock = sourceBlock(
      saveBlock,
      "const targetPolicy =",
      "return window.pergamum.files.writeMarkdown"
    );

    expect(saveBlock).not.toContain("isReadOnlyProjectDocumentSaveAs");
    expect(selectedSaveAsBlock).toContain(
      "await validateStandaloneSaveTargetForSaveAs"
    );
    expect(saveBlock).toContain(
      "selectedSaveAsTargetPath = selectedTarget.path;"
    );
    expect(selectedSaveAsBlock).toContain(
      "return targetPolicy;"
    );
    expect(selectedSaveAsBlock).not.toContain(
      "showSaveAsRejectedDialog(targetPolicy.reason);"
    );
    expect(selectedSaveAsBlock).toContain(
      "await confirmReadOnlyProjectSaveAsInsideRoot("
    );
    expect(selectedSaveAsBlock).toContain(
      "selectedTarget.path"
    );
    expect(saveBlock).toContain("applyStandaloneSaveResult");
    expect(saveBlock).toContain("replaceSavedDocument");
  });

  it("routes renderer Save As UX validation through the shared policy helper", () => {
    const source = appSource();
    const validationBlock = sourceBlock(
      source,
      "async function validateStandaloneSaveTargetForSaveAs",
      "async function selectStandaloneSaveTarget"
    );

    expect(validationBlock).toContain(
      "return validateStandaloneSaveTargetForSaveAsUi({"
    );
    expect(validationBlock).toContain("filePath");
    expect(validationBlock).toContain(
      "currentProjectRootPath: project?.rootPath ?? null"
    );
    expect(validationBlock).toContain("isReadOnlyProject");
    expect(validationBlock).toContain("platform: window.pergamum.platform");
  });

  it("keeps renderer Save As validation before confirmation and writing", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const selectedSaveAsBlock = sourceBlock(
      saveBlock,
      "const targetPolicy =",
      "return window.pergamum.files.writeMarkdown"
    );
    const validationIndex = selectedSaveAsBlock.indexOf(
      "await validateStandaloneSaveTargetForSaveAs"
    );
    const rejectionIndex = selectedSaveAsBlock.indexOf(
      'if (targetPolicy.kind === "rejected")'
    );
    const confirmationIndex = selectedSaveAsBlock.indexOf(
      "targetPolicy.requiresReadOnlyProjectConfirmation"
    );

    expect(validationIndex).toBeGreaterThan(-1);
    expect(rejectionIndex).toBeGreaterThan(validationIndex);
    expect(confirmationIndex).toBeGreaterThan(rejectionIndex);
  });

  it("does not keep the temporary Save As rejection dev preview path", () => {
    const source = appSource();

    expect(source).not.toContain("saveAsRejectionDialogDevPreview");
    expect(source).not.toContain("DogFoodTestProject");
    expect(source).not.toContain("very-long-file-name-for-dialog-preview");
  });

  it("shows read-only root Save As confirmation and protected target rejection dialogs", () => {
    const source = appSource();
    const confirmDialogBlock = sourceBlock(
      source,
      "async function confirmReadOnlyProjectSaveAsInsideRoot",
      "async function showSaveAsRejectedDialog"
    );
    const rejectionDialogBlock = sourceBlock(
      source,
      "async function showSaveAsRejectedDialog",
      "async function validateStandaloneSaveTargetForSaveAs"
    );

    expect(confirmDialogBlock).toContain(
      'translate("dialog.readOnlyProjectSaveAsInsideRoot.title")'
    );
    expect(confirmDialogBlock).toContain('kind: "plainTextWithPathBlock"');
    expect(confirmDialogBlock).toContain(
      '"dialog.readOnlyProjectSaveAsInsideRoot.message"'
    );
    expect(confirmDialogBlock).toContain("pathBlock:");
    expect(confirmDialogBlock).toContain(
      '"dialog.readOnlyProjectSaveAsInsideRoot.targetLabel"'
    );
    expect(confirmDialogBlock).toContain("value: selectedPath");
    expect(confirmDialogBlock).toContain(
      '"dialog.readOnlyProjectSaveAsInsideRoot.messageAfterTarget"'
    );
    expect(confirmDialogBlock).toContain(
      'translate("dialog.readOnlyProjectSaveAsInsideRoot.save")'
    );
    expect(confirmDialogBlock).toContain('kind: "warning"');
    expect(confirmDialogBlock).toContain("dismissOnBackdropClick: false");
    expect(rejectionDialogBlock).toContain(
      "`dialog.saveAsRejected.${reason}.title`"
    );
    expect(rejectionDialogBlock).toContain(
      "`dialog.saveAsRejected.${reason}.message`"
    );
    expect(rejectionDialogBlock).toContain('kind: "plainTextWithPathBlock"');
    expect(rejectionDialogBlock).toContain(
      'translate("dialog.saveAsRejected.targetLabel")'
    );
    expect(rejectionDialogBlock).toContain("value: targetPath");
    expect(rejectionDialogBlock).toContain("afterText: translate(messageKey)");
    expect(rejectionDialogBlock).toContain('kind: "error"');
    expect(rejectionDialogBlock).toContain(
      'confirmLabel: translate("common.close")'
    );
    expect(rejectionDialogBlock).toContain("cancelLabel: null");
    expect(rejectionDialogBlock).toContain("clipboardText: null");
    expect(source).toContain(
      "const rejectedTargetPath =\n              selectedSaveAsTargetPath ?? existingSavePath;"
    );
    expect(source).toContain(
      "await showSaveAsRejectedDialog(\n                savedStandaloneDocument.reason,\n                rejectedTargetPath\n              );"
    );
    expect(source).toContain('return "rejected";');
  });
});
