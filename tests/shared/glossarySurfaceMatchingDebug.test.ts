import { describe, expect, it } from "vitest";
import {
  GlossaryAtomFlags,
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import type { GlossaryAtom, GlossaryEntry } from "../../src/shared/glossary";
import {
  buildGlossarySurfaceIndex,
  matchGlossarySurfacesInText
} from "../../src/shared/glossarySurfaceMatching";
import { renderGlossaryMatchesForDebug } from "../../src/shared/glossarySurfaceMatchingDebug";

const timestamp = "2026-09-02T00:00:00.000Z";
const albertEntryId = "018f4b8c-7a2b-7c3d-8e4f-300000000001";
const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-300000000002";
const fixtureText =
  "アルベルトはアルと呼ばれていた。蝕の夜、アルベルト卿はAlbertと署名した。";

const CHECK_BOTH = setGlossaryAtomBoundaryEndPolicy(
  setGlossaryAtomBoundaryStartPolicy(0, GlossaryBoundaryPolicy.Auto),
  GlossaryBoundaryPolicy.Auto
);

function atom(entryId: string, id: string, value: string): GlossaryAtom {
  return {
    id,
    entryId,
    sortOrder: 0,
    value,
    matchFlags: CHECK_BOTH,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function glossaryEntry(id: string, atoms: GlossaryAtom[]): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atoms.map((a, index) => ({ ...a, sortOrder: index })),
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function fixtureEntries(): GlossaryEntry[] {
  return [
    glossaryEntry(albertEntryId, [
      atom(albertEntryId, "018f4b8c-7a2b-7c3d-8e4f-400000000001", "アルベルト"),
      atom(albertEntryId, "018f4b8c-7a2b-7c3d-8e4f-400000000002", "アル"),
      atom(
        albertEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-400000000003",
        "アルベルト卿"
      ),
      atom(albertEntryId, "018f4b8c-7a2b-7c3d-8e4f-400000000004", "Albert")
    ]),
    glossaryEntry(eclipseEntryId, [
      atom(eclipseEntryId, "018f4b8c-7a2b-7c3d-8e4f-400000000005", "蝕"),
      atom(
        eclipseEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-400000000006",
        "トータル・エクリプス"
      )
    ])
  ];
}

describe("glossary surface matching debug helper (#375)", () => {
  it("renders default fixture matches as bracketed ranges", () => {
    const matches = matchGlossarySurfacesInText(
      fixtureText,
      buildGlossarySurfaceIndex(fixtureEntries())
    );

    expect(renderGlossaryMatchesForDebug(fixtureText, matches)).toBe(
      "[アルベルト]は[アル]と呼ばれていた。蝕の夜、[アルベルト卿]は[Albert]と署名した。"
    );
  });

  it("renders one-character fixture matches when minimumSurfaceLength is 1", () => {
    const matches = matchGlossarySurfacesInText(
      fixtureText,
      buildGlossarySurfaceIndex(fixtureEntries(), {
        minimumSurfaceLength: 1
      })
    );

    expect(renderGlossaryMatchesForDebug(fixtureText, matches)).toBe(
      "[アルベルト]は[アル]と呼ばれていた。[蝕]の夜、[アルベルト卿]は[Albert]と署名した。"
    );
  });

  it("renders boundary-filtered matches", () => {
    const text = "PergamumIDE ではなく Pergamum is an IDE.";
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-300000000003";
    const matches = matchGlossarySurfacesInText(
      text,
      buildGlossarySurfaceIndex([
        glossaryEntry(entryId, [
          atom(entryId, "018f4b8c-7a2b-7c3d-8e4f-400000000007", "Pergamum")
        ])
      ])
    );

    expect(renderGlossaryMatchesForDebug(text, matches)).toBe(
      "PergamumIDE ではなく [Pergamum] is an IDE."
    );
  });

  it("does not depend on UI or DOM structures", () => {
    expect(renderGlossaryMatchesForDebug("一致なし", [])).toBe("一致なし");
  });
});
