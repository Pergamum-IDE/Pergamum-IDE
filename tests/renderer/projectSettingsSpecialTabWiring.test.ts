import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityBar } from "../../src/renderer/ActivityBar";
import {
  createProjectSettingsCommands,
  createProjectSettingsCommandTitles,
  projectSettingsCommandIds,
  registerProjectSettingsCommands
} from "../../src/renderer/projectSettingsCommands";
import { ProjectSettingsPanel } from "../../src/renderer/ProjectSettingsPanel";
import {
  reorderWorkspaceTabOrder,
  specialWorkspaceTabId,
  syncWorkspaceTabOrder,
  workspaceTabKey,
  workspaceTabs,
  type SpecialWorkspaceTab,
  type WorkspaceTabId
} from "../../src/renderer/workspaceTabs";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { evaluateCommandEnablement } from "../../src/shared/commandEnablement";
import type { Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";

const appSource = () => readFileSync("src/renderer/App.tsx", "utf8");
const translate: Translate = (key) => jaTranslations[key] ?? enTranslations[key] ?? key;

describe("Project Settings special tab identity & workspace tabs (#396)", () => {
  it("defines projectSettings as a special workspace tab with stable key", () => {
    const tabId = specialWorkspaceTabId("projectSettings");

    expect(tabId).toEqual({ kind: "special", id: "projectSettings" });
    expect(workspaceTabKey(tabId)).toBe("special:projectSettings");
  });

  it("participates in workspace tabs and tab ordering (#398)", () => {
    const specialTabs: readonly SpecialWorkspaceTab[] = [
      { kind: "special", id: "settings", title: "設定" },
      { kind: "special", id: "projectSettings", title: "プロジェクト設定" }
    ];
    const tabs = workspaceTabs([], specialTabs);

    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toEqual({
      kind: "special",
      id: "projectSettings",
      title: "プロジェクト設定"
    });

    const initialOrder: readonly WorkspaceTabId[] = [
      specialWorkspaceTabId("settings"),
      specialWorkspaceTabId("projectSettings")
    ];

    const synced = syncWorkspaceTabOrder([], [], specialTabs);
    expect(synced).toEqual(initialOrder);

    // Reordering special tabs with D&D
    const reordered = reorderWorkspaceTabOrder(
      initialOrder,
      specialWorkspaceTabId("projectSettings"),
      0
    );
    expect(reordered).toEqual([
      specialWorkspaceTabId("projectSettings"),
      specialWorkspaceTabId("settings")
    ]);
  });
});

describe("Activity Bar Project Settings entry (#396)", () => {
  function markup(props: Partial<Parameters<typeof ActivityBar>[0]>): string {
    return renderToStaticMarkup(
      React.createElement(ActivityBar, {
        activeMode: "files",
        isApplicationSettingsActive: false,
        translate,
        onSelectMode: () => undefined,
        onOpenApplicationSettings: () => undefined,
        ...props
      })
    );
  }

  it("does not render the Project Settings button when no project is open", () => {
    const rendered = markup({ isProjectOpen: false });

    expect(rendered).not.toContain(jaTranslations["activity.projectSettings"]);
    expect(rendered).toContain(jaTranslations["activity.applicationSettings"]);
  });

  it("renders the Project Settings button immediately above Application Settings when a project is open", () => {
    const rendered = markup({ isProjectOpen: true });

    const projectSettingsLabel = jaTranslations["activity.projectSettings"];
    const appSettingsLabel = jaTranslations["activity.applicationSettings"];

    const projectIndex = rendered.indexOf(projectSettingsLabel);
    const appIndex = rendered.indexOf(appSettingsLabel);

    expect(projectIndex).toBeGreaterThan(-1);
    expect(appIndex).toBeGreaterThan(-1);
    expect(projectIndex).toBeLessThan(appIndex);
  });

  it("reflects active state on the Project Settings button", () => {
    const inactive = markup({ isProjectOpen: true, isProjectSettingsActive: false });
    const active = markup({ isProjectOpen: true, isProjectSettingsActive: true });

    const label = jaTranslations["activity.projectSettings"];
    expect(inactive).toContain(`aria-label="${label}" aria-pressed="false"`);
    expect(active).toContain(`aria-label="${label}" aria-pressed="true"`);
    expect(active).toMatch(/class="[^"]*activityBarItem isActive[^"]*"/);
  });

  it("renders Project Settings button even for read-only projects as long as isProjectOpen is true", () => {
    const rendered = markup({ isProjectOpen: true });

    expect(rendered).toContain(jaTranslations["activity.projectSettings"]);
  });
});

describe("Project Settings command registration & gating (#396)", () => {
  it("registers project.settings.open gated with when: { key: 'project.isOpen' }", () => {
    const registry = new CommandRegistry();
    let opened = false;

    const titles = createProjectSettingsCommandTitles(translate);
    registerProjectSettingsCommands(
      registry,
      { openProjectSettings: () => { opened = true; } },
      titles
    );

    const command = registry.get(projectSettingsCommandIds.open);
    expect(command).toBeDefined();
    expect(command?.id).toBe("project.settings.open");
    expect(command?.title).toBe(jaTranslations["command.project.settings.open"]);
    expect(command?.description).toBe(
      jaTranslations["command.project.settings.open.description"]
    );
    expect(command?.when).toEqual({ key: "project.isOpen" });

    // Enablement evaluation
    expect(
      evaluateCommandEnablement(command?.when, {
        "project.isOpen": false
      })
    ).toBe(false);

    expect(
      evaluateCommandEnablement(command?.when, {
        "project.isOpen": true
      })
    ).toBe(true);

    command?.execute();
    expect(opened).toBe(true);
  });
});

describe("Project Settings panel (#396 Slice 3)", () => {
  it("renders header, description, and editor.fontFamily controls", () => {
    const rendered = renderToStaticMarkup(
      React.createElement(ProjectSettingsPanel, {
        translate,
        projectSettings: undefined,
        inheritedFontFamily: "Consolas",
        isReadOnly: false,
        onSaveSettings: async () => undefined
      })
    );

    expect(rendered).toContain(jaTranslations["settings.project.title"]);
    expect(rendered).toContain(jaTranslations["settings.project.description"]);
    expect(rendered).toContain('class="settingsPanel projectSettingsPanel"');
    expect(rendered).toContain(jaTranslations["settings.editor.fontFamily.label"]);
    expect(rendered).toContain("<input");
  });
});

describe("App wiring for Project Settings special tab (#396)", () => {
  it("maintains dedicated open-state and active-state in App", () => {
    const source = appSource();

    expect(source).toContain(
      "const [isProjectSettingsTabOpen, setIsProjectSettingsTabOpen] ="
    );
    expect(source).toContain(
      'isProjectSettingsTabOpen && activeSpecialTabId === "projectSettings"'
    );
    expect(source).toContain('specialWorkspaceTabId("projectSettings")');
  });

  it("protects zero-document fallback from stealing focus when Project Settings tab is active", () => {
    const source = appSource();

    expect(source).toContain("!isProjectSettingsTabActive");
    expect(source).toContain(
      "(activeSpecialTabId === \"settings\" || !hasOpenDocumentTab)"
    );
  });

  it("registers project settings commands in App and wires Activity Bar click", () => {
    const source = appSource();

    expect(source).toContain("registerProjectSettingsCommands(");
    expect(source).toContain("openProjectSettingsTab();");
    expect(source).toContain("onOpenProjectSettings={() =>");
    expect(source).toContain("executeUiCommand(projectSettingsCommandIds.open");
  });

  it("resets project settings tab on project switch, project close, and cold start", () => {
    const source = appSource();

    const switchIndex = source.indexOf("setIsGlossaryTagManagerTabOpen(false);");
    expect(switchIndex).toBeGreaterThan(-1);

    // Count occurrences of setIsProjectSettingsTabOpen(false)
    const resetMatches = source.match(/setIsProjectSettingsTabOpen\(false\)/g);
    // Should occur at closeSpecialTab, project switch, project close, and cold start (at least 4)
    expect(resetMatches?.length).toBeGreaterThanOrEqual(4);

    // Verify projectSettings is cleared in setActiveSpecialTabId on lifecycle transitions
    expect(source).toMatch(
      /current === "glossaryTagManager" \|\|\s*current === "glossaryEntryManager" \|\|\s*current === "projectSettings"/
    );
  });

  it("closes active Project Settings tab without dirty confirmation in closeEditorWithConfirmation", () => {
    const source = appSource();
    const closeFunctionIndex = source.indexOf(
      "async function closeEditorWithConfirmation"
    );
    const nextFunctionIndex = source.indexOf(
      "runEditorCloseFlow",
      closeFunctionIndex
    );
    const closeBlock = source.slice(closeFunctionIndex, nextFunctionIndex);

    expect(closeBlock).toContain("if (!editorId && isProjectSettingsTabActive) {");
    expect(closeBlock).toContain('closeSpecialTab("projectSettings");');
  });

  it("renders ProjectSettingsPanel inside the editor tab area", () => {
    const source = appSource();
    const bodyIndex = source.indexOf(
      '<section className="editorAreaBody" ref={editorAreaBodyRef}>'
    );
    const statusBarIndex = source.indexOf('<footer className="statusBar">');
    const editorAreaBodyBlock = source.slice(bodyIndex, statusBarIndex);

    expect(editorAreaBodyBlock).toContain("isProjectSettingsTabActive ? (");
    expect(editorAreaBodyBlock).toContain("<ProjectSettingsPanel");
    expect(editorAreaBodyBlock).toContain("projectSettings={project?.config?.settings}");
  });

  it("displays project settings title in the window toolbar when tab is active", () => {
    const source = appSource();
    const toolbarIndex = source.indexOf('<div className="documentTitle">');
    const endToolbarIndex = source.indexOf('</div>', toolbarIndex);
    const toolbarBlock = source.slice(toolbarIndex, endToolbarIndex);

    expect(toolbarBlock).toContain("isProjectSettingsTabActive");
    expect(toolbarBlock).toContain('translate("settings.project.title")');
  });
});
