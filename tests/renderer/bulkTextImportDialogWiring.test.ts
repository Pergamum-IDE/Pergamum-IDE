import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync("src/renderer/App.tsx", "utf8");
}

function dialogSource(): string {
  return readFileSync("src/renderer/dialog/BulkTextImportDialog.tsx", "utf8");
}

function functionBlock(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const nextFunction = source.indexOf("\n  function ", start + 1);

  expect(start).toBeGreaterThan(-1);
  expect(nextFunction).toBeGreaterThan(start);

  return source.slice(start, nextFunction);
}

describe("Bulk text import dialog App wiring (#420 Step 2)", () => {
  it("routes the menu command through the App command registry into dialog state", () => {
    const source = appSource();

    expect(source).toContain('} from "./dialog/BulkTextImportDialog"');
    expect(source).toContain("BulkTextImportDialog,");
    expect(source).toContain("openBulkTextImportDialogCommandRef");
    expect(source).toContain(
      "openBulkTextImportDialog: () =>\n          openBulkTextImportDialogCommandRef.current()"
    );
    expect(source).toContain(
      "openBulkTextImportDialogCommandRef.current = openBulkTextImportDialog"
    );
    expect(source).toContain("setIsBulkTextImportDialogOpen(true)");
    expect(source).toContain("<BulkTextImportDialog");
  });

  it("keeps the open/close path free of Step 1 text-import IPC calls", () => {
    const source = appSource();
    const openBlock = functionBlock(source, "openBulkTextImportDialog");
    const closeBlock = functionBlock(source, "closeBulkTextImportDialog");
    const blocks = `${openBlock}\n${closeBlock}`;

    expect(blocks).not.toContain("window.pergamum.projects.dryRunTextImport");
    expect(blocks).not.toContain("window.pergamum.projects.previewTextImportFile");
    expect(blocks).not.toContain(
      "window.pergamum.projects.previewTextImportFiles"
    );
    expect(blocks).not.toContain("window.pergamum.projects.executeTextImport");
  });

  it("treats the dialog as an app modal command blocker", () => {
    const source = appSource();
    const blockerIndex = source.indexOf("registry.setCommandExecutionBlocker(");
    const ignoredIndex = source.indexOf("registry.setOnCommandIgnored(");
    const blockerBlock = source.slice(blockerIndex, ignoredIndex);

    expect(blockerBlock).toContain(
      "isBulkTextImportDialogPendingOrOpenRef.current"
    );
    expect(blockerBlock).toContain('"app_modal_open"');
  });
});

describe("Bulk text import dialog App wiring (#420 Step 3)", () => {
  it("passes the dry-run / folder-listing / dropped-path callbacks to the dialog", () => {
    const source = appSource();
    const renderStart = source.indexOf("<BulkTextImportDialog");
    const renderBlock = source.slice(renderStart, renderStart + 400);

    expect(renderBlock).toContain("listFolders={bulkTextImportListFolders}");
    expect(renderBlock).toContain("onDryRun={bulkTextImportDryRun}");
    expect(renderBlock).toContain(
      "getDroppedFilePaths={bulkTextImportDroppedFilePaths}"
    );
  });

  it("owns the Step 1 dry-run IPC in App, not the dialog", () => {
    const source = appSource();

    // App calls dryRunTextImport (addressed with the current project id).
    expect(source).toContain(
      "window.pergamum.projects.getCurrentProjectId()"
    );
    expect(source).toContain("window.pergamum.projects.dryRunTextImport({");
    // Folder listing goes through the existing File Explorer boundary IPC.
    expect(source).toContain(
      "window.pergamum.projects.listFileExplorerChildren("
    );
    // Dropped files are turned into paths in the preload, never read here.
    expect(source).toContain("window.pergamum.fileSystem.getPathForFile(");
  });

  it("keeps the dialog component independent from the preload project IPC surface", () => {
    const source = dialogSource();

    expect(source).not.toContain("window.pergamum");
    expect(source).not.toContain("dryRunTextImport");
    expect(source).not.toContain("previewTextImportFile");
    expect(source).not.toContain("previewTextImportFiles");
    expect(source).not.toContain("executeTextImport");
    // The renderer must not read external files: no fs, no FileReader.
    expect(source).not.toContain('from "node:fs"');
    expect(source).not.toContain("new FileReader");
  });
});

