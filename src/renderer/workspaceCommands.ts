import { workspaceCommandIds } from "../shared/commandIds";
import {
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import type { Translate } from "../shared/i18n";
import type { SidebarMode } from "./sidebarMode";
import { selectSidebarMode } from "./sidebarMode";

export { workspaceCommandIds };

export type WorkspaceFocusCommandId =
  | typeof workspaceCommandIds.toggleFiles
  | typeof workspaceCommandIds.focusSearch
  | typeof workspaceCommandIds.focusGlossary
  | typeof workspaceCommandIds.focusDocumentMap
  | typeof workspaceCommandIds.focusDocumentMetrics;

export interface WorkspaceCommandController {
  focusSidebarMode(mode: SidebarMode): void;
  openApplicationSettings(): void;
  showResumeHub(): void;
  canShowResumeHub(): boolean;
}

export interface WorkspaceCommandTitles {
  toggleFiles: string;
  toggleFilesDescription: string;
  focusSearch: string;
  focusSearchDescription: string;
  focusGlossary: string;
  focusGlossaryDescription: string;
  focusDocumentMap: string;
  focusDocumentMapDescription: string;
  focusDocumentMetrics: string;
  focusDocumentMetricsDescription: string;
  openApplicationSettings: string;
  openApplicationSettingsDescription: string;
  showResumeHub: string;
  showResumeHubDescription: string;
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
    focusDocumentMap: translate("command.workspace.documentMap.focus"),
    focusDocumentMapDescription: translate(
      "command.workspace.documentMap.focus.description"
    ),
    focusDocumentMetrics: translate(
      "command.workspace.documentMetrics.focus"
    ),
    focusDocumentMetricsDescription: translate(
      "command.workspace.documentMetrics.focus.description"
    ),
    openApplicationSettings: translate(
      "command.workspace.applicationSettings.open"
    ),
    openApplicationSettingsDescription: translate(
      "command.workspace.applicationSettings.open.description"
    ),
    showResumeHub: translate("command.workbench.showResumeHub"),
    showResumeHubDescription: translate(
      "command.workbench.showResumeHub.description"
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
    case "documentMap":
      return workspaceCommandIds.focusDocumentMap;
    case "documentMetrics":
      return workspaceCommandIds.focusDocumentMetrics;
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
      category: "navigation",
      paletteOrder: 20,
      execute: () => {
        controller.focusSidebarMode("files");
      }
    },
    {
      id: workspaceCommandIds.focusSearch,
      title: titles.focusSearch,
      description: titles.focusSearchDescription,
      category: "search",
      paletteOrder: 10,
      execute: () => {
        controller.focusSidebarMode("search");
      }
    },
    {
      id: workspaceCommandIds.focusGlossary,
      title: titles.focusGlossary,
      description: titles.focusGlossaryDescription,
      category: "navigation",
      paletteOrder: 30,
      execute: () => {
        controller.focusSidebarMode("glossary");
      }
    },
    {
      id: workspaceCommandIds.focusDocumentMap,
      title: titles.focusDocumentMap,
      description: titles.focusDocumentMapDescription,
      category: "navigation",
      paletteOrder: 40,
      execute: () => {
        controller.focusSidebarMode("documentMap");
      }
    },
    {
      id: workspaceCommandIds.focusDocumentMetrics,
      title: titles.focusDocumentMetrics,
      description: titles.focusDocumentMetricsDescription,
      category: "navigation",
      paletteOrder: 50,
      execute: () => {
        controller.focusSidebarMode("documentMetrics");
      }
    },
    {
      id: workspaceCommandIds.openApplicationSettings,
      title: titles.openApplicationSettings,
      description: titles.openApplicationSettingsDescription,
      category: "file",
      paletteOrder: 110,
      execute: () => {
        controller.openApplicationSettings();
      }
    },
    {
      id: workspaceCommandIds.showResumeHub,
      title: titles.showResumeHub,
      description: titles.showResumeHubDescription,
      when: { key: "project.isOpen" },
      category: "help",
      paletteOrder: 10,
      execute: () => {
        if (!controller.canShowResumeHub()) {
          return;
        }
        controller.showResumeHub();
      },
      isEnabled: () => controller.canShowResumeHub()
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
