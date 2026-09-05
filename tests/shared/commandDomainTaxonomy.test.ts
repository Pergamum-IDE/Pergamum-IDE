import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  CORE_COMMAND_DOMAINS,
  RESERVED_COMMAND_NAMESPACE_ROOTS
} from "../../src/shared/commandTaxonomy";
import { registerApplicationCommands } from "../../src/renderer/applicationCommands";
import { registerAssistCommands } from "../../src/renderer/assistCommands";
import { registerCommandPaletteCommands } from "../../src/renderer/commandPaletteCommands";
import { registerDebugLogCommands } from "../../src/renderer/debugLogCommands";
import { registerEditorCommands } from "../../src/renderer/editorCommands";
import { registerFileExplorerCommands } from "../../src/renderer/fileExplorerCommands";
import { registerGlossaryCommands } from "../../src/renderer/glossaryCommands";
import { registerLineJumpCommands } from "../../src/renderer/lineJumpCommands";
import { registerGlossaryOccurrencesCommands } from "../../src/renderer/glossaryOccurrencesCommands";
import { registerRecoveryCommands } from "../../src/renderer/recovery/recoveryCommands";
import { registerUtilityWindowCommands } from "../../src/renderer/utilityWindowCommands";
import { registerWorkspaceCommands } from "../../src/renderer/workspaceCommands";

// This guard matches `register*Commands` by name. A registration function
// named outside that convention will not be detected, so new command
// registration functions must follow it.
//
// このガードは `register*Commands` という命名でマッチする。規約から外れた名前の
// 登録関数は検出できないため、新しい command 登録関数はこの命名に従うこと。
function commandRegistrationCallNames(source: string): readonly string[] {
  const names = Array.from(
    source.matchAll(/\b(register[A-Z][A-Za-z]+Commands)\s*\(/g),
    (match) => match[1]
  ).filter((name) => name !== "registerCoreCommands");

  return [...new Set(names)].sort();
}

function firstCommandIdSegment(commandId: string): string {
  return commandId.split(".")[0] ?? "";
}

function buildCoreCommandRegistry(): CommandRegistry {
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
      saveAllDocuments: () => undefined,
      canSaveCurrentDocument: () => true,
      canSaveCurrentDocumentAs: () => true,
      canSaveAllDocuments: () => true,
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
      saveAll: "Save All",
      saveAllDescription: "Save All",
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
  registerLineJumpCommands(
    registry,
    {
      goToLine: () => undefined
    },
    {
      goToLine: "Go to Line",
      goToLineDescription: "Move the cursor to a line in the active editor"
    }
  );
  registerWorkspaceCommands(
    registry,
    {
      focusSidebarMode: () => undefined,
      openApplicationSettings: () => undefined
    },
    {
      toggleFiles: "Toggle File Explorer",
      toggleFilesDescription: "Toggle File Explorer",
      focusSearch: "Focus Search",
      focusSearchDescription: "Focus Search",
      focusGlossary: "Focus Glossary",
      focusGlossaryDescription: "Focus Glossary",
      focusDocumentMap: "Focus Document Map",
      focusDocumentMapDescription: "Focus Document Map",
      focusDocumentMetrics: "Focus Document Metrics",
      focusDocumentMetricsDescription: "Focus Document Metrics",
      openApplicationSettings: "Open Application Settings",
      openApplicationSettingsDescription: "Open Application Settings"
    }
  );
  registerFileExplorerCommands(
    registry,
    {
      requestFileExplorerCreate: () => undefined,
      requestRenameActiveEditorFile: () => undefined
    },
    {
      createMarkdownFile: "Create New Markdown File",
      createMarkdownFileDescription:
        "Create a Markdown file at the current File Explorer selection.",
      createFolder: "Create New Folder",
      createFolderDescription:
        "Create a folder at the current File Explorer selection.",
      rename: "Rename",
      renameDescription:
        "Rename the selected File Explorer file or empty folder."
    }
  );
  registerUtilityWindowCommands(
    registry,
    {
      openUtilityWindow: () => undefined,
      closeUtilityWindow: () => undefined,
      toggleUtilityWindow: () => undefined
    },
    {
      open: "Open Utility Window",
      openDescription: "Open Utility Window",
      close: "Close Utility Window",
      closeDescription: "Close Utility Window",
      toggle: "Toggle Utility Window",
      toggleDescription: "Toggle Utility Window"
    }
  );
  // #377: the Debug Log command is registered only in `--pergamum-debug`
  // mode, but the taxonomy guard still checks it lives under a core domain.
  registerDebugLogCommands(
    registry,
    {
      openDebugLog: () => undefined
    },
    {
      open: "Open Debug Log",
      openDescription: "Open the Debug Log tab."
    }
  );
  registerGlossaryCommands(
    registry,
    {
      openGlossaryEntry: () => true,
      createGlossaryEntry: () => true,
      navigateToPreviousGlossaryOccurrence: () => true,
      navigateToNextGlossaryOccurrence: () => true,
      openGlossaryTagManager: () => true,
      openGlossaryEntryManager: () => true
    },
    {
      openEntry: "Open glossary entry",
      createEntry: "Create glossary entry",
      previousOccurrence: "Previous occurrence",
      nextOccurrence: "Next occurrence",
      manageTags: "Manage glossary tags",
      manageTagsDescription: "Manage glossary tags",
      manageEntries: "Manage glossary entries",
      manageEntriesDescription: "Manage glossary entries"
    }
  );
  registerGlossaryOccurrencesCommands(
    registry,
    {
      navigateToPreviousOccurrence: () => true,
      navigateToNextOccurrence: () => true,
      openTrackedGlossaryEntry: () => true,
      closeGlossaryOccurrenceTracking: () => true
    },
    {
      previous: "Previous occurrence",
      previousDescription: "Previous occurrence",
      next: "Next occurrence",
      nextDescription: "Next occurrence",
      openEntry: "Open entry",
      openEntryDescription: "Open entry",
      closeTracking: "Close tracking",
      closeTrackingDescription: "Close tracking"
    }
  );
  registerCommandPaletteCommands(
    registry,
    { openCommandPalette: () => undefined },
    { open: "Command Palette", openDescription: "Open the Command Palette" }
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
      showLineEndingDistributionDescription:
        "Show the distribution of LF, CRLF, and CR line endings in the current document.",
      insertParagraphIndent: "Insert Paragraph Indents",
      insertParagraphIndentDescription: "Insert paragraph indents",
      removeParagraphIndent: "Remove Paragraph Indents",
      removeParagraphIndentDescription: "Remove paragraph indents"
    }
  );
  registerRecoveryCommands(
    registry,
    { showRecoveryDocuments: () => undefined },
    {
      showRecoveryDocuments: "Recover Unsaved Changes",
      showRecoveryDocumentsDescription: "Recover Unsaved Changes"
    }
  );

  return registry;
}

