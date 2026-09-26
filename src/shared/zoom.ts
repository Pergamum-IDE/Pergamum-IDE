/**
 * Shared constants and candidate-list helpers for application-wide zoom (#589).
 */

export const ZOOM_CANDIDATES = [
  0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0
] as const;

export type ZoomFactorCandidate = (typeof ZOOM_CANDIDATES)[number];

export const MIN_ZOOM_FACTOR = 0.5;
export const MAX_ZOOM_FACTOR = 2.0;
export const DEFAULT_ZOOM_FACTOR = 1.0;
export const ZOOM_EPSILON = 0.001;

/**
 * Clamp a raw zoom factor to the valid [0.5, 2.0] range.
 */
export function clampZoomFactor(factor: number): number {
  if (!Number.isFinite(factor)) {
    return DEFAULT_ZOOM_FACTOR;
  }
  return Math.max(MIN_ZOOM_FACTOR, Math.min(MAX_ZOOM_FACTOR, factor));
}

/**
 * Clamp and snap a zoom factor to the nearest candidate in the fixed candidate list.
 */
export function normalizeZoomFactor(factor: number): number {
  const clamped = clampZoomFactor(factor);
  let nearest: number = ZOOM_CANDIDATES[0];
  let minDiff = Math.abs(clamped - nearest);

  for (let i = 1; i < ZOOM_CANDIDATES.length; i++) {
    const candidate = ZOOM_CANDIDATES[i];
    const diff = Math.abs(clamped - candidate);
    if (diff < minDiff) {
      minDiff = diff;
      nearest = candidate;
    }
  }

  return nearest;
}

/**
 * Calculate the next zoom factor when zooming in.
 */
export function getNextZoomInFactor(currentFactor: number): number {
  const current = normalizeZoomFactor(currentFactor);
  for (const candidate of ZOOM_CANDIDATES) {
    if (candidate > current + ZOOM_EPSILON) {
      return candidate;
    }
  }
  return MAX_ZOOM_FACTOR;
}

/**
 * Calculate the next zoom factor when zooming out.
 */
export function getNextZoomOutFactor(currentFactor: number): number {
  const current = normalizeZoomFactor(currentFactor);
  for (let i = ZOOM_CANDIDATES.length - 1; i >= 0; i--) {
    const candidate = ZOOM_CANDIDATES[i];
    if (candidate < current - ZOOM_EPSILON) {
      return candidate;
    }
  }
  return MIN_ZOOM_FACTOR;
}

/**
 * Format a zoom factor into a user-friendly percentage string (e.g. 1.25 -> "125%").
 */
export function formatZoomFactorPercent(factor: number): string {
  const normalized = normalizeZoomFactor(factor);
  return `${Math.round(normalized * 100)}%`;
}

/**
 * Safely parse and restore a zoom factor from an untrusted persisted value.
 * Invalid, non-finite, missing, or corrupt inputs default to 1.0.
 * Valid numbers are clamped to [0.5, 2.0] and normalized to the nearest candidate.
 */
export function restoreZoomFactor(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_ZOOM_FACTOR;
  }
  return normalizeZoomFactor(value);
}
