import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import {
  filterCommandPaletteEntries,
  listCommandPaletteEntries
} from "../../src/renderer/commandPaletteEntries";
import { registerApplicationCommands } from "../../src/renderer/applicationCommands";
import { registerEditorCommands } from "../../src/renderer/editorCommands";
import { registerWorkspaceCommands } from "../../src/renderer/workspaceCommands";
import { registerFileExplorerCommands } from "../../src/renderer/fileExplorerCommands";
import { registerProjectSettingsCommands } from "../../src/renderer/projectSettingsCommands";
import { registerAssistCommands } from "../../src/renderer/assistCommands";
import { registerGlossaryCommands } from "../../src/renderer/glossaryCommands";
import { registerGlossaryEntryTabCommands } from "../../src/renderer/glossaryEntryTabCommands";
import { registerRecoveryCommands } from "../../src/renderer/recovery/recoveryCommands";

function buildFullCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registerApplicationCommands(
    registry,
    {
      openAbout: () => undefined,
      quitApplication: () => undefined,
      createProject: () => undefined,
      openProject: () => undefined,
      closeProject: () => undefined,
      openBulkTextImportDialog: () => undefined,
      zoomIn: () => undefined,
      zoomOut: () => undefined,
      resetZoom: () => undefined
    },
    {
      openAbout: "About Pergamum",
      openAboutDescription: "",
      quitApplication: "Quit Pergamum",
      quitApplicationDescription: "",
      createProject: "Create Project",
      createProjectDescription: "",
      openProject: "Open Project",
      openProjectDescription: "",
      closeProject: "Close Project",
      closeProjectDescription: "",
      openBulkTextImportDialog: "Bulk Import",
      openBulkTextImportDialogDescription: "",
      zoomIn: "Zoom In",
      zoomInDescription: "",
      zoomOut: "Zoom Out",
      zoomOutDescription: "",
      resetZoom: "Reset Zoom",
      resetZoomDescription: ""
    }
  );

  registerEditorCommands(
    registry,
    {
      newFile: () => undefined,
      canNewFile: () => true,
      openMarkdownDocument: () => undefined,
      saveCurrentDocument: () => undefined,
      saveCurrentDocumentAs: () => undefined,
      saveAllDocuments: () => undefined,
      canSaveCurrentDocument: () => true,
      canSaveCurrentDocumentAs: () => true,
      canSaveAllDocuments: () => true,
      closeEditor: () => undefined,
      canCloseEditor: () => true,
      insertImage: () => undefined,
      canInsertImage: () => true,
      insertBlockquote: () => undefined,
      canInsertBlockquote: () => true,
      toggleSyntaxChecker: () => undefined,
      canToggleSyntaxChecker: () => true,
      applyBold: () => undefined,
      canApplyBold: () => true,
      applyItalic: () => undefined,
      canApplyItalic: () => true,
      applyStrikethrough: () => undefined,
      canApplyStrikethrough: () => true,
      insertHeading: () => undefined,
      canInsertHeading: () => true,
      insertLink: () => undefined,
      canInsertLink: () => true,
      insertHorizontalRule: () => undefined,
      canInsertHorizontalRule: () => true,
      insertCodeBlock: () => undefined,
      canInsertCodeBlock: () => true,
      insertTable: () => undefined,
      canInsertTable: () => true,
      insertCallout: () => undefined,
      canInsertCallout: () => true,
      insertRuby: () => undefined,
      canInsertRuby: () => true,
      insertEmphasisMark: () => undefined,
      canInsertEmphasisMark: () => true,
      indent: () => undefined,
      canIndent: () => true,
      outdent: () => undefined,
      canOutdent: () => true,
      togglePreview: () => undefined,
      canTogglePreview: () => true,
      delegateNativeEditCommand: () => undefined,
      canDelegateNativeEditCommand: () => true
    },
    {
      newFile: "New File",
      newFileDescription: "",
      openMarkdownDocument: "Open Markdown File",
      openMarkdownDocumentDescription: "",
      saveDocument: "Save",
      saveDocumentDescription: "",
      saveAll: "Save All",
      saveAllDescription: "",
      saveAs: "Save As",
      saveAsDescription: "",
      closeEditor: "Close Editor",
      closeEditorDescription: "",
      insertImage: "Insert Image",
      insertImageDescription: "",
      insertBlockquote: "Insert Blockquote",
      insertBlockquoteDescription: "",
      toggleSyntaxChecker: "Toggle Syntax Checker",
      toggleSyntaxCheckerDescription: "",
      bold: "Bold",
      boldDescription: "",
      italic: "Italic",
      italicDescription: "",
      strikethrough: "Strikethrough",
      strikethroughDescription: "",
      heading: "Heading",
      headingDescription: "",
      link: "Link",
      linkDescription: "",
      insertHorizontalRule: "Insert Horizontal Rule",
      insertHorizontalRuleDescription: "",
      insertCodeBlock: "Insert Code Block",
      insertCodeBlockDescription: "",
      insertTable: "Insert Table",
      insertTableDescription: "",
      insertCallout: "Insert Callout",
      insertCalloutDescription: "",
      insertRuby: "Insert Ruby",
      insertRubyDescription: "",
      insertEmphasisMark: "Insert Emphasis Mark",
      insertEmphasisMarkDescription: "",
      indent: "Indent",
      indentDescription: "",
      outdent: "Outdent",
      outdentDescription: "",
      togglePreview: "Toggle Preview",
      togglePreviewDescription: "",
      undo: "Undo",
      undoDescription: "",
      redo: "Redo",
      redoDescription: "",
      cutSelection: "Cut",
      cutSelectionDescription: "",
      copySelection: "Copy",
      copySelectionDescription: "",
      pasteSelection: "Paste",
      pasteSelectionDescription: "",
      selectAllSelection: "Select All",
      selectAllSelectionDescription: ""
    }
  );

  registerWorkspaceCommands(
    registry,
    {
      focusSidebarMode: () => undefined,
      openApplicationSettings: () => undefined,
      openKeyboardShortcuts: () => undefined,
      showResumeHub: () => undefined,
      canShowResumeHub: () => true
    },
    {
      toggleFiles: "Toggle File Explorer",
      toggleFilesDescription: "",
      focusSearch: "Focus Search",
      focusSearchDescription: "",
      focusGlossary: "Focus Glossary",
      focusGlossaryDescription: "",
      focusDocumentMap: "Focus Document Map",
      focusDocumentMapDescription: "",
      focusDocumentMetrics: "Focus Document Metrics",
      focusDocumentMetricsDescription: "",
      openApplicationSettings: "Open Application Settings",
      openKeyboardShortcuts: "Open Keyboard Shortcuts",
      openKeyboardShortcutsDescription: "Open Keyboard Shortcuts",
      openApplicationSettingsDescription: "",
      showResumeHub: "Show Resume Hub",
      showResumeHubDescription: ""
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
      createMarkdownFileDescription: "",
      createFolder: "Create New Folder",
      createFolderDescription: "",
      rename: "Rename",
      renameDescription: ""
    }
  );

  registerProjectSettingsCommands(
    registry,
    { openProjectSettings: () => undefined },
    { open: "Open Project Settings", openDescription: "" }
  );

  registerAssistCommands(
    registry,
    {
      showLineEndingDistribution: () => undefined,
      insertParagraphIndent: () => undefined,
      removeParagraphIndent: () => undefined,
      openExportDialog: () => undefined,
      openJapaneseMachineCheckDialog: () => undefined
    },
    {
      showLineEndingDistribution: "Show Line Ending Distribution",
      showLineEndingDistributionDescription: "",
      insertParagraphIndent: "Insert Paragraph Indents",
      insertParagraphIndentDescription: "",
      removeParagraphIndent: "Remove Paragraph Indents",
      removeParagraphIndentDescription: "",
      openExportDialog: "Export Project",
      openExportDialogDescription: "",
      openJapaneseMachineCheckDialog: "Japanese Style Check",
      openJapaneseMachineCheckDialogDescription: ""
    }
  );

  registerGlossaryCommands(
    registry,
    {
      openGlossaryEntry: () => true,
      openGlossaryTagManager: () => true,
      openGlossaryEntryManager: () => true
    },
    {
      openEntry: "Open Glossary Entry",
      manageTags: "Manage Glossary Tags",
      manageTagsDescription: "",
      manageEntries: "Manage Glossary Entries",
      manageEntriesDescription: ""
    }
  );

  registerGlossaryEntryTabCommands(
    registry,
    {
      openNewGlossaryEntryTab: () => undefined,
      openGlossaryEntryTab: () => undefined,
      openGlossaryEntryTabFromSelection: () => undefined
    },
    {
      openNewEntryTab: "Open New Entry Tab",
      openNewEntryTabDescription: "",
      openEntryTab: "Open Entry Tab",
      openEntryTabDescription: "",
      openFromEditorSelection: "Open from Editor Selection",
      openFromEditorSelectionDescription: ""
    }
  );

  registerRecoveryCommands(
    registry,
    { showRecoveryDocuments: () => undefined },
    {
      showRecoveryDocuments: "Recover Unsaved Changes",
      showRecoveryDocumentsDescription: ""
    }
  );

  return registry;
}

