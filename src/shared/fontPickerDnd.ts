import type { FontFamilySetting } from "./fontSettings";
import { GENERIC_FONT_FAMILIES } from "./fontSettings";

/**
 * Pure selected-font-list mutations shared by both the button-based
 * (#492/#493 Add/Remove/Up/Down) and drag-and-drop (#494) font picker
 * operations, so the two input paths can never silently diverge in their
 * duplicate / generic-fallback guards. Every function returns a new array;
 * none mutate the `list` argument.
 */

/**
 * Moves the entry at `fromIndex` so it ends up at `toIndex` (interpreted as
 * the insertion index *after* the entry has been removed — the standard
 * remove-then-insert reorder algorithm). Out-of-range indices, or a target
 * equal to the source, are a no-op.
 */
export function moveSelectedFont(
  list: readonly FontFamilySetting[],
  fromIndex: number,
  toIndex: number
): FontFamilySetting[] {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= list.length ||
    toIndex < 0 ||
    toIndex > list.length
  ) {
    return [...list];
  }
  const clampedTo = Math.min(toIndex, list.length - 1);
  if (fromIndex === clampedTo) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, item);
  return next;
}

/**
 * Adopts `candidate` into the selected list at `index` (defaults to the end
 * — an empty-space drop, or the plain Add button). Generic fallback
 * families and family-duplicates (case-insensitive) are rejected as a
 * no-op; an out-of-range index is clamped rather than rejected, since a
 * drop past either edge of the list is meant to land at that edge.
 */
export function insertSelectedFont(
  list: readonly FontFamilySetting[],
  candidate: FontFamilySetting,
  index: number = list.length
): FontFamilySetting[] {
  const key = candidate.family.toLowerCase();
  if (GENERIC_FONT_FAMILIES.has(key)) {
    return [...list];
  }
  if (list.some((f) => f.family.toLowerCase() === key)) {
    return [...list];
  }
  const clampedIndex = Math.max(0, Math.min(index, list.length));
  const next = [...list];
  next.splice(clampedIndex, 0, {
    family: candidate.family,
    displayName: candidate.displayName
  });
  return next;
}

/** Removes the entry at `index`. An out-of-range index is a no-op. */
export function removeSelectedFontAt(
  list: readonly FontFamilySetting[],
  index: number
): FontFamilySetting[] {
  if (!Number.isInteger(index) || index < 0 || index >= list.length) {
    return [...list];
  }
  const next = [...list];
  next.splice(index, 1);
  return next;
}