describe("Bulk text import dialog App wiring (#420 Step 4)", () => {
  it("passes the batch preview callback to the dialog", () => {
    const source = appSource();
    const renderStart = source.indexOf("<BulkTextImportDialog");
    const renderBlock = source.slice(renderStart, renderStart + 500);

    expect(renderBlock).toContain("onPreview={bulkTextImportPreview}");
  });

  it("routes the per-file encoding preview through previewTextImportFiles only", () => {
    const source = appSource();

    expect(source).toContain(
      "window.pergamum.projects.previewTextImportFiles("
    );
    // The Step-1 single-file wrapper stays unused.
    expect(/previewTextImportFile\(/.test(source)).toBe(false);
  });

  it("keeps the dialog free of the single-file preview wrapper", () => {
    const source = dialogSource();

    // `previewTextImportFiles` (lowercase) is the IPC method name; the dialog
    // only ever sees the `onPreview` prop and the capitalised request type.
    expect(source).not.toContain("previewTextImportFiles(");
    expect(/previewTextImportFile\(/.test(source)).toBe(false);
  });
});

describe("Bulk text import dialog App wiring (#420 Step 5)", () => {
  it("passes the execute + imported callbacks to the dialog", () => {
    const source = appSource();
    const renderStart = source.indexOf("<BulkTextImportDialog");
    const renderBlock = source.slice(renderStart, renderStart + 700);

    expect(renderBlock).toContain("onExecute={bulkTextImportExecute}");
    expect(renderBlock).toContain("onImported={bulkTextImportOnImported}");
  });

  it("runs the import through executeTextImport, addressed by the current project id", () => {
    const source = appSource();

    expect(source).toContain("window.pergamum.projects.executeTextImport({");
    // projectId is resolved at Import time, like the dry-run.
    const executeBlockIndex = source.indexOf(
      "const bulkTextImportNewFileLineEnding"
    );
    const executeBlock = source.slice(
      executeBlockIndex,
      executeBlockIndex + 900
    );
    expect(executeBlock).toContain(
      "window.pergamum.projects.getCurrentProjectId()"
    );
    expect(executeBlock).toContain('return { ok: false, reason: "noProject" }');
    // targetLineEnding still comes from the existing new-file setting
    expect(executeBlock).toContain(
      "effectiveSettings.files.newFile.lineEnding"
    );
    // #420 Step 8: normalization is driven by the dialog's toggle, not hardcoded
    expect(executeBlock).toContain(
      "normalizeLineEndings: input.normalizeLineEndings"
    );
    expect(executeBlock).not.toContain("normalizeLineEndings: true");
  });

  it("refreshes the File Explorer after a successful import, without auto-opening", () => {
    const source = appSource();
    const blockIndex = source.indexOf("const bulkTextImportOnImported");
    const block = source.slice(blockIndex, blockIndex + 700);

    expect(block).toContain("setFileExplorerRefreshDirectoriesRequest({");
    expect(block).not.toContain("openDocument");
  });

  it("keeps the dialog free of window.pergamum and the execute IPC method name", () => {
    const source = dialogSource();

    expect(source).not.toContain("window.pergamum");
    expect(source).not.toContain("executeTextImport(");
    expect(source).not.toContain("dryRunTextImport");
  });

  it("wires the Import button to an execute handler and a dynamic disabled state", () => {
    const source = dialogSource();
    const importButtonIndex = source.indexOf("bulkTextImportDialogImportButton");
    const buttonBlock = source.slice(
      importButtonIndex - 80,
      importButtonIndex + 320
    );

    expect(buttonBlock).toContain("disabled={!canExecute}");
    expect(buttonBlock).toContain("onClick={handleExecute}");
  });
});

describe("Bulk text import dialog App wiring (#420 Step 6)", () => {
  it("passes the OS source picker callback to the dialog", () => {
    const source = appSource();
    const renderStart = source.indexOf("<BulkTextImportDialog");
    const renderBlock = source.slice(renderStart, renderStart + 800);

    expect(renderBlock).toContain("pickSources={bulkTextImportPickSources}");
  });

  it("routes the picker through pickTextImportSources and returns paths only", () => {
    const source = appSource();
    const blockIndex = source.indexOf("const bulkTextImportPickSources");
    const block = source.slice(blockIndex, blockIndex + 500);

    expect(block).toContain("window.pergamum.projects.pickTextImportSources({");
    expect(block).toContain("return result.paths");
    // no file reading in the renderer
    expect(block).not.toContain("readFile");
    expect(block).not.toContain("FileReader");
  });

  it("shares one add-paths path between drop and the picker buttons", () => {
    const source = dialogSource();

    // Both the drop handler and the picker handler call `addPaths`, now with
    // a #420 Step 8 source-batch kind tag.
    expect(source).toContain('addPaths(getDroppedFilePaths(files), "drop")');
    expect(source).toContain(
      'addPaths(paths, kind === "files" ? "filePicker" : "folderPicker")'
    );
    // The dialog only ever calls the injected `pickSources` prop.
    expect(source).not.toContain("pickTextImportSources");
    expect(source).not.toContain("window.pergamum");
  });

  it("gates picker buttons through destination-first / importing state and swaps the Cancel label after import", () => {
    const source = dialogSource();

    expect(source).toContain("bulkTextImportDialogAddFilesButton");
    expect(source).toContain("bulkTextImportDialogAddFoldersButton");
    expect(source).toContain(
      "const canAddSources = destinationChosen && !isImporting"
    );
    // picker buttons are disabled before a destination is chosen and during import
    const addFilesIndex = source.indexOf("bulkTextImportDialogAddFilesButton");
    expect(
      source.slice(addFilesIndex, addFilesIndex + 200)
    ).toContain("disabled={!canAddSources}");
    // Cancel becomes Close once the run completed
    const cancelIndex = source.indexOf("bulkTextImportDialogCancelButton");
    const cancelBlock = source.slice(cancelIndex, cancelIndex + 360);
    expect(cancelBlock).toContain('state.executionStatus === "completed"');
    expect(cancelBlock).toContain('"textImport.dialog.close"');
    expect(cancelBlock).toContain('"textImport.dialog.cancel"');
  });
});
