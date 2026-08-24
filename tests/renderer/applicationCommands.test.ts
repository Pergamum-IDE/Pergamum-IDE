import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  applicationCommandIds,
  createApplicationCommandTitles,
  registerApplicationCommands
} from "../../src/renderer/applicationCommands";
import { listCommandPaletteEntries } from "../../src/renderer/commandPaletteEntries";

const titles = {
  openAbout: "About Pergamum",
  openAboutDescription:
    "Show Pergamum version, license, and repository information.",
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
  it("registers app-level About, project, and Recent Projects commands", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => undefined,
        createProject: () => undefined,
        openProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      titles
    );

    expect(registry.list().map((command) => command.id)).toEqual([
      "app.about.open",
      "workspace.project.create",
      "workspace.project.open",
      "workspace.recentProjects.toggle"
    ]);
  });

  it("routes app commands to their controller methods", async () => {
    const registry = new CommandRegistry();
    const openAbout = vi.fn();
    const createProject = vi.fn();
    const openProject = vi.fn();
    const toggleRecentProjects = vi.fn();

    registerApplicationCommands(
      registry,
      {
        openAbout,
        createProject,
        openProject,
        toggleRecentProjects
      },
      titles
    );

    await registry.execute(applicationCommandIds.openAbout, executionOptions);
    await registry.execute(
      applicationCommandIds.createProject,
      executionOptions
    );
    await registry.execute(applicationCommandIds.openProject, executionOptions);
    await registry.execute(
      applicationCommandIds.toggleRecentProjects,
      executionOptions
    );

    expect(openAbout).toHaveBeenCalledTimes(1);
    expect(createProject).toHaveBeenCalledTimes(1);
    expect(openProject).toHaveBeenCalledTimes(1);
    expect(toggleRecentProjects).toHaveBeenCalledTimes(1);
  });

  it("exposes About command metadata to the Command Palette", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => undefined,
        createProject: () => undefined,
        openProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      titles
    );

    expect(listCommandPaletteEntries(registry)[0]).toMatchObject({
      id: applicationCommandIds.openAbout,
      title: titles.openAbout,
      description: titles.openAboutDescription,
      enabled: true,
      disabledReason: null
    });
  });

  it("creates localized command titles from command i18n keys", () => {
    const translate = vi.fn((key: string) => `translated:${key}`);

    expect(createApplicationCommandTitles(translate)).toEqual({
      openAbout: "translated:command.app.about.open",
      openAboutDescription: "translated:command.app.about.open.description",
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
