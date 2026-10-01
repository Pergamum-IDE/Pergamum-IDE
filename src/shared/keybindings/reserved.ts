/**
 * #639: reserved key data (from #635 / #636), canonical notation.
 *
 * Data only: nothing here suppresses or intercepts keys at runtime.
 */

import type {
  PergamumPlatform,
  ReservedKeybinding,
  ReservedKeyLevel,
  ReservedRuntimeSuppression
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

function reservedSuppressed(
  keys: readonly string[],
  level: ReservedKeyLevel,
  runtimeSuppression: ReservedRuntimeSuppression,
  reason: string
): ReservedKeybinding[] {
  return keys.map((key) => ({
    key,
    platforms: allPlatforms,
    level,
    reason,
    runtimeSuppression
  }));
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
  // #654: the same screenshot keys as the shifted symbol the capture UI and a
  // hand-written keybindings.json spell them with (Shift-3/4/5 -> # $ %).
  ...reserved(
    ["Mod-#", "Mod-$", "Mod-%"],
    "forbidden",
    "macOS screenshot (shifted-symbol spelling of Mod-Shift-3 / 4 / 5)"
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
  // #644: reload / forceReload keys. Every one is runtime-suppressed; none may
  // be assigned to a command, except Mod-r for Ruby (explicit exception below).
  ...reservedSuppressed(
    ["F5"],
    "forbidden",
    "reload",
    "Chromium reload (F5); suppressed at runtime, never a Pergamum command key"
  ),
  ...reservedSuppressed(
    ["Mod-Shift-r", "Mod-F5", "Shift-F5"],
    "forbidden",
    "forceReload",
    "Chromium forceReload; suppressed at runtime, never a Pergamum command key"
  ),
  {
    key: "Mod-r",
    platforms: allPlatforms,
    level: "reload",
    reason:
      "Pergamum uses Mod-R for ruby insertion; Chromium reload must remain disabled (#635 PO decision)",
    allowedCommands: ["editor.markdown.insertRuby"],
    runtimeSuppression: "reload"
  }
];
