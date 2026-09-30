/**
 * #639 / #640: command metadata for the keybinding catalog.
 *
 * Ids follow the existing runtime command ids where one exists
 * (`src/shared/commandIds.ts`). A test cross-checks that a Pergamum command is
 * `registered` exactly when its id appears there.
 *
 * Model (#640):
 * - `executionHost` is where the handler lives today, not where the key is
 *   captured. Menu-accelerator commands are executed by the renderer command
 *   registry after IPC, so they are `renderer`; delegation to main IPC is
 *   noted in `description`.
 * - `handlerStatus` says how the command is wired (registry / local callback /
 *   native role / standard behavior / not wired yet). It replaces #639's
 *   `metadataOnly` (= `notYetRegistered`).
 * - `when` is display-only descriptive text; it is not evaluated.
 *
 * Titles and descriptions are English catalog text, not i18n keys.
 */

import { editorCommandIds } from "../commandIds";
import type {
  CommandHandlerStatus,
  KeybindingCommand,
  KeybindingScope
} from "./types";

const registered: CommandHandlerStatus = "registered";
const callbackDirect: CommandHandlerStatus = "callbackDirect";
const notYetRegistered: CommandHandlerStatus = "notYetRegistered";

// Descriptive `when` values (display only).
const whenWorkbench = "workbenchFocus && !modalOpen";
const whenActiveDocument = "activeDocument";
const whenEditor = "editorFocus";
const whenMarkdownEdit = "editorFocus && markdownDocument && !readOnly";
const whenTextEdit = "editorFocus && textDocument && !readOnly";

interface PergamumCommandInput {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly description: string;
  readonly handlerStatus: CommandHandlerStatus;
  readonly when: string;
  readonly scope?: KeybindingScope;
}

/** Customizable Pergamum command; its handler lives in the renderer. */
function pergamum(input: PergamumCommandInput): KeybindingCommand {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    description: input.description,
    scope: input.scope ?? "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: input.when,
    handlerStatus: input.handlerStatus
  };
}

/** Electron menu role / OS behavior. Readonly. */
function nativeRole(
  id: string,
  title: string,
  category: string,
  description: string
): KeybindingCommand {
  return {
    id,
    title,
    category,
    description,
    scope: "native",
    executionHost: "nativeRole",
    source: "nativeRole",
    readonly: true,
    readonlyReason: "nativeRole",
    when: "native",
    handlerStatus: "nativeRole"
  };
}

/** Standard CodeMirror / platform text-editing behavior. Readonly. */
function standard(
  id: string,
  title: string,
  description: string
): KeybindingCommand {
  return {
    id,
    title,
    category: "Editor",
    description,
    scope: "editor",
    executionHost: "standard",
    source: "standard",
    readonly: true,
    readonlyReason: "standardBehavior",
    when: "standard",
    handlerStatus: "standard"
  };
}

