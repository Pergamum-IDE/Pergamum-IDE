import { describe, expect, it } from "vitest";
import {
  compileSearchRegex,
  findTextSearchMatches,
  type FindTextSearchMatchesOptions
} from "../../src/shared/textSearch";

const PLAIN: FindTextSearchMatchesOptions = {
  caseSensitive: false,
  wholeWord: false
};
const PLAIN_NFC: FindTextSearchMatchesOptions = {
  ...PLAIN,
  normalizeUnicodeToNfc: true
};
const WHOLE_WORD: FindTextSearchMatchesOptions = {
  caseSensitive: false,
  wholeWord: true
};
const WHOLE_WORD_NFC: FindTextSearchMatchesOptions = {
  ...WHOLE_WORD,
  normalizeUnicodeToNfc: true
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

  it("does not NFC-normalize plain matching and reports raw UTF-16 offsets (#453 Slice 0)", () => {
    const nfdCafe = "cafe\u0301";
    const text = `xx ${nfdCafe} yy`;

    expect(findTextSearchMatches(text, "café", PLAIN)).toEqual([]);

    const [match] = findTextSearchMatches(text, nfdCafe, PLAIN);
    expect(match.startOffset).toBe(3);
    expect(match.endOffset).toBe(8);
    expect(match.matchedText).toBe(nfdCafe);
    expect(
      match.previewText.slice(match.previewMatchStart, match.previewMatchEnd)
    ).toBe(nfdCafe);
  });

  it("NFC-normalizes plain matching while returning raw UTF-16 offsets (#453 Slice 2)", () => {
    const nfdCafe = "cafe\u0301";
    const text = `xx ${nfdCafe} yy`;

    const [match] = findTextSearchMatches(text, "café", PLAIN_NFC);
    expect(match.startOffset).toBe(3);
    expect(match.endOffset).toBe(8);
    expect(match.matchedText).toBe(nfdCafe);
    expect(
      match.previewText.slice(match.previewMatchStart, match.previewMatchEnd)
    ).toBe(nfdCafe);
  });

  it("normalizes an NFD query against NFC text and keeps source ranges raw (#453 Slice 2)", () => {
    const text = "xx café yy";

    const [match] = findTextSearchMatches(text, "cafe\u0301", PLAIN_NFC);
    expect(match.startOffset).toBe(3);
    expect(match.endOffset).toBe(7);
    expect(match.matchedText).toBe("café");
  });

  it("maps mixed ASCII, Japanese, and combining-mark matches to raw offsets (#453 Slice 2)", () => {
    const text = "Aか\u3099B e\u0301猫";

    const [japaneseMatch] = findTextSearchMatches(text, "がB", PLAIN_NFC);
    expect(japaneseMatch.startOffset).toBe(1);
    expect(japaneseMatch.endOffset).toBe(4);
    expect(japaneseMatch.matchedText).toBe("か\u3099B");

    const [accentMatch] = findTextSearchMatches(text, "é", PLAIN_NFC);
    expect(accentMatch.startOffset).toBe(5);
    expect(accentMatch.endOffset).toBe(7);
    expect(accentMatch.matchedText).toBe("e\u0301");
  });

  it("finds multiple normalized matches without range drift (#453 Slice 2)", () => {
    const nfdCafe = "cafe\u0301";
    const text = `${nfdCafe} x ${nfdCafe}`;

    expect(findTextSearchMatches(text, "café", PLAIN_NFC)).toEqual([
      expect.objectContaining({
        startOffset: 0,
        endOffset: 5,
        matchedText: nfdCafe
      }),
      expect.objectContaining({
        startOffset: 8,
        endOffset: 13,
        matchedText: nfdCafe
      })
    ]);
  });

  it("combines NFC normalization with existing case-insensitive matching (#453 Slice 2)", () => {
    const text = "xx CAFE\u0301 yy";

    const [match] = findTextSearchMatches(text, "café", PLAIN_NFC);
    expect(match.startOffset).toBe(3);
    expect(match.endOffset).toBe(8);
    expect(match.matchedText).toBe("CAFE\u0301");
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

    it("applies whole-word checks to raw ranges after NFC-normalized matching (#453 Slice 2)", () => {
      const nfdCafe = "cafe\u0301";
      expect(
        starts(`${nfdCafe} hand${nfdCafe}`, "café", WHOLE_WORD_NFC)
      ).toEqual([0]);
    });
  });

  describe("Japanese-aware whole-word: katakana query (#384)", () => {
    // Katakana "maid" = U+30E1 U+30A4 U+30C9.
    const MAID = "メイド";

    it("hits the bare word, forward compounds, and non-katakana prefixes", () => {
      const hits = [
        MAID, // bare
        `${MAID}服`, // + kanji  (maid-fuku)
        `${MAID}さん`, // + hiragana (maid-san)
        `${MAID}喫茶`, // + kanji  (maid-kissa)
        `${MAID}長`, // + kanji  (maid-chou)
        `超${MAID}`, // kanji prefix
        `鬼${MAID}`, // kanji prefix
        `新人${MAID}`, // kanji prefix
        `すごい${MAID}`, // hiragana prefix
        `「${MAID}」`, // quote bracket
        `（${MAID}）`, // fullwidth paren
        `　${MAID}`, // ideographic space
        `、${MAID}`, // ideographic comma
        `。${MAID}`, // ideographic full stop
        `A${MAID}`, // latin letter (v1: hit)
        `1${MAID}` // digit (v1: hit)
      ];
      for (const text of hits) {
        expect(findTextSearchMatches(text, MAID, WHOLE_WORD)).toHaveLength(1);
      }
    });

    it("rejects a match sitting inside a katakana loanword compound", () => {
      const misses = [
        `オーダー${MAID}`, // preceded by prolonged sound mark U+30FC
        `ハンド${MAID}`, // preceded by katakana
        `カスタム${MAID}`, // preceded by katakana
        `プリンセス${MAID}` // preceded by katakana
      ];
      for (const text of misses) {
        expect(findTextSearchMatches(text, MAID, WHOLE_WORD)).toEqual([]);
      }
    });

    it("treats the katakana middle dot (U+30FB) as a separator", () => {
      expect(
        findTextSearchMatches(`あ・${MAID}`, MAID, WHOLE_WORD)
      ).toHaveLength(1);
    });

    it("plain (non-whole-word) search still finds the substring anywhere", () => {
      expect(
        findTextSearchMatches(`ハンド${MAID}`, MAID, PLAIN)
      ).toHaveLength(1);
    });
  });

  describe("Japanese-aware whole-word: kanji query stays permissive in v1 (#384)", () => {
    const WARD = "管区";

    it("hits regardless of an adjacent kanji (no morphological analysis)", () => {
      const hits = [
        WARD,
        `${WARD}長`,
        `第七${WARD}`,
        `北部${WARD}`,
        `「${WARD}」`
      ];
      for (const text of hits) {
        expect(findTextSearchMatches(text, WARD, WHOLE_WORD)).toHaveLength(1);
      }
    });

    it("still rejects a match directly after a katakana run", () => {
      // Contrived, but the rule is uniform: katakana prefix suppresses.
      expect(
        findTextSearchMatches(`カン${WARD}`, WARD, WHOLE_WORD)
      ).toEqual([]);
    });
  });

  describe("whole-word + Match Case combination (#384)", () => {
    const TEXT = ["maid", "Maid", "handmaid", "Handmade"].join("\n");

    it("Aa OFF + Ab ON: both cases of the standalone word, no compounds", () => {
      expect(
        findTextSearchMatches(TEXT, "maid", {
          caseSensitive: false,
          wholeWord: true
        }).map((match) => match.matchedText)
      ).toEqual(["maid", "Maid"]);
    });

    it("Aa ON + Ab ON: only the exact-case standalone word", () => {
      expect(
        findTextSearchMatches(TEXT, "maid", {
          caseSensitive: true,
          wholeWord: true
        }).map((match) => match.matchedText)
      ).toEqual(["maid"]);
    });
  });

  describe("regular expression search (#384)", () => {
    const REGEX: FindTextSearchMatchesOptions = {
      caseSensitive: false,
      wholeWord: false,
      useRegex: true
    };

    it("matches an alternation across Japanese text", () => {
      const text = "メイドさん\nジャンヌ・ヴァルジャン";
      expect(
        findTextSearchMatches(text, "メイド|ジャンヌ", REGEX).map(
          (match) => match.matchedText
        )
      ).toEqual(["メイド", "ジャンヌ"]);
    });

    it("honours a character class + quantifier", () => {
      const text = "第一章\n第三章\n第X章";
      expect(
        findTextSearchMatches(text, "第[一二三四五六七八九十]+章", REGEX).map(
          (match) => match.matchedText
        )
      ).toEqual(["第一章", "第三章"]);
    });

    it("applies Match Case to the regex flags", () => {
      const text = "maid\nMaid\nMAID";
      expect(
        findTextSearchMatches(text, "maid", REGEX)
      ).toHaveLength(3);
      expect(
        findTextSearchMatches(text, "maid", { ...REGEX, caseSensitive: true })
      ).toHaveLength(1);
    });

    it("keeps offsets and matchedText on the original text under case folding", () => {
      const [match] = findTextSearchMatches("xxMAIDxx", "ma.d", REGEX);
      expect(match.startOffset).toBe(2);
      expect(match.endOffset).toBe(6);
      expect(match.matchedText).toBe("MAID");
    });

    it("does not NFC-normalize regex matching and reports raw UTF-16 offsets (#453 Slice 0)", () => {
      const nfdCafe = "cafe\u0301";
      const text = `xx ${nfdCafe} yy`;

      expect(findTextSearchMatches(text, "café", REGEX)).toEqual([]);

      const [match] = findTextSearchMatches(text, nfdCafe, REGEX);
      expect(match.startOffset).toBe(3);
      expect(match.endOffset).toBe(8);
      expect(match.matchedText).toBe(nfdCafe);

      expect(
        findTextSearchMatches(text, "café", {
          ...REGEX,
          normalizeUnicodeToNfc: true
        })
      ).toEqual([]);
    });

    it("ignores the whole-word option in regex mode", () => {
      expect(
        findTextSearchMatches("ハンドメイド", "メイド", {
          ...REGEX,
          wholeWord: true
        })
      ).toHaveLength(1);
    });

    it("drops zero-length matches without hanging", () => {
      expect(findTextSearchMatches("メイド\nメイド\nメイド", "^", REGEX)).toEqual(
        []
      );
      expect(
        findTextSearchMatches("メイドさん", "(?=メイド)", REGEX)
      ).toEqual([]);
      expect(findTextSearchMatches("aaaa", "a*", REGEX)).toEqual([
        expect.objectContaining({ matchedText: "aaaa" })
      ]);
    });

    it("returns nothing for an invalid pattern instead of throwing", () => {
      expect(() =>
        findTextSearchMatches("anything", "(", REGEX)
      ).not.toThrow();
      expect(findTextSearchMatches("anything", "[", REGEX)).toEqual([]);
    });
  });

  describe("multiline plain-text queries (#455)", () => {
    it("finds a query spanning a newline as one match covering the full raw span", () => {
      const text = "before\nfoo\nbar\nafter";
      const [match] = findTextSearchMatches(text, "foo\nbar", PLAIN);

      expect(match).toBeDefined();
      expect(match.startOffset).toBe(text.indexOf("foo"));
      expect(match.endOffset).toBe(text.indexOf("bar") + "bar".length);
      expect(match.matchedText).toBe("foo\nbar");
    });

    it("preserves leading/trailing whitespace and newlines in the query itself", () => {
      const text = "xx  foo\nbar  yy";
      const [match] = findTextSearchMatches(text, "  foo\nbar  ", PLAIN);

      expect(match).toBeDefined();
      expect(match.matchedText).toBe("  foo\nbar  ");
    });

    it("still applies NFC normalization (#453) across a multiline match", () => {
      const nfdCafe = "café";
      const text = `xx\n${nfdCafe}\nyy`;

      const [match] = findTextSearchMatches(text, "café", PLAIN_NFC);
      expect(match.matchedText).toBe(nfdCafe);
    });

    it("regex mode still treats a literal \\n in the pattern raw (unaffected by #455)", () => {
      const text = "foo\nbar";
      const [match] = findTextSearchMatches(text, "foo\\nbar", {
        caseSensitive: false,
        wholeWord: false,
        useRegex: true
      });
      expect(match.matchedText).toBe("foo\nbar");
    });
  });

  describe("compileSearchRegex (#384)", () => {
    it("compiles a valid pattern with the expected flags", () => {
      const insensitive = compileSearchRegex("メイド|ジャンヌ", false);
      expect(insensitive.regex).toBeInstanceOf(RegExp);
      expect(insensitive.error).toBeNull();
      expect(insensitive.regex?.flags).toBe("gim");

      const sensitive = compileSearchRegex("メイド", true);
      expect(sensitive.regex?.flags).toBe("gm");
    });

    it("reports an invalid pattern without throwing", () => {
      const result = compileSearchRegex("(?<", false);
      expect(result.regex).toBeNull();
      expect(typeof result.error).toBe("string");
      expect(result.error?.length ?? 0).toBeGreaterThan(0);
    });
  });
});