function registeredCoreCommandIds(): readonly string[] {
  return buildCoreCommandRegistry().list().map((command) => String(command.id));
}

describe("command domain taxonomy", () => {
  it("keeps the taxonomy registry builder aligned with App command registrations", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const testSource = readFileSync(
      "tests/shared/commandDomainTaxonomy.test.ts",
      "utf8"
    );

    expect(commandRegistrationCallNames(testSource)).toEqual(
      commandRegistrationCallNames(appSource)
    );
  });

  it("registers built-in commands only under known core command domains", () => {
    const coreCommandDomainSet = new Set<string>(CORE_COMMAND_DOMAINS);
    const unknownDomainCommandIds = registeredCoreCommandIds().filter(
      (commandId) =>
        !coreCommandDomainSet.has(firstCommandIdSegment(commandId))
    );

    expect(unknownDomainCommandIds).toEqual([]);
  });

  it("does not register built-in commands under reserved namespace roots", () => {
    const reservedNamespaceRootSet = new Set<string>(
      RESERVED_COMMAND_NAMESPACE_ROOTS
    );
    const reservedNamespaceCommandIds = registeredCoreCommandIds().filter(
      (commandId) =>
        reservedNamespaceRootSet.has(firstCommandIdSegment(commandId))
    );

    expect(reservedNamespaceCommandIds).toEqual([]);
  });

  it("keeps the app domain limited to application-level commands", () => {
    const registeredAppCommandIds = registeredCoreCommandIds().filter(
      (commandId) => firstCommandIdSegment(commandId) === "app"
    );

    expect(registeredAppCommandIds).toEqual(["app.about.open", "app.quit"]);
  });
});