export const keybindingCommands: readonly KeybindingCommand[] = [
  // File / Project
  pergamum({
    id: "workspace.project.open",
    title: "Open Project",
    category: "File",
    description:
      "Opens a project. Menu accelerator; the renderer registry runs it and delegates to main IPC.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "editor.file.new",
    title: "New File",
    category: "File",
    description: "Creates a new document. Menu accelerator; run by the renderer registry.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "editor.document.save",
    title: "Save",
    category: "File",
    description: "Saves the active document. Menu accelerator; run by the renderer registry.",
    handlerStatus: registered,
    when: whenActiveDocument
  }),
  pergamum({
    id: "editor.saveAs",
    title: "Save As",
    category: "File",
    description: "Saves the active document under a new path (also bound to F12).",
    handlerStatus: registered,
    when: whenActiveDocument
  }),
  pergamum({
    id: "editor.saveAll",
    title: "Save All",
    category: "File",
    description: "Saves every dirty document.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "editor.close",
    title: "Close Editor",
    category: "File",
    description:
      "Closes the active document tab (not the window). Menu accelerator Cmd/Ctrl+W.",
    handlerStatus: registered,
    when: whenActiveDocument
  }),

  // Command Palette
  pergamum({
    id: "workbench.commandPalette.open",
    title: "Open Command Palette",
    category: "View",
    description: "Opens the Command Palette (also bound to F1).",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "workbench.commandPalette.file.open",
    title: "Go to File",
    category: "Command Palette",
    description: "Opens the Command Palette in file mode (empty prefix).",
    handlerStatus: callbackDirect,
    when: whenWorkbench
  }),
  pergamum({
    id: "workbench.commandPalette.heading.open",
    title: "Go to Heading",
    category: "Command Palette",
    description: "Opens the Command Palette in heading mode (# prefix).",
    handlerStatus: callbackDirect,
    when: whenWorkbench
  }),
  pergamum({
    id: "workbench.commandPalette.projectSearch.open",
    title: "Search Project from Palette",
    category: "Command Palette",
    description: "Opens the Command Palette in project-search mode (% prefix).",
    handlerStatus: callbackDirect,
    when: whenWorkbench
  }),
  pergamum({
    id: "workbench.commandPalette.glossary.open",
    title: "Go to Glossary Entry",
    category: "Command Palette",
    description: "Opens the Command Palette in glossary mode (@ prefix).",
    handlerStatus: callbackDirect,
    when: whenWorkbench
  }),
  pergamum({
    id: "workbench.commandPalette.line.open",
    title: "Go to Line",
    category: "Command Palette",
    description: "Opens the Command Palette in line mode (: prefix).",
    handlerStatus: callbackDirect,
    when: whenWorkbench
  }),

  // Search
  pergamum({
    id: "editor.find.open",
    title: "Find in Document",
    category: "Search",
    description: "Opens the active-document Find panel in search mode.",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "editor.find.replace.open",
    title: "Replace in Document",
    category: "Search",
    description: "Opens the active-document Find panel in replace mode.",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "editor.find.next",
    title: "Find Next",
    category: "Search",
    description: "Moves to the next Find match.",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "editor.find.previous",
    title: "Find Previous",
    category: "Search",
    description: "Moves to the previous Find match.",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "search.project.openFromSelection",
    title: "Search Project for Selection",
    category: "Search",
    description:
      "Seeds project Search from the editor selection. Menu accelerator; run by the renderer registry.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "search.project.replace.openFromSelection",
    title: "Replace in Project for Selection",
    category: "Search",
    description:
      "Seeds project Replace from the editor selection. Menu accelerator; run by the renderer registry.",
    handlerStatus: registered,
    when: whenWorkbench
  }),

  // Markdown
  pergamum({
    id: "editor.markdown.bold",
    title: "Bold",
    category: "Markdown",
    description: "Wraps the selection in bold markup.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.italic",
    title: "Italic",
    category: "Markdown",
    description: "Wraps the selection in italic markup.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.strikethrough",
    title: "Strikethrough",
    category: "Markdown",
    description: "Wraps the selection in strikethrough markup.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.link",
    title: "Insert Link",
    category: "Markdown",
    description: "Opens the link dialog for the selection.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.heading",
    title: "Insert Heading",
    category: "Markdown",
    description: "Opens the heading level selector.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertHorizontalRule",
    title: "Insert Horizontal Rule",
    category: "Markdown",
    description: "Inserts a horizontal rule.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertBlockquote",
    title: "Insert Blockquote",
    category: "Markdown",
    description: "Turns the selection into a blockquote.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertCodeBlock",
    title: "Insert Code Block",
    category: "Markdown",
    description: "Inserts a fenced code block.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertRuby",
    title: "Insert Ruby",
    category: "Markdown",
    description: "Opens the ruby dialog for the selection.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertEmphasisMark",
    title: "Insert Emphasis Mark",
    category: "Markdown",
    description: "Adds emphasis marks (bouten) to the selection.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.insertTable",
    title: "Insert Table",
    category: "Markdown",
    description: "Opens the table picker.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.list.checklist",
    title: "Checklist",
    category: "Markdown",
    description: "Toggles a checklist item. No runtime handler yet.",
    handlerStatus: notYetRegistered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.list.ordered",
    title: "Ordered List",
    category: "Markdown",
    description: "Toggles an ordered list. No runtime handler yet.",
    handlerStatus: notYetRegistered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.list.unordered",
    title: "Unordered List",
    category: "Markdown",
    description: "Toggles an unordered list. No runtime handler yet.",
    handlerStatus: notYetRegistered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.markdown.toggleSyntaxChecker",
    title: "Toggle Syntax Checker",
    category: "Markdown",
    description: "Toggles the Markdown syntax checker.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),

  // Glossary
  pergamum({
    id: "glossary.entry.openFromSelection",
    title: "Open Glossary Entry from Selection",
    category: "Glossary",
    description:
      "Opens or creates the glossary entry for the editor selection (CodeMirror keymap).",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "glossary.completion.open",
    title: "Open Glossary Completion",
    category: "Glossary",
    description: "Opens glossary completion at the caret (CodeMirror keymap).",
    handlerStatus: callbackDirect,
    when: whenTextEdit,
    scope: "editor"
  }),

  // Editor
  pergamum({
    id: "editor.indent",
    title: "Indent",
    category: "Editor",
    description: "Indents the selected lines.",
    handlerStatus: registered,
    when: whenTextEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.outdent",
    title: "Outdent",
    category: "Editor",
    description: "Outdents the selected lines.",
    handlerStatus: registered,
    when: whenTextEdit,
    scope: "editor"
  }),
  pergamum({
    id: "editor.document.rename",
    title: "Rename Document",
    category: "Editor",
    description:
      "Renames the active document from the editor body (F2; CodeMirror handler). File Explorer F2 is separate.",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "editor.tabCapture.toggle",
    title: "Toggle Tab Capture",
    category: "Editor",
    description:
      "Flips the editor.captureTabInEditor setting through the settings-save path (CodeMirror handler).",
    handlerStatus: callbackDirect,
    when: whenEditor,
    scope: "editor"
  }),
  pergamum({
    id: "editor.tabCapture.bypassOnce",
    title: "Bypass Tab Capture Once",
    category: "Editor",
    description:
      "Escape arms a one-shot bypass of the next Tab / Shift+Tab while tab capture is on (dedicated CodeMirror handler; not the dialog / popover Escape).",
    handlerStatus: callbackDirect,
    when: "editorFocus && tabCaptureEnabled",
    scope: "editor"
  }),

  // Workbench / Pane
  pergamum({
    id: "workspace.files.toggle",
    title: "Toggle File Explorer",
    category: "View",
    description: "Shows or hides the File Explorer pane.",
    handlerStatus: registered,
    when: whenWorkbench,
    scope: "pane"
  }),
  pergamum({
    id: "workspace.glossary.toggle",
    title: "Toggle Glossary Pane",
    category: "View",
    description: "Shows or hides the Glossary pane (global shortcut listener).",
    handlerStatus: callbackDirect,
    when: whenWorkbench,
    scope: "pane"
  }),
  pergamum({
    id: "workspace.documentMap.toggle",
    title: "Toggle Document Map",
    category: "View",
    description: "Shows or hides the Document Map pane (global shortcut listener).",
    handlerStatus: callbackDirect,
    when: whenWorkbench,
    scope: "pane"
  }),
  pergamum({
    id: "workspace.documentMetrics.toggle",
    title: "Toggle Document Metrics",
    category: "View",
    description:
      "Shows or hides the Document Metrics pane (global shortcut listener).",
    handlerStatus: callbackDirect,
    when: whenWorkbench,
    scope: "pane"
  }),
  // File Explorer pane commands (#643). Local keydown handling of the tree;
  // the rename id is also used by the tab bar's F2 (rename the file).
  pergamum({
    id: "workspace.files.rename",
    title: "Rename File",
    category: "File Explorer",
    description:
      "Renames the selected file / folder (File Explorer) or the focused project document tab's file (tab bar). Editor-body F2 is editor.document.rename.",
    handlerStatus: callbackDirect,
    when: "fileExplorerFocus",
    scope: "pane"
  }),
  pergamum({
    id: "workspace.files.copy",
    title: "Copy File",
    category: "File Explorer",
    description: "Copies the selected File Explorer entries (pane-local keydown).",
    handlerStatus: callbackDirect,
    when: "fileExplorerFocus",
    scope: "pane"
  }),
  pergamum({
    id: "workspace.files.cut",
    title: "Cut File",
    category: "File Explorer",
    description: "Cuts the selected File Explorer entries (pane-local keydown).",
    handlerStatus: callbackDirect,
    when: "fileExplorerFocus",
    scope: "pane"
  }),
  pergamum({
    id: "workspace.files.paste",
    title: "Paste File",
    category: "File Explorer",
    description:
      "Pastes the pending File Explorer copy / cut into the current destination (pane-local keydown).",
    handlerStatus: callbackDirect,
    when: "fileExplorerFocus",
    scope: "pane"
  }),
  pergamum({
    id: "workspace.files.delete",
    title: "Delete File",
    category: "File Explorer",
    description:
      "Deletes the selected File Explorer entries through the confirmation dialog (pane-local keydown).",
    handlerStatus: callbackDirect,
    when: "fileExplorerFocus",
    scope: "pane"
  }),
  pergamum({
    id: "editor.preview.toggle",
    title: "Toggle Preview",
    category: "View",
    description: "Shows or hides the Markdown preview.",
    handlerStatus: registered,
    when: "activeMarkdownDocument",
    scope: "editor"
  }),
  pergamum({
    id: "editor.image.insert",
    title: "Insert Image",
    category: "Markdown",
    description: "Opens the image insertion flow.",
    handlerStatus: registered,
    when: whenMarkdownEdit,
    scope: "editor"
  }),
  pergamum({
    id: "workspace.keyboardShortcuts.open",
    title: "Open Keyboard Shortcuts",
    category: "View",
    description:
      "Opens the Keyboard Shortcuts tab (view only). Menu item and Command Palette; no default key.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "workspace.applicationSettings.open",
    title: "Open Application Settings",
    category: "View",
    description:
      "Opens the Application Settings tab. Menu accelerator; run by the renderer registry.",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "workspace.tabs.previous",
    title: "Previous Tab",
    category: "View",
    description: "Activates the previous workspace tab (window keydown listener).",
    handlerStatus: callbackDirect,
    when: "workbenchFocus && !modalOpen && !textInputFocus"
  }),
  pergamum({
    id: "workspace.tabs.next",
    title: "Next Tab",
    category: "View",
    description: "Activates the next workspace tab (window keydown listener).",
    handlerStatus: callbackDirect,
    when: "workbenchFocus && !modalOpen && !textInputFocus"
  }),

  // Window / App
  nativeRole(
    "app.quit",
    "Quit",
    "Application",
    "Quits the application (native quit; dirty-document preflight runs first)."
  ),
  nativeRole(
    "app.hide",
    "Hide Application",
    "Application",
    "macOS Hide. Metadata only; Electron hide role."
  ),
  nativeRole(
    "app.hideOthers",
    "Hide Others",
    "Application",
    "macOS Hide Others. Metadata only; Electron hideOthers role."
  ),
  pergamum({
    id: "app.zoom.in",
    title: "Zoom In",
    category: "View",
    description:
      "Zooms in. Menu accelerator; run by the renderer, which delegates to main IPC (window.zoomIn).",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "app.zoom.out",
    title: "Zoom Out",
    category: "View",
    description:
      "Zooms out. Menu accelerator; run by the renderer, which delegates to main IPC (window.zoomOut).",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  pergamum({
    id: "app.zoom.reset",
    title: "Reset Zoom",
    category: "View",
    description:
      "Resets zoom. Menu accelerator; run by the renderer, which delegates to main IPC (window.resetZoom).",
    handlerStatus: registered,
    when: whenWorkbench
  }),
  nativeRole(
    "window.close",
    "Close Window",
    "Window",
    "Closes the window (Electron close role; Cmd+Shift+W on macOS so Cmd+W stays editor.close)."
  ),
  nativeRole(
    "window.minimize",
    "Minimize Window",
    "Window",
    "Minimizes the window (Electron minimize role)."
  ),
  nativeRole(
    "window.toggleFullscreen",
    "Toggle Full Screen",
    "Window",
    "Toggles full screen (Electron togglefullscreen role)."
  ),
  nativeRole(
    "developer.toggleDevTools",
    "Toggle Developer Tools",
    "Developer",
    "Toggles DevTools (Electron toggleDevTools role)."
  ),

  // Native editing
  nativeRole(
    editorCommandIds.copySelection,
    "Copy",
    "Edit",
    "Copies the selection (Electron copy role)."
  ),
  nativeRole(
    editorCommandIds.cutSelection,
    "Cut",
    "Edit",
    "Cuts the selection (Electron cut role)."
  ),
  nativeRole(
    editorCommandIds.pasteSelection,
    "Paste",
    "Edit",
    "Pastes the clipboard (Electron paste role)."
  ),
  nativeRole(
    editorCommandIds.selectAllSelection,
    "Select All",
    "Edit",
    "Selects all (Electron selectAll role)."
  ),
  nativeRole("editor.undo", "Undo", "Edit", "Undoes the last edit (Electron undo role)."),
  nativeRole("editor.redo", "Redo", "Edit", "Redoes the last undone edit (Electron redo role)."),

  // Standard behavior (CodeMirror / platform text editing)
  standard("editor.cursor.lineStart", "Cursor to Line Start", "CodeMirror cursorLineBoundaryBackward."),
  standard("editor.cursor.lineEnd", "Cursor to Line End", "CodeMirror cursorLineBoundaryForward."),
  standard("editor.cursor.documentStart", "Cursor to Document Start", "CodeMirror cursorDocStart."),
  standard("editor.cursor.documentEnd", "Cursor to Document End", "CodeMirror cursorDocEnd."),
  standard("editor.line.moveUp", "Move Line Up", "CodeMirror moveLineUp."),
  standard("editor.line.moveDown", "Move Line Down", "CodeMirror moveLineDown."),
  standard("editor.line.copyUp", "Copy Line Up", "CodeMirror copyLineUp."),
  standard("editor.line.copyDown", "Copy Line Down", "CodeMirror copyLineDown."),
  standard("editor.comment.toggle", "Toggle Comment", "CodeMirror toggleComment."),
  standard("editor.selection.nextOccurrence", "Select Next Occurrence", "CodeMirror selectNextOccurrence."),
  standard("editor.line.insertBlankLine", "Insert Blank Line", "CodeMirror insertBlankLine."),
  standard("editor.line.delete", "Delete Line", "CodeMirror deleteLine."),
  standard("editor.selection.undo", "Undo Selection", "CodeMirror undoSelection."),
  standard("editor.diagnostic.next", "Go to Next Diagnostic", "CodeMirror nextDiagnostic.")
];
