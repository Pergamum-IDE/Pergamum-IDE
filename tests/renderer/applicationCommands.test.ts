import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  applicationCommandIds,
  createApplicationCommandTitles,
  registerApplicationCommands
} from "../../src/renderer/applicationCommands";

const titles = {
  createProject: "Create Project",
  createProjectDescription: "Create a new Pergamum project.",
  openProject: "Open Project",
  openProjectDescription:
    "Open an existing project. Check for unsaved changes before switching projects.",
  toggleRecentProjects: "Toggle Recent Projects",
  toggleRecentProjectsDescription:
    "Switch between recently opened projects. Check for unsaved changes before switching projects."
};
const executionOptions = { source: "toolbar" } as const;

describe("application commands", () => {
  it("registers app-level project and Recent Projects commands", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        createProject: () => undefined,
        openProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      titles
    );

    expect(registry.list().map((command) => command.id)).toEqual([
      "workspace.project.create",
      "workspace.project.open",
      "workspace.recentProjects.toggle"
    ]);
  });

  it("routes app commands to their controller methods", async () => {
    const registry = new CommandRegistry();
    const createProject = vi.fn();
    const openProject = vi.fn();
    const toggleRecentProjects = vi.fn();

    registerApplicationCommands(
      registry,
      {
        createProject,
        openProject,
        toggleRecentProjects
      },
      titles
    );

    await registry.execute(
      applicationCommandIds.createProject,
      executionOptions
    );
    await registry.execute(applicationCommandIds.openProject, executionOptions);
    await registry.execute(
      applicationCommandIds.toggleRecentProjects,
      executionOptions
    );

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(toggleRecentProjects).toHaveBeenCalledTimes(1);
  });

  it("creates localized command titles from command i18n keys", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createApplicationCommandTitles(translate)).toEqual({
      createProject: "translated:command.workspace.project.create",
      createProjectDescription:
        "translated:command.workspace.project.create.description",
      openProject: "translated:command.workspace.project.open",
      openProjectDescription:
        "translated:command.workspace.project.open.description",
      toggleRecentProjects: "translated:command.workspace.recentProjects.toggle",
      toggleRecentProjectsDescription:
        "translated:command.workspace.recentProjects.toggle.description"
    });
  });

  it("does not introduce toolbar-prefixed Command IDs", () => {
    expect(Object.values(applicationCommandIds)).not.toContain("toolbar");
    expect(Object.values(applicationCommandIds).join("\n")).not.toContain(
      "toolbar."
    );
  });

  it("keeps application command definitions independent from React and DOM APIs", () => {
    const source = readFileSync("src/renderer/applicationCommands.ts", "utf8");

    expect(source).toContain("../shared/commandIds");
    expect(source).not.toContain("defineCommandId(");
    expect(source).not.toContain("from \"react\"");
    expect(source).not.toContain("from 'react'");
    expect(source).not.toContain("window.");
    expect(source).not.toContain("document.");
    expect(source).not.toContain("HTMLElement");
    expect(source).not.toContain("JSX");
  });
});
