import { describe, expect, it } from "vitest";
import {
  createNormalizedTextWithSourceMap,
  mapNormalizedRangeToSourceRange
} from "../../src/shared/normalizedTextSourceMap";

describe("normalizedTextSourceMap (#453 Slice 1)", () => {
  it("keeps raw text and identity-compatible ranges when NFC normalization is off", () => {
    const raw = "A cafe\u0301 B";
    const sourceMap = createNormalizedTextWithSourceMap(raw, {
      normalizeToNfc: false
    });

    expect(sourceMap).toEqual({ normalizedText: raw, spans: [] });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, raw.length)).toEqual({
      start: 0,
      end: raw.length
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 5, 7)).toEqual({
      start: 5,
      end: 7
    });
  });

  it("normalizes NFD e + combining acute accent to NFC", () => {
    const sourceMap = createNormalizedTextWithSourceMap("e\u0301", {
      normalizeToNfc: true
    });

    expect(sourceMap.normalizedText).toBe("é");
    expect(sourceMap.spans).toEqual([
      {
        normalizedStart: 0,
        normalizedEnd: 1,
        sourceStart: 0,
        sourceEnd: 2
      }
    ]);
  });

  it("maps an NFC match for e acute back to the raw NFD source range", () => {
    const sourceMap = createNormalizedTextWithSourceMap("A e\u0301 B", {
      normalizeToNfc: true
    });
    const normalizedStart = sourceMap.normalizedText.indexOf("é");

    expect(normalizedStart).toBe(2);
    expect(
      mapNormalizedRangeToSourceRange(
        sourceMap,
        normalizedStart,
        normalizedStart + 1
      )
    ).toEqual({ start: 2, end: 4 });
  });

  it("maps mixed ASCII, Japanese, and combining-mark offsets back to raw UTF-16 source ranges", () => {
    const raw = "Aか\u3099B e\u0301猫";
    const sourceMap = createNormalizedTextWithSourceMap(raw, {
      normalizeToNfc: true
    });

    expect(sourceMap.normalizedText).toBe("AがB é猫");
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, 1)).toEqual({
      start: 0,
      end: 1
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 1, 2)).toEqual({
      start: 1,
      end: 3
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 2, 4)).toEqual({
      start: 3,
      end: 5
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 4, 5)).toEqual({
      start: 5,
      end: 7
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 5, 6)).toEqual({
      start: 7,
      end: 8
    });
  });

  it("maps multiple normalized spans in one source string", () => {
    const raw = "e\u0301 and か\u3099";
    const sourceMap = createNormalizedTextWithSourceMap(raw, {
      normalizeToNfc: true
    });

    expect(sourceMap.normalizedText).toBe("é and が");
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, 1)).toEqual({
      start: 0,
      end: 2
    });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 6, 7)).toEqual({
      start: 7,
      end: 9
    });
    expect(
      mapNormalizedRangeToSourceRange(sourceMap, 0, sourceMap.normalizedText.length)
    ).toEqual({ start: 0, end: raw.length });
  });

  it("maps a range inside one normalized span back to the full raw source span", () => {
    const raw = "e\u0323\u0301";
    const sourceMap = createNormalizedTextWithSourceMap(raw, {
      normalizeToNfc: true
    });

    expect(sourceMap.normalizedText.length).toBe(2);
    expect(mapNormalizedRangeToSourceRange(sourceMap, 1, 2)).toEqual({
      start: 0,
      end: raw.length
    });
  });

  it("handles empty strings", () => {
    const sourceMap = createNormalizedTextWithSourceMap("", {
      normalizeToNfc: true
    });

    expect(sourceMap).toEqual({ normalizedText: "", spans: [] });
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, 0)).toBeNull();
  });

  it("returns null for invalid normalized ranges", () => {
    const sourceMap = createNormalizedTextWithSourceMap("abc", {
      normalizeToNfc: false
    });

    expect(mapNormalizedRangeToSourceRange(sourceMap, -1, 1)).toBeNull();
    expect(mapNormalizedRangeToSourceRange(sourceMap, 1, 1)).toBeNull();
    expect(mapNormalizedRangeToSourceRange(sourceMap, 2, 1)).toBeNull();
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, 4)).toBeNull();
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0.5, 1)).toBeNull();
    expect(mapNormalizedRangeToSourceRange(sourceMap, 0, Number.NaN)).toBeNull();
  });
});
