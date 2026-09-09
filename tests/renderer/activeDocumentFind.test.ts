import { describe, expect, it } from "vitest";
import {
  clampActiveFindIndex,
  DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
  evaluateActiveDocumentFind,
  resolveActiveFindCursor,
  runActiveDocumentFind,
  toggleActiveDocumentFindOption
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

describe("evaluateActiveDocumentFind (#424 Slice 2)", () => {
  const opts = (over: Partial<typeof DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS> = {}) => ({
    ...DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
    ...over
  });

  it("returns matches with no regexError for a plain query", () => {
    const result = evaluateActiveDocumentFind("a a a", "a");
    expect(result.regexError).toBeNull();
    expect(result.matches).toHaveLength(3);
  });

  it("match case: ON distinguishes case, OFF does not", () => {
    expect(
      evaluateActiveDocumentFind("Ab ab", "ab", opts({ caseSensitive: true }))
        .matches
    ).toHaveLength(1);
    expect(
      evaluateActiveDocumentFind("Ab ab", "ab", opts({ caseSensitive: false }))
        .matches
    ).toHaveLength(2);
  });

  it("whole word: ASCII boundary via the shared matcher", () => {
    const withWholeWord = evaluateActiveDocumentFind(
      "maid handmaid maid.",
      "maid",
      opts({ wholeWord: true })
    );
    expect(withWholeWord.matches.map((m) => m.startOffset)).toEqual([0, 14]);
  });

  it("whole word: Japanese katakana-compound rule matches the shared matcher", () => {
    // `メイド` hits `メイド服` but not `ハンドメイド` — identical to project Search.
    const result = evaluateActiveDocumentFind(
      "メイド服 ハンドメイド",
      "メイド",
      opts({ wholeWord: true })
    );
    expect(result.matches.map((m) => m.startOffset)).toEqual([0]);
  });

  it("regex: ON treats the query as a pattern", () => {
    const result = evaluateActiveDocumentFind(
      "a1 b2 c3",
      "[a-z]\\d",
      opts({ useRegex: true })
    );
    expect(result.matches.map((m) => m.matchedText)).toEqual(["a1", "b2", "c3"]);
  });

  it("regex: an invalid pattern returns an error state without throwing", () => {
    const result = evaluateActiveDocumentFind(
      "anything",
      "(",
      opts({ useRegex: true })
    );
    expect(result.matches).toEqual([]);
    expect(typeof result.regexError).toBe("string");
    expect(result.regexError!.length).toBeGreaterThan(0);
  });

  it("an invalid pattern is only an error while regex mode is on", () => {
    const plain = evaluateActiveDocumentFind("a ( b (", "(", opts());
    expect(plain.regexError).toBeNull();
    expect(plain.matches).toHaveLength(2);
  });

  it("an empty query is neither a match nor an error", () => {
    expect(evaluateActiveDocumentFind("text", "", opts({ useRegex: true }))).toEqual(
      { matches: [], regexError: null }
    );
  });
});

describe("toggleActiveDocumentFindOption (#424 Slice 2)", () => {
  it("flips an independent flag", () => {
    expect(
      toggleActiveDocumentFindOption(DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS, "caseSensitive")
    ).toEqual({ caseSensitive: true, wholeWord: false, useRegex: false });
  });

  it("turning regex ON forces whole word OFF", () => {
    expect(
      toggleActiveDocumentFindOption(
        { caseSensitive: false, wholeWord: true, useRegex: false },
        "useRegex"
      )
    ).toEqual({ caseSensitive: false, wholeWord: false, useRegex: true });
  });

  it("turning regex OFF leaves whole word OFF (no auto-restore)", () => {
    expect(
      toggleActiveDocumentFindOption(
        { caseSensitive: false, wholeWord: false, useRegex: true },
        "useRegex"
      )
    ).toEqual({ caseSensitive: false, wholeWord: false, useRegex: false });
  });

  it("toggling whole word ON while regex is ON just sets whole word (owner disables the button anyway)", () => {
    expect(
      toggleActiveDocumentFindOption(
        { caseSensitive: false, wholeWord: false, useRegex: true },
        "wholeWord"
      )
    ).toEqual({ caseSensitive: false, wholeWord: true, useRegex: true });
  });
});

describe("clampActiveFindIndex (#424 Slice 2 review-note fix)", () => {
  it("returns null for zero matches or a null index", () => {
    expect(clampActiveFindIndex(3, 0)).toBeNull();
    expect(clampActiveFindIndex(null, 5)).toBeNull();
  });

  it("clamps an index that fell out of range when the match set shrank", () => {
    expect(clampActiveFindIndex(3, 1)).toBe(0);
    expect(clampActiveFindIndex(9, 4)).toBe(3);
  });

  it("clamps a negative index up to 0", () => {
    expect(clampActiveFindIndex(-2, 4)).toBe(0);
  });

  it("leaves an in-range index untouched", () => {
    expect(clampActiveFindIndex(2, 5)).toBe(2);
  });
});
