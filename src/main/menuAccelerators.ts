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
 * limits the lookup to commands that have a menu item (default:
 * {@link MENU_ACCELERATOR_COMMAND_IDS}); pass `null` to serve every app-scope
 * Pergamum command (tests with a custom catalog).
 */
export function createMenuAcceleratorLookup(
  platform: PergamumPlatform,
  catalog?: KeybindingCatalog,
  commandIds: readonly string[] | null = MENU_ACCELERATOR_COMMAND_IDS
): MenuAcceleratorLookup {
  const byCommand = new Map<string, string[]>();
  const allowed = commandIds === null ? null : new Set(commandIds);

  for (const binding of resolveDefaultKeybindings(platform, catalog)) {
    if (
      (allowed !== null && !allowed.has(binding.command)) ||
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
