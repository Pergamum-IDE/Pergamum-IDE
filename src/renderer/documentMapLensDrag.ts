/**
 * #375 Document Map viewport-lens DRAG.
 *
 * This module owns the *pure* drag logic: the lens hit test, the
 * candidate → dragging threshold, the state transitions for
 * pointerdown / pointermove / pointerup / pointercancel (Phase 1), and the
 * pointer-Y → next-lens-Y → target-visual-row math that a `dragging` state
 * feeds to the editor scroll (Phase 2, {@link resolveDocumentMapLensDragTarget}),
 * plus the client→map coordinate conversion shared with click-to-scroll
 * ({@link resolveDocumentMapPoint}) and the lens-Y clamp
 * ({@link clampDocumentMapLensY}).
 *
 * Nothing here touches the DOM, React, or the editor — coordinate helpers take
 * plain `{ left, top }` / number inputs, and the caller turns the returned
 * visual row into a source line and reuses the click-to-scroll path.
 */

/**
 * Chebyshev pixel distance the pointer must travel from the pointerdown point
 * before a `candidate` becomes a `dragging` state. Keeps a plain click inside
 * the lens from being read as a drag.
 */
export const DOCUMENT_MAP_LENS_DRAG_THRESHOLD_PX = 3;

export interface DocumentMapLensRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * #375 Phase 4 — the ONE client→map coordinate conversion, shared by
 * click-to-scroll and lens drag. The Document Map host element is content-sized
 * (1 CSS px = 1 logical map px) and lives inside a scroll container, so its
 * `getBoundingClientRect()` already folds in the container's `scrollTop`:
 * `clientY - hostRect.top` is the logical map Y with no extra scroll math.
 * `hostRect` only needs `{ left, top }` (a `DOMRect` satisfies it). Returns
 * `null` — never throws — for a non-finite client point or host origin (a
 * detached / not-yet-laid-out host); a zero-origin rect is valid.
 */
export function resolveDocumentMapPoint(params: {
  clientX: number;
  clientY: number;
  hostRect: { left: number; top: number };
}): { mapX: number; mapY: number } | null {
  const { clientX, clientY, hostRect } = params;

  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(hostRect.left) ||
    !Number.isFinite(hostRect.top)
  ) {
    return null;
  }

  return { mapX: clientX - hostRect.left, mapY: clientY - hostRect.top };
}

/**
 * #375 Phase 4 — clamp a proposed viewport-lens top Y into the map:
 * `[0, max(0, mapHeight - lensHeight)]`. Tolerant of every degenerate input
 * (never throws): a non-finite `lensY` / `mapHeight` or a `mapHeight <= 0`
 * yields `0`; a non-finite or non-positive `lensHeight` is treated as `0` (so
 * the max is just `mapHeight`); a `lensHeight` at or above `mapHeight` pins the
 * lens to the top (`0`).
 */
export function clampDocumentMapLensY(params: {
  lensY: number;
  lensHeight: number;
  mapHeight: number;
}): number {
  const { lensY, lensHeight, mapHeight } = params;

  if (!Number.isFinite(lensY) || !Number.isFinite(mapHeight) || mapHeight <= 0) {
    return 0;
  }

  const safeLensHeight =
    Number.isFinite(lensHeight) && lensHeight > 0 ? lensHeight : 0;
  const maxLensY = Math.max(0, mapHeight - safeLensHeight);

  return Math.max(0, Math.min(lensY, maxLensY));
}

/**
 * `true` when the map-space point `(mapX, mapY)` lies within `rect` (edges
 * included). `false` for a non-finite point, or an invalid rect — any
 * non-finite field, or a zero / negative width or height.
 */
export function hitTestViewportLens(params: {
  mapX: number;
  mapY: number;
  rect: DocumentMapLensRect;
}): boolean {
  const { mapX, mapY, rect } = params;

  if (
    !Number.isFinite(mapX) ||
    !Number.isFinite(mapY) ||
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return false;
  }

  return (
    mapX >= rect.x &&
    mapX <= rect.x + rect.width &&
    mapY >= rect.y &&
    mapY <= rect.y + rect.height
  );
}

interface DragPointer {
  /** The pointer that owns the drag — every other pointer id is ignored. */
  readonly pointerId: number;
  /** Client (viewport) coordinates at pointerdown. */
  readonly startClientX: number;
  readonly startClientY: number;
  /** Map-space Y at pointerdown. */
  readonly startMapY: number;
  /**
   * `startMapY - lensRect.y` — where inside the lens the grab landed, so the
   * lens does not jump to the pointer on the first move. Phase 2:
   * `nextLensY = pointerMapY - grabOffsetY`.
   */
  readonly grabOffsetY: number;
}

export type DocumentMapLensDragState =
  | { readonly kind: "idle" }
  | ({ readonly kind: "candidate" } & DragPointer)
  | ({ readonly kind: "dragging" } & DragPointer);

export const DOCUMENT_MAP_LENS_DRAG_IDLE: DocumentMapLensDragState = {
  kind: "idle"
};

