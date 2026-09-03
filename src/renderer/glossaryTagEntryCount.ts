import type { GlossaryEntry } from "../shared/glossary";

/**
 * #375: how many glossary ENTRIES each tag is attached to (via
 * `glossary_entry_tags`), keyed by tag id. This is NOT an occurrence / body
 * hit count and NOT an atom count — just `entry.tags` membership. Tags that no
 * entry references are absent from the map; the Tag Manager renders those as
 * `0`.
 */
export function countGlossaryEntriesByTag(
  entries: readonly GlossaryEntry[]
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    for (const tag of entry.tags) {
      counts[tag.id] = (counts[tag.id] ?? 0) + 1;
    }
  }

  return counts;
}
