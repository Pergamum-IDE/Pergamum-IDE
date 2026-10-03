/**
 * #642: accelerator lookup for the Electron application menu, derived from the
 * shared keybinding catalog.
 *
 * Only customizable Pergamum commands with `app` scope are served; native
 * role / standard-behavior commands (quit, toggleDevTools, close, copy, ...)
 * keep their own menu wiring and are never returned here. Keys are written in
 * Electron's `CommandOrControl` spelling, which the menu has always used.
 */

import { NATIVE_MENU_ACCELERATOR_COMMAND_IDS } from "../shared/applicationMenuModel";
import { selectMenuKeybindingKeys } from "../shared/menuKeybindingSelection";
import {
  resolveDefaultKeybindings,
  toElectronAccelerator,
  type KeybindingCatalog,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../shared/keybindings";

// #693: which commands are native accelerators is decided by the menu model
// (each item's `nativeAccelerator`), not by a list here. The Renderer menu's
// shortcut labels do not read it: showing a key is not registering it.
export { NATIVE_MENU_ACCELERATOR_COMMAND_IDS };

export interface MenuAcceleratorLookup {
  /** The primary accelerator (first default key), or `undefined`. */
  get(commandId: string): string | undefined;
  /**
   * Every accelerator for the command in catalog order: the primary key first,
   * then alias keys (F1, F12, `Mod-+`, ...).
   */
  getAll(commandId: string): readonly string[];
}

/** Maps the main process' `process.platform` to the catalog's platform. */
export function nodePlatformToPergamumPlatform(
  platform: NodeJS.Platform
): PergamumPlatform {
  switch (platform) {
    case "darwin":
      return "darwin";
    case "win32":
      return "win32";
    default:
      return "linux";
  }
}

/**
 * `catalog` defaults to the shipped default keybinding catalog. `commandIds`
 * limits the lookup to the commands that opted in to a native accelerator
 * (default: {@link NATIVE_MENU_ACCELERATOR_COMMAND_IDS}); pass `null` to serve
 * every app-scope Pergamum command (tests with a custom catalog).
 */
export function createMenuAcceleratorLookup(
  platform: PergamumPlatform,
  catalog?: KeybindingCatalog,
  commandIds: readonly string[] | null = NATIVE_MENU_ACCELERATOR_COMMAND_IDS,
  /**
   * #645: resolved rows to read instead of the catalog defaults (the
   * effective keybindings with the user's overrides).
   */
  rows?: readonly ResolvedKeybinding[]
): MenuAcceleratorLookup {
  const keys = selectMenuKeybindingKeys(
    rows ?? resolveDefaultKeybindings(platform, catalog),
    commandIds
  );
  const byCommand = new Map<string, string[]>();

  for (const [commandId, commandKeys] of keys) {
    byCommand.set(
      commandId,
      commandKeys.map((key) =>
        toElectronAccelerator(key, platform, { modStyle: "commandOrControl" })
      )
    );
  }

  return {
    get: (commandId) => byCommand.get(commandId)?.[0],
    getAll: (commandId) => byCommand.get(commandId) ?? []
  };
}
