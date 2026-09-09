import { describe, expect, it } from "vitest";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  collectFindGlossaryCandidates,
  filterFindGlossaryCandidates,
  type FindGlossaryCandidate
} from "../../src/renderer/find/findGlossaryPicker";

function findCandidate(
  overrides: Partial<FindGlossaryCandidate> = {}
): FindGlossaryCandidate {
  return {
    atomId: "a1",
    entryId: "e1",
    value: "シズク",
    matchFlags: 0,
    entryLabel: "シズク",
    isRepresentative: true,
    ...overrides
  };
}

let seq = 0;

function glossaryAtom(overrides: Partial<GlossaryAtom> = {}): GlossaryAtom {
  seq += 1;
  return {
    id: `atom-${seq}`,
    entryId: "entry-1",
    sortOrder: 0,
    value: "シズク",
    matchFlags: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function glossaryEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  seq += 1;
  const id = overrides.id ?? `entry-${seq}`;
  return {
    id,
    description: "",
    atoms: [glossaryAtom({ entryId: id })],
    tags: [],
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("collectFindGlossaryCandidates (#424 Slice 4)", () => {
  it("flattens every non-empty atom in project (entry, then atom sortOrder) order", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        atoms: [
          glossaryAtom({ id: "e1a1", entryId: "e1", sortOrder: 0, value: "シズク" }),
          glossaryAtom({ id: "e1a2", entryId: "e1", sortOrder: 1, value: "迷子" }),
          glossaryAtom({ id: "e1a3", entryId: "e1", sortOrder: 2, value: "  " })
        ]
      }),
      glossaryEntry({
        id: "e2",
        atoms: [glossaryAtom({ id: "e2a1", entryId: "e2", sortOrder: 0, value: "港町" })]
      })
    ];

    expect(collectFindGlossaryCandidates(entries).map((c) => c.value)).toEqual([
      "シズク",
      "迷子",
      "港町"
    ]);
  });

  it("tags the representative atom and keeps the raw value + representative label + matchFlags", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        atoms: [
          glossaryAtom({
            id: "e1a1",
            entryId: "e1",
            sortOrder: 0,
            value: "シズク",
            matchFlags: 5
          }),
          glossaryAtom({
            id: "e1a2",
            entryId: "e1",
            sortOrder: 1,
            value: "迷子",
            matchFlags: 3
          })
        ]
      })
    ];

    const [representative, alias] = collectFindGlossaryCandidates(entries);
    expect(representative).toMatchObject({
      value: "シズク",
      entryLabel: "シズク",
      isRepresentative: true,
      matchFlags: 5
    });
    expect(alias).toMatchObject({
      value: "迷子",
      entryLabel: "シズク",
      isRepresentative: false,
      matchFlags: 3
    });
  });

  it("returns nothing for an empty glossary", () => {
    expect(collectFindGlossaryCandidates([])).toEqual([]);
  });
});

describe("filterFindGlossaryCandidates (#424 Slice 4)", () => {
  const candidates: FindGlossaryCandidate[] = [
    findCandidate({ atomId: "a1", value: "シズク", entryLabel: "シズク" }),
    findCandidate({
      atomId: "a2",
      value: "迷子",
      entryLabel: "シズク",
      isRepresentative: false
    }),
    findCandidate({ atomId: "a3", value: "Harbor", entryLabel: "港町" })
  ];

  it("returns every candidate for an empty / whitespace filter", () => {
    expect(filterFindGlossaryCandidates(candidates, "")).toHaveLength(3);
    expect(filterFindGlossaryCandidates(candidates, "   ")).toHaveLength(3);
  });

  it("matches on the atom value", () => {
    expect(
      filterFindGlossaryCandidates(candidates, "迷").map((c) => c.atomId)
    ).toEqual(["a2"]);
  });

  it("matches on the representative label too (so aliases surface by parent)", () => {
    expect(
      filterFindGlossaryCandidates(candidates, "シズク").map((c) => c.atomId)
    ).toEqual(["a1", "a2"]);
  });

  it("is case-insensitive for Latin text", () => {
    expect(
      filterFindGlossaryCandidates(candidates, "harbor").map((c) => c.atomId)
    ).toEqual(["a3"]);
  });
});
