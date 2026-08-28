import { defineCommandId } from "./commandRegistry";
import type { EditorId } from "./editorId";

export const applicationCommandIds = {
  openAbout: defineCommandId("app.about.open"),
  quitApplication: defineCommandId("app.quit"),
  createProject: defineCommandId("workspace.project.create"),
  openProject: defineCommandId("workspace.project.open"),
  closeProject: defineCommandId("workspace.project.close"),
  toggleRecentProjects: defineCommandId("workspace.recentProjects.toggle")
} as const;

export const commandPaletteCommandIds = {
  open: defineCommandId("workbench.commandPalette.open")
} as const;

export const assistCommandIds = {
  showLineEndingDistribution: defineCommandId(
    "assist.lineEndingDistribution.show"
  ),
  insertParagraphIndent: defineCommandId("assist.paragraphIndent.insert"),
  removeParagraphIndent: defineCommandId("assist.paragraphIndent.remove")
} as const;

export const editorCommandIds = {
  openMarkdownDocument: defineCommandId("editor.document.markdown.open"),
  saveDocument: defineCommandId("editor.document.save"),
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
  editorCommandIds.openMarkdownDocument,
  editorCommandIds.saveDocument,
  editorCommandIds.saveAs,
  editorCommandIds.close,
  applicationCommandIds.toggleRecentProjects,
  commandPaletteCommandIds.open,
  assistCommandIds.showLineEndingDistribution,
  assistCommandIds.insertParagraphIndent,
  assistCommandIds.removeParagraphIndent
] as const;

export type ApplicationMenuCommandId =
  (typeof applicationMenuCommandIds)[number];

export function isApplicationMenuCommandId(
  commandId: string
): commandId is ApplicationMenuCommandId {
  return (applicationMenuCommandIds as readonly string[]).includes(commandId);
}
