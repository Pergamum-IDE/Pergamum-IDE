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
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../shared/keybindings";
import { getEffectiveKeybindingRows } from "./effectiveKeybindingStore";

export interface CatalogKeyEvent {
  readonly key: string;
  /** Needed for physical matching only. */
  readonly code?: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
  getModifierState?(key: "AltGraph"): boolean;
}

export interface CatalogKeyMatchOptions {
  /**
   * `"physical"` (default): letters, digits, `` ` `` and Space match on
   * `event.code` (layout independent; CodeMirror / Option-safe).
   * `"logical"`: they match on `event.key` (case-insensitive), as the renderer
   * window listeners always did, so non-QWERTY layouts behave as before.
   */
  readonly keyBasis?: "physical" | "logical";
  /**
   * Symbol keys (`#`, `@`, `:`, `%`, ...) whose catalog key carries no Shift /
   * Alt are produced with Shift or Alt on some layouts; match them on the
   * character alone, ignoring Shift / Alt. Mod stays exact.
   */
  readonly tolerateSymbolModifiers?: boolean;
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

function isSymbolKey(key: string): boolean {
  return /^[\x21-\x7e]$/.test(key) && !/^[A-Za-z0-9]$/.test(key);
}

function keyMatches(
  event: CatalogKeyEvent,
  key: string,
  basis: "physical" | "logical"
): boolean {
  if (basis === "logical") {
    if (/^[a-z]$/.test(key)) {
      return event.key.toLowerCase() === key;
    }
    return event.key === (key === "Space" ? " " : key);
  }
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
  platform: PergamumPlatform,
  options: CatalogKeyMatchOptions = {}
): boolean {
  const parsed = parseKeybindingKey(catalogKey);
  if (parsed === null) {
    return false;
  }
  const basis = options.keyBasis ?? "physical";
  const onlyMod =
    !parsed.modifiers.has("Ctrl") &&
    !parsed.modifiers.has("Alt") &&
    !parsed.modifiers.has("Shift");

  let modifiersOk: boolean;
  if (options.tolerateSymbolModifiers && onlyMod && isSymbolKey(parsed.key)) {
    const modPressed =
      platform === "darwin"
        ? event.metaKey && !event.ctrlKey
        : event.ctrlKey && !event.metaKey;
    modifiersOk = parsed.modifiers.has("Mod")
      ? modPressed
      : !event.ctrlKey && !event.metaKey;
  } else {
    modifiersOk = modifiersMatchCatalogKey(event, catalogKey, platform);
  }
  if (!modifiersOk) {
    return false;
  }
  // AltGr is reported as Ctrl+Alt on Windows / Linux; never mistake it for
  // Mod+Alt. (macOS has no AltGr: Option is plain Alt there.)
  if (
    platform !== "darwin" &&
    parsed.modifiers.has("Mod") &&
    typeof event.getModifierState === "function" &&
    event.getModifierState("AltGraph")
  ) {
    return false;
  }
  return keyMatches(event, parsed.key, basis);
}

/** Per-rows-array cache: a replaced effective set gets a fresh index. */
const keysByRows = new WeakMap<
  readonly ResolvedKeybinding[],
  Map<string, string[]>
>();

/**
 * The keys bound to `commandId` on `platform` in the effective keybindings
 * (defaults plus the user's overrides, #645; just the defaults when there is
 * no keybindings.json). May be empty.
 */
export function catalogKeysForCommand(
  commandId: string,
  platform: PergamumPlatform
): readonly string[] {
  const rows = getEffectiveKeybindingRows(platform);
  let byCommand = keysByRows.get(rows);
  if (byCommand === undefined) {
    byCommand = new Map();
    for (const binding of rows) {
      if (binding.key === null) {
        continue;
      }
      const keys = byCommand.get(binding.command) ?? [];
      keys.push(binding.key);
      byCommand.set(binding.command, keys);
    }
    keysByRows.set(rows, byCommand);
  }
  return byCommand.get(commandId) ?? [];
}

export function eventMatchesCatalogCommand(
  event: CatalogKeyEvent,
  commandId: string,
  platform: PergamumPlatform,
  options?: CatalogKeyMatchOptions
): boolean {
  return catalogKeysForCommand(commandId, platform).some((key) =>
    eventMatchesCatalogKey(event, key, platform, options)
  );
}
