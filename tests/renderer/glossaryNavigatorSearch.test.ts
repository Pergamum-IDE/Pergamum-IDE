import { describe, expect, it } from "vitest";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import {
  GLOSSARY_TAG_FILTER_ALL,
  GLOSSARY_TAG_FILTER_NONE,
  filterGlossaryEntriesByTag,
  filterGlossaryEntriesForNavigator,
  glossaryTagFilterForTagId,
  matchesGlossaryNavigatorSearch
} from "../../src/renderer/glossaryNavigatorSearch";

const ts = "2026-09-02T00:00:00.000Z";

function tag(id: string, label: string): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#123456",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: ts,
    updatedAt: ts
  };
}

function glossaryEntry(
  id: string,
  description: string,
  values: string[],
  tags: GlossaryTag[] = []
): GlossaryEntry {
  return {
    id,
    description,
    atoms: values.map((value, index) => ({
      id: `${id}-atom-${index}`,
      entryId: id,
      sortOrder: index,
      value,
      matchFlags: 0,
      createdAt: ts,
      updatedAt: ts
    })),
    tags,
    createdAt: ts,
    updatedAt: ts
  };
}

function entryIds(entries: readonly GlossaryEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

const tagWarrior = tag("018f4b8c-7a2b-7c3d-8e4f-300000000001", "武将");
const albertEntry = glossaryEntry(
  "entry-albert",
  "辺境領主",
  ["アルベルト", "アル", "Albert"],
  [tagWarrior]
);
const maidEntry = glossaryEntry("entry-maid", "王城に仕える人", [
  "メイド",
  "侍女",
  "Maid"
]);
const glossaryEntries = [maidEntry, albertEntry];

describe("Glossary Navigator search filter (#375)", () => {
  it("returns all entries for an empty or trim-empty query", () => {
    expect(filterGlossaryEntriesForNavigator(glossaryEntries, "")).toBe(
      glossaryEntries
    );
    expect(filterGlossaryEntriesForNavigator(glossaryEntries, "   ")).toBe(
      glossaryEntries
    );
  });

  it("matches every atom value by substring, trimming the query", () => {
    expect(
      entryIds(filterGlossaryEntriesForNavigator(glossaryEntries, "  イド  "))
    ).toEqual(["entry-maid"]);
    expect(
      entryIds(filterGlossaryEntriesForNavigator(glossaryEntries, "ベルト"))
    ).toEqual(["entry-albert"]);
    expect(
      entryIds(filterGlossaryEntriesForNavigator(glossaryEntries, "侍"))
    ).toEqual(["entry-maid"]);
    expect(
      entryIds(filterGlossaryEntriesForNavigator(glossaryEntries, "bert"))
    ).toEqual(["entry-albert"]);
  });

  it("does not search description", () => {
    expect(
      entryIds(filterGlossaryEntriesForNavigator(glossaryEntries, "王城"))
    ).toEqual([]);
  });

  it("matches ASCII case-insensitively within the ASCII range only", () => {
    const entry = glossaryEntry("entry-ascii", "", ["HandMAIDen"]);
    expect(matchesGlossaryNavigatorSearch(entry, "maid")).toBe(true);
    expect(matchesGlossaryNavigatorSearch(entry, "MAID")).toBe(true);
    expect(matchesGlossaryNavigatorSearch(entry, "mAiDeN")).toBe(true);
  });

  it("does not case-fold or normalize non-ASCII notation", () => {
    const entries = [
      glossaryEntry("entry-sharp-s", "", ["Straße"]),
      glossaryEntry("entry-fullwidth", "", ["ＭＡＩＤ"]),
      glossaryEntry("entry-kana", "", ["メイド"])
    ];

    expect(
      entryIds(filterGlossaryEntriesForNavigator(entries, "strasse"))
    ).toEqual([]);
    expect(entryIds(filterGlossaryEntriesForNavigator(entries, "maid"))).toEqual(
      []
    );
    expect(entryIds(filterGlossaryEntriesForNavigator(entries, "めいど"))).toEqual(
      []
    );
  });

  it("preserves entry order without relevance ranking", () => {
    const entries = [
      glossaryEntry("entry-gamma", "", ["Gamma Maid"]),
      glossaryEntry("entry-alpha", "", ["Alpha Maid"])
    ];
    expect(
      entryIds(filterGlossaryEntriesForNavigator(entries, "maid"))
    ).toEqual(["entry-gamma", "entry-alpha"]);
  });
});

describe("filterGlossaryEntriesByTag (#375)", () => {
  it("returns everything for the `all` filter", () => {
    expect(
      filterGlossaryEntriesByTag(glossaryEntries, GLOSSARY_TAG_FILTER_ALL)
    ).toBe(glossaryEntries);
  });

  it("keeps only tagless entries for the `none` filter", () => {
    expect(
      entryIds(
        filterGlossaryEntriesByTag(glossaryEntries, GLOSSARY_TAG_FILTER_NONE)
      )
    ).toEqual(["entry-maid"]);
  });

  it("keeps only entries carrying the selected tag", () => {
    expect(
      entryIds(
        filterGlossaryEntriesByTag(
          glossaryEntries,
          glossaryTagFilterForTagId(tagWarrior.id)
        )
      )
    ).toEqual(["entry-albert"]);
    expect(
      filterGlossaryEntriesByTag(
        glossaryEntries,
        glossaryTagFilterForTagId("no-such-tag")
      )
    ).toEqual([]);
  });
});
