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

    // Import execution is still untouched.
    expect(source).not.toContain("window.pergamum.projects.executeTextImport");
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
    // No import execution in Step 4.
    expect(source).not.toContain("window.pergamum.projects.executeTextImport");
  });

  it("keeps the Import button disabled in Step 4", () => {
    const source = dialogSource();
    const importButtonIndex = source.indexOf("bulkTextImportDialogImportButton");
    const buttonBlock = source.slice(
      importButtonIndex - 200,
      importButtonIndex + 200
    );

    expect(buttonBlock).toContain("disabled");
  });

  it("keeps the dialog free of import execution and single-file preview", () => {
    const source = dialogSource();

    // `previewTextImportFiles` (lowercase) is the IPC method name; the dialog
    // only ever sees the `onPreview` prop and the capitalised request type.
    expect(source).not.toContain("previewTextImportFiles(");
    expect(source).not.toContain("executeTextImport");
    expect(/previewTextImportFile\(/.test(source)).toBe(false);
  });
});
