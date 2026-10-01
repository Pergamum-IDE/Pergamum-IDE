/**
 * #659: the Main Window is created hidden and shown exactly once, when its
 * renderer reports that the startup visual settings (color theme / fonts)
 * are applied — not on Electron's generic `ready-to-show`.
 *
 * Electron-free (structural window type) so it is unit-testable. Tracking is
 * per window, so a later `app.activate` window (macOS) is revealed the same
 * way as the cold-start window.
 *
 * The saved maximize / fullscreen mode is applied HERE, immediately before
 * `show()`, and never while the window is hidden: Electron's `maximize()`
 * (and `setFullScreen`) also SHOW a hidden window, which put a normal-sized
 * unthemed frame on screen at startup.
 */

import {
  applyWindowSessionMode,
  type WindowModeTarget
} from "./windowStateRestore";
import type { WindowSessionMode } from "../shared/session";

export interface RevealableWindow extends WindowModeTarget {
  isDestroyed(): boolean;
  show(): void;
}

/**
 * Failsafe only (never a delay on the normal path): if the renderer has not
 * reported ready by then, the window is shown anyway so a renderer that
 * failed to start can never leave Pergamum invisible.
 */
export const STARTUP_REVEAL_FAILSAFE_MS = 10_000;

export interface StartupWindowReveal<W extends RevealableWindow> {
  /** Starts tracking a freshly created, still hidden window + its saved mode. */
  track(window: W, mode: WindowSessionMode): void;
  /**
   * Applies the saved mode, then shows a tracked window once. Returns false
   * when nothing was shown.
   */
  reveal(window: W): boolean;
}

export function createStartupWindowReveal<
  W extends RevealableWindow
>(): StartupWindowReveal<W> {
  const pending = new WeakMap<W, WindowSessionMode>();

  return {
    track(window, mode) {
      pending.set(window, mode);
    },
    reveal(window) {
      const mode = pending.get(window);
      if (mode === undefined) {
        return false;
      }
      pending.delete(window);

      if (window.isDestroyed()) {
        return false;
      }

      applyWindowSessionMode(window, mode);
      window.show();
      return true;
    }
  };
}

export interface FailsafeWindow extends RevealableWindow {
  once(eventName: "closed", listener: () => void): unknown;
  readonly webContents: {
    once(
      eventName: "did-fail-load" | "render-process-gone",
      listener: () => void
    ): unknown;
  };
}

/**
 * Reveals the window anyway when its renderer can never report ready (load
 * failure, renderer crash, or no report within `timeoutMs`). The timer is
 * cleared on `closed`, and `reveal` itself ignores destroyed / already
 * revealed windows, so a closed window is never shown again.
 */
export function installStartupRevealFailsafe<W extends FailsafeWindow>(
  reveal: StartupWindowReveal<W>,
  window: W,
  timeoutMs: number = STARTUP_REVEAL_FAILSAFE_MS
): void {
  const timer = setTimeout(() => {
    reveal.reveal(window);
  }, timeoutMs);

  window.once("closed", () => clearTimeout(timer));
  window.webContents.once("did-fail-load", () => {
    reveal.reveal(window);
  });
  window.webContents.once("render-process-gone", () => {
    reveal.reveal(window);
  });
}
