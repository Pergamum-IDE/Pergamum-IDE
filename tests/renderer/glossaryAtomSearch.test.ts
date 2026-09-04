import { describe, expect, it } from "vitest";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import {
  buildGlossaryAtomSearchTerms,
  collectSelectableGlossaryAtoms,
  findGlossaryAtomMatches,
  isGlossarySearchMatch,
  type GlossaryAtomSearchTerm
} from "../../src/renderer/glossaryAtomSearch";

const timestamp = "2026-09-04T00:00:00.000Z";

/** strict = the edge must sit on a character-class boundary. */
const STRICT = GlossaryBoundaryPolicy.Auto;
const STRICT_BOTH = setGlossaryAtomBoundaryEndPolicy(
  setGlossaryAtomBoundaryStartPolicy(0, STRICT),
  STRICT
);
const STRICT_START = setGlossaryAtomBoundaryStartPolicy(0, STRICT);
const STRICT_END = setGlossaryAtomBoundaryEndPolicy(0, STRICT);

function atom(
  entryId: string,
  id: string,
  value: string,
  matchFlags = 0
): GlossaryAtom {
  return {
    id,
    entryId,
    sortOrder: 0,
    value,
    matchFlags,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function entry(id: string, atoms: GlossaryAtom[]): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atoms.map((a, index) => ({ ...a, sortOrder: index })),
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function term(
  value: string,
  atomId = `atom-${value}`,
  entryId = `entry-${value}`,
  entryLabel = value,
  matchFlags = 0
): GlossaryAtomSearchTerm {
  return { value, matchFlags, atomId, entryId, entryLabel };
}

describe("collectSelectableGlossaryAtoms (#384)", () => {
  it("flattens every atom with its parent entry's representative label", () => {
    const entries = [
      entry("e1", [atom("e1", "a1", "ジャンヌ"), atom("e1", "a2", "ヴァルジャン")]),
      entry("e2", [atom("e2", "a3", "メイド")])
    ];

    expect(collectSelectableGlossaryAtoms(entries)).toEqual([
      {
        atomId: "a1",
        entryId: "e1",
        value: "ジャンヌ",
        matchFlags: 0,
        entryLabel: "ジャンヌ"
      },
      {
        atomId: "a2",
        entryId: "e1",
        value: "ヴァルジャン",
        matchFlags: 0,
        entryLabel: "ジャンヌ"
      },
      {
        atomId: "a3",
        entryId: "e2",
        value: "メイド",
        matchFlags: 0,
        entryLabel: "メイド"
      }
    ]);
  });

  it("drops atoms whose value is empty or whitespace-only", () => {
    const entries = [
      entry("e1", [
        atom("e1", "a1", "  "),
        atom("e1", "a2", ""),
        atom("e1", "a3", "ジャンヌ")
      ])
    ];

    expect(
      collectSelectableGlossaryAtoms(entries).map((a) => a.atomId)
    ).toEqual(["a3"]);
  });

  it("orders by entry representative label, then atom sortOrder", () => {
    const entries = [
      entry("z", [atom("z", "z1", "Zulu")]),
      entry("a", [atom("a", "a1", "Alpha"), atom("a", "a2", "Alias")])
    ];

    expect(collectSelectableGlossaryAtoms(entries).map((a) => a.value)).toEqual([
      "Alpha",
      "Alias",
      "Zulu"
    ]);
  });
});

describe("buildGlossaryAtomSearchTerms (#384)", () => {
  const atoms = collectSelectableGlossaryAtoms([
    entry("e1", [atom("e1", "a1", "ジャンヌ")]),
    entry("e2", [atom("e2", "a2", "メイド")])
  ]);

  it("resolves selected ids to terms in selection order", () => {
    expect(
      buildGlossaryAtomSearchTerms(atoms, ["a2", "a1"]).map((t) => t.value)
    ).toEqual(["メイド", "ジャンヌ"]);
  });

  it("skips unknown ids and never emits the same id twice", () => {
    expect(
      buildGlossaryAtomSearchTerms(atoms, ["a1", "nope", "a1"]).map(
        (t) => t.atomId
      )
    ).toEqual(["a1"]);
  });

  it("carries each atom's matchFlags through to its term", () => {
    const flagged = collectSelectableGlossaryAtoms([
      entry("e1", [atom("e1", "a1", "ジャン", STRICT_BOTH)])
    ]);
    expect(flagged[0].matchFlags).toBe(STRICT_BOTH);
    expect(
      buildGlossaryAtomSearchTerms(flagged, ["a1"])[0].matchFlags
    ).toBe(STRICT_BOTH);
  });
});

describe("findGlossaryAtomMatches (#384)", () => {
  it("OR-searches every selected atom value and tags each match", () => {
    const text = [
      "ジャンヌは歩いた。",
      "ヴァルジャンは振り返った。",
      "メイドは沈黙した。"
    ].join("\n");

    const matches = findGlossaryAtomMatches(text, [
      term("ジャンヌ", "a1", "e1", "ジャンヌ・ヴァルジャン"),
      term("ヴァルジャン", "a2", "e1", "ジャンヌ・ヴァルジャン"),
      term("メイド", "a3", "e2", "職業")
    ]);

    expect(matches.map((m) => m.glossaryAtomValue)).toEqual([
      "ジャンヌ",
      "ヴァルジャン",
      "メイド"
    ]);
    expect(matches.every(isGlossarySearchMatch)).toBe(true);
    expect(matches[0]).toMatchObject({
      glossaryAtomId: "a1",
      glossaryEntryId: "e1",
      glossaryEntryLabel: "ジャンヌ・ヴァルジャン",
      matchedText: "ジャンヌ"
    });
    // Offsets stay on the original text.
    expect(matches[1].startOffset).toBe(text.indexOf("ヴァルジャン"));
  });

  it("returns nothing for no terms or empty text", () => {
    expect(findGlossaryAtomMatches("ジャンヌ", [])).toEqual([]);
    expect(findGlossaryAtomMatches("", [term("ジャンヌ")])).toEqual([]);
  });

  it("skips empty-value terms", () => {
    expect(
      findGlossaryAtomMatches("ジャンヌ", [term("  "), term("ジャンヌ")])
    ).toHaveLength(1);
  });

  it("keeps only the longer atom when two match at the same start offset", () => {
    const matches = findGlossaryAtomMatches("ジャンヌは歩いた。", [
      term("ジャン", "short", "e-short", "ジャン"),
      term("ジャンヌ", "long", "e-long", "ジャンヌ・ヴァルジャン")
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].glossaryAtomValue).toBe("ジャンヌ");
    expect(matches[0].glossaryAtomId).toBe("long");
  });

  it("keeps atoms that match at different start offsets", () => {
    const matches = findGlossaryAtomMatches("ジャンヌと、ジャンだけ", [
      term("ジャン", "short"),
      term("ジャンヌ", "long")
    ]);

    expect(matches.map((m) => m.glossaryAtomValue)).toEqual([
      "ジャンヌ",
      "ジャン"
    ]);
  });

  it("does not crash when the same value is selected from two entries", () => {
    const matches = findGlossaryAtomMatches("ジャンだけ", [
      term("ジャン", "a-in-A", "entryA", "エントリA"),
      term("ジャン", "a-in-B", "entryB", "エントリB")
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0].glossaryAtomValue).toBe("ジャン");
  });

  it("honours a per-document limit", () => {
    const text = "あい".repeat(10);
    const matches = findGlossaryAtomMatches(text, [term("あい", "a")], {
      limit: 3
    });
    expect(matches).toHaveLength(3);
  });
});

describe("findGlossaryAtomMatches respects Atom match settings (#384)", () => {
  // Each line holds one candidate context for the atom value `ジャン`.
  const TEXT = [
    "ジャン", // 1 bare
    "「ジャン」", // 2 quoted
    "（ジャン）", // 3 bracketed
    "ジャンヌ", // 4 katakana follows
    "ヴァルジャン", // 5 katakana precedes
    "ジャンヌダルク" // 6 katakana follows
  ].join("\n");

  function hitLines(matchFlags: number): number[] {
    return findGlossaryAtomMatches(TEXT, [
      term("ジャン", "a", "e", "ジャン", matchFlags)
    ]).map((match) => match.line);
  }

  it("strict start + strict end: only true word boundaries hit", () => {
    // Not ジャンヌ / ヴァルジャン / ジャンヌダルク.
    expect(hitLines(STRICT_BOTH)).toEqual([1, 2, 3]);
  });

  it("strict start only: rejects a katakana run before the match", () => {
    // ヴァルジャン (line 5) rejected; ジャンヌ / ジャンヌダルク still hit.
    expect(hitLines(STRICT_START)).toEqual([1, 2, 3, 4, 6]);
  });

  it("strict end only: rejects a katakana run after the match", () => {
    // ジャンヌ / ジャンヌダルク (4, 6) rejected; ヴァルジャン (5) still hits.
    expect(hitLines(STRICT_END)).toEqual([1, 2, 3, 5]);
  });

  it("loose start + loose end: plain substring, every line hits", () => {
    expect(hitLines(0)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("strict/strict ジャン does not hit ジャンヌ / ヴァルジャン / ジャンヌダルク", () => {
    const matches = findGlossaryAtomMatches(
      "ジャン ジャンヌ ヴァルジャン ジャンヌダルク",
      [term("ジャン", "a", "e", "ジャン", STRICT_BOTH)]
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].startOffset).toBe(0);
  });
});
