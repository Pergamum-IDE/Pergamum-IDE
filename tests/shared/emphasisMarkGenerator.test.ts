import { describe, expect, it } from "vitest";
import { applyEmphasisMark, getGraphemes } from "../../src/shared/emphasisMarkGenerator";

describe("applyEmphasisMark", () => {
  it("returns empty string when input text is empty", () => {
    expect(
      applyEmphasisMark({
        text: "",
        rule: "aozora",
        aozoraMark: "whiteSesame",
        narouMarkText: "・"
      })
    ).toBe("");
  });

  describe("Aozora Bunko rule", () => {
    it("formats whiteSesame mark", () => {
      expect(
        applyEmphasisMark({
          text: "選択範囲",
          rule: "aozora",
          aozoraMark: "whiteSesame",
          narouMarkText: "・"
        })
      ).toBe("選択範囲［＃「選択範囲」に白ゴマ傍点］");
    });

    it("formats sesame mark as standard 傍点 without ゴマ傍点", () => {
      const result = applyEmphasisMark({
        text: "用語集",
        rule: "aozora",
        aozoraMark: "sesame",
        narouMarkText: "・"
      });
      expect(result).toBe("用語集［＃「用語集」に傍点］");
      expect(result).not.toContain("ゴマ傍点");
    });

    it("formats circle mark as 丸傍点 without 黒丸傍点", () => {
      const result = applyEmphasisMark({
        text: "用語集",
        rule: "aozora",
        aozoraMark: "circle",
        narouMarkText: "・"
      });
      expect(result).toBe("用語集［＃「用語集」に丸傍点］");
      expect(result).not.toContain("黒丸傍点");
    });

    it("formats whiteCircle mark", () => {
      expect(
        applyEmphasisMark({
          text: "文字",
          rule: "aozora",
          aozoraMark: "whiteCircle",
          narouMarkText: "・"
        })
      ).toBe("文字［＃「文字」に白丸傍点］");
    });

    it("formats blackTriangle mark", () => {
      expect(
        applyEmphasisMark({
          text: "文字",
          rule: "aozora",
          aozoraMark: "blackTriangle",
          narouMarkText: "・"
        })
      ).toBe("文字［＃「文字」に黒三角傍点］");
    });

    it("formats whiteTriangle mark", () => {
      expect(
        applyEmphasisMark({
          text: "文字",
          rule: "aozora",
          aozoraMark: "whiteTriangle",
          narouMarkText: "・"
        })
      ).toBe("文字［＃「文字」に白三角傍点］");
    });

    it("formats doubleCircle mark", () => {
      expect(
        applyEmphasisMark({
          text: "文字",
          rule: "aozora",
          aozoraMark: "doubleCircle",
          narouMarkText: "・"
        })
      ).toBe("文字［＃「文字」に二重丸傍点］");
    });

    it("formats fisheye mark as 蛇の目傍点", () => {
      expect(
        applyEmphasisMark({
          text: "用語集",
          rule: "aozora",
          aozoraMark: "fisheye",
          narouMarkText: "・"
        })
      ).toBe("用語集［＃「用語集」に蛇の目傍点］");
    });

    it("formats saltire mark as ばつ傍点", () => {
      expect(
        applyEmphasisMark({
          text: "用語集",
          rule: "aozora",
          aozoraMark: "saltire",
          narouMarkText: "・"
        })
      ).toBe("用語集［＃「用語集」にばつ傍点］");
    });
  });

  describe("Kakuyomu rule", () => {
    it("formats double angle bracket notation", () => {
      expect(
        applyEmphasisMark({
          text: "選択範囲",
          rule: "kakuyomu",
          aozoraMark: "whiteSesame",
          narouMarkText: "・"
        })
      ).toBe("《《選択範囲》》");
    });
  });

  describe("Narou rule", () => {
    it("formats per-character rubric notation", () => {
      expect(
        applyEmphasisMark({
          text: "選択範囲",
          rule: "narou",
          aozoraMark: "whiteSesame",
          narouMarkText: "・"
        })
      ).toBe("｜選《・》｜択《・》｜範《・》｜囲《・》");
    });

    it("supports custom multi-character mark text", () => {
      expect(
        applyEmphasisMark({
          text: "文字",
          rule: "narou",
          aozoraMark: "whiteSesame",
          narouMarkText: "〇"
        })
      ).toBe("｜文《〇》｜字《〇》");
    });

    it("correctly handles surrogate pairs and grapheme clusters", () => {
      const graphemes = getGraphemes("𩸽🐱‍👤");
      expect(graphemes.length).toBeGreaterThan(0);
      const res = applyEmphasisMark({
        text: "𩸽",
        rule: "narou",
        aozoraMark: "whiteSesame",
        narouMarkText: "・"
      });
      expect(res).toBe("｜𩸽《・》");
    });
  });
});
