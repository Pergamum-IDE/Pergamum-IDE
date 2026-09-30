/**
 * #641: match a DOM `KeyboardEvent` against keybinding-catalog keys.
 *
 * Used where a shortcut is recognized outside the generated CodeMirror keymap
 * (e.g. the Find panel's own inputs, the tab-capture Escape handler), so the
 * keys still come from the catalog instead of being repeated as literals.
 *
 * Modifiers must match exactly (Mod = Cmd on darwin, Ctrl elsewhere). Letter,
 * digit, `` ` `` and Space keys match on the physical `event.code`, which is
 * layout independent and unaffected by macOS Option composition; other keys
 * (F-keys, arrows, Escape, punctuation) match on `event.key`.
 */

import {
  parseKeybindingKey,
  resolveDefaultKeybindings,
  type PergamumPlatform
} from "../../shared/keybindings";

export interface CatalogKeyEvent {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** Exact modifier match (no key check). */
export function modifiersMatchCatalogKey(
  event: Pick<CatalogKeyEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey">,
  catalogKey: string,
  platform: PergamumPlatform
): boolean {
  const parsed = parseKeybindingKey(catalogKey);
  if (parsed === null) {
    return false;
  }
  const mod = parsed.modifiers.has("Mod");
  const expectedCtrl =
    parsed.modifiers.has("Ctrl") || (mod && platform !== "darwin");
  const expectedMeta = mod && platform === "darwin";
  return (
    event.ctrlKey === expectedCtrl &&
    event.metaKey === expectedMeta &&
    event.altKey === parsed.modifiers.has("Alt") &&
    event.shiftKey === parsed.modifiers.has("Shift")
  );
}

function keyMatches(event: CatalogKeyEvent, key: string): boolean {
  if (/^[a-z]$/.test(key)) {
    return event.code === `Key${key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(key)) {
    return event.code === `Digit${key}`;
  }
  if (key === "`") {
    return event.code === "Backquote";
  }
  if (key === "Space") {
    return event.code === "Space";
  }
  return event.key === key;
}

export function eventMatchesCatalogKey(
  event: CatalogKeyEvent,
  catalogKey: string,
  platform: PergamumPlatform
): boolean {
  const parsed = parseKeybindingKey(catalogKey);
  return (
    parsed !== null &&
    modifiersMatchCatalogKey(event, catalogKey, platform) &&
    keyMatches(event, parsed.key)
  );
}

const keysByPlatform = new Map<PergamumPlatform, Map<string, string[]>>();

/** The catalog's default keys for `commandId` on `platform` (may be empty). */
export function catalogKeysForCommand(
  commandId: string,
  platform: PergamumPlatform
): readonly string[] {
  let byCommand = keysByPlatform.get(platform);
  if (byCommand === undefined) {
    byCommand = new Map();
    for (const binding of resolveDefaultKeybindings(platform)) {
      if (binding.key === null) {
        continue;
      }
      const keys = byCommand.get(binding.command) ?? [];
      keys.push(binding.key);
      byCommand.set(binding.command, keys);
    }
    keysByPlatform.set(platform, byCommand);
  }
  return byCommand.get(commandId) ?? [];
}

export function eventMatchesCatalogCommand(
  event: CatalogKeyEvent,
  commandId: string,
  platform: PergamumPlatform
): boolean {
  return catalogKeysForCommand(commandId, platform).some((key) =>
    eventMatchesCatalogKey(event, key, platform)
  );
}
