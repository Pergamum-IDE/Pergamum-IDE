/**
 * #639: default keybindings, in canonical CodeMirror-style notation.
 *
 * Values mirror the currently shipped shortcuts (menu accelerators, global
 * listeners, CodeMirror keymaps) plus the #635 PO decisions. This is a
 * catalog only; runtime registrations are not migrated to it yet.
 *
 * Several default keys for one command = several entries. A command without
 * an entry has no default key. Platform fields: `undefined` = use `key`,
 * `null` = explicitly unassigned on that platform.
 */

import { editorCommandIds } from "../commandIds";
import type { DefaultKeybinding } from "./types";

type PlatformOverrides = Pick<DefaultKeybinding, "mac" | "win" | "linux">;

function bind(
  command: string,
  key: string | null,
  overrides: PlatformOverrides = {}
): DefaultKeybinding {
  return { command, key, ...overrides };
}

export const defaultKeybindings: readonly DefaultKeybinding[] = [
  // File / Project
  bind("workspace.project.open", "Mod-Shift-o"),
  bind("editor.file.new", "Mod-n"),
  bind("editor.document.save", "Mod-s"),
  bind("editor.saveAs", "Mod-Shift-s"),
  bind("editor.saveAs", "F12"),
  // PO decision (#635): Save All is Mod-Alt-s, not the old Alt+Shift+S.
  bind("editor.saveAll", "Mod-Alt-s"),
  bind("editor.close", "Mod-w"),

  // Command Palette
  bind("workbench.commandPalette.open", "Mod-p"),
  bind("workbench.commandPalette.open", "F1"),
  bind("workbench.commandPalette.file.open", "Mod-o"),
  // darwin: Mod-Shift-3 / Mod-Shift-5 are system screenshot keys.
  bind("workbench.commandPalette.heading.open", "Mod-#", { mac: null }),
  bind("workbench.commandPalette.glossary.open", "Mod-@"),
  bind("workbench.commandPalette.line.open", "Mod-:"),
  bind("workbench.commandPalette.projectSearch.open", "Mod-%", { mac: null }),

  // Search
  bind("editor.find.open", "Mod-f"),
  bind("editor.find.replace.open", "Mod-h", { mac: "Mod-Alt-f" }),
  bind("editor.find.next", "F3"),
  bind("editor.find.previous", "Shift-F3"),
  bind("search.project.openFromSelection", "Mod-Shift-f"),
  bind("search.project.replace.openFromSelection", "Mod-Shift-h"),

  // Markdown
  bind("editor.markdown.bold", "Mod-b"),
  bind("editor.markdown.italic", "Mod-i"),
  bind("editor.markdown.strikethrough", "Mod-Shift-x"),
  bind("editor.markdown.link", "Mod-k"),
  bind("editor.markdown.heading", "Mod-l"),
  bind("editor.markdown.insertHorizontalRule", "Mod-Shift-l"),
  // darwin: Mod-Shift-q is the system log-out key.
  bind("editor.markdown.insertBlockquote", "Mod-Shift-q", { mac: "Mod-Alt-q" }),
  bind("editor.markdown.insertCodeBlock", "Mod-Shift-b"),
  // PO decision (#635): Mod-r is Ruby, not reload.
  bind("editor.markdown.insertRuby", "Mod-r"),
  bind("editor.markdown.insertEmphasisMark", "Mod-."),
  bind("editor.markdown.insertTable", "Mod-t"),
  bind("editor.markdown.toggleSyntaxChecker", "Mod-Shift-c"),
  // No default key yet: editor.markdown.list.checklist / .ordered /
  // .unordered (catalog metadata only).

  // Glossary
  bind("glossary.entry.openFromSelection", "Mod-g"),
  bind("glossary.completion.open", "Ctrl-Space", { mac: "Alt-`" }),

  // Editor
  bind("editor.indent", "Mod-]"),
  bind("editor.outdent", "Mod-["),
  // Tab capture: Mod-m is "Minimize" on darwin, hence Shift-Alt-m there.
  bind("editor.tabCapture.toggle", "Ctrl-m", { mac: "Shift-Alt-m" }),
  // No default key yet: editor.tabCapture.bypassOnce.

  // Workbench / Pane
  bind("workspace.files.toggle", "Mod-Shift-e"),
  bind("workspace.glossary.toggle", "Mod-Shift-g"),
  bind("workspace.documentMap.toggle", "Mod-Shift-m"),
  bind("workspace.documentMetrics.toggle", "Mod-Shift-t"),
  bind("editor.preview.toggle", "Mod-Shift-p"),
  bind("editor.image.insert", "Mod-Shift-i"),
  bind("workspace.applicationSettings.open", "Mod-,"),
  bind("workspace.tabs.previous", "Alt-ArrowLeft", {
    mac: "Mod-Alt-ArrowLeft"
  }),
  bind("workspace.tabs.next", "Alt-ArrowRight", { mac: "Mod-Alt-ArrowRight" }),

  // Window / App
  bind("app.quit", "Mod-q"),
  bind("app.zoom.in", "Mod-="),
  bind("app.zoom.in", "Mod-+"),
  bind("app.zoom.out", "Mod--"),
  bind("app.zoom.reset", "Mod-0"),
  bind("window.close", "Alt-F4", { mac: "Mod-Shift-w" }),
  bind("window.minimize", null, { mac: "Mod-m" }),
  bind("window.toggleFullscreen", "F11", { mac: "Ctrl-Mod-f" }),
  bind("developer.toggleDevTools", "Mod-Shift-d"),

  // Native editing
  bind(editorCommandIds.copySelection, "Mod-c"),
  bind(editorCommandIds.cutSelection, "Mod-x"),
  bind(editorCommandIds.pasteSelection, "Mod-v"),
  bind(editorCommandIds.selectAllSelection, "Mod-a"),
  bind("editor.undo", "Mod-z"),
  bind("editor.redo", "Mod-y", { mac: "Mod-Shift-z" }),

  // Standard behavior
  bind("editor.cursor.lineStart", "Home", { mac: "Mod-ArrowLeft" }),
  bind("editor.cursor.lineEnd", "End", { mac: "Mod-ArrowRight" }),
  bind("editor.cursor.documentStart", "Mod-Home", { mac: "Mod-ArrowUp" }),
  bind("editor.cursor.documentEnd", "Mod-End", { mac: "Mod-ArrowDown" }),
  bind("editor.comment.toggle", "Mod-/"),
  bind("editor.selection.nextOccurrence", "Mod-d"),
  bind("editor.line.insertBlankLine", "Mod-Enter"),
  bind("editor.line.delete", "Mod-Shift-k"),
  bind("editor.selection.undo", "Mod-u"),
  bind("editor.diagnostic.next", "F8")
];
