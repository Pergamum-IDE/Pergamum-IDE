/**
 * #644: classification of reload / forceReload key input, derived from the
 * reserved-key data (`runtimeSuppression`). Pure; shared by the main-process
 * `before-input-event` guard and the renderer's bubble-phase fallback.
 *
 * The decisive field is `rendererMayHandle`: the key has an explicit
 * `allowedCommands` exception (Mod-r -> `editor.markdown.insertRuby`), so the
 * renderer must still receive it. Such a key is never suppressed in main.
 */

import { parseKeybindingKey } from "./format";
import { reservedKeybindings } from "./reserved";
import type {
  PergamumPlatform,
  ReservedKeybinding,
  ReservedRuntimeSuppression
} from "./types";

/** The fields read from an Electron `Input` or a DOM `KeyboardEvent`. */
export interface ReloadGuardInput {
  readonly key: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly shift: boolean;
  readonly alt: boolean;
}

export interface ReloadShortcutClassification {
  readonly kind: ReservedRuntimeSuppression;
  /** The reserved entry's key, in canonical notation. */
  readonly reservedKey: string;
  /** true when an allowed command (Ruby's Mod-r) must still receive the key. */
  readonly rendererMayHandle: boolean;
}

function matches(
  input: ReloadGuardInput,
  reserved: ReservedKeybinding,
  platform: PergamumPlatform
): boolean {
  const parsed = parseKeybindingKey(reserved.key);
  if (parsed === null) {
    return false;
  }
  const mod = parsed.modifiers.has("Mod");
  const expectedCtrl =
    parsed.modifiers.has("Ctrl") || (mod && platform !== "darwin");
  const expectedMeta = mod && platform === "darwin";
  if (
    input.control !== expectedCtrl ||
    input.meta !== expectedMeta ||
    input.alt !== parsed.modifiers.has("Alt") ||
    input.shift !== parsed.modifiers.has("Shift")
  ) {
    return false;
  }
  return /^[a-z]$/.test(parsed.key)
    ? input.key.toLowerCase() === parsed.key
    : input.key === parsed.key;
}

/**
 * The reload / forceReload behavior `input` would trigger on `platform`, or
 * `null` when it is not a reload key. Modifiers are exact (Ctrl+Alt+R is not
 * reload; Mod is Cmd on darwin and Ctrl elsewhere).
 */
export function classifyReloadShortcut(
  input: ReloadGuardInput,
  platform: PergamumPlatform,
  reserved: readonly ReservedKeybinding[] = reservedKeybindings
): ReloadShortcutClassification | null {
  for (const entry of reserved) {
    if (
      entry.runtimeSuppression === undefined ||
      !entry.platforms.includes(platform) ||
      !matches(input, entry, platform)
    ) {
      continue;
    }
    return {
      kind: entry.runtimeSuppression,
      reservedKey: entry.key,
      rendererMayHandle: (entry.allowedCommands ?? []).length > 0
    };
  }
  return null;
}
