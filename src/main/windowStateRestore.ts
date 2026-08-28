/**
 * #274: turn a persisted `WindowSessionState` into concrete cold-start
 * `BrowserWindow` placement + a follow-up mode to apply.
 *
 * Pure and Electron-free: the caller passes in the display work areas
 * (from `screen.getAllDisplays()`), so this is unit-testable without a real
 * display topology.
 *
 * Rules (Issue #274):
 *   - `normalBounds` is the restore-down size/position
 *   - a window that is off-screen for the CURRENT topology gets its x/y
 *     reset onto a safe display; width/height are preserved and only
 *     clamped when they exceed the chosen display's work area
 *   - never depends on an nth-display identity — displays are matched by
 *     geometry, not index
 *   - `minimized` is not in the schema and is never produced here
 */

import type {
  WindowSessionMode,
  WindowSessionState
} from "../shared/session";

export interface DisplayWorkAreaLike {
  readonly workArea: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface ResolvedWindowBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResolvedWindowPlacement {
  /** `null` → let `BrowserWindow` use its built-in default size/placement. */
  readonly bounds: ResolvedWindowBounds | null;
  readonly mode: WindowSessionMode;
}

/**
 * How much of the saved window rectangle must overlap SOME display work
 * area for the window to count as "still on-screen" and be placed verbatim.
 * A small sliver peeking onto a display is treated as off-screen.
 */
const MIN_VISIBLE_OVERLAP_PX = 64;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlapArea(a: Rect, b: Rect): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  const width = right - left;
  const height = bottom - top;

  return width > 0 && height > 0 ? width * height : 0;
}

function isVisiblyOnScreen(
  bounds: Rect,
  displays: readonly DisplayWorkAreaLike[]
): boolean {
  const threshold = MIN_VISIBLE_OVERLAP_PX * MIN_VISIBLE_OVERLAP_PX;

  return displays.some(
    (display) => overlapArea(bounds, display.workArea) >= threshold
  );
}

function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function nearestDisplay(
  bounds: Rect,
  displays: readonly DisplayWorkAreaLike[]
): DisplayWorkAreaLike {
  const windowCenter = rectCenter(bounds);
  let best = displays[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const display of displays) {
    const center = rectCenter(display.workArea);
    const dx = center.x - windowCenter.x;
    const dy = center.y - windowCenter.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      best = display;
    }
  }

  return best;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function resolveWindowPlacement(
  saved: WindowSessionState | null,
  displays: readonly DisplayWorkAreaLike[]
): ResolvedWindowPlacement {
  if (!saved) {
    return { bounds: null, mode: "normal" };
  }

  const { normalBounds, mode } = saved;
  const bounds: Rect = {
    x: normalBounds.x,
    y: normalBounds.y,
    width: normalBounds.width,
    height: normalBounds.height
  };

  // No topology info at all — trust the saved bounds verbatim.
  if (displays.length === 0) {
    return { bounds: { ...bounds }, mode };
  }

  if (isVisiblyOnScreen(bounds, displays)) {
    return { bounds: { ...bounds }, mode };
  }

  // Off-screen for the current topology: keep the size where possible, move
  // onto the geometrically nearest display's work area.
  const target = nearestDisplay(bounds, displays).workArea;
  const width = Math.min(bounds.width, target.width);
  const height = Math.min(bounds.height, target.height);
  const x = clamp(bounds.x, target.x, target.x + target.width - width);
  const y = clamp(bounds.y, target.y, target.y + target.height - height);

  return { bounds: { x, y, width, height }, mode };
}

export interface WindowModeTarget {
  maximize(): void;
  setFullScreen(flag: boolean): void;
}

/**
 * Apply the saved window mode after the window has been created with
 * `normalBounds`. `normal` is a no-op. `minimized` never reaches here.
 */
export function applyWindowSessionMode(
  window: WindowModeTarget,
  mode: WindowSessionMode
): void {
  switch (mode) {
    case "maximized":
      window.maximize();
      return;
    case "fullscreen":
      window.setFullScreen(true);
      return;
    case "normal":
      return;
  }
}
