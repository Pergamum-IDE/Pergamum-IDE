/**
 * #683/#685: shortcut labels for the renderer context menus.
 *
 * The label comes from the EFFECTIVE keybinding rows (a user override shows,
 * an unbound command shows nothing — never a hardcoded default), primary
 * binding only, formatted by the shared `formatKeybindingLabel`.
 *
 * A menu item only carries a shortcut when the keybinding command does the same
 * thing to the same target ("press this key = this item"). The per-menu mapping
 * below is that audit; an unmapped item deliberately shows no shortcut.
 */

import { assistCommandIds, editorCommandIds } from "../shared/commandIds";
import type { TabContextMenuAction } from "./documentTabContextMenu";
import { rendererShortcutCommandIds } from "./keybindings/rendererShortcuts";
import {
  createCommandShortcutResolver,
  useCommandShortcutResolver,
  type CommandShortcutResolver
} from "./commandShortcuts";

export type ContextMenuShortcutResolver = CommandShortcutResolver;

export const createContextMenuShortcutResolver = createCommandShortcutResolver;

export const useContextMenuShortcutResolver = useCommandShortcutResolver;

/** Edit menu: the items run the same native edit commands the keys do. */
export const editContextMenuShortcutCommandIds = {
  [editorCommandIds.cutSelection]: editorCommandIds.cutSelection,
  [editorCommandIds.copySelection]: editorCommandIds.copySelection,
  [editorCommandIds.pasteSelection]: editorCommandIds.pasteSelection,
  [editorCommandIds.selectAllSelection]: editorCommandIds.selectAllSelection
} as const;

/**
 * File Explorer menu. Copy / Cut / Paste / Rename / Delete call the very same
 * handlers as the tree's keydown (both act on the current File Explorer
 * selection; a right-click selects the clicked entry first). New file / folder
 * (target = clicked folder or root), Export, Japanese check and Move have no
 * equivalent key with the same target, so they are unmapped.
 */
export const fileExplorerContextMenuShortcutCommandIds: Readonly<
  Record<string, string>
> = {
  copy: rendererShortcutCommandIds.filesCopy,
  cut: rendererShortcutCommandIds.filesCut,
  paste: rendererShortcutCommandIds.filesPaste,
  rename: rendererShortcutCommandIds.filesRename,
  delete: rendererShortcutCommandIds.filesDelete
};

/**
 * Document Tab menu. Its actions target the RIGHT-CLICKED tab, the keys target
 * the ACTIVE editor / focused tab; right-click never activates a tab. So a
 * shortcut is shown only when the clicked tab is the active one, where both are
 * the same operation on the same tab:
 *  - close   -> editor.close      (closes the active document tab)
 *  - saveAs  -> editor.saveAs     (saves the active document under a new path)
 *  - rename  -> F2 on the focused active project-document tab (the menu closes
 *               with focus returned to that tab)
 *  - japaneseMachineCheck -> assist.japaneseMachineCheck.openDialog
 * Export is never mapped: its key (if any) exports the whole project, the item
 * exports the clicked file. Close Others / Left / Right, Select in File
 * Explorer and the path copies have no keybinding command, so they are
 * unmapped.
 */
export function documentTabContextMenuShortcutCommandId(
  action: TabContextMenuAction,
  tab: { readonly isActive: boolean; readonly isProjectDocument: boolean }
): string | null {
  if (!tab.isActive) {
    return null;
  }

  switch (action) {
    case "close":
      return editorCommandIds.close;
    case "saveAs":
      return editorCommandIds.saveAs;
    case "renameFile":
      return tab.isProjectDocument
        ? rendererShortcutCommandIds.filesRename
        : null;
    case "japaneseMachineCheck":
      // The key checks the active editor's target; this item checks the
      // clicked tab's. Same thing only when the clicked tab is the active one.
      return assistCommandIds.openJapaneseMachineCheckDialog;
    default:
      return null;
  }
}
