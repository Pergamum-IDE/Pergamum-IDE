import { describe, expect, it } from "vitest";
import type { GlossaryEntry, GlossaryTag } from "../../src/shared/glossary";
import { countGlossaryEntriesByTag } from "../../src/renderer/glossaryTagEntryCount";

function tag(id: string): GlossaryTag {
  return {
    id,
    label: id,
    description: null,
    backgroundRgb: "#123456",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

function entry(id: string, tags: GlossaryTag[]): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: [
      {
        id: `${id}-atom`,
        entryId: id,
        sortOrder: 0,
        value: id,
        matchFlags: 0,
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z"
      }
    ],
    tags,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

const person = tag("person");
const place = tag("place");
const unused = tag("unused");

describe("countGlossaryEntriesByTag (#375)", () => {
  it("counts how many entries carry each tag", () => {
    const counts = countGlossaryEntriesByTag([
      entry("e1", [person, place]),
      entry("e2", [person]),
      entry("e3", [])
    ]);

    expect(counts).toEqual({ person: 2, place: 1 });
  });

  it("omits tags that no entry references (rendered as 0 by the caller)", () => {
    const counts = countGlossaryEntriesByTag([entry("e1", [person])]);
    expect(counts[unused.id]).toBeUndefined();
  });

  it("returns an empty map for no entries", () => {
    expect(countGlossaryEntriesByTag([])).toEqual({});
  });
});
