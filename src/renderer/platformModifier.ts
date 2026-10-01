/**
 * #636: one place for platform-aware "Mod" key handling in the renderer.
 *
 * The platform comes from the Main process (`process.platform`), mapped to
 * `AppPlatform` in preload and exposed as `window.pergamum.platform` (#182).
 * The renderer must not read `navigator.platform`.
 *
 * Mod = Cmd on macOS, Ctrl on Windows / Linux. Exactly one of Ctrl / Meta:
 * on macOS, Ctrl+letter stays available for the OS text-editing keys
 * (Ctrl+B / F / H / K ...), and Ctrl+Cmd never counts as Mod.
 */

import type { AppPlatform } from "../shared/platform";
import type { PergamumPlatform } from "../shared/keybindings";

export function appPlatformToPergamumPlatform(
  platform: AppPlatform
): PergamumPlatform {
  switch (platform) {
    case "macos":
      return "darwin";
    case "windows":
      return "win32";
    default:
      // "linux" and "other": Linux-like shortcuts.
      return "linux";
  }
}

/**
 * The runtime platform. Falls back to Linux-like when the preload bridge is
 * missing (unit tests, non-Electron contexts).
 */
export function getRuntimePlatform(): PergamumPlatform {
  const appPlatform =
    typeof window === "undefined" ? undefined : window.pergamum?.platform;
  return appPlatform === undefined
    ? "linux"
    : appPlatformToPergamumPlatform(appPlatform);
}

export interface ModifierKeyState {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/**
 * darwin: `metaKey && !ctrlKey`. win32 / linux: `ctrlKey && !metaKey`.
 */
export function isModKey(
  event: ModifierKeyState,
  platform: PergamumPlatform
): boolean {
  return platform === "darwin"
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}
