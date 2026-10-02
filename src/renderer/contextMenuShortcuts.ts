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

import { useCallback, useSyncExternalStore } from "react";
import { editorCommandIds } from "../shared/commandIds";
import {
  formatKeybindingLabel,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../shared/keybindings";
import type { TabContextMenuAction } from "./documentTabContextMenu";
import {
  getEffectiveKeybindingRows,
  getEffectiveKeybindingsRevision,
  subscribeEffectiveKeybindings
} from "./keybindings/effectiveKeybindingStore";
import { getRuntimePlatform } from "./platformModifier";
import { rendererShortcutCommandIds } from "./keybindings/rendererShortcuts";

export type ContextMenuShortcutResolver = (
  commandId: string | null | undefined
) => string | undefined;

/** The primary (first bound) key of a command, in catalog order. */
function primaryKey(
  rows: readonly ResolvedKeybinding[],
  commandId: string
): string | undefined {
  for (const binding of rows) {
    if (binding.command === commandId && binding.key !== null) {
      return binding.key;
    }
  }

  return undefined;
}

export function createContextMenuShortcutResolver(
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[]
): ContextMenuShortcutResolver {
  return (commandId) => {
    if (!commandId) {
      return undefined;
    }
    const key = primaryKey(rows, commandId);

    return key === undefined ? undefined : formatKeybindingLabel(key, platform);
  };
}

/**
 * Resolver bound to the live effective-keybinding store: the returned function
 * changes identity when the store changes, so a menu that is open re-renders.
 */
export function useContextMenuShortcutResolver(): ContextMenuShortcutResolver {
  const revision = useSyncExternalStore(
    subscribeEffectiveKeybindings,
    getEffectiveKeybindingsRevision,
    getEffectiveKeybindingsRevision
  );

  return useCallback(
    (commandId) => {
      const platform = getRuntimePlatform();

      return createContextMenuShortcutResolver(
        platform,
        getEffectiveKeybindingRows(platform)
      )(commandId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [revision]
  );
}

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
 * Close Others / Left / Right, Select in File Explorer and the path copies have
 * no keybinding command, so they are unmapped.
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
    default:
      return null;
  }
}
