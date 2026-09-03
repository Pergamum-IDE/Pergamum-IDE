import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import { selectSidebarMode } from "./sidebarMode";

export const workspaceCommandIds = {
  toggleFiles: defineCommandId("workspace.files.toggle"),
  focusSearch: defineCommandId("workspace.search.focus"),
  focusGlossary: defineCommandId("workspace.glossary.focus"),
  focusTextMap: defineCommandId("workspace.textMap.focus"),
  openApplicationSettings: defineCommandId("workspace.applicationSettings.open")
} as const;

export type WorkspaceFocusCommandId =
  | typeof workspaceCommandIds.toggleFiles
  | typeof workspaceCommandIds.focusSearch
  | typeof workspaceCommandIds.focusGlossary
  | typeof workspaceCommandIds.focusTextMap;

export interface WorkspaceCommandController {
  focusSidebarMode(mode: SidebarMode): void;
  openApplicationSettings(): void;
}

export interface WorkspaceCommandTitles {
  toggleFiles: string;
  toggleFilesDescription: string;
  focusSearch: string;
  focusSearchDescription: string;
  focusGlossary: string;
  focusGlossaryDescription: string;
  focusTextMap: string;
  focusTextMapDescription: string;
  openApplicationSettings: string;
  openApplicationSettingsDescription: string;
}

type WorkspaceCommand = Command<readonly [], void>;

export function createWorkspaceCommandTitles(
  translate: Translate
): WorkspaceCommandTitles {
  return {
    toggleFiles: translate("command.workspace.files.toggle"),
    toggleFilesDescription: translate("command.workspace.files.toggle.description"),
    focusSearch: translate("command.workspace.search.focus"),
    focusSearchDescription: translate(
      "command.workspace.search.focus.description"
    ),
    focusGlossary: translate("command.workspace.glossary.focus"),
    focusGlossaryDescription: translate(
      "command.workspace.glossary.focus.description"
    ),
    focusTextMap: translate("command.workspace.textMap.focus"),
    focusTextMapDescription: translate(
      "command.workspace.textMap.focus.description"
    ),
    openApplicationSettings: translate(
      "command.workspace.applicationSettings.open"
    ),
    openApplicationSettingsDescription: translate(
      "command.workspace.applicationSettings.open.description"
    )
  };
}

export function workspaceFocusCommandIdForMode(
  mode: SidebarMode
): WorkspaceFocusCommandId {
  switch (selectSidebarMode(mode)) {
    case "files":
      return workspaceCommandIds.toggleFiles;
    case "search":
      return workspaceCommandIds.focusSearch;
    case "glossary":
      return workspaceCommandIds.focusGlossary;
    case "textMap":
      return workspaceCommandIds.focusTextMap;
  }
}

export function createWorkspaceCommands(
  controller: WorkspaceCommandController,
  titles: WorkspaceCommandTitles
): readonly WorkspaceCommand[] {
  return [
    {
      id: workspaceCommandIds.toggleFiles,
      title: titles.toggleFiles,
      description: titles.toggleFilesDescription,
      execute: () => {
        controller.focusSidebarMode("files");
      }
    },
    {
      id: workspaceCommandIds.focusSearch,
      title: titles.focusSearch,
      description: titles.focusSearchDescription,
      execute: () => {
        controller.focusSidebarMode("search");
      }
    },
    {
      id: workspaceCommandIds.focusGlossary,
      title: titles.focusGlossary,
      description: titles.focusGlossaryDescription,
      execute: () => {
        controller.focusSidebarMode("glossary");
      }
    },
    {
      id: workspaceCommandIds.focusTextMap,
      title: titles.focusTextMap,
      description: titles.focusTextMapDescription,
      execute: () => {
        controller.focusSidebarMode("textMap");
      }
    },
    {
      id: workspaceCommandIds.openApplicationSettings,
      title: titles.openApplicationSettings,
      description: titles.openApplicationSettingsDescription,
      execute: () => {
        controller.openApplicationSettings();
      }
    }
  ];
}

export function registerWorkspaceCommands(
  registry: CommandRegistry,
  controller: WorkspaceCommandController,
  titles: WorkspaceCommandTitles
): void {
  for (const command of createWorkspaceCommands(controller, titles)) {
    registry.register(command);
  }
}