/**
 * Start a drag `candidate` from a pointerdown that hit the lens. The caller
 * has already run {@link hitTestViewportLens}; `mapY` / `lensRectY` are in the
 * same map-pixel space as the lens rect.
 */
export function beginDocumentMapLensDrag(params: {
  pointerId: number;
  clientX: number;
  clientY: number;
  mapY: number;
  lensRectY: number;
}): DocumentMapLensDragState {
  return {
    kind: "candidate",
    pointerId: params.pointerId,
    startClientX: params.clientX,
    startClientY: params.clientY,
    startMapY: params.mapY,
    grabOffsetY: params.mapY - params.lensRectY
  };
}

/**
 * Advance the drag on a pointermove. Only the pointer that started the drag is
 * honoured — any other `pointerId` (or an `idle` state) returns `state`
 * unchanged. A `candidate` promotes to `dragging` once the pointer has moved
 * at least `threshold` px (Chebyshev) from the start; `dragging` stays
 * `dragging`.
 */
export function advanceDocumentMapLensDrag(
  state: DocumentMapLensDragState,
  move: { pointerId: number; clientX: number; clientY: number },
  threshold: number = DOCUMENT_MAP_LENS_DRAG_THRESHOLD_PX
): DocumentMapLensDragState {
  if (state.kind === "idle" || state.pointerId !== move.pointerId) {
    return state;
  }

  if (state.kind === "dragging") {
    return state;
  }

  const moved =
    Math.abs(move.clientX - state.startClientX) >= threshold ||
    Math.abs(move.clientY - state.startClientY) >= threshold;

  return moved ? { ...state, kind: "dragging" } : state;
}

/**
 * End a drag on pointerup / pointercancel / lostpointercapture. When
 * `pointerId` owns the drag the result is `idle`; an unrelated `pointerId` (or
 * an already-idle `state`) leaves `state` untouched.
 *
 * `suppressClick` is `true` whenever the ending gesture *started on the lens* —
 * both a real `dragging` (must not also fire click-to-scroll) and a
 * sub-threshold `candidate` press (Phase 3: the lens is a grab handle, not a
 * jump target, so a plain click there is inert rather than re-navigating to
 * roughly the current position). A gesture that began OUTSIDE the lens never
 * reaches here with a non-idle `state`, so ordinary click-to-scroll is
 * unaffected.
 */
export function endDocumentMapLensDrag(
  state: DocumentMapLensDragState,
  pointerId: number
): { state: DocumentMapLensDragState; suppressClick: boolean } {
  if (state.kind === "idle" || state.pointerId !== pointerId) {
    return { state, suppressClick: false };
  }

  return { state: DOCUMENT_MAP_LENS_DRAG_IDLE, suppressClick: true };
}

/**
 * #375 Phase 3 duplicate-scroll guard. Given the source line a `dragging` move
 * has just resolved to and the line the drag last scrolled the editor to,
 * `true` iff a fresh scroll should be requested — i.e. the line resolved
 * (`!== null`) AND it differs from the last one. A high-frequency `pointermove`
 * that keeps landing on the same line therefore issues no repeat scroll.
 */
export function shouldRequestDocumentMapLensDragScroll(
  resolvedLineIndex: number | null,
  lastScrolledLineIndex: number | null
): boolean {
  return (
    resolvedLineIndex !== null &&
    resolvedLineIndex !== lastScrolledLineIndex
  );
}

/**
 * #375 Phase 2 — where a `dragging` lens should sit, and the map visual row
 * that lens top maps to, given the pointer's current map-space Y.
 *
 *   nextLensY = pointerMapY - grabOffsetY   — keep the grabbed spot under the
 *                                             pointer, so the lens does not jump
 *   nextLensY clamped into [0, max(0, mapHeight - lensHeight)]
 *   targetVisualRow = floor(clampedLensY / cellSize)
 *
 * `cellSize` MUST be the Document Map plan's own cell size — never a literal.
 * Returns `null` (the caller then no-ops the scroll) for any non-finite input,
 * a non-positive `cellSize`, or a `mapHeight` that is not a positive finite
 * number (layout not ready / empty map). A `lensHeight` at or above `mapHeight`
 * is fine — `maxLensY` floors at 0, so the lens simply pins to the top.
 */
export function resolveDocumentMapLensDragTarget(params: {
  pointerMapY: number;
  grabOffsetY: number;
  lensHeight: number;
  mapHeight: number;
  cellSize: number;
}): { nextLensY: number; targetVisualRow: number } | null {
  const { pointerMapY, grabOffsetY, lensHeight, mapHeight, cellSize } = params;

  if (
    !Number.isFinite(pointerMapY) ||
    !Number.isFinite(grabOffsetY) ||
    !Number.isFinite(lensHeight) ||
    !Number.isFinite(mapHeight) ||
    !Number.isFinite(cellSize) ||
    mapHeight <= 0 ||
    cellSize <= 0
  ) {
    return null;
  }

  const nextLensY = clampDocumentMapLensY({
    lensY: pointerMapY - grabOffsetY,
    lensHeight,
    mapHeight
  });

  return {
    nextLensY,
    targetVisualRow: Math.floor(nextLensY / cellSize)
  };
}
