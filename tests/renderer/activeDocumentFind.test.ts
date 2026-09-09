import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
  resolveActiveFindCursor,
  runActiveDocumentFind
} from "../../src/renderer/find/activeDocumentFind";

describe("runActiveDocumentFind (#424 Slice 1)", () => {
  it("returns no matches for an empty query", () => {
    expect(runActiveDocumentFind("hello hello", "")).toEqual([]);
  });

  it("returns no matches for empty text", () => {
    expect(runActiveDocumentFind("", "hello")).toEqual([]);
  });

  it("finds every plain-text occurrence with document offsets", () => {
    const matches = runActiveDocumentFind("ab cab abc", "ab");
    expect(matches.map((m) => [m.startOffset, m.endOffset])).toEqual([
      [0, 2],
      [4, 6],
      [7, 9]
    ]);
    expect(matches[0].matchedText).toBe("ab");
  });

  it("is case-insensitive by default", () => {
    const matches = runActiveDocumentFind("Alpha ALPHA alpha", "alpha");
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => m.matchedText)).toEqual([
      "Alpha",
      "ALPHA",
      "alpha"
    ]);
  });

  it("matches Japanese substrings", () => {
    const matches = runActiveDocumentFind("メイド服とメイドさん", "メイド");
    expect(matches.map((m) => m.startOffset)).toEqual([0, 5]);
  });

  it("uses the shared plain-text defaults (no whole-word / no regex)", () => {
    expect(DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS).toEqual({
      caseSensitive: false,
      wholeWord: false,
      useRegex: false
    });
    // `.` is a literal, not "any char", because useRegex is false.
    expect(runActiveDocumentFind("a.b axb", ".")).toHaveLength(1);
  });
});

describe("resolveActiveFindCursor (#424 Slice 1)", () => {
  it("returns null when there are no matches", () => {
    expect(resolveActiveFindCursor(0, null, "next")).toBeNull();
    expect(resolveActiveFindCursor(0, 3, "previous")).toBeNull();
  });

  it("starts at the first match for next / last match for previous when index is null", () => {
    expect(resolveActiveFindCursor(5, null, "next")).toBe(0);
    expect(resolveActiveFindCursor(5, null, "previous")).toBe(4);
  });

  it("treats an out-of-range index like null", () => {
    expect(resolveActiveFindCursor(3, 9, "next")).toBe(0);
    expect(resolveActiveFindCursor(3, -1, "previous")).toBe(2);
  });

  it("steps forward and wraps around at the end", () => {
    expect(resolveActiveFindCursor(3, 0, "next")).toBe(1);
    expect(resolveActiveFindCursor(3, 1, "next")).toBe(2);
    expect(resolveActiveFindCursor(3, 2, "next")).toBe(0);
  });

  it("steps backward and wraps around at the start", () => {
    expect(resolveActiveFindCursor(3, 2, "previous")).toBe(1);
    expect(resolveActiveFindCursor(3, 1, "previous")).toBe(0);
    expect(resolveActiveFindCursor(3, 0, "previous")).toBe(2);
  });

  it("stays put with a single match", () => {
    expect(resolveActiveFindCursor(1, 0, "next")).toBe(0);
    expect(resolveActiveFindCursor(1, 0, "previous")).toBe(0);
  });
});
