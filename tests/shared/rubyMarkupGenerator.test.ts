import { describe, expect, it } from "vitest";
import { applyRubyMarkup } from "../../src/shared/rubyMarkupGenerator";

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
  });
});
