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
        createProject: () => undefined,
        openProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      {
        createProject: "Create Project",
        openProject: "Open Project",
        toggleRecentProjects: "Toggle Recent Projects"
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
