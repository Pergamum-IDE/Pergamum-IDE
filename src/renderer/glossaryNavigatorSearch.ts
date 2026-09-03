import type { GlossaryEntry } from "../shared/glossary";

function asciiLowercaseForNavigatorSearch(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    result +=
      code >= 0x41 && code <= 0x5a
        ? String.fromCharCode(code + 0x20)
        : value[index];
  }

  return result;
}

/** #375: every atom value of the entry is searchable. */
function glossaryNavigatorSearchValues(
  entry: GlossaryEntry
): readonly string[] {
  return entry.atoms.map((atom) => atom.value);
}

export function matchesGlossaryNavigatorSearch(
  entry: GlossaryEntry,
  query: string
): boolean {
  const normalizedQuery = asciiLowercaseForNavigatorSearch(query.trim());

  if (normalizedQuery.length === 0) {
    return true;
  }

  return glossaryNavigatorSearchValues(entry).some((value) =>
    asciiLowercaseForNavigatorSearch(value).includes(normalizedQuery)
  );
}

export function filterGlossaryEntriesForNavigator(
  entries: readonly GlossaryEntry[],
  query: string
): readonly GlossaryEntry[] {
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    return entries;
  }

  return entries.filter((entry) =>
    matchesGlossaryNavigatorSearch(entry, trimmedQuery)
  );
}

/**
 * #375: the sidebar tag filter. `none` is a UI-only pseudo-tag (entries that
 * carry no tag at all); it is never a real `GlossaryTag`.
 */
export type GlossaryTagFilter =
  | { readonly kind: "all" }
  | { readonly kind: "none" }
  | { readonly kind: "tag"; readonly tagId: string };

export const GLOSSARY_TAG_FILTER_ALL: GlossaryTagFilter = { kind: "all" };
export const GLOSSARY_TAG_FILTER_NONE: GlossaryTagFilter = { kind: "none" };

export function glossaryTagFilterForTagId(tagId: string): GlossaryTagFilter {
  return { kind: "tag", tagId };
}

export function filterGlossaryEntriesByTag(
  entries: readonly GlossaryEntry[],
  filter: GlossaryTagFilter
): readonly GlossaryEntry[] {
  switch (filter.kind) {
    case "all":
      return entries;
    case "none":
      return entries.filter((entry) => entry.tags.length === 0);
    case "tag":
      return entries.filter((entry) =>
        entry.tags.some((tag) => tag.id === filter.tagId)
      );
  }
}
