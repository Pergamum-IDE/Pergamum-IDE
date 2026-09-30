/**
 * #639: reserved key data (from #635 / #636), canonical notation.
 *
 * Data only: nothing here suppresses or intercepts keys at runtime.
 */

import type {
  PergamumPlatform,
  ReservedKeybinding,
  ReservedKeyLevel
} from "./types";

const darwin: readonly PergamumPlatform[] = ["darwin"];
const allPlatforms: readonly PergamumPlatform[] = ["darwin", "win32", "linux"];

function reserved(
  keys: readonly string[],
  level: ReservedKeyLevel,
  reason: string,
  platforms: readonly PergamumPlatform[] = darwin
): ReservedKeybinding[] {
  return keys.map((key) => ({ key, platforms, level, reason }));
}

export const reservedKeybindings: readonly ReservedKeybinding[] = [
  ...reserved(
    ["Mod-Space", "Ctrl-Space", "Ctrl-Mod-Space"],
    "forbidden",
    "macOS Spotlight / input source / character viewer"
  ),
  ...reserved(
    ["Mod-Shift-3", "Mod-Shift-4", "Mod-Shift-5"],
    "forbidden",
    "macOS screenshot"
  ),
  ...reserved(["Mod-Tab", "Mod-`"], "forbidden", "macOS app/window switching"),
  ...reserved(["Mod-Alt-Escape"], "forbidden", "macOS Force Quit"),
  ...reserved(["Ctrl-Mod-q"], "forbidden", "macOS lock screen"),
  ...reserved(["Mod-h"], "nativeOnly", "macOS Hide application"),
  ...reserved(["Mod-Alt-h"], "nativeOnly", "macOS Hide Others"),
  ...reserved(["Mod-m"], "nativeOnly", "macOS Minimize"),
  ...reserved(["Mod-q"], "nativeOnly", "macOS Quit"),
  ...reserved(["Mod-Shift-q"], "nativeOnly", "macOS Log Out"),
  ...reserved(
    [
      "Ctrl-a",
      "Ctrl-e",
      "Ctrl-b",
      "Ctrl-f",
      "Ctrl-n",
      "Ctrl-p",
      "Ctrl-k",
      "Ctrl-h",
      "Ctrl-d",
      "Ctrl-o",
      "Ctrl-t",
      "Ctrl-y"
    ],
    "discouraged",
    "macOS Emacs-style text editing keys"
  ),
  ...reserved(
    ["Mod-Shift-r", "F5"],
    "forbidden",
    "Electron forceReload / reload; runtime suppression is a future issue",
    allPlatforms
  ),
  {
    key: "Mod-r",
    platforms: allPlatforms,
    level: "reload",
    reason: "Electron reload; allowed only for Ruby (#635 PO decision)",
    allowedCommands: ["editor.markdown.insertRuby"]
  }
];
