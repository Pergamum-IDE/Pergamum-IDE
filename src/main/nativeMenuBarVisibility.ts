/**
 * #663: on Windows / Linux the Renderer menu bar replaces the VISIBLE native
 * menu bar; the Electron Application Menu itself stays installed, because it
 * is still the accelerator / native-role backend (#635). Only its bar is
 * hidden here. macOS keeps its native global menu untouched.
 *
 * `autoHideMenuBar` is deliberately not used: it would bring the native bar
 * back on a bare Alt press (Alt mnemonics are the Renderer menu's job, #665).
 * Electron makes the bar visible again whenever the menu is (re)installed
 * (`Menu.setApplicationMenu`), so this runs after every install and for every
 * new window.
 */

export interface NativeMenuBarTarget {
  isDestroyed(): boolean;
  setMenuBarVisibility(visible: boolean): void;
}

export function shouldHideNativeMenuBar(platform: NodeJS.Platform): boolean {
  return platform === "win32" || platform === "linux";
}

export function hideNativeMenuBar(
  windows: Iterable<NativeMenuBarTarget>,
  platform: NodeJS.Platform = process.platform
): void {
  if (!shouldHideNativeMenuBar(platform)) {
    return;
  }

  for (const window of windows) {
    if (!window.isDestroyed()) {
      window.setMenuBarVisibility(false);
    }
  }
}
