/**
 * #272: capture a `BrowserWindow`'s state into the plain, serializable
 * `WindowSessionState` the Session Store persists.
 *
 * What #272 stores (so a downstream restore Issue can act on it):
 *   - `normalBounds` — the window's non-maximized/non-fullscreen bounds,
 *     via Electron `getNormalBounds()`, kept even while maximized or
 *     fullscreen so "restore down" size survives
 *   - `mode` — `normal` | `maximized` | `fullscreen`
 *
 * What #272 does NOT do (downstream restore's job): off-screen detection,
 * display fallback, actual placement, applying maximize/fullscreen.
 *
 * `minimized` is never persisted as a mode: a session that ended minimized
 * must not reopen minimized. A minimized window still yields its
 * `normalBounds` and `mode: "normal"`.
 */

import type {
  WindowSessionBounds,
  WindowSessionMode,
  WindowSessionState
} from "../shared/session";

/** The subset of Electron's `BrowserWindow` this needs — kept tiny so it
 *  is trivial to fake in tests. */
export interface WindowSessionSource {
  isDestroyed(): boolean;
  isMinimized(): boolean;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  getNormalBounds(): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): WindowSessionBounds | null {
  if (
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height)
  };
}

function resolveMode(source: WindowSessionSource): WindowSessionMode {
  if (source.isFullScreen()) {
    return "fullscreen";
  }

  if (source.isMaximized()) {
    return "maximized";
  }

  // Includes the minimized case — deliberately reported as "normal".
  return "normal";
}

/**
 * Returns `null` when the window is gone or its bounds are unusable — the
 * caller persists `window: null` and the rest of the Session is unaffected.
 */
export function captureWindowSessionState(
  source: WindowSessionSource | null | undefined
): WindowSessionState | null {
  if (!source || source.isDestroyed()) {
    return null;
  }

  let rawBounds: { x: number; y: number; width: number; height: number };

  try {
    rawBounds = source.getNormalBounds();
  } catch {
    return null;
  }

  const normalBounds = normalizeBounds(rawBounds);

  if (!normalBounds) {
    return null;
  }

  return {
    normalBounds,
    mode: resolveMode(source)
  };
}
