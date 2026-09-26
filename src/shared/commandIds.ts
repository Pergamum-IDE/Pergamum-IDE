import { defineCommandId } from "./commandRegistry";
import type { EditorId } from "./editorId";

export const applicationCommandIds = {
  openAbout: defineCommandId("app.about.open"),
  quitApplication: defineCommandId("app.quit"),
  createProject: defineCommandId("workspace.project.create"),
  openProject: defineCommandId("workspace.project.open"),
  closeProject: defineCommandId("workspace.project.close"),
  openBulkTextImportDialog: defineCommandId(
    "import.text.bulk.openDialog"
  ),
  toggleRecentProjects: defineCommandId("workspace.recentProjects.toggle")
} as const;

export const commandPaletteCommandIds = {
  open: defineCommandId("workbench.commandPalette.open")
} as const;

export const recoveryCommandIds = {
  showDocuments: defineCommandId("recovery.documents.show")
} as const;

export const assistCommandIds = {
  showLineEndingDistribution: defineCommandId(
    "assist.lineEndingDistribution.show"
  ),
  insertParagraphIndent: defineCommandId("assist.paragraphIndent.insert"),
  removeParagraphIndent: defineCommandId("assist.paragraphIndent.remove")
} as const;

/**
 * #375: glossary command ids the application menu also references (so they
 * live in shared, not the renderer-only glossary command module).
 */
export const glossaryTabCommandIds = {
  manageTags: defineCommandId("glossary.tag.manage"),
  manageEntries: defineCommandId("glossary.entry.manage")
} as const;

export const projectSettingsCommandIds = {
  open: defineCommandId("project.settings.open")
} as const;

/**
 * #457: Ctrl+Shift+F / Ctrl+Shift+H, wired as application-menu accelerators
 * (see src/main/menu.ts) rather than a CodeMirror keymap extension, since
 * they must fire regardless of what has focus in the renderer. Neither
 * carries a payload over IPC - each renderer-side command resolves the
 * current selection itself at execute time.
 */
export const searchSelectionShortcutCommandIds = {
  openProjectSearchFromSelection: defineCommandId<readonly [], void>(
    "search.project.openFromSelection"
  ),
  openProjectReplaceFromSelection: defineCommandId<readonly [], void>(
    "search.project.replace.openFromSelection"
  )
} as const;

export const editorCommandIds = {
  newFile: defineCommandId("editor.file.new"),
  openMarkdownDocument: defineCommandId("editor.document.markdown.open"),
  saveDocument: defineCommandId("editor.document.save"),
  saveAll: defineCommandId("editor.saveAll"),
  saveAs: defineCommandId("editor.saveAs"),
  close: defineCommandId<readonly [{ editorId?: EditorId }?], void>(
    "editor.close"
  ),
  cutSelection: defineCommandId("editor.selection.cut"),
  copySelection: defineCommandId("editor.selection.copy"),
  pasteSelection: defineCommandId("editor.selection.paste"),
  selectAllSelection: defineCommandId("editor.selection.selectAll"),
  goToLine: defineCommandId<readonly [number], void>("editor.line.goTo")
} as const;

export const editCommandIds = [
  editorCommandIds.cutSelection,
  editorCommandIds.copySelection,
  editorCommandIds.pasteSelection,
  editorCommandIds.selectAllSelection
] as const;

export type EditCommandId = (typeof editCommandIds)[number];

export function isEditCommandId(commandId: string): commandId is EditCommandId {
  return (editCommandIds as readonly string[]).includes(commandId);
}

/**
 * Command IDs the application menu bridge is allowed to send/receive over
 * IPC. Despite the name, this is not File-menu-specific — it also covers
 * View menu items such as the Command Palette (#130).
 */
export const applicationMenuCommandIds = [
  applicationCommandIds.openAbout,
  applicationCommandIds.quitApplication,
  applicationCommandIds.createProject,
  applicationCommandIds.openProject,
  applicationCommandIds.closeProject,
  applicationCommandIds.openBulkTextImportDialog,
  editorCommandIds.newFile,
  editorCommandIds.openMarkdownDocument,
  editorCommandIds.saveDocument,
  editorCommandIds.saveAll,
  editorCommandIds.saveAs,
  editorCommandIds.close,
  applicationCommandIds.toggleRecentProjects,
  commandPaletteCommandIds.open,
  assistCommandIds.showLineEndingDistribution,
  assistCommandIds.insertParagraphIndent,
  assistCommandIds.removeParagraphIndent,
  glossaryTabCommandIds.manageTags,
  glossaryTabCommandIds.manageEntries,
  searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
  searchSelectionShortcutCommandIds.openProjectReplaceFromSelection
] as const;

export type ApplicationMenuCommandId =
  (typeof applicationMenuCommandIds)[number];

export function isApplicationMenuCommandId(
  commandId: string
): commandId is ApplicationMenuCommandId {
  return (applicationMenuCommandIds as readonly string[]).includes(commandId);
}
