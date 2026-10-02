/**
 * #664: which effective keybinding rows an application menu item carries.
 *
 * One selection rule shared by the Electron native menu (accelerators,
 * `main/menuAccelerators`) and the Renderer menu (shortcut labels), so the
 * label shown in the Renderer menu is always the key the native accelerator
 * backend actually binds.
 */

import type { ResolvedKeybinding } from "./keybindings";

/**
 * The commands that have an application-menu item (primary item or hidden
 * alias). App-scope commands that are handled by a renderer window listener
 * instead (the Command Palette prefix shortcuts, #643) are deliberately NOT
 * here, so the menu can never claim their keys: an Electron accelerator would
 * intercept the keystroke before the renderer sees it (see #556).
 */
export const MENU_ACCELERATOR_COMMAND_IDS: readonly string[] = [
  "workspace.project.open",
  "editor.file.new",
  "editor.close",
  "editor.document.save",
  "editor.saveAll",
  "editor.saveAs",
  "workbench.commandPalette.open",
  "search.project.openFromSelection",
  "search.project.replace.openFromSelection",
  "workspace.applicationSettings.open",
  "app.zoom.in",
  "app.zoom.out",
  "app.zoom.reset"
];

/**
 * The customizable (app-scope Pergamum) keys of each menu command, in catalog
 * order: the primary key first, then alias keys (F1, F12, `Mod-+`, ...).
 * `allowed = null` serves every app-scope Pergamum command.
 */
export function selectMenuKeybindingKeys(
  rows: readonly ResolvedKeybinding[],
  allowed: readonly string[] | null = MENU_ACCELERATOR_COMMAND_IDS
): ReadonlyMap<string, readonly string[]> {
  const allowedSet = allowed === null ? null : new Set(allowed);
  const byCommand = new Map<string, string[]>();

  for (const binding of rows) {
    if (
      (allowedSet !== null && !allowedSet.has(binding.command)) ||
      binding.scope !== "app" ||
      binding.source !== "pergamum" ||
      binding.readonly ||
      binding.key === null
    ) {
      continue;
    }
    const keys = byCommand.get(binding.command) ?? [];
    keys.push(binding.key);
    byCommand.set(binding.command, keys);
  }

  return byCommand;
}

/**
 * The key of a native-role row (Electron role / quit lifecycle): readonly
 * catalog metadata that documents the shortcut the native backend binds. Used
 * for display only.
 */
export function selectNativeRoleKey(
  rows: readonly ResolvedKeybinding[],
  commandId: string
): string | undefined {
  for (const binding of rows) {
    if (
      binding.command === commandId &&
      binding.scope === "native" &&
      binding.key !== null
    ) {
      return binding.key;
    }
  }

  return undefined;
}
