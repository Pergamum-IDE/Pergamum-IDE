import { describe, expect, it } from "vitest";
import { GlossaryAtomFlags } from "../../src/shared/glossaryAtomFlags";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { buildGlossarySurfaceIndex } from "../../src/shared/glossarySurfaceMatching";
import {
  buildGlossarySurfaceDecorationSegments,
  shouldSkipGlossarySurfaceDecorationTextNode,
  type GlossarySurfaceDecorationAncestor,
  type GlossarySurfaceDecorationSegment
} from "../../src/renderer/glossarySurfaceDecoration";

const ts = "2026-09-02T00:00:00.000Z";
const albertEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000002";

function glossaryEntry(
  id: string,
  atomSpecs: Array<string | [string, number]>
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atomSpecs.map((spec, index) => {
      const [value, matchFlags] =
        typeof spec === "string" ? [spec, 0] : spec;
      return {
        id: `${id}-atom-${index}`,
        entryId: id,
        sortOrder: index,
        value,
        matchFlags,
        createdAt: ts,
        updatedAt: ts
      };
    }),
    tags: [],
    createdAt: ts,
    updatedAt: ts
  };
}

function fixtureEntries(): GlossaryEntry[] {
  return [
    glossaryEntry(albertEntryId, [
      "アルベルト",
      "アル",
      "アルベルト卿",
      "Albert"
    ]),
    glossaryEntry(eclipseEntryId, ["蝕"])
  ];
}

function summarizeSegments(
  segments: readonly GlossarySurfaceDecorationSegment[]
): Array<{ kind: GlossarySurfaceDecorationSegment["kind"]; text: string }> {
  return segments.map((segment) =>
    segment.kind === "plain"
      ? { kind: "plain", text: segment.text }
      : { kind: "match", text: segment.match.matchedText }
  );
}

function ancestor(
  tagName: string,
  parentElement: GlossarySurfaceDecorationAncestor | null = null
): GlossarySurfaceDecorationAncestor {
  return { tagName, parentElement };
}

describe("buildGlossarySurfaceDecorationSegments (#375)", () => {
  it("turns every atom-value match into a match segment", () => {
    const text =
      "アルベルトはアルと呼ばれ、アルベルト卿はAlbertと署名した。";
    const segments = buildGlossarySurfaceDecorationSegments(
      text,
      buildGlossarySurfaceIndex(fixtureEntries())
    );

    expect(summarizeSegments(segments)).toEqual([
      { kind: "match", text: "アルベルト" },
      { kind: "plain", text: "は" },
      { kind: "match", text: "アル" },
      { kind: "plain", text: "と呼ばれ、" },
      { kind: "match", text: "アルベルト卿" },
      { kind: "plain", text: "は" },
      { kind: "match", text: "Albert" },
      { kind: "plain", text: "と署名した。" }
    ]);
  });

  it("keeps non-matching text as a plain segment", () => {
    expect(
      buildGlossarySurfaceDecorationSegments(
        "一致しない本文",
        buildGlossarySurfaceIndex(fixtureEntries())
      )
    ).toEqual([{ kind: "plain", text: "一致しない本文" }]);
  });

  it("respects the default minimumSurfaceLength (a bare 蝕 is not indexed)", () => {
    expect(
      buildGlossarySurfaceDecorationSegments(
        "蝕",
        buildGlossarySurfaceIndex(fixtureEntries())
      )
    ).toEqual([{ kind: "plain", text: "蝕" }]);
  });

  it("highlights an opted-in one-character kanji atom but not inside a compound (#365)", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-1000000000b1";
    const index = buildGlossarySurfaceIndex([
      glossaryEntry(entryId, [
        ["蝕", GlossaryAtomFlags.AllowSingleCharacterMatch]
      ])
    ]);

    expect(
      summarizeSegments(
        buildGlossarySurfaceDecorationSegments("蝕の時。", index)
      )
    ).toEqual([
      { kind: "match", text: "蝕" },
      { kind: "plain", text: "の時。" }
    ]);
    expect(
      buildGlossarySurfaceDecorationSegments("腐蝕した銅板。", index)
    ).toEqual([{ kind: "plain", text: "腐蝕した銅板。" }]);
  });

  it("segments overlaps according to the shared matching result", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000003";
    const segments = buildGlossarySurfaceDecorationSegments(
      "xアルベルト卿y",
      buildGlossarySurfaceIndex([
        glossaryEntry(entryId, ["アルベルト", "アルベルト卿"])
      ])
    );

    expect(summarizeSegments(segments)).toEqual([
      { kind: "plain", text: "x" },
      { kind: "match", text: "アルベルト卿" },
      { kind: "plain", text: "y" }
    ]);
  });
});

describe("shouldSkipGlossarySurfaceDecorationTextNode", () => {
  it("skips text nodes under code, pre, and anchor elements", () => {
    expect(shouldSkipGlossarySurfaceDecorationTextNode(ancestor("code"))).toBe(
      true
    );
    expect(
      shouldSkipGlossarySurfaceDecorationTextNode(
        ancestor("span", ancestor("pre"))
      )
    ).toBe(true);
    expect(
      shouldSkipGlossarySurfaceDecorationTextNode(
        ancestor("strong", ancestor("a"))
      )
    ).toBe(true);
  });

  it("does not skip normal paragraph text nodes", () => {
    expect(
      shouldSkipGlossarySurfaceDecorationTextNode(
        ancestor("strong", ancestor("p"))
      )
    ).toBe(false);
  });
});
