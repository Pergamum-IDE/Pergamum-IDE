/**
 * #644: renderer fallback that keeps an UNHANDLED reload key from falling
 * through to Chromium's reload.
 *
 * A bubble-phase window `keydown` listener (it runs after the editor's own
 * handlers). If a handler already consumed the event (ruby insertion on
 * Mod-R, including its read-only notification), `defaultPrevented` is true
 * and nothing happens. Otherwise it only calls `preventDefault()`; it never
 * stops propagation and never runs a command, so it cannot starve
 * `editor.markdown.insertRuby`.
 *
 * Mod-Shift-R / F5 / Mod-F5 / Shift-F5 are normally swallowed earlier by the
 * main-process guard (src/main/reloadGuard.ts); this covers plain Mod-R and
 * any environment where main's guard is not installed.
 */

import { useEffect } from "react";
import { classifyReloadShortcut } from "../shared/keybindings";
import { getRuntimePlatform } from "./platformModifier";

export function preventUnhandledReloadKey(
  event: KeyboardEvent,
  platform = getRuntimePlatform()
): boolean {
  if (event.defaultPrevented) {
    return false;
  }
  const classification = classifyReloadShortcut(
    {
      key: event.key,
      control: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey
    },
    platform
  );
  if (classification === null) {
    return false;
  }
  event.preventDefault();
  return true;
}

export function useReloadKeyFallback(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      preventUnhandledReloadKey(event);
    }
    // Bubble phase on purpose (no `capture`).
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
