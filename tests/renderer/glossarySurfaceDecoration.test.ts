import { describe, expect, it } from "vitest";
import type {
  GlossaryEntry,
  GlossaryForm,
  GlossaryFormRelation,
  GlossaryWarningPolicy
} from "../../src/shared/glossary";
import { buildGlossarySurfaceIndex } from "../../src/shared/glossarySurfaceMatching";
import {
  buildGlossarySurfaceDecorationSegments,
  shouldSkipGlossarySurfaceDecorationTextNode,
  type GlossarySurfaceDecorationAncestor,
  type GlossarySurfaceDecorationSegment
} from "../../src/renderer/glossarySurfaceDecoration";

const timestamp = "2026-08-13T00:00:00.000Z";
const albertEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000002";

function canonicalForm(
  entryId: string,
  id: string,
  surface: string
): GlossaryForm {
  return {
    id,
    entryId,
    surface,
    matchBoundaryStart: "auto",
    matchBoundaryEnd: "auto",
    relation: null,
    warningPolicy: null,
    isCanonical: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function nonCanonicalForm(
  entryId: string,
  id: string,
  surface: string,
  relation: GlossaryFormRelation,
  warningPolicy: GlossaryWarningPolicy
): GlossaryForm {
  return {
    id,
    entryId,
    surface,
    relation,
    warningPolicy,
    matchBoundaryStart: "auto",
    matchBoundaryEnd: "auto",
    isCanonical: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function glossaryEntry(
  id: string,
  kind: GlossaryEntry["kind"],
  forms: GlossaryForm[]
): GlossaryEntry {
  return {
    id,
    kind,
    description: "",
    forms,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function fixtureEntries(): GlossaryEntry[] {
  return [
    glossaryEntry(albertEntryId, "person", [
      canonicalForm(
        albertEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000001",
        "アルベルト"
      ),
      nonCanonicalForm(
        albertEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000002",
        "アル",
        "alias",
        "default"
      ),
      nonCanonicalForm(
        albertEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000003",
        "アルベルト卿",
        "alias",
        "warn"
      ),
      nonCanonicalForm(
        albertEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000004",
        "Albert",
        "variant",
        "ignore"
      )
    ]),
    glossaryEntry(eclipseEntryId, "term", [
      canonicalForm(
        eclipseEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000005",
        "蝕"
      )
    ])
  ];
}

function summarizeSegments(
  segments: readonly GlossarySurfaceDecorationSegment[]
): Array<{
  kind: GlossarySurfaceDecorationSegment["kind"];
  text: string;
  relation?: string;
}> {
  return segments.map((segment) =>
    segment.kind === "plain"
      ? { kind: "plain", text: segment.text }
      : {
          kind: "match",
          text: segment.match.matchedText,
          relation: segment.match.candidates[0].relation
        }
  );
}

function ancestor(
  tagName: string,
  parentElement: GlossarySurfaceDecorationAncestor | null = null
): GlossarySurfaceDecorationAncestor {
  return {
    tagName,
    parentElement
  };
}

describe("buildGlossarySurfaceDecorationSegments", () => {
  it("turns canonical, alias, and variant matches into match segments", () => {
    const text =
      "アルベルトはアルと呼ばれ、アルベルト卿はAlbertと署名した。";
    const segments = buildGlossarySurfaceDecorationSegments(
      text,
      buildGlossarySurfaceIndex(fixtureEntries())
    );

    expect(summarizeSegments(segments)).toEqual([
      { kind: "match", text: "アルベルト", relation: "canonical" },
      { kind: "plain", text: "は" },
      { kind: "match", text: "アル", relation: "alias" },
      { kind: "plain", text: "と呼ばれ、" },
      { kind: "match", text: "アルベルト卿", relation: "alias" },
      { kind: "plain", text: "は" },
      { kind: "match", text: "Albert", relation: "variant" },
      { kind: "plain", text: "と署名した。" }
    ]);
  });

  it("keeps non-matching text as a plain segment", () => {
    const segments = buildGlossarySurfaceDecorationSegments(
      "一致しない本文",
      buildGlossarySurfaceIndex(fixtureEntries())
    );

    expect(segments).toEqual([
      { kind: "plain", text: "一致しない本文" }
    ]);
  });

  it("uses the default minimumSurfaceLength from the matching index", () => {
    const segments = buildGlossarySurfaceDecorationSegments(
      "蝕",
      buildGlossarySurfaceIndex(fixtureEntries())
    );

    expect(segments).toEqual([{ kind: "plain", text: "蝕" }]);
  });

  it("highlights an opted-in one-character kanji form but not inside a compound (#365)", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-1000000000b1";
    const optedInEntry = glossaryEntry(entryId, "term", [
      {
        id: "018f4b8c-7a2b-7c3d-8e4f-2000000000b1",
        entryId,
        surface: "蝕",
        relation: null,
        warningPolicy: null,
        isCanonical: true,
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        allowSingleCharacterMatch: true,
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ]);
    const index = buildGlossarySurfaceIndex([optedInEntry]);

    expect(
      summarizeSegments(buildGlossarySurfaceDecorationSegments("蝕の時。", index))
    ).toEqual([
      { kind: "match", text: "蝕", relation: "canonical" },
      { kind: "plain", text: "の時。" }
    ]);
    // no highlight for 蝕 inside the compound 腐蝕
    expect(
      buildGlossarySurfaceDecorationSegments("腐蝕した銅板。", index)
    ).toEqual([{ kind: "plain", text: "腐蝕した銅板。" }]);
  });

  it("segments overlaps according to the shared matching result", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000003";
    const segments = buildGlossarySurfaceDecorationSegments(
      "xアルベルト卿y",
      buildGlossarySurfaceIndex([
        glossaryEntry(entryId, "person", [
          canonicalForm(
            entryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000006",
            "アルベルト"
          ),
          nonCanonicalForm(
            entryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000007",
            "アルベルト卿",
            "alias",
            "warn"
          )
        ])
      ])
    );

    expect(summarizeSegments(segments)).toEqual([
      { kind: "plain", text: "x" },
      { kind: "match", text: "アルベルト卿", relation: "alias" },
      { kind: "plain", text: "y" }
    ]);
  });
});

describe("shouldSkipGlossarySurfaceDecorationTextNode", () => {
  it("skips text nodes under code, pre, and anchor elements", () => {
    expect(
      shouldSkipGlossarySurfaceDecorationTextNode(ancestor("code"))
    ).toBe(true);
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
