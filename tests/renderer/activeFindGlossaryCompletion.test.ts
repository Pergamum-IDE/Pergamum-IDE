import { describe, expect, it } from "vitest";
import type { FindGlossaryCandidate } from "../../src/renderer/find/findGlossaryPicker";
import {
  ACTIVE_FIND_GLOSSARY_COMPLETION_LIMIT,
  activeFindGlossaryAtomValues,
  applyActiveFindGlossaryCompletion,
  collectActiveFindGlossaryCompletionItems,
  resolveActiveFindGlossaryCompletionPrefix
} from "../../src/renderer/find/activeFindGlossaryCompletion";

function candidate(
  overrides: Partial<FindGlossaryCandidate> = {}
): FindGlossaryCandidate {
  return {
    atomId: "a1",
    entryId: "e1",
    value: "シズク",
    matchFlags: 0,
    entryLabel: "シズク",
    isRepresentative: true,
    ...overrides
  };
}

const CANDIDATES: FindGlossaryCandidate[] = [
  candidate({ atomId: "a1", value: "シズク", entryLabel: "シズク", isRepresentative: true }),
  candidate({
    atomId: "a2",
    value: "迷子",
    entryLabel: "シズク",
    isRepresentative: false
  }),
  candidate({ atomId: "a3", value: "港町", entryLabel: "港町", isRepresentative: true }),
  candidate({
    atomId: "a4",
    value: "みなとまち",
    entryLabel: "港町",
    isRepresentative: false
  })
];

const ATOM_VALUES = activeFindGlossaryAtomValues(CANDIDATES);

describe("resolveActiveFindGlossaryCompletionPrefix (#424 Slice 5)", () => {
  it("query target uses the whole input value (ignores caret / atom values)", () => {
    expect(
      resolveActiveFindGlossaryCompletionPrefix("query", "みなと", 2, ATOM_VALUES)
    ).toBe("みなと");
  });

  it("replace target reuses the editor's suffix strategy against the atom values", () => {
    // caret after the standalone "迷" — it is a startsWith-prefix of "迷子"
    expect(
      resolveActiveFindGlossaryCompletionPrefix(
        "replace",
        "彼はふいに迷",
        "彼はふいに迷".length,
        ATOM_VALUES
      )
    ).toBe("迷");
  });

  it("replace target falls back to the delimiter-bounded run", () => {
    expect(
      resolveActiveFindGlossaryCompletionPrefix(
        "replace",
        "こんにちは 世界",
        "こんにちは 世界".length,
        ATOM_VALUES
      )
    ).toBe("世界");
  });

  it("replace target clamps an out-of-range caret", () => {
    expect(
      resolveActiveFindGlossaryCompletionPrefix("replace", "abc", 999, ATOM_VALUES)
    ).toBe("abc");
  });
});

describe("collectActiveFindGlossaryCompletionItems (#424 Slice 5)", () => {
  it("returns shared display items (representative + non-representative) for an empty prefix", () => {
    const items = collectActiveFindGlossaryCompletionItems(CANDIDATES, "");
    expect(items.map((item) => item.value)).toEqual([
      "シズク",
      "迷子",
      "港町",
      "みなとまち"
    ]);
    // insertText is always the RAW value
    expect(items.map((item) => item.insertText)).toEqual([
      "シズク",
      "迷子",
      "港町",
      "みなとまち"
    ]);
  });

  it("representative form has no detail; non-representative shows → representative", () => {
    const items = collectActiveFindGlossaryCompletionItems(CANDIDATES, "");
    expect(items.find((i) => i.value === "シズク")!.detail).toBeNull();
    expect(items.find((i) => i.value === "迷子")!.detail).toBe("→ シズク");
    expect(items.find((i) => i.value === "みなとまち")!.detail).toBe("→ 港町");
  });

  it("prefix-filters by startsWith (never substring), keeping project order", () => {
    expect(
      collectActiveFindGlossaryCompletionItems(CANDIDATES, "みな").map(
        (i) => i.value
      )
    ).toEqual(["みなとまち"]);
    expect(
      collectActiveFindGlossaryCompletionItems(CANDIDATES, "なとまち")
    ).toEqual([]);
  });

  it("never normalizes the picked value to the representative", () => {
    const [alias] = collectActiveFindGlossaryCompletionItems(CANDIDATES, "迷");
    expect(alias.value).toBe("迷子");
    expect(alias.insertText).toBe("迷子");
  });

  it("caps the list at the Slice 5 limit for an empty prefix", () => {
    const many: FindGlossaryCandidate[] = Array.from(
      { length: ACTIVE_FIND_GLOSSARY_COMPLETION_LIMIT + 25 },
      (_unused, index) =>
        candidate({ atomId: `m${index}`, value: `語${index}` })
    );
    expect(
      collectActiveFindGlossaryCompletionItems(many, "")
    ).toHaveLength(ACTIVE_FIND_GLOSSARY_COMPLETION_LIMIT);
  });
});

describe("applyActiveFindGlossaryCompletion (#424 Slice 5)", () => {
  it("query target replaces the WHOLE value and puts the caret at the end", () => {
    expect(
      applyActiveFindGlossaryCompletion({
        value: "old query text",
        selectionStart: 3,
        selectionEnd: 3,
        insertText: "迷子",
        target: "query"
      })
    ).toEqual({ value: "迷子", selectionStart: 2, selectionEnd: 2 });
  });

  it("replace target inserts at the caret when no prefix was covered", () => {
    expect(
      applyActiveFindGlossaryCompletion({
        value: "（）",
        selectionStart: 1,
        selectionEnd: 1,
        insertText: "迷子",
        target: "replace",
        replacePrefixLength: 0
      })
    ).toEqual({ value: "（迷子）", selectionStart: 3, selectionEnd: 3 });
  });

  it("replace target consumes the covered completion prefix (editor parity)", () => {
    // user typed "迷", the popup matched it, picking "迷子" replaces the "迷"
    expect(
      applyActiveFindGlossaryCompletion({
        value: "冒頭、迷",
        selectionStart: 4,
        selectionEnd: 4,
        insertText: "迷子",
        target: "replace",
        replacePrefixLength: 1
      })
    ).toEqual({ value: "冒頭、迷子", selectionStart: 5, selectionEnd: 5 });
  });

  it("replace target replaces a real selection and ignores replacePrefixLength", () => {
    expect(
      applyActiveFindGlossaryCompletion({
        value: "keep XXXX keep",
        selectionStart: 5,
        selectionEnd: 9,
        insertText: "迷子",
        target: "replace",
        replacePrefixLength: 3
      })
    ).toEqual({ value: "keep 迷子 keep", selectionStart: 7, selectionEnd: 7 });
  });

  it("replace target normalizes a reversed selection", () => {
    expect(
      applyActiveFindGlossaryCompletion({
        value: "0123456789",
        selectionStart: 7,
        selectionEnd: 3,
        insertText: "X",
        target: "replace"
      })
    ).toEqual({ value: "012X789", selectionStart: 4, selectionEnd: 4 });
  });

  it("does not regex-escape the inserted value", () => {
    expect(
      applyActiveFindGlossaryCompletion({
        value: "",
        selectionStart: 0,
        selectionEnd: 0,
        insertText: "$1(a)",
        target: "replace"
      }).value
    ).toBe("$1(a)");
  });
});
