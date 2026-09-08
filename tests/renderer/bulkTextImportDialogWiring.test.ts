import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync("src/renderer/App.tsx", "utf8");
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

    expect(source).toContain(
      'import { BulkTextImportDialog } from "./dialog/BulkTextImportDialog"'
    );
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

  it("keeps the Step 2 open/close path free of Step 1 text-import IPC calls", () => {
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

  it("keeps the skeleton dialog independent from the preload project IPC surface", () => {
    const source = readFileSync(
      "src/renderer/dialog/BulkTextImportDialog.tsx",
      "utf8"
    );

    expect(source).not.toContain("window.pergamum");
    expect(source).not.toContain("dryRunTextImport");
    expect(source).not.toContain("previewTextImportFile");
    expect(source).not.toContain("previewTextImportFiles");
    expect(source).not.toContain("executeTextImport");
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
