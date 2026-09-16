import { describe, expect, it } from "vitest";
import {
  countGraphemes,
  RUBY_TEXT_MAX_GRAPHEMES,
  validateRubyText
} from "../../src/shared/rubyMarkupSettings";

describe("rubyMarkupSettings", () => {
  it("defines RUBY_TEXT_MAX_GRAPHEMES as 50", () => {
    expect(RUBY_TEXT_MAX_GRAPHEMES).toBe(50);
  });

  describe("countGraphemes", () => {
    it("counts ASCII characters correctly", () => {
      expect(countGraphemes("abc")).toBe(3);
    });

    it("counts Japanese hiragana and kanji correctly", () => {
      expect(countGraphemes("かんじ")).toBe(3);
      expect(countGraphemes("漢字")).toBe(2);
    });

    it("counts grapheme clusters with surrogate pairs / combining marks correctly", () => {
      // 𠮷 (surrogate pair)
      expect(countGraphemes("𠮷野家")).toBe(3);
    });
  });

  describe("validateRubyText", () => {
    it("rejects empty string", () => {
      expect(validateRubyText("")).toBe(false);
    });

    it("accepts valid ruby text between 1 and 50 graphemes", () => {
      expect(validateRubyText("かんじ")).toBe(true);
      expect(validateRubyText("a".repeat(50))).toBe(true);
    });

    it("rejects ruby text over 50 graphemes", () => {
      expect(validateRubyText("a".repeat(51))).toBe(false);
    });

    it("rejects ruby text containing newlines", () => {
      expect(validateRubyText("かん\nじ")).toBe(false);
      expect(validateRubyText("かん\rじ")).toBe(false);
    });

    it("rejects ruby text containing forbidden characters 《, 》, ｜", () => {
      expect(validateRubyText("かん《じ")).toBe(false);
      expect(validateRubyText("かん》じ")).toBe(false);
      expect(validateRubyText("かん｜じ")).toBe(false);
    });
  });
});
