import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");

describe("Settings special tab wiring (#181)", () => {
  it("opens or focuses Settings through the Application Settings command", () => {
    const source = appSource();
    const workspaceCommandIndex = source.indexOf("registerWorkspaceCommands(");
    const utilityCommandIndex = source.indexOf("registerUtilityWindowCommands(");

    expect(workspaceCommandIndex).toBeGreaterThan(-1);
    expect(utilityCommandIndex).toBeGreaterThan(workspaceCommandIndex);

    const workspaceCommandBlock = source.slice(
      workspaceCommandIndex,
      utilityCommandIndex
    );

    expect(workspaceCommandBlock).toContain(
      "openApplicationSettings: () => {"
    );
    expect(workspaceCommandBlock).toContain("openSettingsTab();");
    expect(source).toContain("workspaceCommandIds.openApplicationSettings");
    expect(workspaceCommandBlock).not.toContain("setIsSettingsOpen");
  });

  it("keeps Settings as a special workspace tab instead of an EditorId kind", () => {
    const source = appSource();

    expect(source).toContain("const [isSettingsTabOpen, setIsSettingsTabOpen]");
    expect(source).toContain("const [activeSpecialTabId, setActiveSpecialTabId]");
    expect(source).toContain("specialWorkspaceTabId(\"settings\")");
    expect(source).toContain("documentWorkspaceTabId(openDocumentsState.activeDocumentId)");
    expect(source).not.toContain("createSettingsEditorId");
  });

  it("uses the explicit Application Settings title key for the special tab label", () => {
    const source = appSource();
    const specialTabsIndex = source.indexOf(
      "const specialTabs = useMemo<SpecialWorkspaceTab[]>"
    );
    const editorNavigationIndex = source.indexOf(
      "if (!editorNavigationRef.current)",
      specialTabsIndex
    );
    const toolbarTitleIndex = source.indexOf("<div className=\"documentTitle\">");
    const toolbarButtonsIndex = source.indexOf(
      "executeUiCommand(applicationCommandIds.openProject",
      toolbarTitleIndex
    );

    expect(specialTabsIndex).toBeGreaterThan(-1);
    expect(editorNavigationIndex).toBeGreaterThan(specialTabsIndex);
    expect(toolbarTitleIndex).toBeGreaterThan(-1);
    expect(toolbarButtonsIndex).toBeGreaterThan(toolbarTitleIndex);

    const specialTabsBlock = source.slice(
      specialTabsIndex,
      editorNavigationIndex
    );
    const toolbarTitleBlock = source.slice(toolbarTitleIndex, toolbarButtonsIndex);

    expect(specialTabsBlock).toContain(
      'title: translate("settings.application.title")'
    );
    expect(specialTabsBlock).not.toContain('translate("settings.title")');
    expect(toolbarTitleBlock).toContain('translate("settings.application.title")');
  });

  it("renders SettingsPanel inside the editor tab area only when the Settings tab is active", () => {
    const source = appSource();
    const tabBarIndex = source.indexOf("<DocumentTabBar");
    const bodyIndex = source.indexOf(
      '<section className="editorAreaBody" ref={editorAreaBodyRef}>'
    );
    const statusBarIndex = source.indexOf("<footer className=\"statusBar\">");

    expect(tabBarIndex).toBeGreaterThan(-1);
    expect(bodyIndex).toBeGreaterThan(tabBarIndex);
    expect(statusBarIndex).toBeGreaterThan(bodyIndex);

    const editorAreaBodyBlock = source.slice(bodyIndex, statusBarIndex);

    expect(editorAreaBodyBlock).toContain("isSettingsTabActive ? (");
    expect(editorAreaBodyBlock).toContain("<SettingsPanel");
    expect(editorAreaBodyBlock).toContain("<EditorSurface");
  });

  it("no longer wires an Advanced Settings enable-confirmation flow, but keeps the generic confirmDialog infrastructure reusable elsewhere (#232)", () => {
    const source = appSource();

    expect(source).not.toContain("confirmEnableAdvancedSettings");
    expect(source).not.toContain("onConfirmEnableAdvancedSettings");
    expect(source).not.toContain(
      "settings.application.advanced.enableConfirm"
    );
    // The generic dialog helper itself remains, used by other confirm flows.
    expect(source).toContain("function confirmDialog(");
    expect(
      (source.match(/confirmDialog\(/g) ?? []).length
    ).toBeGreaterThan(1);
  });

  it("closes an active Settings tab without using the dirty document close flow", () => {
    const source = appSource();
    const closeFunctionIndex = source.indexOf(
      "async function closeEditorWithConfirmation"
    );
    const nextFunctionIndex = source.indexOf(
      "function handleActivityBarModeClick",
      closeFunctionIndex
    );

    expect(closeFunctionIndex).toBeGreaterThan(-1);
    expect(nextFunctionIndex).toBeGreaterThan(closeFunctionIndex);

    const closeFunctionBlock = source.slice(closeFunctionIndex, nextFunctionIndex);
    const specialCloseIndex = closeFunctionBlock.indexOf(
      "if (!editorId && isSettingsTabActive)"
    );
    const dirtyCloseIndex = closeFunctionBlock.indexOf("runEditorCloseFlow");

    expect(specialCloseIndex).toBeGreaterThan(-1);
    expect(dirtyCloseIndex).toBeGreaterThan(specialCloseIndex);
    expect(closeFunctionBlock).toContain("closeSpecialTab(\"settings\");");
    expect(closeFunctionBlock).toContain("return;");
  });

  it("does not let Settings-active save commands target the last active document", () => {
    const source = appSource();
    const saveFunctionIndex = source.indexOf("async function saveFile(");
    const saveRequestLogIndex = source.indexOf(
      'event: "save.requested"',
      saveFunctionIndex
    );

    expect(saveFunctionIndex).toBeGreaterThan(-1);
    expect(saveRequestLogIndex).toBeGreaterThan(saveFunctionIndex);

    const savePrefix = source.slice(saveFunctionIndex, saveRequestLogIndex);

    // #375: `isEditorAreaSpecialTabActive` covers both the Settings tab and
    // the Glossary Tag Manager tab (it is `isSettingsTabActive || ...`), so
    // a Settings-active save still cannot target the last active document.
    expect(savePrefix.replace(/\s+/g, " ")).toContain(
      "if ( !targetOpenDocument || (!options.editorId && isEditorAreaSpecialTabActive) )"
    );
    expect(source).toContain(
      "editorIsDirty: !isEditorAreaSpecialTabActive && isDirty"
    );
    expect(source).toContain(
      "editorKindMarkdown:\n          !isEditorAreaSpecialTabActive"
    );
  });
});
