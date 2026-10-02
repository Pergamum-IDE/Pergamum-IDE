import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assistCommandIds } from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  getApplicationMenuModel,
  type ApplicationMenuItem
} from "../../src/shared/applicationMenuModel";
import { buildCommandContextSnapshot } from "../../src/renderer/commandContextSnapshot";
import { isApplicationMenuCommandDisabled } from "../../src/renderer/applicationMenuIntegration";
import { registerAssistCommands } from "../../src/renderer/assistCommands";
import { t } from "../../src/shared/i18n";

function assistItems(): readonly ApplicationMenuItem[] {
  const assist = getApplicationMenuModel("win32").find(
    (item) => item.type === "submenu" &&
      "key" in item.label &&
      item.label.key === "menu.assist"
  );

  if (assist === undefined || assist.type !== "submenu") {
    throw new Error("no Assist menu");
  }

  return assist.items;
}

function commandIdOf(item: ApplicationMenuItem): string {
  return item.type === "command" ? item.commandId : item.type;
}

describe("Application Menu > Assist > Japanese Style Check (#688)", () => {
  it("sits between Line Ending Distribution and the paragraph indent items", () => {
    const ids = assistItems().map(commandIdOf);
    const at = ids.indexOf(assistCommandIds.openJapaneseMachineCheckDialog);

    expect(at).toBe(1);
    expect(ids[0]).toBe(assistCommandIds.showLineEndingDistribution);
    expect(ids[2]).toBe(assistCommandIds.insertParagraphIndent);
    expect(ids[3]).toBe(assistCommandIds.removeParagraphIndent);
    expect(ids[4]).toBe("separator");
  });

  it("reuses the existing command (no new command id) with ja / en labels", () => {
    const item = assistItems().find(
      (candidate) =>
        candidate.type === "command" &&
        candidate.commandId === assistCommandIds.openJapaneseMachineCheckDialog
    );

    expect(item).toMatchObject({ label: { key: "menu.assist.japaneseMachineCheck" } });
    expect(t("ja", "menu.assist.japaneseMachineCheck")).toBe(
      "日本語表現チェック..."
    );
    expect(t("en", "menu.assist.japaneseMachineCheck")).toBe(
      "Japanese Style Check..."
    );
    expect(assistCommandIds.openJapaneseMachineCheckDialog).toBe(
      "assist.japaneseMachineCheck.openDialog"
    );
  });

  it("leaves enablement to the command registry: the menu is disabled exactly when the command is", () => {
    let eligible = true;
    const registry = new CommandRegistry();

    registerAssistCommands(
      registry,
      {
        showLineEndingDistribution: () => undefined,
        insertParagraphIndent: () => undefined,
        removeParagraphIndent: () => undefined,
        canRunJapaneseMachineCheck: () => eligible,
        openJapaneseMachineCheckDialog: () => undefined
      },
      {} as never
    );

    const context = buildCommandContextSnapshot({
      projectIsOpen: true,
      projectAccessReadWrite: true,
      projectAccessReadOnly: false,
      editorHasDocument: true,
      editorIsDirty: false,
      editorKindMarkdown: false,
      editorDocumentProjectOwned: true,
      editorDocumentProjectFile: false,
      activeEditorSaveBlockedByReadOnlyProjectRootForUi: false,
      recoveryOwner: false,
      recoveryHasRecoverableCandidates: false
    });
    const id = assistCommandIds.openJapaneseMachineCheckDialog;

    // E.g. a glossary Description (Slice 4's resolver says yes) ...
    expect(isApplicationMenuCommandDisabled(registry, context, id)).toBe(false);
    // ... and an unsupported target (the resolver says no).
    eligible = false;
    expect(isApplicationMenuCommandDisabled(registry, context, id)).toBe(true);
  });

  it("duplicates no target logic in the menu code", () => {
    for (const path of [
      "src/shared/applicationMenuModel.ts",
      "src/renderer/applicationMenuIntegration.ts"
    ]) {
      const source = readFileSync(path, "utf8");

      expect(source, path).not.toContain("japaneseMachineCheckTarget");
      expect(source, path).not.toContain("resolveJapaneseMachineCheckTarget");
    }
  });
});
