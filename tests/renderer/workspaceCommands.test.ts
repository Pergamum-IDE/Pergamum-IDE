import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import type { SidebarMode } from "../../src/renderer/sidebarMode";
import {
  createWorkspaceCommandTitles,
  registerWorkspaceCommands,
  workspaceCommandIds,
  workspaceFocusCommandIdForMode
} from "../../src/renderer/workspaceCommands";

const executionOptions = { source: "activityBar" } as const;

describe("workspace commands", () => {
  const titles = {
    toggleFiles: "Focus File Explorer",
    toggleFilesDescription: "Show the File Explorer.",
    focusSearch: "Focus Search",
    focusSearchDescription: "Not implemented.",
    focusGlossary: "Focus Glossary",
    focusGlossaryDescription: "Show the Glossary panel.",
    focusTextMap: "Focus Text Map",
    focusTextMapDescription: "Show the Text Map panel in the left pane.",
    openApplicationSettings: "Open Application Settings",
    openApplicationSettingsDescription: "Open application-wide settings."
  };

  it("registers Workspace focus and settings commands", () => {
    const registry = new CommandRegistry();

    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: () => undefined,
        openApplicationSettings: () => undefined
      },
      titles
    );

    expect(registry.list().map((command) => command.id)).toEqual([
      workspaceCommandIds.toggleFiles,
      workspaceCommandIds.focusSearch,
      workspaceCommandIds.focusGlossary,
      workspaceCommandIds.focusTextMap,
      workspaceCommandIds.openApplicationSettings
    ]);
  });

  it("focuses the requested Sidebar mode through commands", async () => {
    const registry = new CommandRegistry();
    const focusedModes: SidebarMode[] = [];

    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: (mode) => {
          focusedModes.push(mode);
        },
        openApplicationSettings: () => undefined
      },
      titles
    );

    await registry.execute(workspaceCommandIds.toggleFiles, executionOptions);
    await registry.execute(workspaceCommandIds.focusSearch, executionOptions);
    await registry.execute(workspaceCommandIds.focusGlossary, executionOptions);
    await registry.execute(workspaceCommandIds.focusTextMap, executionOptions);

    expect(focusedModes).toEqual(["files", "search", "glossary", "textMap"]);
  });

  it("opens Application Settings through a command", async () => {
    const registry = new CommandRegistry();
    const openApplicationSettings = vi.fn();

    registerWorkspaceCommands(
      registry,
      {
        focusSidebarMode: () => undefined,
        openApplicationSettings
      },
      titles
    );

    await registry.execute(
      workspaceCommandIds.openApplicationSettings,
      executionOptions
    );

    expect(openApplicationSettings).toHaveBeenCalledTimes(1);
  });

  it("maps Sidebar modes to stable Workspace Command IDs", () => {
    expect(workspaceFocusCommandIdForMode("files")).toBe(
      workspaceCommandIds.toggleFiles
    );
    expect(workspaceFocusCommandIdForMode("search")).toBe(
      workspaceCommandIds.focusSearch
    );
    expect(workspaceFocusCommandIdForMode("glossary")).toBe(
      workspaceCommandIds.focusGlossary
    );
    expect(workspaceFocusCommandIdForMode("textMap")).toBe(
      workspaceCommandIds.focusTextMap
    );
  });

  it("creates localized command titles outside the registry", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createWorkspaceCommandTitles(translate)).toEqual({
      toggleFiles: "translated:command.workspace.files.toggle",
      toggleFilesDescription:
        "translated:command.workspace.files.toggle.description",
      focusSearch: "translated:command.workspace.search.focus",
      focusSearchDescription:
        "translated:command.workspace.search.focus.description",
      focusGlossary: "translated:command.workspace.glossary.focus",
      focusGlossaryDescription:
        "translated:command.workspace.glossary.focus.description",
      focusTextMap: "translated:command.workspace.textMap.focus",
      focusTextMapDescription:
        "translated:command.workspace.textMap.focus.description",
      openApplicationSettings:
        "translated:command.workspace.applicationSettings.open",
      openApplicationSettingsDescription:
        "translated:command.workspace.applicationSettings.open.description"
    });
  });

  it("keeps Workspace command definitions independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/workspaceCommands.ts", "utf8");

    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });
});
