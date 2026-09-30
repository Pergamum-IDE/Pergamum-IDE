/**
 * #642: accelerator lookup for the Electron application menu, derived from the
 * shared keybinding catalog.
 *
 * Only customizable Pergamum commands with `app` scope are served; native
 * role / standard-behavior commands (quit, toggleDevTools, close, copy, ...)
 * keep their own menu wiring and are never returned here. Keys are written in
 * Electron's `CommandOrControl` spelling, which the menu has always used.
 */

import {
  resolveDefaultKeybindings,
  toElectronAccelerator,
  type KeybindingCatalog,
  type PergamumPlatform
} from "../shared/keybindings";

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

/** `catalog` defaults to the shipped default keybinding catalog. */
export function createMenuAcceleratorLookup(
  platform: PergamumPlatform,
  catalog?: KeybindingCatalog
): MenuAcceleratorLookup {
  const byCommand = new Map<string, string[]>();

  for (const binding of resolveDefaultKeybindings(platform, catalog)) {
    if (
      binding.scope !== "app" ||
      binding.source !== "pergamum" ||
      binding.readonly ||
      binding.key === null
    ) {
      continue;
    }
    const accelerators = byCommand.get(binding.command) ?? [];
    accelerators.push(
      toElectronAccelerator(binding.key, platform, {
        modStyle: "commandOrControl"
      })
    );
    byCommand.set(binding.command, accelerators);
  }

  return {
    get: (commandId) => byCommand.get(commandId)?.[0],
    getAll: (commandId) => byCommand.get(commandId) ?? []
  };
}
