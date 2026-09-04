import { describe, expect, it } from "vitest";
import type {
  GlossaryAtom,
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import type { DocumentMapDialogueDelimiterPair } from "../../src/shared/documentMapSettings";
import {
  analyzeDocumentNavigationDialogueRatio,
  analyzeDocumentNavigationDocument,
  collectDocumentNavigationGlossaryCounts,
  collectDocumentNavigationTagCounts
} from "../../src/renderer/documentNavigationAnalysis";

let seq = 0;

function atom(value: string, sortOrder: number, matchFlags = 0): GlossaryAtom {
  seq += 1;
  return {
    id: `atom-${seq}`,
    entryId: "unset",
    sortOrder,
    value,
    matchFlags,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

function tag(id: string, label: string, sortOrder = 0): GlossaryTag {
  return {
    id,
    label,
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder,
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

function entry(
  id: string,
  atomValues: readonly string[],
  tags: readonly GlossaryTag[] = []
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atomValues.map((value, index) => ({
      ...atom(value, index),
      entryId: id
    })),
    tags: [...tags],
    createdAt: "2026-09-02T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z"
  };
}

const defaultPairs: DocumentMapDialogueDelimiterPair[] = [
  { open: "「", close: "」", color: "#909090" }
];

/** The expected tag-count row for a tag built by the `tag()` fixture. */
function tagRow(tagId: string, label: string, count: number) {
  return {
    tagId,
    label,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    count
  };
}

describe("collectDocumentNavigationGlossaryCounts (#360 Phase 2)", () => {
  it("returns no rows when there are no hits", () => {
    const entries = [entry("e1", ["山田太郎", "山田", "太郎"])];
    expect(
      collectDocumentNavigationGlossaryCounts("誰もいない部屋。", entries)
    ).toEqual([]);
  });

  it("returns no rows for empty text or no entries", () => {
    expect(collectDocumentNavigationGlossaryCounts("", [])).toEqual([]);
    expect(
      collectDocumentNavigationGlossaryCounts("山田", [])
    ).toEqual([]);
  });

  it("counts a single atom hit against its Entry", () => {
    const entries = [entry("e1", ["山田太郎"])];
    const rows = collectDocumentNavigationGlossaryCounts(
      "山田太郎が来た。",
      entries
    );
    expect(rows).toEqual([{ entryId: "e1", label: "山田太郎", count: 1 }]);
  });

  it("sums hits on different Atoms of the SAME Entry into one row", () => {
    // "山田太郎" longest-matches once; "山田" and "太郎" match once each
    // elsewhere — all three Atoms belong to e1, so the Entry row is 3.
    const entries = [entry("e1", ["山田太郎", "山田", "太郎"])];
    const rows = collectDocumentNavigationGlossaryCounts(
      "山田太郎。山田さん。太郎くん。",
      entries
    );
    expect(rows).toEqual([{ entryId: "e1", label: "山田太郎", count: 3 }]);
  });

  it("uses the representative (sortOrder 0) atom as the label", () => {
    const entries = [entry("e1", ["山田太郎", "山田"])];
    const rows = collectDocumentNavigationGlossaryCounts("山田さん。", entries);
    expect(rows[0]?.label).toBe("山田太郎");
    expect(rows[0]?.count).toBe(1);
  });

  it("drops Entries with a zero count and sorts the rest by count desc", () => {
    const entries = [
      entry("e1", ["リンゴ"]),
      entry("e2", ["ミカン"]),
      entry("e3", ["ブドウ"])
    ];
    const rows = collectDocumentNavigationGlossaryCounts(
      "リンゴ、リンゴ、リンゴ。ミカン。",
      entries
    );
    expect(rows).toEqual([
      { entryId: "e1", label: "リンゴ", count: 3 },
      { entryId: "e2", label: "ミカン", count: 1 }
    ]);
    // e3 never appears.
    expect(rows.some((row) => row.entryId === "e3")).toBe(false);
  });
});

describe("collectDocumentNavigationTagCounts (#360 Phase 2)", () => {
  it("credits only the Entry's FIRST assigned tag", () => {
    const people = tag("t-people", "人物", 0);
    const place = tag("t-place", "地名", 1);
    // e1's assignment order is [people, place]; a hit adds to 人物 only.
    const entries = [entry("e1", ["山田太郎"], [people, place])];
    const rows = collectDocumentNavigationTagCounts(
      "山田太郎。山田太郎。",
      entries
    );
    expect(rows).toEqual([tagRow("t-people", "人物", 2)]);
  });

  it("excludes tagless Entries from tag counts", () => {
    const people = tag("t-people", "人物");
    const entries = [
      entry("e1", ["山田太郎"], [people]),
      entry("e2", ["謎の男"]) // no tags
    ];
    const rows = collectDocumentNavigationTagCounts(
      "山田太郎と謎の男。",
      entries
    );
    expect(rows).toEqual([tagRow("t-people", "人物", 1)]);
  });

  it("aggregates several Entries under a shared first tag and sorts by count desc", () => {
    const people = tag("t-people", "人物", 0);
    const item = tag("t-item", "道具", 1);
    const entries = [
      entry("e1", ["山田"], [people]),
      entry("e2", ["花子"], [people]),
      entry("e3", ["魔剣"], [item])
    ];
    const rows = collectDocumentNavigationTagCounts(
      "山田、山田、花子。魔剣。",
      entries
    );
    expect(rows).toEqual([
      tagRow("t-people", "人物", 3),
      tagRow("t-item", "道具", 1)
    ]);
  });

  it("returns no rows when nothing tagged is hit", () => {
    const people = tag("t-people", "人物");
    const entries = [entry("e1", ["山田太郎"], [people])];
    expect(
      collectDocumentNavigationTagCounts("空っぽの文章。", entries)
    ).toEqual([]);
  });
});

describe("analyzeDocumentNavigationDialogueRatio (#360 Phase 2)", () => {
  it("returns an all-zero split for empty text", () => {
    expect(analyzeDocumentNavigationDialogueRatio("", defaultPairs)).toEqual({
      narrationCharacters: 0,
      dialogueCharacters: 0,
      totalCharacters: 0,
      narrationPercent: 0,
      dialoguePercent: 0
    });
  });

  it("counts delimiter-pair spans (brackets included) as dialogue, the rest as narration", () => {
    // 「あ」 = 3 dialogue chars; "。" = 1 narration char.
    const result = analyzeDocumentNavigationDialogueRatio("「あ」。", defaultPairs);
    expect(result.dialogueCharacters).toBe(3);
    expect(result.narrationCharacters).toBe(1);
    expect(result.totalCharacters).toBe(4);
    expect(result.dialoguePercent + result.narrationPercent).toBe(100);
  });

  it("keeps total = narration + dialogue and percents summing to 100", () => {
    const text = "地の文がしばらく続いて「短い会話」また地の文。";
    const result = analyzeDocumentNavigationDialogueRatio(text, defaultPairs);
    expect(result.narrationCharacters + result.dialogueCharacters).toBe(
      result.totalCharacters
    );
    expect(result.narrationPercent + result.dialoguePercent).toBe(100);
    expect(result.dialogueCharacters).toBeGreaterThan(0);
    expect(result.narrationCharacters).toBeGreaterThan(0);
  });

  it("treats an unclosed opening delimiter as running to end-of-text", () => {
    const text = "始まり「閉じ忘れた会話";
    const result = analyzeDocumentNavigationDialogueRatio(text, defaultPairs);
    // "始まり" (3) narration; "「閉じ忘れた会話" (8) dialogue.
    expect(result.narrationCharacters).toBe(3);
    expect(result.dialogueCharacters).toBe(8);
    expect(result.totalCharacters).toBe(11);
  });

  it("handles multiple delimiter pairs without double-counting overlaps", () => {
    const pairs: DocumentMapDialogueDelimiterPair[] = [
      { open: "「", close: "」", color: "#909090" },
      { open: "『", close: "』", color: "#707070" }
    ];
    const text = "地『二重』の文「会話」おわり";
    const result = analyzeDocumentNavigationDialogueRatio(text, pairs);
    expect(result.narrationCharacters + result.dialogueCharacters).toBe(
      result.totalCharacters
    );
    expect(result.totalCharacters).toBe([...text].length);
    // 『二重』 = 4, 「会話」 = 4.
    expect(result.dialogueCharacters).toBe(8);
  });

  it("does not throw when there are no delimiter pairs configured", () => {
    const result = analyzeDocumentNavigationDialogueRatio("「あ」。", []);
    expect(result.dialogueCharacters).toBe(0);
    expect(result.narrationCharacters).toBe(result.totalCharacters);
  });
});

describe("analyzeDocumentNavigationDocument (#360 Phase 2)", () => {
  it("computes glossary counts, tag counts and the dialogue split in one call", () => {
    const people = tag("t-people", "人物");
    const entries = [entry("e1", ["山田太郎", "山田"], [people])];
    const text = "山田太郎は言った。「やあ、山田です」";

    const analysis = analyzeDocumentNavigationDocument(
      text,
      entries,
      defaultPairs
    );

    expect(analysis.glossaryCounts).toEqual([
      { entryId: "e1", label: "山田太郎", count: 2 }
    ]);
    expect(analysis.tagCounts).toEqual([tagRow("t-people", "人物", 2)]);
    expect(
      analysis.dialogueRatio.narrationCharacters +
        analysis.dialogueRatio.dialogueCharacters
    ).toBe(analysis.dialogueRatio.totalCharacters);
    expect(analysis.dialogueRatio.dialogueCharacters).toBeGreaterThan(0);
  });

  it("returns empty sections (never throws) for an empty document", () => {
    const analysis = analyzeDocumentNavigationDocument("", [], defaultPairs);
    expect(analysis.glossaryCounts).toEqual([]);
    expect(analysis.tagCounts).toEqual([]);
    expect(analysis.dialogueRatio.totalCharacters).toBe(0);
  });
});
