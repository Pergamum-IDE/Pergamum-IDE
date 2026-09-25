import { describe, expect, it } from "vitest";
import {
  applyRubyMarkup,
  isKanjiChar,
  renderDendenRubyHtml,
  splitIntoKanjiRunsAndPlainText
} from "../../src/shared/rubyMarkupGenerator";

describe("rubyMarkupGenerator", () => {
  describe("applyRubyMarkup", () => {
    it("generates Aozora Bunko ruby markup with explicit range marker ｜", () => {
      const result = applyRubyMarkup({
        text: "漢字",
        rule: "aozora",
        rubyText: "かんじ"
      });
      expect(result).toBe("｜漢字《かんじ》");
    });

    it("handles selection text containing pre-existing formatting or characters", () => {
      const result = applyRubyMarkup({
        text: "東京特許許可局",
        rule: "aozora",
        rubyText: "とうきょうとっきょきょかきょく"
      });
      expect(result).toBe("｜東京特許許可局《とうきょうとっきょきょかきょく》");
    });

    it("generates Denden Markdown ruby markup {text|rubyText}", () => {
      const result = applyRubyMarkup({
        text: "電子出版",
        rule: "denden",
        rubyText: "でんししゅっぱん"
      });
      expect(result).toBe("{電子出版|でんししゅっぱん}");
    });

    it("generates Denden Markdown mono-ruby style markup when rubyText contains pipes", () => {
      const result = applyRubyMarkup({
        text: "電子出版",
        rule: "denden",
        rubyText: "でん|し|しゅっ|ぱん"
      });
      expect(result).toBe("{電子出版|でん|し|しゅっ|ぱん}");
    });

    it("normalizes full-width ｜ to half-width | in Denden rubyText", () => {
      const result = applyRubyMarkup({
        text: "漢字",
        rule: "denden",
        rubyText: "かん｜じ"
      });
      expect(result).toBe("{漢字|かん|じ}");
    });
  });

  describe("isKanjiChar", () => {
    it("recognizes standard Han ideographs and iteration marks 々, 〻", () => {
      expect(isKanjiChar("漢")).toBe(true);
      expect(isKanjiChar("字")).toBe(true);
      expect(isKanjiChar("々")).toBe(true);
      expect(isKanjiChar("〻")).toBe(true);
      expect(isKanjiChar("あ")).toBe(false);
      expect(isKanjiChar("A")).toBe(false);
    });
  });

  describe("splitIntoKanjiRunsAndPlainText", () => {
    it("splits kanji-kana mixed string into alternating runs", () => {
      const segments = splitIntoKanjiRunsAndPlainText("漢字かな混じり文書です");
      expect(segments).toEqual([
        { type: "kanjiRun", text: "漢字" },
        { type: "plain", text: "かな" },
        { type: "kanjiRun", text: "混" },
        { type: "plain", text: "じり" },
        { type: "kanjiRun", text: "文書" },
        { type: "plain", text: "です" }
      ]);
    });
  });

  describe("renderDendenRubyHtml", () => {
    it("renders kanji-run ruby when ruby part count equals kanji run count", () => {
      const html = renderDendenRubyHtml("漢字かな混じり文書です", [
        "かんじ",
        "ま",
        "ぶんしょ"
      ]);
      expect(html).toBe(
        "<ruby>漢字<rt>かんじ</rt></ruby>かな<ruby>混<rt>ま</rt></ruby>じり<ruby>文書<rt>ぶんしょ</rt></ruby>です"
      );
    });

    it("renders per-character mono ruby when ruby part count equals character count", () => {
      const html = renderDendenRubyHtml("電子出版", [
        "でん",
        "し",
        "しゅっ",
        "ぱん"
      ]);
      expect(html).toBe(
        "<ruby>電<rt>でん</rt>子<rt>し</rt>出<rt>しゅっ</rt>版<rt>ぱん</rt></ruby>"
      );
    });

    it("falls back to group ruby when part count mismatches both char count and kanji run count", () => {
      const html = renderDendenRubyHtml("電子出版", ["でん", "しゅっぱん"]);
      expect(html).toBe("<ruby>電子出版<rt>でん|しゅっぱん</rt></ruby>");
    });

    it("keeps single ruby part mixed text as group ruby", () => {
      const html = renderDendenRubyHtml("漢字かな混じり文書です", [
        "かんじかなまじりぶんしょです"
      ]);
      expect(html).toBe(
        "<ruby>漢字かな混じり文書です<rt>かんじかなまじりぶんしょです</rt></ruby>"
      );
    });

    it("normalizes full-width ｜ in rubyParts when rendering HTML", () => {
      const html = renderDendenRubyHtml("漢字", ["かん｜じ"]);
      expect(html).toBe("<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>");
    });
  });
});
