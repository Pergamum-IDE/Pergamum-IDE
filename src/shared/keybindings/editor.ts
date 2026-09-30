/**
 * #641: editor-scope view of the default keybinding catalog, used to build
 * the CodeMirror keymap.
 */

import { defaultKeybindings } from "./defaults";
import { defaultKeybindingCatalog, resolveDefaultKeybindings } from "./resolve";
import type {
  KeybindingCatalog,
  PergamumPlatform,
  ResolvedKeybinding
} from "./types";

/**
 * Customizable editor-scope Pergamum keybindings that have a key on
 * `platform`. Excludes readonly commands (nativeRole / standard) and rows
 * with `key: null`. Command metadata (when, handlerStatus, ...) is kept.
 */
export function resolveEditorKeybindings(
  platform: PergamumPlatform,
  catalog: KeybindingCatalog = defaultKeybindingCatalog
): ResolvedKeybinding[] {
  return resolveDefaultKeybindings(platform, catalog).filter(
    (binding) =>
      binding.scope === "editor" &&
      binding.source === "pergamum" &&
      !binding.readonly &&
      binding.key !== null
  );
}

/**
 * The catalog's common (platform-independent) default keys for the given
 * commands, in canonical notation. Platform overrides are NOT applied: the
 * canonical `Mod-...` spelling is what CodeMirror's own standard keymaps use,
 * which is what the base-setup filters compare against.
 */
export function listCommonDefaultKeys(
  commandIds: readonly string[]
): string[] {
  const wanted = new Set(commandIds);
  const keys: string[] = [];
  for (const entry of defaultKeybindings) {
    if (wanted.has(entry.command) && entry.key !== null) {
      keys.push(entry.key);
    }
  }
  return keys;
}
