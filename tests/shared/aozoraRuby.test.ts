import { describe, expect, it } from "vitest";
import {
  findAozoraRubyBase,
  isAozoraRubyBoundaryCodePoint,
  isKanaCodePoint,
  isKanjiCodePoint,
  MAX_FALLBACK_RUBY_BASE_LENGTH
} from "../../src/shared/aozoraRuby";

describe("aozoraRuby (#628)", () => {
  describe("isKanjiCodePoint and isKanaCodePoint", () => {
    it("identifies CJK kanji code points correctly", () => {
      expect(isKanjiCodePoint("漢".codePointAt(0)!)).toBe(true);
      expect(isKanjiCodePoint("字".codePointAt(0)!)).toBe(true);
      expect(isKanjiCodePoint("𠮷".codePointAt(0)!)).toBe(true); // Extension B surrogate pair
      expect(isKanjiCodePoint("A".codePointAt(0)!)).toBe(false);
      expect(isKanjiCodePoint("あ".codePointAt(0)!)).toBe(false);
    });

    it("identifies hiragana and katakana code points correctly", () => {
      expect(isKanaCodePoint("あ".codePointAt(0)!)).toBe(true);
      expect(isKanaCodePoint("ア".codePointAt(0)!)).toBe(true);
      expect(isKanaCodePoint("ｦ".codePointAt(0)!)).toBe(true); // Halfwidth katakana
      expect(isKanaCodePoint("漢".codePointAt(0)!)).toBe(false);
      expect(isKanaCodePoint("X".codePointAt(0)!)).toBe(false);
    });
  });

  describe("findAozoraRubyBase - Explicit ruby", () => {
    it("resolves explicit ruby base with ｜ or | marker", () => {
      const text1 = "｜BOKC《ヴォクス》";
      const match1 = findAozoraRubyBase(text1, text1.indexOf("《"), 0);
      expect(match1).toEqual({ matchStart: 0, baseText: "BOKC" });

      const text2 = "｜ВОКС《ヴォクス》";
      const match2 = findAozoraRubyBase(text2, text2.indexOf("《"), 0);
      expect(match2).toEqual({ matchStart: 0, baseText: "ВОКС" });

      const text3 = "｜外務省BOKC《ヴォクス》";
      const match3 = findAozoraRubyBase(text3, text3.indexOf("《"), 0);
      expect(match3).toEqual({ matchStart: 0, baseText: "外務省BOKC" });

      const text4 = "|ASCII《アスキー》";
      const match4 = findAozoraRubyBase(text4, text4.indexOf("《"), 0);
      expect(match4).toEqual({ matchStart: 0, baseText: "ASCII" });
    });
  });

  describe("findAozoraRubyBase - Existing implicit kanji ruby", () => {
    it("resolves contiguous kanji run immediately preceding 《", () => {
      const text1 = "漢字《かんじ》";
      const match1 = findAozoraRubyBase(text1, text1.indexOf("《"), 0);
      expect(match1).toEqual({ matchStart: 0, baseText: "漢字" });

      const text2 = "東京《とうきょう》";
      const match2 = findAozoraRubyBase(text2, text2.indexOf("《"), 0);
      expect(match2).toEqual({ matchStart: 0, baseText: "東京" });
    });
  });

  describe("findAozoraRubyBase - Non-kana fallback ruby base (#628)", () => {
    it("resolves Latin non-kana ruby base (BOKC)", () => {
      const text = "BOKC《ヴォクス》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toEqual({ matchStart: 0, baseText: "BOKC" });
    });

    it("resolves Cyrillic non-kana ruby base (ВОКС)", () => {
      const text = "ВОКС《ヴォクス》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toEqual({ matchStart: 0, baseText: "ВОКС" });
    });

    it("stops fallback at Japanese opening bracket 「", () => {
      const text = "「BOKC《ヴォクス》から";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toEqual({ matchStart: 1, baseText: "BOKC" });
    });

    it("resolves non-kana base in sentence", () => {
      const text = "BOKC《ヴォクス》という";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toEqual({ matchStart: 0, baseText: "BOKC" });
    });

    it("stops fallback at kanji boundary", () => {
      const text = "外務省BOKC《ヴォクス》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toEqual({ matchStart: 3, baseText: "BOKC" });
    });
  });

  describe("findAozoraRubyBase - False positives (should return null)", () => {
    it("does not form ruby when preceding character is hiragana (これは重要です《注》)", () => {
      const text = "これは重要です《注》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toBeNull();
    });

    it("does not form ruby when preceding character is hiragana (そうです《ママ》)", () => {
      const text = "そうです《ママ》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toBeNull();
    });

    it("does not form ruby when preceding character is punctuation", () => {
      const text = "テスト。《注》";
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toBeNull();
    });

    it("does not form ruby when candidate exceeds max fallback length", () => {
      const longBase = "A".repeat(MAX_FALLBACK_RUBY_BASE_LENGTH + 1);
      const text = `${longBase}《ルビ》`;
      const match = findAozoraRubyBase(text, text.indexOf("《"), 0);
      expect(match).toBeNull();
    });
  });
});
