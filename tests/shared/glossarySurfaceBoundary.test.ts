import { describe, expect, it } from "vitest";
import { shouldAcceptGlossarySurfaceBoundary } from "../../src/shared/glossarySurfaceBoundary";

function acceptBoundary(
  text: string,
  matchedText: string,
  checkStartBoundary = true,
  checkEndBoundary = true,
  occurrence = 0
): boolean {
  let start = -1;
  let cursor = 0;

  for (let index = 0; index <= occurrence; index += 1) {
    start = text.indexOf(matchedText, cursor);
    cursor = start + matchedText.length;
  }

  expect(start).toBeGreaterThanOrEqual(0);

  return shouldAcceptGlossarySurfaceBoundary({
    text,
    start,
    end: start + matchedText.length,
    checkStartBoundary,
    checkEndBoundary
  });
}

describe("glossary surface boundary resolver (#375)", () => {
  it("accepts a checked edge that sits on the text edge", () => {
    expect(acceptBoundary("PergamumIDE", "Pergamum", true, false)).toBe(true);
    expect(acceptBoundary("SuperPergamum", "Pergamum", false, true)).toBe(true);
  });

  it("applies Katakana continuation checks when the edge is checked", () => {
    expect(acceptBoundary("オーダーメイド", "オーダ")).toBe(false);
    expect(acceptBoundary("オーダは沈黙した。", "オーダ")).toBe(true);
    expect(acceptBoundary("オーダーメイド", "オーダー")).toBe(false);
    expect(acceptBoundary("オーダーは沈黙した。", "オーダー")).toBe(true);
  });

  it("treats Katakana marks and punctuation-like characters as Other", () => {
    expect(acceptBoundary("ヤマダノヽ", "ヤマダノ")).toBe(true);
    expect(acceptBoundary("ヤマダノヾ", "ヤマダノ")).toBe(true);
    expect(acceptBoundary("ジャン・ヴァルジャン", "ジャン")).toBe(true);
    expect(acceptBoundary("ジャン゠ヴァルジャン", "ジャン")).toBe(true);
  });

  it("rejects a later Katakana occurrence with a Katakana start continuation", () => {
    expect(
      acceptBoundary("ジャン・ヴァルジャン", "ジャン", true, true, 1)
    ).toBe(false);
  });

  it("applies ASCII word continuation checks when the edge is checked", () => {
    expect(acceptBoundary("PergamumIDE", "Pergamum")).toBe(false);
    expect(acceptBoundary("Pergamum2", "Pergamum")).toBe(false);
    expect(acceptBoundary("Pergamum_IDE", "Pergamum")).toBe(false);
    expect(acceptBoundary("Pergamum is an IDE.", "Pergamum")).toBe(true);
    expect(acceptBoundary("Pergamum.IDE", "Pergamum")).toBe(true);
  });

  it("lets an unchecked edge pass independently of the other edge", () => {
    expect(acceptBoundary("オーダーメイド", "オーダ", true, false)).toBe(true);
    expect(acceptBoundary("オーダーメイド", "メイド", true, true)).toBe(false);
    expect(acceptBoundary("オーダーメイド", "メイド", false, true)).toBe(true);
  });

  it("accepts unconditionally when neither edge is checked", () => {
    expect(acceptBoundary("PergamumIDE", "Pergamum", false, false)).toBe(true);
    expect(acceptBoundary("オーダーメイド", "オーダ", false, false)).toBe(true);
  });

  it("passes unresolved Hiragana, Kanji, Odoriji, and mixed-script edges", () => {
    expect(acceptBoundary("お館さまがお呼びです。", "お館さま")).toBe(true);
    expect(acceptBoundary("領主館", "領主")).toBe(true);
    expect(acceptBoundary("オー領主", "領主")).toBe(true);
    expect(acceptBoundary("山田野々", "山田")).toBe(true);
    expect(acceptBoundary("やまだのゝ", "やまだの")).toBe(true);
  });
});
