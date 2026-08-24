import type { Command, CommandRegistry } from "../shared/commandRegistry";
import { applicationCommandIds } from "../shared/commandIds";
import type { Translate } from "../shared/i18n";

export { applicationCommandIds };

export interface ApplicationCommandController {
  openAbout(): void | Promise<void>;
  createProject(): void | Promise<void>;
  openProject(): void | Promise<void>;
  toggleRecentProjects(): void;
}

export interface ApplicationCommandTitles {
  openAbout: string;
  openAboutDescription: string;
  createProject: string;
  createProjectDescription: string;
  openProject: string;
  openProjectDescription: string;
  toggleRecentProjects: string;
  toggleRecentProjectsDescription: string;
}

type ApplicationCommand = Command<readonly [], void>;

export function createApplicationCommandTitles(
  translate: Translate
): ApplicationCommandTitles {
  return {
    openAbout: translate("command.app.about.open"),
    openAboutDescription: translate("command.app.about.open.description"),
    createProject: translate("command.workspace.project.create"),
    createProjectDescription: translate(
      "command.workspace.project.create.description"
    ),
    openProject: translate("command.workspace.project.open"),
    openProjectDescription: translate(
      "command.workspace.project.open.description"
    ),
    toggleRecentProjects: translate("command.workspace.recentProjects.toggle"),
    toggleRecentProjectsDescription: translate(
      "command.workspace.recentProjects.toggle.description"
    )
  };
}

export function createApplicationCommands(
  controller: ApplicationCommandController,
  titles: ApplicationCommandTitles
): readonly ApplicationCommand[] {
  return [
    {
      id: applicationCommandIds.openAbout,
      title: titles.openAbout,
      description: titles.openAboutDescription,
      execute: () => controller.openAbout()
    },
    {
      id: applicationCommandIds.createProject,
      title: titles.createProject,
      description: titles.createProjectDescription,
      execute: () => controller.createProject()
    },
    {
      id: applicationCommandIds.openProject,
      title: titles.openProject,
      description: titles.openProjectDescription,
      execute: () => controller.openProject()
    },
    {
      id: applicationCommandIds.toggleRecentProjects,
      title: titles.toggleRecentProjects,
      description: titles.toggleRecentProjectsDescription,
      execute: () => controller.toggleRecentProjects()
    }
  ];
}

export function registerApplicationCommands(
  registry: CommandRegistry,
  controller: ApplicationCommandController,
  titles: ApplicationCommandTitles
): void {
  for (const command of createApplicationCommands(controller, titles)) {
    registry.register(command);
  }
}
