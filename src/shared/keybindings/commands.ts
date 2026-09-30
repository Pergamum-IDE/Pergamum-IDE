/**
 * #639: command metadata for the keybinding catalog.
 *
 * Ids follow the existing runtime command ids where one exists
 * (`src/shared/commandIds.ts`). Entries flagged `metadataOnly` are catalog
 * metadata for future wiring: no runtime command with that id is registered
 * yet. A test cross-checks the flag against `commandIds.ts`.
 *
 * Titles are English catalog labels, not i18n keys (i18n is out of scope).
 */

import { editorCommandIds } from "../commandIds";
import type {
  KeybindingCommand,
  KeybindingExecutionHost,
  KeybindingScope
} from "./types";

interface CommandOptions {
  readonly scope?: KeybindingScope;
  readonly host?: KeybindingExecutionHost;
  readonly metadataOnly?: true;
}

/** Customizable Pergamum command. Defaults: scope "app", host "renderer". */
function pergamum(
  id: string,
  title: string,
  category: string,
  options: CommandOptions = {}
): KeybindingCommand {
  return {
    id,
    title,
    category,
    scope: options.scope ?? "app",
    executionHost: options.host ?? "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    metadataOnly: options.metadataOnly ?? false
  };
}

/** Electron menu role / OS behavior. Readonly. */
function nativeRole(
  id: string,
  title: string,
  category: string,
  options: { readonly metadataOnly?: true } = {}
): KeybindingCommand {
  return {
    id,
    title,
    category,
    scope: "native",
    executionHost: "nativeRole",
    source: "nativeRole",
    readonly: true,
    readonlyReason: "nativeRole",
    when: null,
    metadataOnly: options.metadataOnly ?? false
  };
}

/** Standard CodeMirror / platform text-editing behavior. Readonly. */
function standard(id: string, title: string): KeybindingCommand {
  return {
    id,
    title,
    category: "Editor",
    scope: "editor",
    executionHost: "standard",
    source: "standard",
    readonly: true,
    readonlyReason: "standardBehavior",
    when: null,
    metadataOnly: true
  };
}

const editor = { scope: "editor" } as const;
const editorMeta = { scope: "editor", metadataOnly: true } as const;
const pane = { scope: "pane" } as const;
const paneMeta = { scope: "pane", metadataOnly: true } as const;
const appMeta = { metadataOnly: true } as const;

