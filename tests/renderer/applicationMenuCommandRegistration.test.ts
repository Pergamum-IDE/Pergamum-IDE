import { describe, expect, it } from "vitest";
import { applicationMenuCommandIds } from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { registerApplicationCommands } from "../../src/renderer/applicationCommands";
import { registerAssistCommands } from "../../src/renderer/assistCommands";
import { registerCommandPaletteCommands } from "../../src/renderer/commandPaletteCommands";
import { registerEditorCommands } from "../../src/renderer/editorCommands";

describe("application menu command registration", () => {
  it("registers every allowlisted application menu command in the renderer registry", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => undefined,
        quitApplication: () => undefined,
        createProject: () => undefined,
        openProject: () => undefined,
        closeProject: () => undefined,
        toggleRecentProjects: () => undefined
      },
      {
        openAbout: "About Pergamum",
        openAboutDescription:
          "Show Pergamum version, license, and repository information.",
        quitApplication: "Quit Pergamum",
        quitApplicationDescription: "Quit Pergamum",
        createProject: "Create Project",
        createProjectDescription: "Create Project",
        openProject: "Open Project",
        openProjectDescription: "Open Project",
        closeProject: "Close Project",
        closeProjectDescription: "Close Project",
        toggleRecentProjects: "Toggle Recent Projects",
        toggleRecentProjectsDescription: "Toggle Recent Projects"
      }
    );
    registerEditorCommands(
      registry,
      {
        openMarkdownDocument: () => undefined,
        saveCurrentDocument: () => undefined,
        saveCurrentDocumentAs: () => undefined,
        canSaveCurrentDocument: () => true,
        canSaveCurrentDocumentAs: () => true,
        closeEditor: () => undefined,
        canCloseEditor: () => true,
        delegateNativeEditCommand: () => undefined,
        canDelegateNativeEditCommand: () => true
      },
      {
        openMarkdownDocument: "Open Markdown File",
        openMarkdownDocumentDescription: "Open Markdown File",
        saveDocument: "Save",
        saveDocumentDescription: "Save",
        saveAs: "Save As",
        saveAsDescription: "Save As",
        closeEditor: "Close Current Document",
        closeEditorDescription: "Close Current Document",
        cutSelection: "Cut",
        cutSelectionDescription: "Cut",
        copySelection: "Copy",
        copySelectionDescription: "Copy",
        pasteSelection: "Paste",
        pasteSelectionDescription: "Paste",
        selectAllSelection: "Select All",
        selectAllSelectionDescription: "Select All"
      }
    );
    registerAssistCommands(
      registry,
      {
        showLineEndingDistribution: () => undefined,
        insertParagraphIndent: () => undefined,
        removeParagraphIndent: () => undefined
      },
      {
        showLineEndingDistribution: "Show Line Ending Distribution",
        showLineEndingDistributionDescription: "Show line endings",
        insertParagraphIndent: "Insert Paragraph Indents",
        insertParagraphIndentDescription: "Insert paragraph indents",
        removeParagraphIndent: "Remove Paragraph Indents",
        removeParagraphIndentDescription: "Remove paragraph indents"
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
