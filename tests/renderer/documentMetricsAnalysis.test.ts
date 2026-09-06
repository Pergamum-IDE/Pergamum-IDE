import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  GlossaryAtom,
  GlossaryEntry,
  GlossaryTag
} from "../../src/shared/glossary";
import type { DocumentMapDialogueDelimiterPair } from "../../src/shared/documentMapSettings";
import {
  analyzeDocumentMetricsDialogueRatio,
  analyzeDocumentMetricsDocument,
  collectDocumentMetricsGlossaryCounts,
  collectDocumentMetricsTagCounts
} from "../../src/renderer/documentMetricsAnalysis";
import {
  collectDocumentMapDialogueRanges,
  documentMapWinningDialogueRangeAtOffset
} from "../../src/renderer/glossaryDocumentMap";

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

describe("collectDocumentMetricsGlossaryCounts (#360 Phase 2)", () => {
  it("returns no rows when there are no hits", () => {
    const entries = [entry("e1", ["山田太郎", "山田", "太郎"])];
    expect(
      collectDocumentMetricsGlossaryCounts("誰もいない部屋。", entries)
    ).toEqual([]);
  });

  it("returns no rows for empty text or no entries", () => {
    expect(collectDocumentMetricsGlossaryCounts("", [])).toEqual([]);
    expect(
      collectDocumentMetricsGlossaryCounts("山田", [])
    ).toEqual([]);
  });

  it("counts a single atom hit against its Entry", () => {
    const entries = [entry("e1", ["山田太郎"])];
    const rows = collectDocumentMetricsGlossaryCounts(
      "山田太郎が来た。",
      entries
    );
    expect(rows).toEqual([{ entryId: "e1", label: "山田太郎", count: 1 }]);
  });

  it("sums hits on different Atoms of the SAME Entry into one row", () => {
    // "山田太郎" longest-matches once; "山田" and "太郎" match once each
    // elsewhere — all three Atoms belong to e1, so the Entry row is 3.
    const entries = [entry("e1", ["山田太郎", "山田", "太郎"])];
    const rows = collectDocumentMetricsGlossaryCounts(
      "山田太郎。山田さん。太郎くん。",
      entries
    );
    expect(rows).toEqual([{ entryId: "e1", label: "山田太郎", count: 3 }]);
  });

  it("uses the representative (sortOrder 0) atom as the label", () => {
    const entries = [entry("e1", ["山田太郎", "山田"])];
    const rows = collectDocumentMetricsGlossaryCounts("山田さん。", entries);
    expect(rows[0]?.label).toBe("山田太郎");
    expect(rows[0]?.count).toBe(1);
  });

  it("drops Entries with a zero count and sorts the rest by count desc", () => {
    const entries = [
      entry("e1", ["リンゴ"]),
      entry("e2", ["ミカン"]),
      entry("e3", ["ブドウ"])
    ];
    const rows = collectDocumentMetricsGlossaryCounts(
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

describe("collectDocumentMetricsTagCounts (#360 Phase 2)", () => {
  it("credits only the Entry's FIRST assigned tag", () => {
    const people = tag("t-people", "人物", 0);
    const place = tag("t-place", "地名", 1);
    // e1's assignment order is [people, place]; a hit adds to 人物 only.
    const entries = [entry("e1", ["山田太郎"], [people, place])];
    const rows = collectDocumentMetricsTagCounts(
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
    const rows = collectDocumentMetricsTagCounts(
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
    const rows = collectDocumentMetricsTagCounts(
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
      collectDocumentMetricsTagCounts("空っぽの文章。", entries)
    ).toEqual([]);
  });
});

describe("analyzeDocumentMetricsDialogueRatio (#360 Phase 2)", () => {
  it("returns an all-zero split for empty text with configured pairs", () => {
    expect(analyzeDocumentMetricsDialogueRatio("", defaultPairs)).toEqual({
      narrationCharacters: 0,
      pairs: [
        {
          pairIndex: 0,
          open: "「",
          close: "」",
          color: "#909090",
          characters: 0,
          percent: 0
        }
      ],
      totalCharacters: 0,
      narrationPercent: 0,
      dialogueCharacters: 0,
      dialoguePercent: 0
    });
  });

  it("counts delimiter-pair spans (brackets included) as dialogue, the rest as narration", () => {
    // 「あ」 = 3 dialogue chars; "。" = 1 narration char.
    const result = analyzeDocumentMetricsDialogueRatio("「あ」。", defaultPairs);
    expect(result.dialogueCharacters).toBe(3);
    expect(result.narrationCharacters).toBe(1);
    expect(result.totalCharacters).toBe(4);
    expect(result.dialoguePercent + result.narrationPercent).toBe(100);
    expect(result.pairs).toEqual([
      {
        pairIndex: 0,
        open: "「",
        close: "」",
        color: "#909090",
        characters: 3,
        percent: 75
      }
    ]);
  });

  it("keeps total = narration + dialogue and percents summing to 100", () => {
    const text = "地の文がしばらく続いて「短い会話」また地の文。";
    const result = analyzeDocumentMetricsDialogueRatio(text, defaultPairs);
    expect(result.narrationCharacters + result.dialogueCharacters).toBe(
      result.totalCharacters
    );
    expect(result.narrationPercent + result.dialoguePercent).toBe(100);
    expect(result.dialogueCharacters).toBeGreaterThan(0);
    expect(result.narrationCharacters).toBeGreaterThan(0);
  });

  it("treats an unclosed opening delimiter as running to end-of-text", () => {
    const text = "始まり「閉じ忘れた会話";
    const result = analyzeDocumentMetricsDialogueRatio(text, defaultPairs);
    // "始まり" (3) narration; "「閉じ忘れた会話" (8) dialogue.
    expect(result.narrationCharacters).toBe(3);
    expect(result.dialogueCharacters).toBe(8);
    expect(result.totalCharacters).toBe(11);
    expect(result.pairs[0].characters).toBe(8);
  });

  it("handles multiple delimiter pairs and attributes counts per pair", () => {
    const pairs: DocumentMapDialogueDelimiterPair[] = [
      { open: "「", close: "」", color: "#61afef" },
      { open: "『", close: "』", color: "#c678dd" }
    ];
    const text = "地『二重』の文「会話」おわり";
    const result = analyzeDocumentMetricsDialogueRatio(text, pairs);
    expect(result.narrationCharacters + result.dialogueCharacters).toBe(
      result.totalCharacters
    );
    expect(result.totalCharacters).toBe([...text].length);
    // 『二重』 = 4 (pairIndex 1), 「会話」 = 4 (pairIndex 0).
    expect(result.pairs[0]).toEqual({
      pairIndex: 0,
      open: "「",
      close: "」",
      color: "#61afef",
      characters: 4,
      percent: Math.round((4 / text.length) * 100)
    });
    expect(result.pairs[1]).toEqual({
      pairIndex: 1,
      open: "『",
      close: "』",
      color: "#c678dd",
      characters: 4,
      percent: Math.round((4 / text.length) * 100)
    });
    expect(result.narrationCharacters + result.pairs[0].characters + result.pairs[1].characters).toBe(
      result.totalCharacters
    );
  });

  it("retains zero-count pairs in breakdown when configured but unused in text", () => {
    const pairs: DocumentMapDialogueDelimiterPair[] = [
      { open: "「", close: "」", color: "#61afef" },
      { open: "『", close: "』", color: "#c678dd" }
    ];
    const text = "「使用された会話」のみ。";
    const result = analyzeDocumentMetricsDialogueRatio(text, pairs);
    expect(result.pairs[0].characters).toBe(9);
    expect(result.pairs[1].characters).toBe(0);
    expect(result.pairs[1].percent).toBe(0);
    expect(result.pairs[1].color).toBe("#c678dd");
  });

  it("resolves overlapping dialogue pairs with later pairIndex winning without double-counting", () => {
    // Overlap: pair 0 is 「...」, pair 1 is 『...』.
    // If text has 「外『中」後』
    // Range 0: 0..4 (「外『中」)
    // Range 1: 2..7 (『中」後』)
    // At offsets 0..1: pair 0 (「外)
    // At offsets 2..3: overlap! pair 1 has higher pairIndex (1 >= 0), so pair 1 wins ('『中')
    // At offsets 4..6: pair 1 ('」後』')
    const pairs: DocumentMapDialogueDelimiterPair[] = [
      { open: "「", close: "」", color: "#61afef" },
      { open: "『", close: "』", color: "#c678dd" }
    ];
    const text = "「外『中」後』";
    const result = analyzeDocumentMetricsDialogueRatio(text, pairs);
    expect(result.narrationCharacters).toBe(0);
    expect(result.pairs[0].characters).toBe(2); // "「外"
    expect(result.pairs[1].characters).toBe(5); // "『中」後』"
    expect(result.pairs[0].characters + result.pairs[1].characters).toBe(result.totalCharacters);
    expect(result.totalCharacters).toBe(7);
  });

  it("returns narration 100% and empty pairs when dialogueDelimiterPairs is []", () => {
    const result = analyzeDocumentMetricsDialogueRatio("「あ」。", []);
    expect(result.dialogueCharacters).toBe(0);
    expect(result.narrationCharacters).toBe(result.totalCharacters);
    expect(result.narrationPercent).toBe(100);
    expect(result.dialoguePercent).toBe(0);
    expect(result.pairs).toEqual([]);
  });
});

describe("analyzeDocumentMetricsDocument (#360 Phase 2)", () => {
  it("computes glossary counts, tag counts and the dialogue split in one call", () => {
    const people = tag("t-people", "人物");
    const entries = [entry("e1", ["山田太郎", "山田"], [people])];
    const text = "山田太郎は言った。「やあ、山田です」";

    const analysis = analyzeDocumentMetricsDocument(
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
    const analysis = analyzeDocumentMetricsDocument("", [], defaultPairs);
    expect(analysis.glossaryCounts).toEqual([]);
    expect(analysis.tagCounts).toEqual([]);
    expect(analysis.dialogueRatio.totalCharacters).toBe(0);
  });
});

describe("analyzeDocumentMetricsDialogueRatio sweep correctness vs point-query oracle", () => {
  const multiPairs: DocumentMapDialogueDelimiterPair[] = [
    { open: "「", close: "」", color: "#61afef" },
    { open: "『", close: "』", color: "#c678dd" },
    { open: "“", close: "”", color: "#98c379" }
  ];

  function verifySweepMatchesOracle(
    text: string,
    pairs: readonly DocumentMapDialogueDelimiterPair[]
  ): void {
    const ranges = collectDocumentMapDialogueRanges(text, pairs);
    const expectedPairCounts = pairs.map(() => 0);
    let expectedNarration = 0;

    for (let offset = 0; offset < text.length; ) {
      const codePoint = text.codePointAt(offset) ?? 0;
      const winner = documentMapWinningDialogueRangeAtOffset(offset, ranges);
      if (winner === null) {
        expectedNarration += 1;
      } else {
        expectedPairCounts[winner.pairIndex] += 1;
      }
      offset += codePoint > 0xffff ? 2 : 1;
    }

    const result = analyzeDocumentMetricsDialogueRatio(text, pairs);
    expect(result.narrationCharacters).toBe(expectedNarration);
    for (let i = 0; i < pairs.length; i++) {
      expect(result.pairs[i].characters).toBe(expectedPairCounts[i]);
    }
    const expectedDialogue = expectedPairCounts.reduce((s, c) => s + c, 0);
    expect(result.dialogueCharacters).toBe(expectedDialogue);
    expect(result.totalCharacters).toBe(expectedNarration + expectedDialogue);
  }

  it("matches point-query oracle for text without dialogue", () => {
    verifySweepMatchesOracle("これは純粋な地の文です。会話文は一切ありません。", multiPairs);
  });

  it("matches point-query oracle for simple sequential dialogue spans", () => {
    verifySweepMatchesOracle(
      "地の文「一つ目の会話文」地の文『二つ目の会話文』地の文“三つ目の会話文”終わり。",
      multiPairs
    );
  });

  it("matches point-query oracle for nested dialogue spans (higher pairIndex wins)", () => {
    verifySweepMatchesOracle(
      "外側「会話の中で『二重カッコ』を使う例」です。",
      multiPairs
    );
  });

  it("matches point-query oracle for reversed nesting (lower pairIndex inside higher)", () => {
    verifySweepMatchesOracle(
      "外側『会話の中で「一重カッコ」を使う例』です。",
      multiPairs
    );
  });

  it("matches point-query oracle for overlapping dialogue delimiters", () => {
    const overlapPairs: DocumentMapDialogueDelimiterPair[] = [
      { open: "<<", close: ">>", color: "#61afef" },
      { open: "<|", close: "|>", color: "#c678dd" }
    ];
    verifySweepMatchesOracle(
      "Start << span 1 <| span 2 >> end 1 |> end 2 after",
      overlapPairs
    );
  });

  it("matches point-query oracle for unclosed open delimiter to EOF", () => {
    verifySweepMatchesOracle("ここは地の文「ここから末尾まで閉じない会話文", multiPairs);
  });

  it("matches point-query oracle for multiple unclosed open delimiters", () => {
    verifySweepMatchesOracle(
      "地の文「未閉じ1『未閉じ2“未閉じ3末尾",
      multiPairs
    );
  });

  it("matches point-query oracle for multi-byte surrogate pair characters", () => {
    verifySweepMatchesOracle(
      "「𠮷野家でお昼」を食べて『🍺ビール』を飲む“🎉祝杯”！",
      multiPairs
    );
  });

  it("matches point-query oracle for synthetic stress fixture with many overlapping ranges", () => {
    // Generate a long text with repeated overlapping and nested ranges
    const segments: string[] = [];
    for (let i = 0; i < 200; i++) {
      segments.push(`地の文${i}番目「会話1-${i}『会話2-${i}」一部重複』“単独3-${i}”`);
    }
    const syntheticText = segments.join("\n");
    verifySweepMatchesOracle(syntheticText, multiPairs);
  });

  it("preserves counting invariant across all edge cases", () => {
    const testCases = [
      "",
      "   ",
      "「」",
      "『』",
      "「あ」",
      "「『」』",
      "地の文のみ",
      "「会話のみ」",
      "「未閉じ"
    ];
    for (const text of testCases) {
      const result = analyzeDocumentMetricsDialogueRatio(text, multiPairs);
      const sumPairChars = result.pairs.reduce((s, p) => s + p.characters, 0);
      expect(result.narrationCharacters + sumPairChars).toBe(result.totalCharacters);
      expect(result.dialogueCharacters).toBe(sumPairChars);
    }
  });
});

/**
 * Architecture guard: Ensures analyzeDocumentMetricsDialogueRatio does not
 * regress to per-character point queries via documentMapWinningDialogueRangeAtOffset.
 *
 * Background:
 *   During #396 development, an O(N × R) regression was introduced where
 *   every document character offset was checked against all dialogue ranges
 *   using the point-query helper. This guard makes such a regression
 *   immediately visible without relying on wall-clock benchmarks.
 *
 * Scope:
 *   - Checks only the production function body in documentMetricsAnalysis.ts.
 *   - The oracle (test) usage of documentMapWinningDialogueRangeAtOffset in this
 *     test file and its presence in glossaryDocumentMap.ts are NOT banned.
 *   - Only the Metrics hot-loop production path is protected.
 */
describe("analyzeDocumentMetricsDialogueRatio O(N×R) regression guard (architecture)", () => {
  it("does not call documentMapWinningDialogueRangeAtOffset in the production implementation", () => {
    const source = readFileSync("src/renderer/documentMetricsAnalysis.ts", "utf8");

    // Extract the function body starting from the export function declaration.
    // We match from the function header to the closing brace of the function body.
    const fnStart = source.indexOf("export function analyzeDocumentMetricsDialogueRatio(");
    expect(fnStart).toBeGreaterThan(-1);

    // We consider the entire file from that point onward as the relevant scope.
    // Since the file has no other exported functions after this one that would
    // call the point-query, checking the entire tail is sufficient and simpler.
    const functionTail = source.slice(fnStart);

    expect(functionTail).not.toContain("documentMapWinningDialogueRangeAtOffset");
  });
});
