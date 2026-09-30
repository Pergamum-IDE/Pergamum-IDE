/**
 * #644: main-process guard that keeps Chromium's reload / forceReload keys
 * from reloading the app.
 *
 * It is defense in depth: the application menu has no reload item, so these
 * keys do nothing today. The guard makes that robust against a future menu
 * change, without relying on it.
 *
 * DESIGN RULE: a key that an allowed command must still receive
 * (`rendererMayHandle`, i.e. plain Mod-R for ruby insertion) is NEVER
 * suppressed here. `before-input-event`'s `preventDefault()` withholds the key
 * from the renderer too, which would break `editor.markdown.insertRuby`. Only
 * keys with no renderer use (Mod-Shift-R, F5, Mod-F5, Shift-F5) are
 * suppressed. The renderer's bubble-phase fallback covers plain Mod-R.
 */

import type { Event as ElectronEvent, Input, WebContents } from "electron";
import {
  classifyReloadShortcut,
  type PergamumPlatform
} from "../shared/keybindings";
import { nodePlatformToPergamumPlatform } from "./menuAccelerators";

/** The Electron `Input` fields the guard reads. */
export type ReloadGuardKeyInput = Pick<
  Input,
  "type" | "key" | "control" | "meta" | "shift" | "alt"
>;

/**
 * Should main swallow this input? True only for a keyDown of a reload /
 * forceReload key that no renderer command needs.
 */
export function shouldSuppressReloadInput(
  input: ReloadGuardKeyInput,
  platform: PergamumPlatform
): boolean {
  if (input.type !== "keyDown") {
    return false;
  }
  const classification = classifyReloadShortcut(input, platform);
  return classification !== null && !classification.rendererMayHandle;
}

export function installReloadShortcutGuard(
  webContents: Pick<WebContents, "on">,
  nodePlatform: NodeJS.Platform = process.platform
): void {
  const platform = nodePlatformToPergamumPlatform(nodePlatform);
  webContents.on(
    "before-input-event",
    (event: ElectronEvent, input: Input): void => {
      if (shouldSuppressReloadInput(input, platform)) {
        event.preventDefault();
      }
    }
  );
}
