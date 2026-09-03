/**
 * #375: pure reordering for the Glossary Management table's drag handle. Moves
 * the id at `fromIndex` to `toIndex` and returns a NEW array; the result is
 * sent to `window.pergamum.glossary.reorderEntries(entryIdsInOrder)`, which
 * re-packs `glossary_entries.sort_order` to `0..n-1`. Out-of-range or no-op
 * moves return an unchanged copy (the caller skips the round-trip when the
 * order did not change).
 *
 * Mirrors {@link ./glossaryTagReorder} — the same drag-handle contract as the
 * Tag Manager.
 */
export function reorderGlossaryEntryIds(
  entryIds: readonly string[],
  fromIndex: number,
  toIndex: number
): string[] {
  const next = [...entryIds];

  if (
    !Number.isInteger(fromIndex) ||
    fromIndex < 0 ||
    fromIndex >= next.length
  ) {
    return next;
  }

  const target = Math.max(0, Math.min(Math.trunc(toIndex), next.length - 1));

  if (target === fromIndex) {
    return next;
  }

  const [moved] = next.splice(fromIndex, 1);
  next.splice(target, 0, moved);

  return next;
}

/** True when `next` differs from `current` in at least one position. */
export function glossaryEntryOrderChanged(
  current: readonly string[],
  next: readonly string[]
): boolean {
  return (
    current.length !== next.length ||
    next.some((id, index) => id !== current[index])
  );
}
