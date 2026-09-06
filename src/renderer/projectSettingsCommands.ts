import {
  type Command,
  type CommandRegistry
} from "../shared/commandRegistry";
import { projectSettingsCommandIds } from "../shared/commandIds";
import type { Translate } from "../shared/i18n";

export { projectSettingsCommandIds };

export interface ProjectSettingsCommandController {
  openProjectSettings(): void;
}

export interface ProjectSettingsCommandTitles {
  open: string;
  openDescription: string;
}

type ProjectSettingsCommand = Command<readonly [], void>;

export function createProjectSettingsCommandTitles(
  translate: Translate
): ProjectSettingsCommandTitles {
  return {
    open: translate("command.project.settings.open"),
    openDescription: translate("command.project.settings.open.description")
  };
}

export function createProjectSettingsCommands(
  controller: ProjectSettingsCommandController,
  titles: ProjectSettingsCommandTitles
): readonly ProjectSettingsCommand[] {
  return [
    {
      id: projectSettingsCommandIds.open,
      title: titles.open,
      description: titles.openDescription,
      when: { key: "project.isOpen" },
      execute: () => {
        controller.openProjectSettings();
      }
    }
  ];
}

export function registerProjectSettingsCommands(
  registry: CommandRegistry,
  controller: ProjectSettingsCommandController,
  titles: ProjectSettingsCommandTitles
): void {
  for (const command of createProjectSettingsCommands(controller, titles)) {
    registry.register(command);
  }
}
