/**
 * #645: the renderer's source of resolved keybinding rows.
 *
 * The effective keybindings (defaults + the user's keybindings.json, resolved
 * by the main process) are fetched ONCE at startup, before the first render
 * (see main.tsx), and stored here. Until then - and whenever the fetch fails,
 * or there is no keybindings.json - every consumer reads the shipped defaults,
 * so behavior is identical to before #645.
 *
 * Set-once by design: there is no live reload, no subscription and no mutation
 * after startup. Consumers key their caches on the returned rows array, so a
 * reset / replacement is picked up without any invalidation hook. The reset
 * API exists for tests.
 */

import {
  resolveDefaultKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../shared/keybindings";

interface StoredKeybindings {
  readonly platform: PergamumPlatform;
  readonly rows: readonly ResolvedKeybinding[];
}

let stored: StoredKeybindings | null = null;
const defaultRowsByPlatform = new Map<
  PergamumPlatform,
  readonly ResolvedKeybinding[]
>();

/** Stores the effective rows resolved for `platform`. */
export function setEffectiveKeybindings(
  platform: PergamumPlatform,
  rows: readonly ResolvedKeybinding[]
): void {
  stored = { platform, rows };
}

/** Back to the shipped defaults (tests). */
export function resetEffectiveKeybindings(): void {
  stored = null;
}

/**
 * The resolved rows for `platform`: the stored effective rows when they were
 * resolved for that platform, else the (cached) defaults. The returned array
 * is stable between calls until the store changes.
 */
export function getEffectiveKeybindingRows(
  platform: PergamumPlatform
): readonly ResolvedKeybinding[] {
  if (stored !== null && stored.platform === platform) {
    return stored.rows;
  }
  let defaults = defaultRowsByPlatform.get(platform);
  if (defaults === undefined) {
    defaults = resolveDefaultKeybindings(platform);
    defaultRowsByPlatform.set(platform, defaults);
  }
  return defaults;
}

/**
 * Fetches the effective keybindings from the main process and stores them.
 * Never throws: any failure (no bridge, IPC error, malformed reply) keeps the
 * defaults. Returns whether the effective rows were stored.
 */
export async function loadEffectiveKeybindingsFromMain(): Promise<boolean> {
  try {
    const api =
      typeof window === "undefined"
        ? undefined
        : window.pergamum?.keybindings?.getEffectiveKeybindings;
    if (api === undefined) {
      return false;
    }
    const result = await window.pergamum.keybindings.getEffectiveKeybindings();
    if (
      !result ||
      !Array.isArray(result.keybindings) ||
      typeof result.platform !== "string"
    ) {
      return false;
    }
    setEffectiveKeybindings(result.platform, [...result.keybindings]);
    return true;
  } catch {
    return false;
  }
}
