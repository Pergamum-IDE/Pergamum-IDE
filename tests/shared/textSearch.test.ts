import { describe, expect, it } from "vitest";
import {
  findTextSearchMatches,
  type FindTextSearchMatchesOptions
} from "../../src/shared/textSearch";

const PLAIN: FindTextSearchMatchesOptions = {
  caseSensitive: false,
  wholeWord: false
};
const WHOLE_WORD: FindTextSearchMatchesOptions = {
  caseSensitive: false,
  wholeWord: true
};

function starts(text: string, query: string, options = PLAIN): number[] {
  return findTextSearchMatches(text, query, options).map((m) => m.startOffset);
}

describe("findTextSearchMatches (#384 Phase 2)", () => {
  it("returns nothing for an empty query or empty text", () => {
    expect(findTextSearchMatches("hello", "", PLAIN)).toEqual([]);
    expect(findTextSearchMatches("", "hello", PLAIN)).toEqual([]);
  });

  it("finds every plain occurrence, left to right, non-overlapping", () => {
    expect(starts("abcabcabc", "abc")).toEqual([0, 3, 6]);
    expect(starts("a a a a", "a")).toEqual([0, 2, 4, 6]);
  });

  it("is case-insensitive by default and case-sensitive on request", () => {
    expect(starts("Maid maid MAID", "maid")).toEqual([0, 5, 10]);
    expect(
      starts("Maid maid MAID", "maid", { caseSensitive: true, wholeWord: false })
    ).toEqual([5]);
  });

  it("computes 1-based line / column across a multiline document", () => {
    const text = "one\ntwo three\nfour";
    const [m] = findTextSearchMatches(text, "three", PLAIN);
    expect(m.line).toBe(2);
    expect(m.column).toBe(5);
    expect(m.startOffset).toBe(text.indexOf("three"));
    expect(m.matchedText).toBe("three");
  });

  it("builds a preview slice with the match offsets relative to it", () => {
    const [m] = findTextSearchMatches("The quick brown fox", "brown", PLAIN);
    expect(m.previewText).toContain("brown");
    expect(
      m.previewText.slice(m.previewMatchStart, m.previewMatchEnd)
    ).toBe("brown");
  });

  it("ellipsises a very long line around the match", () => {
    const long = `${"x".repeat(400)} needle ${"y".repeat(400)}`;
    const [m] = findTextSearchMatches(long, "needle", PLAIN);
    expect(m.previewText.startsWith("…")).toBe(true);
    expect(m.previewText.endsWith("…")).toBe(true);
    expect(
      m.previewText.slice(m.previewMatchStart, m.previewMatchEnd)
    ).toBe("needle");
  });

  it("honours a per-document match limit", () => {
    expect(
      findTextSearchMatches("a".repeat(50), "a", {
        ...PLAIN,
        limit: 10
      })
    ).toHaveLength(10);
  });

  describe("ASCII whole-word", () => {
    it("matches a standalone word and word touching punctuation", () => {
      expect(starts('a maid, the "maid" and maid.', "maid", WHOLE_WORD)).toEqual(
        [2, 13, 23]
      );
    });

    it("rejects a word that is part of a larger word", () => {
      expect(starts("maidservant handmaid mermaid", "maid", WHOLE_WORD)).toEqual(
        []
      );
    });
  });

  describe("Japanese-aware whole-word (preceding boundary only)", () => {
    // Katakana "maid" = U+30E1 U+30A4 U+30C9.
    const MAID = "メイド";

    it("matches the bare word and words that only EXTEND it forward", () => {
      // "maid", "maid-fuku", "maid-san", "maid-kissa", "<maid>" (bracketed).
      const hits = [
        MAID,
        `${MAID}服`,
        `${MAID}さん`,
        `${MAID}喃茶`,
        `「${MAID}」`
      ];
      for (const text of hits) {
        expect(
          findTextSearchMatches(text, MAID, WHOLE_WORD).length
        ).toBeGreaterThan(0);
      }
    });

    it("rejects a match preceded by a word-continuation character", () => {
      // "order-maid" (preceded by prolonged sound mark U+30FC),
      // "hand-maid" (preceded by katakana), "custom-maid" (preceded by katakana).
      const misses = [
        `オーダー${MAID}`,
        `ハンド${MAID}`,
        `カスタム${MAID}`
      ];
      for (const text of misses) {
        expect(findTextSearchMatches(text, MAID, WHOLE_WORD)).toEqual([]);
      }
    });

    it("treats the katakana middle dot (U+30FB) as a separator", () => {
      expect(
        findTextSearchMatches(`あ・${MAID}`, MAID, WHOLE_WORD).length
      ).toBe(1);
    });

    it("plain (non-whole-word) search still finds the substring anywhere", () => {
      expect(
        findTextSearchMatches(`ハンド${MAID}`, MAID, PLAIN).length
      ).toBe(1);
    });
  });
});
