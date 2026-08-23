import {
  defineCommandId,
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import { selectSidebarMode } from "./sidebarMode";

export const workspaceCommandIds = {
  focusFiles: defineCommandId("workspace.files.focus"),
  focusSearch: defineCommandId("workspace.search.focus"),
  focusGlossary: defineCommandId("workspace.glossary.focus"),
  openApplicationSettings: defineCommandId("workspace.applicationSettings.open")
} as const;

export type WorkspaceFocusCommandId =
  | typeof workspaceCommandIds.focusFiles
  | typeof workspaceCommandIds.focusSearch
  | typeof workspaceCommandIds.focusGlossary;

export interface WorkspaceCommandController {
  focusSidebarMode(mode: SidebarMode): void;
  openApplicationSettings(): void;
}

export interface WorkspaceCommandTitles {
  focusFiles: string;
  focusFilesDescription: string;
  focusSearch: string;
  focusSearchDescription: string;
  focusGlossary: string;
  focusGlossaryDescription: string;
  openApplicationSettings: string;
  openApplicationSettingsDescription: string;
}

type WorkspaceCommand = Command<readonly [], void>;

export function createWorkspaceCommandTitles(
  translate: Translate
): WorkspaceCommandTitles {
  return {
    focusFiles: translate("command.workspace.files.focus"),
    focusFilesDescription: translate("command.workspace.files.focus.description"),
    focusSearch: translate("command.workspace.search.focus"),
    focusSearchDescription: translate(
      "command.workspace.search.focus.description"
    ),
    focusGlossary: translate("command.workspace.glossary.focus"),
    focusGlossaryDescription: translate(
      "command.workspace.glossary.focus.description"
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
      return workspaceCommandIds.focusFiles;
    case "search":
      return workspaceCommandIds.focusSearch;
    case "glossary":
      return workspaceCommandIds.focusGlossary;
  }
}

export function createWorkspaceCommands(
  controller: WorkspaceCommandController,
  titles: WorkspaceCommandTitles
): readonly WorkspaceCommand[] {
  return [
    {
      id: workspaceCommandIds.focusFiles,
      title: titles.focusFiles,
      description: titles.focusFilesDescription,
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