describe("Command Palette ordering (#617)", () => {
  it("orders empty-query results by category order (File -> Edit -> Formatting -> Navigation -> Search -> View -> Assist -> Glossary -> Recovery -> Help)", () => {
    const registry = buildFullCommandRegistry();
    const rawEntries = listCommandPaletteEntries(registry);
    const sortedEntries = filterCommandPaletteEntries(rawEntries, "");

    const categories = sortedEntries.map((e) => e.category);

    const categoryOrderMap: Record<string, number> = {
      file: 1,
      edit: 2,
      formatting: 3,
      navigation: 4,
      search: 5,
      view: 6,
      assist: 7,
      glossary: 8,
      recovery: 9,
      help: 10
    };

    let prevOrder = 0;
    for (const cat of categories) {
      const order = categoryOrderMap[cat ?? ""] ?? 99;
      expect(order).toBeGreaterThanOrEqual(prevOrder);
      prevOrder = order;
    }
  });

  it("excludes hidden commands (palette.visible = false) from the Palette", () => {
    const registry = buildFullCommandRegistry();
    const entries = listCommandPaletteEntries(registry);
    const ids = entries.map((e) => String(e.id));

    expect(ids).toContain("import.text.bulk.openDialog");
    expect(ids).not.toContain("glossary.entry.open");
    expect(ids).not.toContain("glossary.openCreateEntryPane");
    expect(ids).not.toContain("glossary.openEditEntryPane");
  });
});
