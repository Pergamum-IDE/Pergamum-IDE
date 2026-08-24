import { describe, expect, it } from "vitest";
import { applicationMenuCommandIds } from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { registerApplicationCommands } from "../../src/renderer/applicationCommands";
import { registerCommandPaletteCommands } from "../../src/renderer/commandPaletteCommands";
import { registerEditorCommands } from "../../src/renderer/editorCommands";

describe("application menu command registration", () => {
  it("registers every allowlisted application menu command in the renderer registry", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => undefined,
        createProject: () => undefined,
        openProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      {
        openAbout: "About Pergamum",
        openAboutDescription:
          "Show Pergamum version, license, and repository information.",
        createProject: "Create Project",
        createProjectDescription: "Create Project",
        openProject: "Open Project",
        openProjectDescription: "Open Project",
        toggleRecentProjects: "Toggle Recent Projects",
        toggleRecentProjectsDescription: "Toggle Recent Projects"
      }
    );
    registerEditorCommands(
      registry,
      {
        openMarkdownDocument: () => undefined,
        saveCurrentDocument: () => undefined,
        canSaveCurrentDocument: () => true,
        closeEditor: () => undefined,
        canCloseEditor: () => true,
        delegateNativeEditCommand: () => undefined,
        canDelegateNativeEditCommand: () => true
      },
      {
        openMarkdownDocument: "Open Markdown File",
        saveDocument: "Save",
        closeEditor: "Close Current Document",
        cutSelection: "Cut",
        copySelection: "Copy",
        pasteSelection: "Paste",
        selectAllSelection: "Select All"
      }
    );
    registerCommandPaletteCommands(
      registry,
      { openCommandPalette: () => undefined },
      { open: "Command Palette", openDescription: "Open the Command Palette" }
    );

    expect(
      applicationMenuCommandIds.map((commandId) => registry.get(commandId))
    ).toEqual(applicationMenuCommandIds.map(() => expect.any(Object)));
  });
});
