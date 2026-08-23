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
  });

  it("keeps read-only project document Save As as copy-out without switching the editor to a standalone file", () => {
    const source = appSource();
    const saveBlock = sourceBlock(
      source,
      "async function saveFile(",
      "async function readProjectDocument"
    );
    const readOnlySaveAsBlock = sourceBlock(
      saveBlock,
      "if (isReadOnlyProjectDocumentSaveAs) {",
      "const savedDocument = applyStandaloneSaveResult"
    );

    expect(saveBlock).toContain("const isReadOnlyProjectDocumentSaveAs =");
    expect(saveBlock).toContain("options.forceSaveAs === true");
    expect(saveBlock).toContain("isProjectCurrentDocument(documentToSave)");
    expect(readOnlySaveAsBlock).toContain(
      "const fileName = displayName(savedStandaloneDocument.path);"
    );
    expect(readOnlySaveAsBlock).toContain(
      "await showReadOnlyProjectSaveAsSucceededDialog(fileName);"
    );
    expect(readOnlySaveAsBlock).not.toContain("applyStandaloneSaveResult");
    expect(readOnlySaveAsBlock).not.toContain("replaceSavedDocument");
    expect(readOnlySaveAsBlock).not.toContain("markCurrentDocumentSaved");
  });

  it("shows read-only Save As success through a safe one-button info dialog", () => {
    const source = appSource();
    const dialogBlock = sourceBlock(
      source,
      "async function showReadOnlyProjectSaveAsSucceededDialog",
      "async function selectStandaloneSaveTarget"
    );

    expect(dialogBlock).toContain(
      'translate("dialog.readOnlyProjectSaveAsSucceeded.title")'
    );
    expect(dialogBlock).toContain(
      'translate("dialog.readOnlyProjectSaveAsSucceeded.message"'
    );
    expect(dialogBlock).toContain("fileName");
    expect(dialogBlock).toContain('kind: "plainText"');
    expect(dialogBlock).toContain('kind: "info"');
    expect(dialogBlock).toContain('translate("dialog.icon.info")');
    expect(dialogBlock).toContain("dismissOnBackdropClick: false");
    expect(dialogBlock).toContain('confirmLabel: translate("common.ok")');
    expect(dialogBlock).toContain("cancelLabel: null");
    expect(dialogBlock).toContain("clipboardText: null");
    expect(dialogBlock).not.toContain("project.rootPath");
    expect(dialogBlock).not.toContain("project.name");
    expect(dialogBlock).not.toContain("documentToSave.content");
  });
});
