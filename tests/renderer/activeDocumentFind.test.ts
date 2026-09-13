import { describe, expect, it } from "vitest";
import {
  activeDocumentReplacementTemplateError,
  type ActiveDocumentFindMatchOptions,
  buildActiveDocumentReplaceAllChanges,
  buildActiveDocumentReplacement,
  clampActiveFindIndex,
  DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
  evaluateActiveDocumentFind,
  replacementTemplateErrorTranslationKey,
  resolveActiveFindCursor,
  resolveActiveFindIndexAfterReplaceAll,
  resolveActiveFindIndexAfterReplacement,
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
  const NFC_ON = { normalizeUnicodeToNfc: true } as const;
  const NFC_OFF = { normalizeUnicodeToNfc: false } as const;

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

  describe("#456: multiline query text", () => {
    it("finds a query spanning a newline as one match covering the full raw span", () => {
      const text = "before\nfoo\nbar\nafter";
      const result = evaluateActiveDocumentFind(text, "foo\nbar", opts());

      expect(result.regexError).toBeNull();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]).toMatchObject({
        startOffset: text.indexOf("foo"),
        endOffset: text.indexOf("bar") + "bar".length,
        matchedText: "foo\nbar"
      });
    });

    it("preserves leading/trailing spaces and newlines in the query itself", () => {
      const text = "xx  foo\nbar  yy";
      const result = evaluateActiveDocumentFind(text, "  foo\nbar  ", opts());

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedText).toBe("  foo\nbar  ");
    });

    it("treats a whitespace/newline-only query as empty (trimmed) - not a match or an error", () => {
      expect(evaluateActiveDocumentFind("foo\nbar", "\n\n", opts())).toEqual({
        matches: [],
        regexError: null
      });
      expect(evaluateActiveDocumentFind("foo\nbar", "   ", opts())).toEqual({
        matches: [],
        regexError: null
      });
    });

    it("a non-blank multiline query (with surrounding newlines) is NOT treated as empty", () => {
      const result = evaluateActiveDocumentFind("xx foo yy", "\nfoo\n", opts());
      // The raw query (with its newlines) does not literally occur in the
      // text, so it legitimately finds nothing - but this must NOT be the
      // "empty query" no-search path (no regexError, ok to search).
      expect(result).toEqual({ matches: [], regexError: null });
      const found = evaluateActiveDocumentFind("xx \nfoo\n yy", "\nfoo\n", opts());
      expect(found.matches).toHaveLength(1);
    });

    it("#453: NFC matching still works across a multiline match", () => {
      const nfdCafe = "café";
      const text = `xx\n${nfdCafe}\nyy`;
      const result = evaluateActiveDocumentFind(text, "café", opts(), NFC_ON);

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedText).toBe(nfdCafe);
    });

    it("regex mode remains raw with an explicit \\n in the pattern", () => {
      const result = evaluateActiveDocumentFind(
        "foo\nbar",
        "foo\\nbar",
        opts({ useRegex: true })
      );
      expect(result.regexError).toBeNull();
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].matchedText).toBe("foo\nbar");
    });
  });

  it("#453 Slice 3: matches NFC query against NFD text when normalization is on", () => {
    const nfdCafe = "cafe\u0301";
    const result = evaluateActiveDocumentFind(
      `xx ${nfdCafe} yy`,
      "café",
      opts(),
      NFC_ON
    );

    expect(result.regexError).toBeNull();
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      startOffset: 3,
      endOffset: 8,
      matchedText: nfdCafe
    });
  });

  it("#453 Slice 3: matches NFD query against NFC text when normalization is on", () => {
    const result = evaluateActiveDocumentFind(
      "xx café yy",
      "cafe\u0301",
      opts(),
      NFC_ON
    );

    expect(result.regexError).toBeNull();
    expect(result.matches[0]).toMatchObject({
      startOffset: 3,
      endOffset: 7,
      matchedText: "café"
    });
  });

  it("#453 Slice 3: preserves raw matching when normalization is off", () => {
    const nfdCafe = "cafe\u0301";

    expect(
      evaluateActiveDocumentFind(`xx ${nfdCafe} yy`, "café", opts(), NFC_OFF)
        .matches
    ).toEqual([]);
    expect(
      evaluateActiveDocumentFind(`xx ${nfdCafe} yy`, nfdCafe, opts(), NFC_OFF)
        .matches[0]
    ).toMatchObject({
      startOffset: 3,
      endOffset: 8,
      matchedText: nfdCafe
    });
  });

  it("#453 Slice 3: keeps regex raw even when normalization is on", () => {
    const nfdCafe = "cafe\u0301";

    const result = evaluateActiveDocumentFind(
      `xx ${nfdCafe} yy`,
      "café",
      opts({ useRegex: true }),
      NFC_ON
    );

    expect(result.regexError).toBeNull();
    expect(result.matches).toEqual([]);
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

describe("buildActiveDocumentReplacement (#424 Slice 3)", () => {
  const plain = DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS;
  const regex = { ...DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS, useRegex: true };
  const NFC_ON: ActiveDocumentFindMatchOptions = { normalizeUnicodeToNfc: true };
  const NFC_OFF: ActiveDocumentFindMatchOptions = {
    normalizeUnicodeToNfc: false
  };

  function firstMatch(
    text: string,
    query: string,
    options = plain,
    matchOptions = NFC_OFF
  ) {
    const m = evaluateActiveDocumentFind(
      text,
      query,
      options,
      matchOptions
    ).matches[0];
    if (!m) throw new Error("no match");
    return m;
  }

  it("plain mode returns the replacement text verbatim", () => {
    const text = "one two one";
    const result = buildActiveDocumentReplacement(
      text,
      firstMatch(text, "one"),
      "1",
      plain,
      "one"
    );
    expect(result).toEqual({ ok: true, replacement: "1" });
  });

  it("an empty replacement deletes the match", () => {
    const text = "keep DROP keep";
    const result = buildActiveDocumentReplacement(
      text,
      firstMatch(text, "DROP"),
      "",
      plain,
      "DROP"
    );
    expect(result).toEqual({ ok: true, replacement: "" });
  });

  it("regex $1 expands the capture group", () => {
    const text = "value: (foo)";
    const pattern = String.raw`\((\w+)\)`;
    const result = buildActiveDocumentReplacement(
      text,
      firstMatch(text, pattern, regex),
      "$1bar",
      regex,
      pattern
    );
    expect(result).toEqual({ ok: true, replacement: "foobar" });
  });

  it("regex ${1} and $$ behave like project replace", () => {
    const text = "ab";
    const m = firstMatch(text, "(a)(b)", regex);
    expect(
      buildActiveDocumentReplacement(text, m, "${2}${1}", regex, "(a)(b)")
    ).toEqual({ ok: true, replacement: "ba" });
    expect(
      buildActiveDocumentReplacement(text, m, "$$1", regex, "(a)(b)")
    ).toEqual({ ok: true, replacement: "$1" });
  });

  it("#424 Slice 3 dogfood: $${1} is a literal $ then literal {1} (matches project replace)", () => {
    const text = "ab";
    const m = firstMatch(text, "(a)(b)", regex);
    expect(
      buildActiveDocumentReplacement(text, m, "$${1}", regex, "(a)(b)")
    ).toEqual({ ok: true, replacement: "${1}" });
    // and $$$1 is a literal $ then group 1
    expect(
      buildActiveDocumentReplacement(text, m, "$$$1", regex, "(a)(b)")
    ).toEqual({ ok: true, replacement: "$a" });
  });

  it("rejects an unsupported / missing-group template in regex mode", () => {
    const text = "foo";
    const m = firstMatch(text, "(foo)", regex);
    expect(
      buildActiveDocumentReplacement(text, m, "$&", regex, "(foo)")
    ).toEqual({ ok: false, templateError: "unsupportedSequence" });
    expect(
      buildActiveDocumentReplacement(text, m, "$2", regex, "(foo)")
    ).toEqual({ ok: false, templateError: "missingGroup" });
  });

  it("a $-template is literal in plain mode", () => {
    const text = "x";
    const result = buildActiveDocumentReplacement(
      text,
      firstMatch(text, "x"),
      "$1$&",
      plain,
      "x"
    );
    expect(result).toEqual({ ok: true, replacement: "$1$&" });
  });

  it("#453 Slice 4: replace-current uses the raw NFD source range for an NFC query", () => {
    const nfdCafe = "cafe\u0301";
    const text = `A ${nfdCafe} B`;
    const match = firstMatch(text, "café", plain, NFC_ON);

    expect(match).toMatchObject({
      startOffset: 2,
      endOffset: 7,
      matchedText: nfdCafe
    });
    expect(
      buildActiveDocumentReplacement(text, match, "X", plain, "café")
    ).toEqual({ ok: true, replacement: "X" });
    expect(
      text.slice(0, match.startOffset) +
        "X" +
        text.slice(match.endOffset)
    ).toBe("A X B");
  });

  it("#453 Slice 4: replace-current uses the raw NFC source range for an NFD query", () => {
    const text = "A café B";
    const match = firstMatch(text, "cafe\u0301", plain, NFC_ON);

    expect(match).toMatchObject({
      startOffset: 2,
      endOffset: 6,
      matchedText: "café"
    });
    expect(
      buildActiveDocumentReplacement(text, match, "Y", plain, "cafe\u0301")
    ).toEqual({ ok: true, replacement: "Y" });
    expect(
      text.slice(0, match.startOffset) +
        "Y" +
        text.slice(match.endOffset)
    ).toBe("A Y B");
  });

  it("#453 Slice 4: replace-current preserves raw matching when normalization is off", () => {
    const nfdCafe = "cafe\u0301";
    const text = `A ${nfdCafe} B`;

    expect(
      evaluateActiveDocumentFind(text, "café", plain, NFC_OFF).matches
    ).toEqual([]);
    expect(firstMatch(text, nfdCafe, plain, NFC_OFF)).toMatchObject({
      startOffset: 2,
      endOffset: 7,
      matchedText: nfdCafe
    });
  });

  it("#453 Slice 4: regex replace-current remains raw even when normalization is on", () => {
    const nfdCafe = "cafe\u0301";

    expect(
      evaluateActiveDocumentFind(
        `A ${nfdCafe} B`,
        "café",
        regex,
        NFC_ON
      ).matches
    ).toEqual([]);
  });

  describe("#456: multiline find text and replacement text", () => {
    it("finds a multiline query and replace-current returns the raw match span", () => {
      const text = "before\nfoo\nbar\nafter";
      const match = firstMatch(text, "foo\nbar");
      expect(match).toMatchObject({
        startOffset: text.indexOf("foo"),
        endOffset: text.indexOf("bar") + "bar".length,
        matchedText: "foo\nbar"
      });
      expect(
        buildActiveDocumentReplacement(text, match, "baz", plain, "foo\nbar")
      ).toEqual({ ok: true, replacement: "baz" });
    });

    it("replacement text may contain newlines, used verbatim (not trimmed, not NFC-normalized)", () => {
      const text = "foo";
      const match = firstMatch(text, "foo");
      const result = buildActiveDocumentReplacement(
        text,
        match,
        " bar\nbaz\n",
        plain,
        "foo"
      );
      expect(result).toEqual({ ok: true, replacement: " bar\nbaz\n" });
    });
  });
});

describe("activeDocumentReplacementTemplateError (#424 Slice 3)", () => {
  it("is null outside regex mode", () => {
    expect(
      activeDocumentReplacementTemplateError(
        "$&",
        DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS,
        "q"
      )
    ).toBeNull();
  });

  it("reports the enum for an invalid template in regex mode", () => {
    const regex = { ...DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS, useRegex: true };
    expect(
      activeDocumentReplacementTemplateError("$&", regex, "(a)")
    ).toBe("unsupportedSequence");
    expect(
      activeDocumentReplacementTemplateError("$3", regex, "(a)")
    ).toBe("missingGroup");
    expect(
      activeDocumentReplacementTemplateError("$1", regex, "(a)")
    ).toBeNull();
  });

  it("maps error enums to the shared project-replace i18n keys", () => {
    expect(replacementTemplateErrorTranslationKey("missingGroup")).toBe(
      "search.replace.template.missingGroup"
    );
    expect(replacementTemplateErrorTranslationKey("unsupportedSequence")).toBe(
      "search.replace.template.unsupported"
    );
    expect(replacementTemplateErrorTranslationKey("ambiguousReference")).toBe(
      "search.replace.template.unsupported"
    );
  });
});

describe("buildActiveDocumentReplaceAllChanges (#424 Slice 4)", () => {
  const plain = DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS;
  const regex = { ...DEFAULT_ACTIVE_DOCUMENT_FIND_OPTIONS, useRegex: true };
  const NFC_ON: ActiveDocumentFindMatchOptions = { normalizeUnicodeToNfc: true };

  function allMatches(
    text: string,
    query: string,
    options = plain,
    matchOptions: ActiveDocumentFindMatchOptions = {
      normalizeUnicodeToNfc: false
    }
  ) {
    return evaluateActiveDocumentFind(
      text,
      query,
      options,
      matchOptions
    ).matches;
  }

  it("builds one change per match for plain text (offsets from one snapshot)", () => {
    const text = "cat cot cat";
    const result = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, "cat"),
      "dog",
      plain,
      "cat"
    );
    expect(result).toEqual({
      ok: true,
      changes: [
        { from: 0, to: 3, insert: "dog" },
        { from: 8, to: 11, insert: "dog" }
      ]
    });
  });

  it("an empty replacement deletes every match", () => {
    const text = "a-b-c";
    const result = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, "-"),
      "",
      plain,
      "-"
    );
    expect(result).toEqual({
      ok: true,
      changes: [
        { from: 1, to: 2, insert: "" },
        { from: 3, to: 4, insert: "" }
      ]
    });
  });

  it("returns no changes when there are no matches", () => {
    const result = buildActiveDocumentReplaceAllChanges(
      "nothing here",
      [],
      "x",
      plain,
      "zzz"
    );
    expect(result).toEqual({ ok: true, changes: [] });
  });

  it("regex $1 / ${1} expand per match against that match's captures", () => {
    const text = "(foo) and (barbar)";
    const pattern = String.raw`\((\w+)\)`;
    const dollar = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, pattern, regex),
      "[$1]",
      regex,
      pattern
    );
    expect(dollar).toEqual({
      ok: true,
      changes: [
        { from: 0, to: 5, insert: "[foo]" },
        { from: 10, to: 18, insert: "[barbar]" }
      ]
    });
    const braced = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, pattern, regex),
      "${1}!",
      regex,
      pattern
    );
    expect(braced.ok && braced.changes.map((c) => c.insert)).toEqual([
      "foo!",
      "barbar!"
    ]);
  });

  it("$$ produces a literal $ in every change", () => {
    const text = "ab ab";
    const result = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, "(a)(b)", regex),
      "$$$1",
      regex,
      "(a)(b)"
    );
    expect(result.ok && result.changes.map((c) => c.insert)).toEqual([
      "$a",
      "$a"
    ]);
  });

  it("an invalid replacement template rejects the whole batch", () => {
    const text = "foo foo";
    expect(
      buildActiveDocumentReplaceAllChanges(
        text,
        allMatches(text, "(foo)", regex),
        "$&",
        regex,
        "(foo)"
      )
    ).toEqual({ ok: false, templateError: "unsupportedSequence" });
    expect(
      buildActiveDocumentReplaceAllChanges(
        text,
        allMatches(text, "(foo)", regex),
        "$2",
        regex,
        "(foo)"
      )
    ).toEqual({ ok: false, templateError: "missingGroup" });
  });

  it("a $-template stays literal in plain mode", () => {
    const text = "x x";
    const result = buildActiveDocumentReplaceAllChanges(
      text,
      allMatches(text, "x"),
      "$1$&",
      plain,
      "x"
    );
    expect(result.ok && result.changes.map((c) => c.insert)).toEqual([
      "$1$&",
      "$1$&"
    ]);
  });

  it("#453 Slice 4: replace-all uses raw ranges for multiple normalized matches without drift", () => {
    const nfdCafe = "cafe\u0301";
    const text = `${nfdCafe} / ${nfdCafe}`;
    const matches = allMatches(text, "café", plain, NFC_ON);

    expect(matches.map((match) => [match.startOffset, match.endOffset])).toEqual(
      [
        [0, 5],
        [8, 13]
      ]
    );
    expect(
      buildActiveDocumentReplaceAllChanges(text, matches, "X", plain, "café")
    ).toEqual({
      ok: true,
      changes: [
        { from: 0, to: 5, insert: "X" },
        { from: 8, to: 13, insert: "X" }
      ]
    });
  });

  it("#456: multiple multiline matches do not drift", () => {
    const text = "A\nfoo\nbar\nB\nfoo\nbar\nC";
    const matches = allMatches(text, "foo\nbar");
    expect(matches.map((m) => [m.startOffset, m.endOffset])).toEqual([
      [2, 9],
      [12, 19]
    ]);

    const result = buildActiveDocumentReplaceAllChanges(
      text,
      matches,
      "X",
      plain,
      "foo\nbar"
    );
    expect(result).toEqual({
      ok: true,
      changes: [
        { from: 2, to: 9, insert: "X" },
        { from: 12, to: 19, insert: "X" }
      ]
    });
  });

  it("#456: a multiline replacement is used verbatim for every match", () => {
    const text = "foo x foo";
    const matches = allMatches(text, "foo");
    const result = buildActiveDocumentReplaceAllChanges(
      text,
      matches,
      "bar\nbaz",
      plain,
      "foo"
    );
    expect(result.ok && result.changes.map((c) => c.insert)).toEqual([
      "bar\nbaz",
      "bar\nbaz"
    ]);
  });
});

describe("resolveActiveFindIndexAfterReplaceAll (#424 Slice 4)", () => {
  it("lands on the first match when any remain", () => {
    expect(resolveActiveFindIndexAfterReplaceAll([{}, {}, {}])).toBe(0);
  });

  it("clears the cursor when nothing is left", () => {
    expect(resolveActiveFindIndexAfterReplaceAll([])).toBeNull();
  });
});

describe("resolveActiveFindIndexAfterReplacement (#424 Slice 3)", () => {
  const at = (offsets: number[]) => offsets.map((startOffset) => ({ startOffset }));

  it("returns null when no matches remain", () => {
    expect(resolveActiveFindIndexAfterReplacement([], 10)).toBeNull();
  });

  it("picks the first match at or after the replacement start", () => {
    expect(
      resolveActiveFindIndexAfterReplacement(at([2, 8, 20]), 8)
    ).toBe(1);
    expect(
      resolveActiveFindIndexAfterReplacement(at([2, 8, 20]), 9)
    ).toBe(2);
  });

  it("wraps to the first match when nothing is left after that point", () => {
    expect(
      resolveActiveFindIndexAfterReplacement(at([2, 8]), 50)
    ).toBe(0);
  });
});
