import { describe, expect, it } from "vitest";
import type { FindGlossaryCandidate } from "../../src/renderer/find/findGlossaryPicker";
import { buildActiveGlossaryFindTerms } from "../../src/renderer/find/activeGlossaryFind";
import {
  DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS,
  findParagraphIndexForOffset,
  runActiveGlossaryNearbyFind,
  segmentParagraphs,
  type ActiveGlossaryNearbySettings
} from "../../src/renderer/find/activeGlossaryNearbySearch";

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
  candidate({ atomId: "a1", entryId: "e1", value: "シズク" }),
  candidate({
    atomId: "a2",
    entryId: "e1",
    value: "迷子",
    entryLabel: "シズク",
    isRepresentative: false
  }),
  candidate({ atomId: "a3", entryId: "e2", value: "港町" })
];
const terms = (ids: string[]) => buildActiveGlossaryFindTerms(CANDIDATES, ids);

const chars = (n: number): ActiveGlossaryNearbySettings => ({
  unit: "characters",
  characterDistance: n,
  paragraphDistance: 2
});
const paras = (n: number): ActiveGlossaryNearbySettings => ({
  unit: "paragraphs",
  characterDistance: 500,
  paragraphDistance: n
});

describe("segmentParagraphs (#424 Slice 7)", () => {
  it("splits on blank lines; whitespace-only lines are separators", () => {
    const text = "これは1段落目です。\nまだ1段落目です。\n\n  \nこれは2段落目です。";
    const paragraphs = segmentParagraphs(text);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].index).toBe(0);
    expect(paragraphs[1].index).toBe(1);
    expect(text.slice(paragraphs[0].startOffset, paragraphs[0].endOffset)).toContain(
      "1段落目"
    );
    expect(text.slice(paragraphs[1].startOffset, paragraphs[1].endOffset)).toContain(
      "2段落目"
    );
  });

  it("findParagraphIndexForOffset locates the containing paragraph", () => {
    const text = "AAA\n\nBBB\n\nCCC";
    const paragraphs = segmentParagraphs(text);
    expect(findParagraphIndexForOffset(paragraphs, 0)).toBe(0);
    expect(findParagraphIndexForOffset(paragraphs, text.indexOf("BBB"))).toBe(1);
    expect(findParagraphIndexForOffset(paragraphs, text.indexOf("CCC"))).toBe(2);
  });
});

describe("runActiveGlossaryNearbyFind — characters (#424 Slice 7)", () => {
  it("returns both atoms when they sit within N characters", () => {
    const text = "シズクは迷子になった。";
    const matches = runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), chars(20));
    expect(matches.map((m) => m.matchedText).sort()).toEqual(["シズク", "迷子"]);
  });

  it("excludes an occurrence pair farther apart than N characters", () => {
    const filler = "あ".repeat(60);
    const text = `シズク${filler}迷子 そして近くのシズクと迷子。`;
    // characterDistance 10: only the tight trailing pair participates
    const matches = runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), chars(10));
    const offsets = matches.map((m) => m.startOffset);
    // the leading シズク (offset 0) is too far from any 迷子 → excluded
    expect(offsets).not.toContain(0);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("overlapping / adjacent occurrences count as distance 0", () => {
    const text = "迷子シズク";
    const matches = runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), chars(0));
    expect(matches.map((m) => m.matchedText).sort()).toEqual(["シズク", "迷子"]);
  });

  it("3 atoms require all three inside one window", () => {
    const near = "港町でシズクが迷子。";
    const far = "港町。".repeat(40) + "シズク";
    expect(
      runActiveGlossaryNearbyFind(near, terms(["a1", "a2", "a3"]), chars(20)).length
    ).toBe(3);
    expect(
      runActiveGlossaryNearbyFind(far, terms(["a1", "a2", "a3"]), chars(20))
    ).toEqual([]);
  });
});

describe("runActiveGlossaryNearbyFind — paragraphs (#424 Slice 7)", () => {
  const text = [
    "シズクの登場する段落。", // paragraph 0
    "",
    "何も起きない段落。", // paragraph 1
    "",
    "ここで迷子になる段落。", // paragraph 2
    "",
    "さらに次の段落。" // paragraph 3
  ].join("\n");

  it("distance 0 → same paragraph only", () => {
    const same = "シズクと迷子が同じ段落。\n\n別の段落。";
    expect(
      runActiveGlossaryNearbyFind(same, terms(["a1", "a2"]), paras(0)).map(
        (m) => m.matchedText
      )
    ).toEqual(["シズク", "迷子"]);
    // シズク @ p0, 迷子 @ p2 → 2 apart → excluded at distance 0
    expect(runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), paras(0))).toEqual(
      []
    );
  });

  it("distance 1 excludes a 2-paragraph gap", () => {
    expect(runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), paras(1))).toEqual(
      []
    );
  });

  it("distance 2 includes a 2-paragraph gap", () => {
    const matches = runActiveGlossaryNearbyFind(text, terms(["a1", "a2"]), paras(2));
    expect(matches.map((m) => m.matchedText).sort()).toEqual(["シズク", "迷子"]);
  });
});

describe("runActiveGlossaryNearbyFind — selection count semantics (#424 Slice 7)", () => {
  it("0 selected atoms → no matches", () => {
    expect(runActiveGlossaryNearbyFind("シズク 迷子", terms([]), chars(50))).toEqual(
      []
    );
  });

  it("1 selected atom behaves like Any (every occurrence)", () => {
    const text = "シズク。シズク。シズク。";
    expect(
      runActiveGlossaryNearbyFind(text, terms(["a1"]), chars(1)).map(
        (m) => m.startOffset
      )
    ).toEqual([0, 4, 8]);
  });

  it("results are offset-sorted and de-duplicated", () => {
    const text = "港町シズク迷子、港町シズク迷子。";
    const matches = runActiveGlossaryNearbyFind(
      text,
      terms(["a1", "a2", "a3"]),
      chars(30)
    );
    const offsets = matches.map((m) => m.startOffset);
    expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("uses the selected atom's RAW value (non-representative), matchFlags respected", () => {
    // matchFlags 0 = plain substring; 迷子 raw value is searched, not シズク
    const text = "シズクだけ" + "。".repeat(40) + "迷子とシズクが近い。";
    const matches = runActiveGlossaryNearbyFind(text, terms(["a2", "a1"]), chars(10));
    expect(matches.some((m) => m.matchedText === "迷子")).toBe(true);
    // the lone leading シズク (offset 0) has no 迷子 within 10 chars → excluded
    expect(matches.map((m) => m.startOffset)).not.toContain(0);
  });

  it("exposes catalog-backed defaults", () => {
    expect(DEFAULT_ACTIVE_GLOSSARY_NEARBY_SETTINGS).toEqual({
      unit: "paragraphs",
      characterDistance: 500,
      paragraphDistance: 2
    });
  });
});
