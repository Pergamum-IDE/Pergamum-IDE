// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { markdownPreviewRenderer } from "../../src/renderer/preview/markdownPreviewRenderer";

describe("Markdown Preview Aozora/Narou ruby notation parsing (#507)", () => {
  describe("Explicit ruby marker parsing (｜ / |)", () => {
    it("parses full-width vertical bar marker ｜菖苔《わらづと》", () => {
      const result = markdownPreviewRenderer.render("｜菖苔《わらづと》");
      expect(result).toContain("<ruby>菖苔<rt>わらづと</rt></ruby>");
      expect(result).not.toContain("｜");
      expect(result).not.toContain("《");
      expect(result).not.toContain("》");
    });

    it("parses half-width vertical bar marker |菖苔《わらづと》", () => {
      const result = markdownPreviewRenderer.render("|菖苔《わらづと》");
      expect(result).toContain("<ruby>菖苔<rt>わらづと</rt></ruby>");
      expect(result).not.toContain("|");
    });

    it("allows non-Kanji base text when explicit marker is used", () => {
      const result = markdownPreviewRenderer.render("｜ABC《エービーシー》");
      expect(result).toContain("<ruby>ABC<rt>エービーシー</rt></ruby>");
    });

    it("HTML escapes special characters inside base or ruby text", () => {
      const result = markdownPreviewRenderer.render("｜<script>《&alert》");
      expect(result).toContain("<ruby>&lt;script&gt;<rt>&amp;alert</rt></ruby>");
    });
  });

  describe("Implicit ruby marker parsing (Kanji run before 《...》)", () => {
    it("parses plain Kanji run 菖苔《わらづと》", () => {
      const result = markdownPreviewRenderer.render("菖苔《わらづと》");
      expect(result).toContain("<ruby>菖苔<rt>わらづto</rt></ruby>".replace("to", "と"));
    });

    it("converts explicit full-width vertical bar ruby: 寝床の｜藁苞《わらづと》を調べる。", () => {
      const result = markdownPreviewRenderer.render("寝床の｜藁苞《わらづと》を調べる。");
      expect(result).toContain("<ruby>");
      expect(result).toContain("藁苞");
      expect(result).toContain("<rt>わらづと</rt>");
      expect(result).not.toContain("｜藁苞《わらづと》");
    });

    it("converts explicit half-width vertical bar ruby: 寝床の|藁苞《わらづと》を調べる。", () => {
      const result = markdownPreviewRenderer.render("寝床の|藁苞《わらづと》を調べる。");
      expect(result).toContain("<ruby>");
      expect(result).toContain("藁苞");
      expect(result).toContain("<rt>わらづと</rt>");
      expect(result).not.toContain("|藁苞《わらづと》");
    });

    it("converts implicit Kanji run ruby: 寝床の藁苞《わらづと》を調べる。", () => {
      const result = markdownPreviewRenderer.render("寝床の藁苞《わらづと》を調べる。");
      expect(result).toContain("<ruby>");
      expect(result).toContain("藁苞");
      expect(result).toContain("<rt>わらづと</rt>");
      expect(result).toContain("寝床の<ruby>藁苞<rt>わらづと</rt></ruby>を調べる。");
    });
  });

  describe("Negative cases (non-matching patterns)", () => {
    it("does not match hiragana before 《", () => {
      const result = markdownPreviewRenderer.render("かな《かな》");
      expect(result).not.toContain("<ruby>");
      expect(result).toContain("かな《かな》");
    });

    it("does not match Latin characters before 《 without explicit marker", () => {
      const result = markdownPreviewRenderer.render("abc《えーびーしー》");
      expect(result).not.toContain("<ruby>");
      expect(result).toContain("abc《えーびーしー》");
    });

    it("does not match when ruby text is empty or missing closing bracket", () => {
      const result = markdownPreviewRenderer.render("菖苔《》 菖苔《わらづと");
      expect(result).not.toContain("<ruby>");
    });

    it("does not match bare 《ルビだけ》", () => {
      const result = markdownPreviewRenderer.render("《ルビだけ》");
      expect(result).not.toContain("<ruby>");
    });
  });

  describe("Narou shorthand ruby and escape markers in preview (#525 Slice 15)", () => {
    it("renders 漢字（かんじ） and 漢字(かんじ) as ruby in Narou horizontal preview", () => {
      const fullParen = markdownPreviewRenderer.render("漢字（かんじ）", {
        previewRenderer: "narouHorizontal"
      });
      const halfParen = markdownPreviewRenderer.render("漢字(かんじ)", {
        previewRenderer: "narouHorizontal"
      });

      expect(fullParen).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
      expect(halfParen).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    });

    it("renders 漢字（かんじ） and 漢字(かんじ) as ruby in Narou vertical preview", () => {
      const fullParen = markdownPreviewRenderer.render("漢字（かんじ）", {
        previewRenderer: "narouVertical"
      });
      const halfParen = markdownPreviewRenderer.render("漢字(かんじ)", {
        previewRenderer: "narouVertical"
      });

      expect(fullParen).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
      expect(halfParen).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    });

    it("uses contiguous Kanji run as parent text (東京都（とうきょうと）)", () => {
      const result = markdownPreviewRenderer.render("東京都（とうきょうと）", {
        previewRenderer: "narouHorizontal"
      });
      expect(result).toContain("<ruby>東京都<rt>とうきょうと</rt></ruby>");
    });

    it("does not convert non-reading content inside parentheses (東京（本社）)", () => {
      const result = markdownPreviewRenderer.render("東京（本社）", {
        previewRenderer: "narouHorizontal"
      });
      expect(result).not.toContain("<ruby>");
      expect(result).toContain("東京（本社）");
    });

    it("removes escape markers before parentheses and renders normal text in Narou previews", () => {
      const cases = [
        "漢字|（これは無視）",
        "漢字｜（これは無視）",
        "漢字|(これは無視)",
        "漢字｜(これは無視)"
      ];

      for (const input of cases) {
        const horizResult = markdownPreviewRenderer.render(input, {
          previewRenderer: "narouHorizontal"
        });
        const vertResult = markdownPreviewRenderer.render(input, {
          previewRenderer: "narouVertical"
        });

        expect(horizResult).not.toContain("<ruby>");
        expect(horizResult).not.toContain("|");
        expect(horizResult).not.toContain("｜");
        expect(horizResult).toMatch(/漢字[（(]これは無視[）)]/);

        expect(vertResult).not.toContain("<ruby>");
        expect(vertResult).not.toContain("|");
        expect(vertResult).not.toContain("｜");
        expect(vertResult).toMatch(/漢字[（(]これは無視[）)]/);
      }
    });

    it("preserves explicit ruby syntax |漢字《かんじ》 and ｜漢字《かんじ》", () => {
      const halfPipe = markdownPreviewRenderer.render("|漢字《かんじ》", {
        previewRenderer: "narouHorizontal"
      });
      const fullPipe = markdownPreviewRenderer.render("｜漢字《かんじ》", {
        previewRenderer: "narouVertical"
      });

      expect(halfPipe).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
      expect(fullPipe).toContain("<ruby>漢字<rt>かんじ</rt></ruby>");
    });

    it("does not convert shorthand ruby for other preview renderers (markdown, aozora, kakuyomu)", () => {
      const markdownRes = markdownPreviewRenderer.render("漢字（かんじ）", {
        previewRenderer: "markdown"
      });
      const aozoraRes = markdownPreviewRenderer.render("漢字（かんじ）", {
        previewRenderer: "aozoraHorizontal"
      });
      const kakuyomuRes = markdownPreviewRenderer.render("漢字（かんじ）", {
        previewRenderer: "kakuyomuHorizontal"
      });

      expect(markdownRes).not.toContain("<ruby>");
      expect(aozoraRes).not.toContain("<ruby>");
      expect(kakuyomuRes).not.toContain("<ruby>");
    });
  });
});
