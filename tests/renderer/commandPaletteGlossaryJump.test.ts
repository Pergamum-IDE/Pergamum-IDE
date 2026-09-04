import { describe, expect, it } from "vitest";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  DEFAULT_MAX_GLOSSARY_JUMP_CANDIDATES,
  collectGlossaryJumpAtoms,
  filterCommandPaletteGlossaryJumpCandidates,
  resolveGlossaryJumpSelection,
  type CommandPaletteGlossaryJumpAtom
} from "../../src/renderer/commandPaletteGlossaryJump";

function atom(
  overrides: Partial<CommandPaletteGlossaryJumpAtom> = {}
): CommandPaletteGlossaryJumpAtom {
  return {
    atomId: "atom-1",
    entryId: "entry-1",
    value: "オーダー",
    entryLabel: "オーダー",
    ...overrides
  };
}

let entrySeq = 0;

function glossaryAtom(overrides: Partial<GlossaryAtom> = {}): GlossaryAtom {
  entrySeq += 1;
  return {
    id: `atom-${entrySeq}`,
    entryId: "entry-1",
    sortOrder: 0,
    value: "オーダー",
    matchFlags: 0,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

function glossaryEntry(overrides: Partial<GlossaryEntry> = {}): GlossaryEntry {
  entrySeq += 1;
  const id = overrides.id ?? `entry-${entrySeq}`;
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

describe("collectGlossaryJumpAtoms (#142.1)", () => {
  it("flattens atoms in the given entry array order, then each entry's own atom sortOrder", () => {
    const entries = [
      glossaryEntry({
        id: "e2",
        atoms: [
          glossaryAtom({ id: "e2a1", entryId: "e2", sortOrder: 0, value: "二番目A" }),
          glossaryAtom({ id: "e2a2", entryId: "e2", sortOrder: 1, value: "二番目B" })
        ]
      }),
      glossaryEntry({
        id: "e1",
        atoms: [glossaryAtom({ id: "e1a1", entryId: "e1", sortOrder: 0, value: "一番目" })]
      })
    ];

    // Entry array order is preserved (e2 before e1, matching the project's
    // own Entry sortOrder as given by the caller) - never re-sorted by label.
    expect(collectGlossaryJumpAtoms(entries).map((a) => a.atomId)).toEqual([
      "e2a1",
      "e2a2",
      "e1a1"
    ]);
  });

  it("drops empty / whitespace-only atom values", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        atoms: [
          glossaryAtom({ id: "a1", entryId: "e1", sortOrder: 0, value: "" }),
          glossaryAtom({ id: "a2", entryId: "e1", sortOrder: 1, value: "   " }),
          glossaryAtom({ id: "a3", entryId: "e1", sortOrder: 2, value: "有効" })
        ]
      })
    ];

    const result = collectGlossaryJumpAtoms(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("有効");
  });

  it("does not search Tags, Entry description or Markdown body text", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        description: "説明本文はここ",
        atoms: [glossaryAtom({ id: "a1", entryId: "e1", value: "表記" })],
        tags: [
          {
            id: "tag-1",
            label: "タグ",
            description: "タグ説明",
            backgroundRgb: "#000000",
            foregroundRgb: "#ffffff",
            sortOrder: 0,
            createdAt: "",
            updatedAt: ""
          }
        ]
      })
    ];

    const result = collectGlossaryJumpAtoms(entries);
    expect(result).toEqual([
      { atomId: "a1", entryId: "e1", value: "表記", entryLabel: "表記" }
    ]);
  });

  it("resolves the entry label from the representative (sortOrder 0) atom, or the entry id when atoms are empty-only", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        atoms: [
          glossaryAtom({ id: "a1", entryId: "e1", sortOrder: 0, value: "代表" }),
          glossaryAtom({ id: "a2", entryId: "e1", sortOrder: 1, value: "別表記" })
        ]
      })
    ];

    const result = collectGlossaryJumpAtoms(entries);
    expect(result.every((a) => a.entryLabel === "代表")).toBe(true);
  });
});

