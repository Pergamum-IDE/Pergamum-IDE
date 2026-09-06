import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  buildGlossarySurfaceIndex,
  isAmbiguousGlossarySurfaceTextMatch,
  matchGlossarySurfacesInText,
  matchGlossarySurfacesPerEntry,
  type GlossarySurfaceTextMatch
} from "../../src/shared/glossarySurfaceMatching";

const timestamp = "2026-09-02T00:00:00.000Z";

const CHECK_END = setGlossaryAtomBoundaryEndPolicy(
  0,
  GlossaryBoundaryPolicy.Auto
);
const CHECK_BOTH = setGlossaryAtomBoundaryStartPolicy(
  CHECK_END,
  GlossaryBoundaryPolicy.Auto
);

let atomCounter = 0;

function atom(
  entryId: string,
  value: string,
  matchFlags = 0,
  idOverride?: string
): GlossaryAtom {
  atomCounter += 1;
  const id =
    idOverride ??
    `018f4b8c-7a2b-7c3d-8e4f-2000${String(atomCounter).padStart(8, "0")}`;

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

const entryAId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const entryBId = "018f4b8c-7a2b-7c3d-8e4f-100000000002";

function matchText(
  text: string,
  entries: GlossaryEntry[],
  options?: { minimumSurfaceLength?: number }
): GlossarySurfaceTextMatch[] {
  return matchGlossarySurfacesInText(
    text,
    buildGlossarySurfaceIndex(entries, options)
  );
}

describe("glossary surface matching (#375)", () => {
  it("matches an atom value and reports UTF-16 ranges + atom identity", () => {
    const a = atom(entryAId, "アルベルト");
    const matches = matchText("彼はアルベルトと呼ばれた。", [entry(entryAId, [a])]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      matchedText: "アルベルト",
      range: { start: 2, end: 7 }
    });
    expect(matches[0].candidates).toEqual([
      { entryId: entryAId, atomId: a.id, surface: "アルベルト" }
    ]);
  });

  it("uses leftmost-longest matching and advances the cursor to range.end", () => {
    const short = atom(entryAId, "アル");
    const long = atom(entryAId, "アルベルト");
    const matches = matchText("アルベルトとアルが来た。", [
      entry(entryAId, [long, short])
    ]);

    expect(matches.map((m) => m.matchedText)).toEqual(["アルベルト", "アル"]);
    expect(matches[0].range).toEqual({ start: 0, end: 5 });
    expect(matches[1].range).toEqual({ start: 6, end: 8 });
  });

  it("represents a cross-entry ambiguous match as sorted candidates without dropping any", () => {
    const a = atom(entryBId, "水鏡", 0, "018f4b8c-7a2b-7c3d-8e4f-2000000000a1");
    const b = atom(entryAId, "水鏡", 0, "018f4b8c-7a2b-7c3d-8e4f-2000000000a2");
    const matches = matchText("水鏡先生", [
      entry(entryAId, [b]),
      entry(entryBId, [a])
    ]);

    expect(matches).toHaveLength(1);
    expect(isAmbiguousGlossarySurfaceTextMatch(matches[0])).toBe(true);
    expect(matches[0].candidates.map((c) => c.entryId)).toEqual([
      entryAId,
      entryBId
    ]);
  });

  it("trims atom values and skips a value that is blank after trimming", () => {
    const spaced = atom(entryAId, "  織田  ");
    const blank = atom(entryAId, "   ");
    const matches = matchText("織田は笑った。", [entry(entryAId, [spaced, blank])]);
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedText).toBe("織田");
  });

  it("is case sensitive", () => {
    const a = atom(entryAId, "Pergamum");
    expect(matchText("pergamum is here", [entry(entryAId, [a])])).toHaveLength(0);
    expect(
      matchText("Pergamum is here", [entry(entryAId, [a])])
    ).toHaveLength(1);
  });

  it("does not check a boundary edge unless the corresponding flag is set", () => {
    const noCheck = atom(entryAId, "オーダ", 0);
    expect(
      matchText("オーダーメイド", [entry(entryAId, [noCheck])])
    ).toHaveLength(1);

    const checkEnd = atom(entryAId, "オーダ", CHECK_END);
    expect(
      matchText("オーダーメイド", [entry(entryAId, [checkEnd])])
    ).toHaveLength(0);
    expect(
      matchText("オーダは沈黙した", [entry(entryAId, [checkEnd])])
    ).toHaveLength(1);
  });

  it("runs the boundary check before leftmost-longest selection", () => {
    // The longer atom "Pergamum I" is boundary-rejected at its end ("I" then
    // "D", both ASCII word), so the shorter boundary-accepted "Pergamum"
    // wins at cursor 0 even though it is not the longest raw match.
    const long = atom(entryAId, "Pergamum I", CHECK_BOTH);
    const short = atom(entryBId, "Pergamum", CHECK_BOTH);
    const matches = matchText("Pergamum IDE", [
      entry(entryAId, [long]),
      entry(entryBId, [short])
    ]);
    expect(matches.map((m) => m.matchedText)).toEqual(["Pergamum"]);
  });

  it("applies minimumSurfaceLength at index construction time", () => {
    const two = atom(entryAId, "織田");
    expect(
      matchText("織田家", [entry(entryAId, [two])], { minimumSurfaceLength: 3 })
    ).toHaveLength(0);
    expect(
      matchText("織田家", [entry(entryAId, [two])], { minimumSurfaceLength: 2 })
    ).toHaveLength(1);
  });

  it("returns an empty array for empty text, empty entries, and no matches", () => {
    const a = atom(entryAId, "織田");
    expect(matchText("", [entry(entryAId, [a])])).toEqual([]);
    expect(matchText("なにもない", [])).toEqual([]);
    expect(matchText("徳川家康の話", [entry(entryAId, [a])])).toEqual([]);
  });

  it("keeps correct UTF-16 ranges across newlines and surrogate pairs", () => {
    const emoji = atom(entryAId, "𩸽定食");
    const matches = matchText("今日は\n𩸽定食を食べた", [entry(entryAId, [emoji])]);
    expect(matches).toHaveLength(1);
    // "𩸽" is a surrogate pair (2 UTF-16 units); "𩸽定食" spans 4 units.
    expect(matches[0].range).toEqual({ start: 4, end: 8 });
    expect(matches[0].matchedText).toBe("𩸽定食");
  });

  describe("single-character atom matching (#365 carry-over)", () => {
    const kanaText = "その蝕は美しかった。";
    const compoundText = "腐蝕が進む。";

    function eclipse(flags: number): GlossaryEntry {
      return entry(entryAId, [atom(entryAId, "蝕", flags)]);
    }

    it("skips a one-character atom by default", () => {
      expect(matchText(kanaText, [eclipse(0)])).toHaveLength(0);
    });

    it("indexes and matches a one-character atom when the opt-in flag is set", () => {
      const matches = matchText(kanaText, [
        eclipse(GlossaryAtomFlags.AllowSingleCharacterMatch)
      ]);
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedText).toBe("蝕");
    });

    it("leaves 2+ character atoms unaffected by the opt-in flag", () => {
      const a = atom(entryAId, "織田");
      expect(matchText("織田家", [entry(entryAId, [a])])).toHaveLength(1);
    });

    it("rejects an opted-in single kanji inside a kanji compound", () => {
      expect(
        matchText(compoundText, [
          eclipse(GlossaryAtomFlags.AllowSingleCharacterMatch)
        ])
      ).toHaveLength(0);
    });

    it("does not reject an opted-in single kanji next to the same kanji, an iteration mark, or punctuation", () => {
      const opted = eclipse(GlossaryAtomFlags.AllowSingleCharacterMatch);
      // "蝕蝕" — both are accepted (same-kanji neighbour never blocks).
      expect(matchText("蝕蝕の刻", [opted])).toHaveLength(2);
      expect(matchText("蝕々の刻", [opted])).toHaveLength(1);
      expect(matchText("（蝕）の刻", [opted])).toHaveLength(1);
    });
  });

  describe("start-indexed longest match resolver (O(N+H))", () => {
    it("resolves the longest matching atom at the same start offset", () => {
      const entryLong = entry("e-nobu", [
        atom("e-nobu", "織田信長", 0, "e-nobu-atom-1"),
        atom("e-nobu", "織田", 0, "e-nobu-atom-2")
      ]);
      const matches = matchText("織田信長公記", [entryLong]);
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedText).toBe("織田信長");
      expect(matches[0].range).toEqual({ start: 0, end: 4 });
      expect(matches[0].candidates).toHaveLength(1);
      expect(matches[0].candidates[0].atomId).toBe("e-nobu-atom-1");
    });

    it("groups multiple candidate entries for the exact same surface span without duplication", () => {
      const entry1 = entry("e-1", [atom("e-1", "魔法")]);
      const entry2 = entry("e-2", [atom("e-2", "魔法")]);
      const matches = matchText("古代魔法の書", [entry1, entry2]);
      expect(matches).toHaveLength(1);
      expect(matches[0].matchedText).toBe("魔法");
      expect(matches[0].range).toEqual({ start: 2, end: 4 });
      expect(matches[0].candidates).toHaveLength(2);
      expect(matches[0].candidates.map((c) => c.entryId).sort()).toEqual([
        "e-1",
        "e-2"
      ]);
    });

    it("resolves successive non-overlapping matches greedily across document offsets", () => {
      const entry1 = entry("e-1", [atom("e-1", "アオイ")]);
      const entry2 = entry("e-2", [atom("e-2", "レン")]);
      const matches = matchText("アオイとレンが歩いた。アオイが呼んだ。", [
        entry1,
        entry2
      ]);
      expect(matches).toHaveLength(3);
      expect(matches[0]).toMatchObject({
        matchedText: "アオイ",
        range: { start: 0, end: 3 }
      });
      expect(matches[1]).toMatchObject({
        matchedText: "レン",
        range: { start: 4, end: 6 }
      });
      expect(matches[2]).toMatchObject({
        matchedText: "アオイ",
        range: { start: 11, end: 14 }
      });
    });

    it("verifies source code uses start-offset indexing and eliminates O(N*H) linear scan of all range values", () => {
      const source = readFileSync(
        "src/shared/glossarySurfaceMatching.ts",
        "utf8"
      );
      // Confirms matches are indexed by start offset
      expect(source).toContain("matchesByStart");
      expect(source).toContain("matchesByStart.get(cursor)");
      // Confirms the old O(N*H) pattern is removed
      expect(source).not.toContain("matchesByRange.values()");
    });
  });

  describe("matchGlossarySurfacesPerEntry (#403 MEDIUM-1)", () => {
    it("returns an empty map for empty text or empty index", () => {
      const emptyIndex = buildGlossarySurfaceIndex([]);
      expect(matchGlossarySurfacesPerEntry("", emptyIndex).size).toBe(0);
      expect(matchGlossarySurfacesPerEntry("織田信長", emptyIndex).size).toBe(0);

      const entry1 = entry(entryAId, [atom(entryAId, "織田信長")]);
      const validIndex = buildGlossarySurfaceIndex([entry1]);
      expect(matchGlossarySurfacesPerEntry("", validIndex).size).toBe(0);
    });

    it("matches per-entry occurrences without cross-entry shadowing", () => {
      const entryShort = entry(entryAId, [atom(entryAId, "信長")]);
      const entryLong = entry(entryBId, [atom(entryBId, "織田信長")]);
      const index = buildGlossarySurfaceIndex([entryShort, entryLong]);

      const text = "信長と織田信長が並んだ。";
      const result = matchGlossarySurfacesPerEntry(text, index);

      // 信長 matches at [0, 2] and [5, 7]
      const shortOccurrences = result.get(entryAId) ?? [];
      expect(shortOccurrences).toEqual([
        { start: 0, end: 2 },
        { start: 5, end: 7 }
      ]);

      // 織田信長 matches at [3, 7]
      const longOccurrences = result.get(entryBId) ?? [];
      expect(longOccurrences).toEqual([{ start: 3, end: 7 }]);
    });

    it("applies greedy longest-match forward progression within the same entry", () => {
      // Entry with multiple atoms where one is a prefix of another
      const entryMulti = entry(entryAId, [
        atom(entryAId, "東京"),
        atom(entryAId, "東京都")
      ]);
      const index = buildGlossarySurfaceIndex([entryMulti]);

      const text = "東京都と東京";
      const result = matchGlossarySurfacesPerEntry(text, index);

      // At index 0, "東京都" is chosen over "東京" because it is longer
      // At index 4, "東京" matches
      const occurrences = result.get(entryAId) ?? [];
      expect(occurrences).toEqual([
        { start: 0, end: 3 },
        { start: 4, end: 6 }
      ]);
    });

    it("deduplicates multiple atoms of the same entry matching the identical span", () => {
      const entryDup = entry(entryAId, [
        atom(entryAId, "白猫", 0, "atom-1"),
        atom(entryAId, "白猫", 0, "atom-2")
      ]);
      const index = buildGlossarySurfaceIndex([entryDup]);

      const text = "白猫がいる。";
      const result = matchGlossarySurfacesPerEntry(text, index);

      const occurrences = result.get(entryAId) ?? [];
      expect(occurrences).toEqual([{ start: 0, end: 2 }]);
    });

    it("respects single-character kanji opt-in and compound guards per entry", () => {
      const optedInSingle = entry(entryAId, [
        atom(entryAId, "蝕", GlossaryAtomFlags.AllowSingleCharacterMatch)
      ]);
      const index = buildGlossarySurfaceIndex([optedInSingle]);

      // "蝕の時が来た。腐蝕した銅板。"
      // The isolated "蝕" matches; "腐蝕" is rejected by kanji compound guard
      const text = "蝕の時が来た。腐蝕した銅板。";
      const result = matchGlossarySurfacesPerEntry(text, index);

      const occurrences = result.get(entryAId) ?? [];
      expect(occurrences).toEqual([{ start: 0, end: 1 }]);
    });
  });
});
