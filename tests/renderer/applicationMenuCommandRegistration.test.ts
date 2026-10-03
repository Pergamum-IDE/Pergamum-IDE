import { describe, expect, it } from "vitest";
import {
  applicationMenuCommandIds,
  noArgumentMenuCommandId
} from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { registerApplicationCommands } from "../../src/renderer/applicationCommands";
import { registerAssistCommands } from "../../src/renderer/assistCommands";
import { registerCommandPaletteCommands } from "../../src/renderer/commandPaletteCommands";
import { registerEditorCommands } from "../../src/renderer/editorCommands";
import { registerGlossaryCommands } from "../../src/renderer/glossaryCommands";
import { registerProjectSearchSelectionShortcutCommands } from "../../src/renderer/projectSearchSelectionShortcutCommands";
import { registerProjectSettingsCommands } from "../../src/renderer/projectSettingsCommands";
import { registerWorkspaceCommands } from "../../src/renderer/workspaceCommands";

describe("application menu command registration", () => {
  it("registers every allowlisted application menu command in the renderer registry", () => {
    const registry = new CommandRegistry();

    registerApplicationCommands(
      registry,
      {
        openAbout: () => undefined,
        openUsageTour: () => undefined,
        openMarkdownCheatSheet: () => undefined,
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
        openAboutDescription:
          "Show Pergamum version, license, and repository information.",
        openUsageTour: "Usage Tour",
        openUsageTourDescription: "Show the usage tour.",
        openMarkdownCheatSheet: "Markdown Cheat Sheet",
        openMarkdownCheatSheetDescription: "",
        quitApplication: "Quit Pergamum",
        quitApplicationDescription: "Quit Pergamum",
        createProject: "Create Project",
        createProjectDescription: "Create Project",
        openProject: "Open Project",
        openProjectDescription: "Open Project",
        closeProject: "Close Project",
        closeProjectDescription: "Close Project",
        openBulkTextImportDialog: "Bulk Import Text Files",
        openBulkTextImportDialogDescription: "Bulk Import Text Files",
        zoomIn: "Zoom In",
        zoomInDescription: "Zoom In",
        zoomOut: "Zoom Out",
        zoomOutDescription: "Zoom Out",
        resetZoom: "Reset Zoom",
        resetZoomDescription: "Reset Zoom"
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
        newFileDescription: "New File",
        openMarkdownDocument: "Open Markdown File",
        openMarkdownDocumentDescription: "Open Markdown File",
        saveDocument: "Save",
        saveDocumentDescription: "Save",
        saveAll: "Save All",
        saveAllDescription: "Save all open documents.",
        saveAs: "Save As",
        saveAsDescription: "Save As",
        closeEditor: "Close Current Document",
        closeEditorDescription: "Close Current Document",
        insertImage: "Insert Image",
        insertImageDescription: "Insert Image",
        insertBlockquote: "Insert Blockquote",
        insertBlockquoteDescription: "Insert Blockquote",
        toggleSyntaxChecker: "Toggle Markdown Syntax Checker",
        toggleSyntaxCheckerDescription: "Toggle Markdown Syntax Checker",
        bold: "Bold",
        boldDescription: "Bold",
        italic: "Italic",
        italicDescription: "Italic",
        strikethrough: "Strikethrough",
        strikethroughDescription: "Strikethrough",
        heading: "Heading",
        headingDescription: "Heading",
        link: "Link",
        linkDescription: "Link",
        insertHorizontalRule: "Insert Horizontal Rule",
        insertHorizontalRuleDescription: "Insert Horizontal Rule",
        insertCodeBlock: "Insert Code Block",
        insertCodeBlockDescription: "Insert Code Block",
        insertTable: "Insert Table",
        insertTableDescription: "Insert Table",
        insertCallout: "Insert Callout",
        insertCalloutDescription: "Insert Callout",
        insertRuby: "Insert Ruby",
        insertRubyDescription: "Insert Ruby",
        insertEmphasisMark: "Insert Emphasis Mark",
        insertEmphasisMarkDescription: "Insert Emphasis Mark",
        indent: "Indent",
        indentDescription: "Indent",
        outdent: "Outdent",
        outdentDescription: "Outdent",
        togglePreview: "Toggle Preview",
        togglePreviewDescription: "Toggle Preview",
        undo: "Undo",
        undoDescription: "Undo",
        redo: "Redo",
        redoDescription: "Redo",
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
        manageTagsDescription: "Manage Glossary Tags",
        manageEntries: "Manage Glossary Entries",
        manageEntriesDescription: "Manage Glossary Entries"
      }
    );
    registerProjectSearchSelectionShortcutCommands(
      registry,
      {
        openProjectSearchFromSelection: () => undefined,
        openProjectReplaceFromSelection: () => undefined
      },
      {
        openProjectSearchFromSelection: "Find in Project",
        openProjectSearchFromSelectionDescription: "Find in Project",
        openProjectReplaceFromSelection: "Replace in Project",
        openProjectReplaceFromSelectionDescription: "Replace in Project"
      }
    );
    registerProjectSettingsCommands(
      registry,
      { openProjectSettings: () => undefined },
      { open: "Open Project Settings", openDescription: "Open Project Settings" }
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
        toggleFiles: "Toggle Files",
        toggleFilesDescription: "Toggle Files",
        focusSearch: "Focus Search",
        focusSearchDescription: "Focus Search",
        focusGlossary: "Focus Glossary",
        focusGlossaryDescription: "Focus Glossary",
        focusDocumentMap: "Focus Document Map",
        focusDocumentMapDescription: "Focus Document Map",
        focusDocumentMetrics: "Focus Document Metrics",
        focusDocumentMetricsDescription: "Focus Document Metrics",
        openApplicationSettings: "Open Application Settings",
        openKeyboardShortcuts: "Open Keyboard Shortcuts",
        openKeyboardShortcutsDescription: "Open Keyboard Shortcuts",
        openApplicationSettingsDescription: "Open Application Settings",
        showResumeHub: "Show Resume Hub",
        showResumeHubDescription: "Show Resume Hub"
      }
    );

    expect(
      applicationMenuCommandIds.map((commandId) =>
        registry.get(noArgumentMenuCommandId(commandId))
      )
    ).toEqual(applicationMenuCommandIds.map(() => expect.any(Object)));
  });
});