describe("filterCommandPaletteGlossaryJumpCandidates (#142 / #142.1)", () => {
  it("prefix-matches the atom value and marks the matched range for a non-empty query", () => {
    const [candidate] = filterCommandPaletteGlossaryJumpCandidates({
      atoms: [atom({ value: "オーダーメイド" })],
      query: "オーダ"
    });

    expect(candidate.value).toBe("オーダーメイド");
    expect(candidate.matchRanges).toEqual([{ start: 0, end: 3 }]);
  });

  it("is prefix-only - no substring / subsequence / fuzzy", () => {
    const atoms = [atom({ value: "総オーダー" })];

    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms, query: "オーダー" })
    ).toHaveLength(0);
  });

  it("is case-insensitive for Latin forms", () => {
    const atoms = [atom({ value: "Order" })];

    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms, query: "ord" })
    ).toHaveLength(1);
    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms, query: "ORD" })
    ).toHaveLength(1);
  });

  it("#142.1: lists every atom, unfiltered and with no highlighted range, for an empty (or whitespace-only) query", () => {
    const atoms = [
      atom({ atomId: "a", value: "第一" }),
      atom({ atomId: "b", value: "第二" })
    ];

    const empty = filterCommandPaletteGlossaryJumpCandidates({ atoms, query: "" });
    expect(empty.map((c) => c.atomId)).toEqual(["a", "b"]);
    expect(empty.every((c) => c.matchRanges.length === 0)).toBe(true);

    const whitespace = filterCommandPaletteGlossaryJumpCandidates({
      atoms,
      query: "   "
    });
    expect(whitespace.map((c) => c.atomId)).toEqual(["a", "b"]);
  });

  it("#142.1: preserves the given (project Entry-then-Atom sortOrder) sequence for both empty and non-empty queries", () => {
    const atoms = [
      atom({ atomId: "a1", entryId: "e1", value: "オーダーA", entryLabel: "オーダー系" }),
      atom({ atomId: "a2", entryId: "e2", value: "オーダーB", entryLabel: "別語彙" })
    ];

    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms, query: "" }).map(
        (c) => c.atomId
      )
    ).toEqual(["a1", "a2"]);
    expect(
      filterCommandPaletteGlossaryJumpCandidates({
        atoms,
        query: "オーダー"
      }).map((c) => c.atomId)
    ).toEqual(["a1", "a2"]);
  });

  it("caps the rendered list for both empty and non-empty queries", () => {
    const many = Array.from({ length: 120 }, (_unused, index) =>
      atom({ atomId: `a${index}`, value: `オーダー${index}` })
    );

    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms: many, query: "" })
    ).toHaveLength(DEFAULT_MAX_GLOSSARY_JUMP_CANDIDATES);
    expect(
      filterCommandPaletteGlossaryJumpCandidates({ atoms: many, query: "オーダー" })
    ).toHaveLength(DEFAULT_MAX_GLOSSARY_JUMP_CANDIDATES);
    expect(
      filterCommandPaletteGlossaryJumpCandidates({
        atoms: many,
        query: "オーダー",
        limit: 3
      })
    ).toHaveLength(3);
  });

  it("carries the parent entry's label through to row 2", () => {
    const atoms = [
      atom({ atomId: "a1", entryId: "e1", value: "オーダーA", entryLabel: "オーダー系" }),
      atom({ atomId: "a2", entryId: "e2", value: "オーダーB", entryLabel: "別語彙" })
    ];

    const result = filterCommandPaletteGlossaryJumpCandidates({
      atoms,
      query: "オーダー"
    });

    expect(result.map((candidate) => candidate.entryLabel)).toEqual([
      "オーダー系",
      "別語彙"
    ]);
  });

  it("emits a separate candidate for each matching atom of the same entry", () => {
    const atoms = [
      atom({ atomId: "a1", entryId: "e1", value: "オーダー" }),
      atom({ atomId: "a2", entryId: "e1", value: "オーダー表記" })
    ];

    const result = filterCommandPaletteGlossaryJumpCandidates({
      atoms,
      query: "オーダー"
    });

    expect(result).toHaveLength(2);
    expect(result.map((candidate) => candidate.atomId)).toEqual(["a1", "a2"]);
    expect(result.every((candidate) => candidate.entryId === "e1")).toBe(true);
  });
});

describe("resolveGlossaryJumpSelection (#142.1)", () => {
  it("selects row 0 for a fresh (or non-selectable-previously) list, keeps a valid index, clamps a stale one", () => {
    expect(resolveGlossaryJumpSelection(2)).toBe(0);
    expect(resolveGlossaryJumpSelection(2, 1)).toBe(1);
    expect(resolveGlossaryJumpSelection(2, 9)).toBe(0);
    expect(resolveGlossaryJumpSelection(2, -1)).toBe(0);
  });

  it("returns null only when there are zero rows at all (non-empty query with no matches - the manager row always keeps rowCount >= 1)", () => {
    expect(resolveGlossaryJumpSelection(0)).toBeNull();
    expect(resolveGlossaryJumpSelection(0, 0)).toBeNull();
  });
});
