/**
 * #664 / #693: which effective keybinding rows an application menu item uses.
 *
 * ONE selection rule (the customizable keys of a command: app scope, Pergamum
 * source, not readonly, bound), applied to two separate purposes:
 *   - the Renderer menu's shortcut LABEL: every command item, from the
 *     effective rows (`allowed = null`);
 *   - the Electron native ACCELERATOR: only the commands that opted in
 *     (`NATIVE_MENU_ACCELERATOR_COMMAND_IDS` of the menu model).
 * Having a label does not make a key a native accelerator.
 */

import type { ResolvedKeybinding } from "./keybindings";

/**
 * The customizable (app-scope Pergamum) keys of each command, in catalog
 * order: the primary key first, then alias keys (F1, F12, `Mod-+`, ...).
 * `allowed = null` serves every app-scope Pergamum command.
 */
export function selectMenuKeybindingKeys(
  rows: readonly ResolvedKeybinding[],
  allowed: readonly string[] | null
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