export const keybindingCommands: readonly KeybindingCommand[] = [
  // File / Project
  pergamum("workspace.project.open", "Open Project", "File", { host: "main" }),
  pergamum("editor.file.new", "New File", "File", { host: "main" }),
  pergamum("editor.document.save", "Save", "File", { host: "main" }),
  pergamum("editor.saveAs", "Save As", "File", { host: "main" }),
  pergamum("editor.saveAll", "Save All", "File", { host: "main" }),
  pergamum("editor.close", "Close Editor", "File", { host: "main" }),

  // Command Palette
  pergamum("workbench.commandPalette.open", "Open Command Palette", "View", {
    host: "main"
  }),
  pergamum(
    "workbench.commandPalette.file.open",
    "Go to File",
    "Command Palette",
    appMeta
  ),
  pergamum(
    "workbench.commandPalette.heading.open",
    "Go to Heading",
    "Command Palette",
    appMeta
  ),
  pergamum(
    "workbench.commandPalette.projectSearch.open",
    "Search Project from Palette",
    "Command Palette",
    appMeta
  ),
  pergamum(
    "workbench.commandPalette.glossary.open",
    "Go to Glossary Entry",
    "Command Palette",
    appMeta
  ),
  pergamum(
    "workbench.commandPalette.line.open",
    "Go to Line",
    "Command Palette",
    appMeta
  ),

  // Search
  pergamum("editor.find.open", "Find in Document", "Search", editorMeta),
  pergamum(
    "editor.find.replace.open",
    "Replace in Document",
    "Search",
    editorMeta
  ),
  pergamum("editor.find.next", "Find Next", "Search", editorMeta),
  pergamum("editor.find.previous", "Find Previous", "Search", editorMeta),
  pergamum(
    "search.project.openFromSelection",
    "Search Project for Selection",
    "Search",
    { host: "main" }
  ),
  pergamum(
    "search.project.replace.openFromSelection",
    "Replace in Project for Selection",
    "Search",
    { host: "main" }
  ),

  // Markdown
  pergamum("editor.markdown.bold", "Bold", "Markdown", editor),
  pergamum("editor.markdown.italic", "Italic", "Markdown", editor),
  pergamum(
    "editor.markdown.strikethrough",
    "Strikethrough",
    "Markdown",
    editor
  ),
  pergamum("editor.markdown.link", "Insert Link", "Markdown", editor),
  pergamum("editor.markdown.heading", "Insert Heading", "Markdown", editor),
  pergamum(
    "editor.markdown.insertHorizontalRule",
    "Insert Horizontal Rule",
    "Markdown",
    editor
  ),
  pergamum(
    "editor.markdown.insertBlockquote",
    "Insert Blockquote",
    "Markdown",
    editor
  ),
  pergamum(
    "editor.markdown.insertCodeBlock",
    "Insert Code Block",
    "Markdown",
    editor
  ),
  pergamum("editor.markdown.insertRuby", "Insert Ruby", "Markdown", editor),
  pergamum(
    "editor.markdown.insertEmphasisMark",
    "Insert Emphasis Mark",
    "Markdown",
    editor
  ),
  pergamum("editor.markdown.insertTable", "Insert Table", "Markdown", editor),
  pergamum(
    "editor.markdown.list.checklist",
    "Checklist",
    "Markdown",
    editorMeta
  ),
  pergamum(
    "editor.markdown.list.ordered",
    "Ordered List",
    "Markdown",
    editorMeta
  ),
  pergamum(
    "editor.markdown.list.unordered",
    "Unordered List",
    "Markdown",
    editorMeta
  ),
  pergamum(
    "editor.markdown.toggleSyntaxChecker",
    "Toggle Syntax Checker",
    "Markdown",
    editor
  ),

  // Glossary
  pergamum(
    "glossary.entry.openFromSelection",
    "Open Glossary Entry from Selection",
    "Glossary",
    editorMeta
  ),
  pergamum(
    "glossary.completion.open",
    "Open Glossary Completion",
    "Glossary",
    editorMeta
  ),

  // Editor
  pergamum("editor.indent", "Indent", "Editor", editor),
  pergamum("editor.outdent", "Outdent", "Editor", editor),
  pergamum(
    "editor.tabCapture.toggle",
    "Toggle Tab Capture",
    "Editor",
    editorMeta
  ),
  pergamum(
    "editor.tabCapture.bypassOnce",
    "Bypass Tab Capture Once",
    "Editor",
    editorMeta
  ),

  // Workbench / Pane
  pergamum("workspace.files.toggle", "Toggle File Explorer", "View", pane),
  pergamum(
    "workspace.glossary.toggle",
    "Toggle Glossary Pane",
    "View",
    paneMeta
  ),
  pergamum(
    "workspace.documentMap.toggle",
    "Toggle Document Map",
    "View",
    paneMeta
  ),
  pergamum(
    "workspace.documentMetrics.toggle",
    "Toggle Document Metrics",
    "View",
    paneMeta
  ),
  pergamum("editor.preview.toggle", "Toggle Preview", "View", editor),
  pergamum("editor.image.insert", "Insert Image", "Markdown", editor),
  pergamum(
    "workspace.applicationSettings.open",
    "Open Application Settings",
    "View",
    { host: "main" }
  ),
  pergamum(
    "workspace.tabs.previous",
    "Previous Tab",
    "View",
    { metadataOnly: true }
  ),
  pergamum("workspace.tabs.next", "Next Tab", "View", { metadataOnly: true }),

  // Window / App
  nativeRole("app.quit", "Quit", "Application"),
  pergamum("app.zoom.in", "Zoom In", "View", { host: "main" }),
  pergamum("app.zoom.out", "Zoom Out", "View", { host: "main" }),
  pergamum("app.zoom.reset", "Reset Zoom", "View", { host: "main" }),
  nativeRole("window.close", "Close Window", "Window", { metadataOnly: true }),
  nativeRole("window.minimize", "Minimize Window", "Window", {
    metadataOnly: true
  }),
  nativeRole("window.toggleFullscreen", "Toggle Full Screen", "Window", {
    metadataOnly: true
  }),
  nativeRole("developer.toggleDevTools", "Toggle Developer Tools", "Developer", {
    metadataOnly: true
  }),

  // Native editing
  nativeRole(editorCommandIds.copySelection, "Copy", "Edit"),
  nativeRole(editorCommandIds.cutSelection, "Cut", "Edit"),
  nativeRole(editorCommandIds.pasteSelection, "Paste", "Edit"),
  nativeRole(editorCommandIds.selectAllSelection, "Select All", "Edit"),
  nativeRole("editor.undo", "Undo", "Edit"),
  nativeRole("editor.redo", "Redo", "Edit"),

  // Standard behavior (CodeMirror / platform text editing)
  standard("editor.cursor.lineStart", "Cursor to Line Start"),
  standard("editor.cursor.lineEnd", "Cursor to Line End"),
  standard("editor.cursor.documentStart", "Cursor to Document Start"),
  standard("editor.cursor.documentEnd", "Cursor to Document End"),
  standard("editor.comment.toggle", "Toggle Comment"),
  standard("editor.selection.nextOccurrence", "Select Next Occurrence"),
  standard("editor.line.insertBlankLine", "Insert Blank Line"),
  standard("editor.line.delete", "Delete Line"),
  standard("editor.selection.undo", "Undo Selection"),
  standard("editor.diagnostic.next", "Go to Next Diagnostic")
];
