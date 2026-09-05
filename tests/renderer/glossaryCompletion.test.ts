import { describe, expect, it } from "vitest";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  GLOSSARY_COMPLETION_CANDIDATE_LIMIT,
  collectGlossaryCompletionAtoms,
  extractDelimitedGlossaryCompletionPrefix,
  extractGlossaryCompletionPrefix,
  filterGlossaryCompletionCandidates,
  glossaryCompletionCandidateDetail,
  type GlossaryCompletionAtom
} from "../../src/renderer/glossaryCompletion";

function atom(overrides: Partial<GlossaryCompletionAtom> = {}): GlossaryCompletionAtom {
  return {
    atomId: "atom-1",
    entryId: "entry-1",
    value: "オーダー",
    entryLabel: "オーダー",
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
    value: "オーダー",
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

describe("collectGlossaryCompletionAtoms (#390)", () => {
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

    expect(collectGlossaryCompletionAtoms(entries).map((a) => a.atomId)).toEqual([
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

    const result = collectGlossaryCompletionAtoms(entries);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe("有効");
  });

  it("never surfaces Tags, Entry description, or Markdown body text as candidates", () => {
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

    const result = collectGlossaryCompletionAtoms(entries);
    expect(result).toEqual([
      { atomId: "a1", entryId: "e1", value: "表記", entryLabel: "表記" }
    ]);
  });

  it("resolves the entry label from the representative (sortOrder 0) atom", () => {
    const entries = [
      glossaryEntry({
        id: "e1",
        atoms: [
          glossaryAtom({ id: "a1", entryId: "e1", sortOrder: 0, value: "代表" }),
          glossaryAtom({ id: "a2", entryId: "e1", sortOrder: 1, value: "別表記" })
        ]
      })
    ];

    const result = collectGlossaryCompletionAtoms(entries);
    expect(result.every((a) => a.entryLabel === "代表")).toBe(true);
    // The non-representative form's own value is still used for insertion -
    // never rewritten to the representative form (#390 requirement).
    expect(result.map((a) => a.value)).toEqual(["代表", "別表記"]);
  });
});

describe("filterGlossaryCompletionCandidates (#390)", () => {
  it("lists every atom, unfiltered, in sortOrder for an empty prefix", () => {
    const atoms = [
      atom({ atomId: "a", value: "第一" }),
      atom({ atomId: "b", value: "第二" })
    ];

    expect(
      filterGlossaryCompletionCandidates({ atoms, prefix: "" }).map((c) => c.atomId)
    ).toEqual(["a", "b"]);
  });

  it("is prefix startsWith only - no substring / subsequence / fuzzy", () => {
    const atoms = [atom({ value: "総オーダー" })];

    expect(
      filterGlossaryCompletionCandidates({ atoms, prefix: "オーダー" })
    ).toHaveLength(0);
  });

  it("is case-insensitive for Latin forms", () => {
    const atoms = [atom({ value: "Order" })];

    expect(filterGlossaryCompletionCandidates({ atoms, prefix: "ord" })).toHaveLength(1);
    expect(filterGlossaryCompletionCandidates({ atoms, prefix: "ORD" })).toHaveLength(1);
  });

  it("uses the selected registered form itself as the candidate value - never a fixed representative form", () => {
    const atoms = [
      atom({ atomId: "a1", entryId: "e1", value: "代表", entryLabel: "代表" }),
      atom({ atomId: "a2", entryId: "e1", value: "別表記", entryLabel: "代表" })
    ];

    const result = filterGlossaryCompletionCandidates({ atoms, prefix: "" });
    expect(result.map((c) => c.value)).toEqual(["代表", "別表記"]);
    expect(result.every((c) => c.entryLabel === "代表")).toBe(true);
  });

  it("caps the candidate list from the front of the sortOrder sequence", () => {
    const many = Array.from({ length: GLOSSARY_COMPLETION_CANDIDATE_LIMIT + 20 }, (_, i) =>
      atom({ atomId: `a${i}`, value: `オーダー${i}` })
    );

    const result = filterGlossaryCompletionCandidates({ atoms: many, prefix: "" });
    expect(result).toHaveLength(GLOSSARY_COMPLETION_CANDIDATE_LIMIT);
    expect(result[0].atomId).toBe("a0");
  });
});

describe("extractDelimitedGlossaryCompletionPrefix (#390)", () => {
  it.each([
    ["オー", "オー"],
    ["ジャンヌ", "ジャンヌ"],
    ["foo", "foo"],
    ["foo bar", "bar"],
    ["「オー", "オー"],
    ["", ""]
  ])("extracts %j -> %j", (textBeforeCaret, expected) => {
    expect(extractDelimitedGlossaryCompletionPrefix(textBeforeCaret)).toBe(expected);
  });
});

describe("extractGlossaryCompletionPrefix (#390 - candidate-aware suffix strategy)", () => {
  it("finds the longest caret-preceding suffix that is a registered-form prefix, even with no delimiter", () => {
    expect(
      extractGlossaryCompletionPrefix("彼はアレ", ["アレ", "アレコレ"])
    ).toBe("アレ");
  });

  it("falls back to the delimiter-based prefix when no suffix matches any candidate", () => {
    expect(extractGlossaryCompletionPrefix("foo bar", ["baz"])).toBe("bar");
    expect(extractGlossaryCompletionPrefix("オー", [])).toBe("オー");
    expect(extractGlossaryCompletionPrefix("", ["アレ"])).toBe("");
  });

  it("prefers the longest matching suffix over a shorter one", () => {
    expect(
      extractGlossaryCompletionPrefix("学級委員長", ["委員長", "長"])
    ).toBe("委員長");
  });
});

describe("glossaryCompletionCandidateDetail (#390 follow-up)", () => {
  it("returns null when the registered form IS the entry's representative form - no noisy '親語彙:' echo", () => {
    expect(
      glossaryCompletionCandidateDetail({ value: "オーダ", entryLabel: "オーダ" })
    ).toBeNull();
  });

  it("returns '→ ' plus the entry label (no '親語彙:' text) when the form differs from the representative form", () => {
    expect(
      glossaryCompletionCandidateDetail({ value: "迷子", entryLabel: "シズク" })
    ).toBe("→ シズク");
  });

  it("trim-normalizes both sides before comparing", () => {
    expect(
      glossaryCompletionCandidateDetail({ value: " オーダ ", entryLabel: "オーダ" })
    ).toBeNull();
  });
});
