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

    expect(saveFileBlock).toContain("await showFileSaveFailedDialog();");
    expect(
      saveFileBlock.indexOf("await showFileSaveFailedDialog();")
    ).toBeLessThan(saveFileBlock.indexOf('return "failed";'));
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
      "async function saveGlossaryEntry"
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
      "async function saveGlossaryEntry"
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
