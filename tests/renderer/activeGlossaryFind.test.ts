import { describe, expect, it } from "vitest";
import type { FindGlossaryCandidate } from "../../src/renderer/find/findGlossaryPicker";
import {
  ACTIVE_GLOSSARY_FIND_MATCH_LIMIT,
  buildActiveGlossaryFindTerms,
  runActiveGlossaryFind
} from "../../src/renderer/find/activeGlossaryFind";

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
  candidate({ atomId: "a1", entryId: "e1", value: "シズク", isRepresentative: true }),
  candidate({
    atomId: "a2",
    entryId: "e1",
    value: "迷子",
    entryLabel: "シズク",
    isRepresentative: false
  }),
  candidate({ atomId: "a3", entryId: "e2", value: "港町", isRepresentative: true })
];

const terms = (ids: string[]) => buildActiveGlossaryFindTerms(CANDIDATES, ids);

describe("buildActiveGlossaryFindTerms (#424 Slice 6)", () => {
  it("resolves selected ids to raw value + matchFlags, dropping unknown ids", () => {
    expect(terms(["a2", "nope", "a3"]).map((t) => [t.value, t.atomId])).toEqual([
      ["迷子", "a2"],
      ["港町", "a3"]
    ]);
  });

  it("uses the selected atom's RAW value — never the representative form", () => {
    expect(terms(["a2"])[0].value).toBe("迷子");
  });
});

describe("runActiveGlossaryFind — any (#424 Slice 6)", () => {
  const text = "港町でシズクは迷子になった。シズクを探す港町の朝。";

  it("returns every occurrence of any selected atom, ordered by offset", () => {
    const matches = runActiveGlossaryFind(text, terms(["a1", "a3"]), "any");
    expect(matches.map((m) => m.matchedText)).toEqual([
      "港町",
      "シズク",
      "シズク",
      "港町"
    ]);
    const offsets = matches.map((m) => m.startOffset);
    expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
  });

  it("matches the non-representative atom's raw value", () => {
    const matches = runActiveGlossaryFind(text, terms(["a2"]), "any");
    expect(matches.map((m) => m.matchedText)).toEqual(["迷子"]);
  });

  it("empty selection → no matches", () => {
    expect(runActiveGlossaryFind(text, terms([]), "any")).toEqual([]);
  });

  it("empty text → no matches", () => {
    expect(runActiveGlossaryFind("", terms(["a1"]), "any")).toEqual([]);
  });
});

describe("runActiveGlossaryFind — all (document-level) (#424 Slice 6)", () => {
  it("returns every occurrence of every atom when ALL are present in the document", () => {
    const text = "シズクと迷子。もう一度シズク。";
    const matches = runActiveGlossaryFind(text, terms(["a1", "a2"]), "all");
    expect(matches.map((m) => m.matchedText)).toEqual([
      "シズク",
      "迷子",
      "シズク"
    ]);
  });

  it("returns NO matches when one selected atom is absent from the document", () => {
    const text = "シズクだけがいる文章。シズク、シズク。";
    expect(runActiveGlossaryFind(text, terms(["a1", "a2"]), "all")).toEqual([]);
  });

  it("a single selected atom behaves the same under all and any", () => {
    const text = "シズク。シズク。";
    expect(
      runActiveGlossaryFind(text, terms(["a1"]), "all").map((m) => m.startOffset)
    ).toEqual(
      runActiveGlossaryFind(text, terms(["a1"]), "any").map((m) => m.startOffset)
    );
  });
});

describe("runActiveGlossaryFind — determinism (#424 Slice 6)", () => {
  it("is stable across repeated calls", () => {
    const text = "港町シズク迷子港町シズク";
    const once = runActiveGlossaryFind(text, terms(["a1", "a2", "a3"]), "any");
    const twice = runActiveGlossaryFind(text, terms(["a1", "a2", "a3"]), "any");
    expect(twice.map((m) => [m.startOffset, m.endOffset])).toEqual(
      once.map((m) => [m.startOffset, m.endOffset])
    );
  });

  it("exposes a match limit constant", () => {
    expect(ACTIVE_GLOSSARY_FIND_MATCH_LIMIT).toBeGreaterThan(1000);
  });
});
