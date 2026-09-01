import { describe, expect, it } from "vitest";
import type {
  GlossaryEntry,
  GlossaryForm,
  GlossaryFormMatchBoundary,
  GlossaryFormRelation,
  GlossaryWarningPolicy
} from "../../src/shared/glossary";
import {
  buildGlossarySurfaceIndex,
  isAmbiguousGlossarySurfaceTextMatch,
  matchGlossarySurfacesInText,
  type GlossarySurfaceTextMatch
} from "../../src/shared/glossarySurfaceMatching";

const timestamp = "2026-08-13T00:00:00.000Z";

const albertEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000002";
const duplicateCanonicalEntryId =
  "018f4b8c-7a2b-7c3d-8e4f-100000000003";
const duplicateAliasEntryId =
  "018f4b8c-7a2b-7c3d-8e4f-100000000004";
const duplicateVariantEntryId =
  "018f4b8c-7a2b-7c3d-8e4f-100000000005";

function canonicalForm(
  entryId: string,
  id: string,
  surface: string,
  matchBoundaryStart: GlossaryFormMatchBoundary = "auto",
  matchBoundaryEnd: GlossaryFormMatchBoundary = "auto",
  allowSingleCharacterMatch = false
): GlossaryForm {
  return {
    id,
    entryId,
    surface,
    matchBoundaryStart,
    matchBoundaryEnd,
    allowSingleCharacterMatch,
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
  warningPolicy: GlossaryWarningPolicy,
  matchBoundaryStart: GlossaryFormMatchBoundary = "auto",
  matchBoundaryEnd: GlossaryFormMatchBoundary = "auto",
  allowSingleCharacterMatch = false
): GlossaryForm {
  return {
    id,
    entryId,
    surface,
    relation,
    warningPolicy,
    matchBoundaryStart,
    matchBoundaryEnd,
    allowSingleCharacterMatch,
    isCanonical: false,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function glossaryEntry(
  id: string,
  forms: GlossaryForm[]
): GlossaryEntry {
  return {
    id,
    kind: "term",
    description: "",
    forms,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function fixtureEntries(): GlossaryEntry[] {
  return [
    glossaryEntry(albertEntryId, [
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
    glossaryEntry(eclipseEntryId, [
      canonicalForm(
        eclipseEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000005",
        "蝕"
      ),
      nonCanonicalForm(
        eclipseEntryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000006",
        "トータル・エクリプス",
        "alias",
        "default"
      )
    ])
  ];
}

function assertSlicesMatch(
  text: string,
  matches: readonly GlossarySurfaceTextMatch[]
): void {
  for (const match of matches) {
    expect(text.slice(match.range.start, match.range.end)).toBe(
      match.matchedText
    );
    expect(match.candidates.length).toBeGreaterThan(0);
  }
}

describe("glossary surface matching", () => {
  it("detects canonical, alias, and variant surfaces with UTF-16 ranges", () => {
    const text =
      "アルベルトはアルと呼ばれていた。蝕の夜、アルベルト卿はAlbertと署名した。";
    const index = buildGlossarySurfaceIndex(fixtureEntries());
    const matches = matchGlossarySurfacesInText(text, index);

    expect(matches.map((match) => match.matchedText)).toEqual([
      "アルベルト",
      "アル",
      "アルベルト卿",
      "Albert"
    ]);
    assertSlicesMatch(text, matches);

    expect(matches[0]).toMatchObject({
      matchedText: "アルベルト",
      range: {
        start: text.indexOf("アルベルト"),
        end: text.indexOf("アルベルト") + "アルベルト".length
      },
      candidates: [
        {
          entryId: albertEntryId,
          formId: "018f4b8c-7a2b-7c3d-8e4f-200000000001",
          surface: "アルベルト",
          relation: "canonical",
          warningPolicy: null
        }
      ]
    });
    expect(matches[1].candidates[0]).toMatchObject({
      surface: "アル",
      relation: "alias",
      warningPolicy: "default"
    });
    expect(matches[2].candidates[0]).toMatchObject({
      surface: "アルベルト卿",
      relation: "alias",
      warningPolicy: "warn"
    });
    expect(matches[3].candidates[0]).toMatchObject({
      surface: "Albert",
      relation: "variant",
      warningPolicy: "ignore"
    });
  });

  it("applies minimumSurfaceLength at index construction time", () => {
    const text = "アルと蝕とAlbert";
    const defaultIndex = buildGlossarySurfaceIndex(fixtureEntries());
    const oneCharacterIndex = buildGlossarySurfaceIndex(fixtureEntries(), {
      minimumSurfaceLength: 1
    });
    const threeCharacterIndex = buildGlossarySurfaceIndex(fixtureEntries(), {
      minimumSurfaceLength: 3
    });

    expect(defaultIndex.entries.map((entry) => entry.surface)).not.toContain(
      "蝕"
    );
    expect(
      matchGlossarySurfacesInText(text, defaultIndex).map(
        (match) => match.matchedText
      )
    ).toEqual(["アル", "Albert"]);
    expect(
      matchGlossarySurfacesInText(text, oneCharacterIndex).map(
        (match) => match.matchedText
      )
    ).toEqual(["アル", "蝕", "Albert"]);
    expect(
      matchGlossarySurfacesInText(text, threeCharacterIndex).map(
        (match) => match.matchedText
      )
    ).toEqual(["Albert"]);
  });

  it("uses Array.from-style character length for minimumSurfaceLength", () => {
    const emojiEntry = glossaryEntry(
      "018f4b8c-7a2b-7c3d-8e4f-100000000006",
      [
        canonicalForm(
          "018f4b8c-7a2b-7c3d-8e4f-100000000006",
          "018f4b8c-7a2b-7c3d-8e4f-200000000007",
          "😀"
        )
      ]
    );
    const defaultIndex = buildGlossarySurfaceIndex([emojiEntry]);
    const oneCharacterIndex = buildGlossarySurfaceIndex([emojiEntry], {
      minimumSurfaceLength: 1
    });

    expect("😀".length).toBe(2);
    expect(Array.from("😀")).toHaveLength(1);
    expect(defaultIndex.entries).toEqual([]);
    expect(oneCharacterIndex.entries).toHaveLength(1);
  });

  it("uses leftmost-longest matching and advances the cursor to range.end", () => {
    const index = buildGlossarySurfaceIndex(fixtureEntries());

    expect(
      matchGlossarySurfacesInText("アルベルト卿は笑った。", index).map(
        (match) => match.matchedText
      )
    ).toEqual(["アルベルト卿"]);

    const overlappingEntry = glossaryEntry(
      "018f4b8c-7a2b-7c3d-8e4f-100000000007",
      [
        canonicalForm(
          "018f4b8c-7a2b-7c3d-8e4f-100000000007",
          "018f4b8c-7a2b-7c3d-8e4f-200000000008",
          "abcd",
          "none",
          "none"
        ),
        nonCanonicalForm(
          "018f4b8c-7a2b-7c3d-8e4f-100000000007",
          "018f4b8c-7a2b-7c3d-8e4f-200000000009",
          "cdef",
          "alias",
          "default",
          "none",
          "none"
        )
      ]
    );

    expect(
      matchGlossarySurfacesInText(
        "abcdef",
        buildGlossarySurfaceIndex([overlappingEntry])
      ).map((match) => match.matchedText)
    ).toEqual(["abcd"]);
  });

  it("represents ambiguous matches as sorted candidates without dropping any", () => {
    const entries = [
      glossaryEntry(duplicateVariantEntryId, [
        canonicalForm(
          duplicateVariantEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000010",
          "別候補"
        ),
        nonCanonicalForm(
          duplicateVariantEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000011",
          "重複",
          "variant",
          "warn"
        )
      ]),
      glossaryEntry(duplicateAliasEntryId, [
        canonicalForm(
          duplicateAliasEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000012",
          "別名候補"
        ),
        nonCanonicalForm(
          duplicateAliasEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000013",
          "重複",
          "alias",
          "default"
        )
      ]),
      glossaryEntry(duplicateCanonicalEntryId, [
        canonicalForm(
          duplicateCanonicalEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000014",
          "重複"
        )
      ])
    ];
    const matches = matchGlossarySurfacesInText(
      "重複している",
      buildGlossarySurfaceIndex(entries)
    );

    expect(matches).toHaveLength(1);
    expect(isAmbiguousGlossarySurfaceTextMatch(matches[0])).toBe(true);
    expect(matches[0].candidates).toEqual([
      {
        entryId: duplicateCanonicalEntryId,
        formId: "018f4b8c-7a2b-7c3d-8e4f-200000000014",
        surface: "重複",
        relation: "canonical",
        warningPolicy: null
      },
      {
        entryId: duplicateAliasEntryId,
        formId: "018f4b8c-7a2b-7c3d-8e4f-200000000013",
        surface: "重複",
        relation: "alias",
        warningPolicy: "default"
      },
      {
        entryId: duplicateVariantEntryId,
        formId: "018f4b8c-7a2b-7c3d-8e4f-200000000011",
        surface: "重複",
        relation: "variant",
        warningPolicy: "warn"
      }
    ]);
  });

  it("trims surfaces and excludes trim-empty surfaces", () => {
    const entry = glossaryEntry(
      "018f4b8c-7a2b-7c3d-8e4f-100000000008",
      [
        canonicalForm(
          "018f4b8c-7a2b-7c3d-8e4f-100000000008",
          "018f4b8c-7a2b-7c3d-8e4f-200000000015",
          "  Trim  "
        ),
        nonCanonicalForm(
          "018f4b8c-7a2b-7c3d-8e4f-100000000008",
          "018f4b8c-7a2b-7c3d-8e4f-200000000016",
          "   ",
          "alias",
          "default"
        )
      ]
    );
    const index = buildGlossarySurfaceIndex([entry]);

    expect(index.entries.map((indexEntry) => indexEntry.surface)).toEqual([
      "Trim"
    ]);
    expect(
      matchGlossarySurfacesInText("Trim is trimmed", index).map(
        (match) => match.matchedText
      )
    ).toEqual(["Trim"]);
  });

  it("is case-sensitive and applies the default ASCII boundary policy", () => {
    const index = buildGlossarySurfaceIndex(fixtureEntries());
    const text = "Albert albert ALBERT Albertine";
    const matches = matchGlossarySurfacesInText(text, index);

    expect(matches.map((match) => match.matchedText)).toEqual(["Albert"]);
    expect(matches[0].range.start).toBe(text.indexOf("Albert"));
    assertSlicesMatch(text, matches);
  });

  it("keeps case-sensitive matching unchanged", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000010";
    const index = buildGlossarySurfaceIndex([
      glossaryEntry(entryId, [
        canonicalForm(
          entryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000019",
          "Pergamum"
        )
      ])
    ]);

    expect(matchGlossarySurfacesInText("pergamum", index)).toEqual([]);
  });

  it("treats boundary resolver as identity when every form is none / none", () => {
    const orderEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000011";
    const maidEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000012";
    const index = buildGlossarySurfaceIndex([
      glossaryEntry(orderEntryId, [
        canonicalForm(
          orderEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000020",
          "オーダ",
          "none",
          "none"
        )
      ]),
      glossaryEntry(maidEntryId, [
        canonicalForm(
          maidEntryId,
          "018f4b8c-7a2b-7c3d-8e4f-200000000021",
          "メイド",
          "none",
          "none"
        )
      ])
    ]);

    expect(
      matchGlossarySurfacesInText("オーダーメイド", index).map(
        (match) => match.matchedText
      )
    ).toEqual(["オーダ", "メイド"]);
  });

  it("runs boundary resolver before leftmost-longest selection", () => {
    const longEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000013";
    const shortEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000014";
    const text = "Pergamum.IDEX";
    const matches = matchGlossarySurfacesInText(
      text,
      buildGlossarySurfaceIndex([
        glossaryEntry(longEntryId, [
          canonicalForm(
            longEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000022",
            "Pergamum.IDE"
          )
        ]),
        glossaryEntry(shortEntryId, [
          canonicalForm(
            shortEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000023",
            "Pergamum"
          )
        ])
      ])
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      matchedText: "Pergamum",
      range: {
        start: 0,
        end: "Pergamum".length
      },
      candidates: [
        {
          entryId: shortEntryId,
          formId: "018f4b8c-7a2b-7c3d-8e4f-200000000023",
          surface: "Pergamum",
          relation: "canonical",
          warningPolicy: null
        }
      ]
    });
  });

  it("filters ambiguous candidates at candidate level", () => {
    const rejectedEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000015";
    const acceptedEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000016";
    const matches = matchGlossarySurfacesInText(
      "オーダーメイド",
      buildGlossarySurfaceIndex([
        glossaryEntry(rejectedEntryId, [
          canonicalForm(
            rejectedEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000024",
            "オーダ"
          )
        ]),
        glossaryEntry(acceptedEntryId, [
          canonicalForm(
            acceptedEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000025",
            "オーダ",
            "auto",
            "none"
          )
        ])
      ])
    );

    expect(matches).toHaveLength(1);
    expect(isAmbiguousGlossarySurfaceTextMatch(matches[0])).toBe(false);
    expect(matches[0].candidates).toEqual([
      {
        entryId: acceptedEntryId,
        formId: "018f4b8c-7a2b-7c3d-8e4f-200000000025",
        surface: "オーダ",
        relation: "canonical",
        warningPolicy: null
      }
    ]);
  });

  it("uses asymmetric start/end policies without swapping them", () => {
    const acceptedEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000052";
    const rejectedEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000053";
    const text = "オーダーメイド";

    expect(
      matchGlossarySurfacesInText(
        text,
        buildGlossarySurfaceIndex([
          glossaryEntry(acceptedEntryId, [
            canonicalForm(
              acceptedEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000052",
              "メイド",
              "none",
              "auto"
            )
          ])
        ])
      ).map((match) => match.matchedText)
    ).toEqual(["メイド"]);

    expect(
      matchGlossarySurfacesInText(
        text,
        buildGlossarySurfaceIndex([
          glossaryEntry(rejectedEntryId, [
            canonicalForm(
              rejectedEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000053",
              "メイド",
              "auto",
              "none"
            )
          ])
        ])
      )
    ).toEqual([]);
  });

  it("drops a range when all ambiguous candidates are boundary-rejected", () => {
    const firstEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000017";
    const secondEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000018";

    expect(
      matchGlossarySurfacesInText(
        "オーダーメイド",
        buildGlossarySurfaceIndex([
          glossaryEntry(firstEntryId, [
            canonicalForm(
              firstEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000026",
              "オーダ"
            )
          ]),
          glossaryEntry(secondEntryId, [
            canonicalForm(
              secondEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000027",
              "オーダ"
            )
          ])
        ])
      )
    ).toEqual([]);
  });

  it("keeps the public match result shape unchanged", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000019";
    const [match] = matchGlossarySurfacesInText(
      "Pergamum is an IDE.",
      buildGlossarySurfaceIndex([
        glossaryEntry(entryId, [
          canonicalForm(
            entryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000028",
            "Pergamum"
          )
        ])
      ])
    );

    expect(Object.keys(match).sort()).toEqual([
      "candidates",
      "matchedText",
      "range"
    ]);
    expect(Object.keys(match.candidates[0]).sort()).toEqual([
      "entryId",
      "formId",
      "relation",
      "surface",
      "warningPolicy"
    ]);
  });

  it("covers boundary-aware matching fixtures", () => {
    const cases: Array<{
      surface: string;
      text: string;
      start?: GlossaryFormMatchBoundary;
      end?: GlossaryFormMatchBoundary;
      expectedMatchedTexts: string[];
    }> = [
      {
        surface: "オーダ",
        text: "オーダーメイド",
        expectedMatchedTexts: []
      },
      {
        surface: "オーダ",
        text: "オーダは沈黙した。",
        expectedMatchedTexts: ["オーダ"]
      },
      {
        surface: "オーダ",
        text: "オーダーメイド",
        end: "none",
        expectedMatchedTexts: ["オーダ"]
      },
      {
        surface: "メイド",
        text: "オーダーメイド",
        expectedMatchedTexts: []
      },
      {
        surface: "メイド",
        text: "オーダーメイド",
        start: "none",
        expectedMatchedTexts: ["メイド"]
      },
      {
        surface: "オーダー",
        text: "オーダーメイド",
        expectedMatchedTexts: []
      },
      {
        surface: "オーダー",
        text: "オーダーは沈黙した。",
        expectedMatchedTexts: ["オーダー"]
      },
      {
        surface: "ヤマダノ",
        text: "ヤマダノヽ",
        expectedMatchedTexts: ["ヤマダノ"]
      },
      {
        surface: "ジャン",
        text: "ジャン・ヴァルジャン",
        expectedMatchedTexts: ["ジャン"]
      },
      {
        surface: "Pergamum",
        text: "PergamumIDE",
        expectedMatchedTexts: []
      },
      {
        surface: "Pergamum",
        text: "Pergamum_IDE",
        expectedMatchedTexts: []
      },
      {
        surface: "Pergamum",
        text: "Pergamum2",
        expectedMatchedTexts: []
      },
      {
        surface: "Pergamum",
        text: "Pergamum is an IDE.",
        expectedMatchedTexts: ["Pergamum"]
      },
      {
        surface: "お館さま",
        text: "お館さまがお呼びです。",
        expectedMatchedTexts: ["お館さま"]
      },
      {
        surface: "領主",
        text: "領主館",
        expectedMatchedTexts: ["領主"]
      },
      {
        surface: "領主",
        text: "オー領主",
        expectedMatchedTexts: ["領主"]
      },
      {
        surface: "山田",
        text: "山田野々",
        expectedMatchedTexts: ["山田"]
      },
      {
        surface: "やまだの",
        text: "やまだのゝ",
        expectedMatchedTexts: ["やまだの"]
      }
    ];

    cases.forEach((testCase, index) => {
      const entryId = `018f4b8c-7a2b-7c3d-8e4f-100000000${(20 + index)
        .toString()
        .padStart(3, "0")}`;
      const formId = `018f4b8c-7a2b-7c3d-8e4f-200000000${(29 + index)
        .toString()
        .padStart(3, "0")}`;
      const matches = matchGlossarySurfacesInText(
        testCase.text,
        buildGlossarySurfaceIndex([
          glossaryEntry(entryId, [
            canonicalForm(
              entryId,
              formId,
              testCase.surface,
              testCase.start ?? "auto",
              testCase.end ?? "auto"
            )
          ])
        ])
      );

      expect(matches.map((match) => match.matchedText)).toEqual(
        testCase.expectedMatchedTexts
      );
    });
  });

  it("keeps the Issue 66 dogfood matching results after start/end rename", () => {
    const maidEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000054";
    const jeanEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000055";
    const matches = matchGlossarySurfacesInText(
      [
        "メイドさんはオーダーメイドの品を受け取った。",
        "",
        "ジャン・ヴァルジャンは沈黙した。",
        "",
        "ジャンは黙々と仕事をしている。"
      ].join("\n"),
      buildGlossarySurfaceIndex([
        glossaryEntry(maidEntryId, [
          canonicalForm(
            maidEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000054",
            "メイド"
          )
        ]),
        glossaryEntry(jeanEntryId, [
          canonicalForm(
            jeanEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000055",
            "ジャン"
          ),
          nonCanonicalForm(
            jeanEntryId,
            "018f4b8c-7a2b-7c3d-8e4f-200000000056",
            "ジャン・ヴァルジャン",
            "alias",
            "default"
          )
        ])
      ])
    );

    expect(matches.map((match) => match.matchedText)).toEqual([
      "メイド",
      "ジャン・ヴァルジャン",
      "ジャン"
    ]);
  });

  it("keeps leftmost-longest when boundary accepts multiple Kanji matches", () => {
    const shortEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000050";
    const longEntryId = "018f4b8c-7a2b-7c3d-8e4f-100000000051";

    expect(
      matchGlossarySurfacesInText(
        "山田野々",
        buildGlossarySurfaceIndex([
          glossaryEntry(shortEntryId, [
            canonicalForm(
              shortEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000050",
              "山田"
            )
          ]),
          glossaryEntry(longEntryId, [
            canonicalForm(
              longEntryId,
              "018f4b8c-7a2b-7c3d-8e4f-200000000051",
              "山田野々"
            )
          ])
        ])
      ).map((match) => match.matchedText)
    ).toEqual(["山田野々"]);
  });

  it("returns an empty array for empty text, empty entries, and no matches", () => {
    const index = buildGlossarySurfaceIndex(fixtureEntries());

    expect(matchGlossarySurfacesInText("", index)).toEqual([]);
    expect(
      matchGlossarySurfacesInText(
        "アルベルト",
        buildGlossarySurfaceIndex([])
      )
    ).toEqual([]);
    expect(matchGlossarySurfacesInText("一致しない本文", index)).toEqual([]);
  });

  it("keeps correct UTF-16 ranges across newlines and surrogate pairs", () => {
    const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000009";
    const entry = glossaryEntry(entryId, [
      canonicalForm(
        entryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000017",
        "😀A"
      ),
      nonCanonicalForm(
        entryId,
        "018f4b8c-7a2b-7c3d-8e4f-200000000018",
        "二行目",
        "alias",
        "default"
      )
    ]);
    const text = "序\n二行目\n😀A";
    const matches = matchGlossarySurfacesInText(
      text,
      buildGlossarySurfaceIndex([entry])
    );

    expect(matches.map((match) => match.matchedText)).toEqual([
      "二行目",
      "😀A"
    ]);
    assertSlicesMatch(text, matches);
    expect(matches[1].range).toEqual({
      start: text.indexOf("😀A"),
      end: text.indexOf("😀A") + "😀A".length
    });
    expect("😀A".length).toBe(3);
    expect(Array.from("😀A")).toHaveLength(2);
  });

  describe("explicit one-character form matching (#365)", () => {
    const eclipseEntryId = "018f4b8c-7a2b-7c3d-8e4f-1000000000a1";
    const eclipseFormId = "018f4b8c-7a2b-7c3d-8e4f-2000000000a1";

    function eclipseIndex(allowSingleCharacterMatch: boolean) {
      return buildGlossarySurfaceIndex([
        glossaryEntry(eclipseEntryId, [
          canonicalForm(
            eclipseEntryId,
            eclipseFormId,
            "蝕",
            "auto",
            "auto",
            allowSingleCharacterMatch
          )
        ])
      ]);
    }

    function eclipseMatches(text: string): string[] {
      return matchGlossarySurfacesInText(text, eclipseIndex(true)).map(
        (match) => match.matchedText
      );
    }

    it("skips a one-character form by default (allowSingleCharacterMatch false)", () => {
      const index = eclipseIndex(false);
      expect(index.entries).toEqual([]);
      expect(matchGlossarySurfacesInText("蝕の時が来た。", index)).toEqual([]);
    });

    it("indexes and matches a one-character form when explicitly enabled", () => {
      const index = eclipseIndex(true);
      expect(index.entries.map((entry) => entry.surface)).toEqual(["蝕"]);
      expect(index.entries[0].singleCharacterKanjiGuard).toBe(true);
    });

    it("leaves 2+ character forms unaffected by allowSingleCharacterMatch", () => {
      const on = buildGlossarySurfaceIndex([
        glossaryEntry("018f4b8c-7a2b-7c3d-8e4f-1000000000a2", [
          canonicalForm(
            "018f4b8c-7a2b-7c3d-8e4f-1000000000a2",
            "018f4b8c-7a2b-7c3d-8e4f-2000000000a2",
            "アル",
            "auto",
            "auto",
            true
          )
        ])
      ]);
      expect(on.entries.map((e) => e.surface)).toEqual(["アル"]);
      expect(on.entries[0].singleCharacterKanjiGuard).toBe(false);
      expect(
        matchGlossarySurfacesInText("アルと呼ばれた。", on).map(
          (m) => m.matchedText
        )
      ).toEqual(["アル"]);
    });

    it("always skips empty / whitespace-only surfaces", () => {
      const index = buildGlossarySurfaceIndex([
        glossaryEntry("018f4b8c-7a2b-7c3d-8e4f-1000000000a3", [
          canonicalForm(
            "018f4b8c-7a2b-7c3d-8e4f-1000000000a3",
            "018f4b8c-7a2b-7c3d-8e4f-2000000000a3",
            "  ",
            "none",
            "none",
            true
          )
        ])
      ]);
      expect(index.entries).toEqual([]);
    });

    it("keeps the existing minimumSurfaceLength option behaviour for non-opted-in forms", () => {
      const index = buildGlossarySurfaceIndex(
        [
          glossaryEntry(eclipseEntryId, [
            canonicalForm(eclipseEntryId, eclipseFormId, "蝕")
          ])
        ],
        { minimumSurfaceLength: 1 }
      );
      expect(index.entries.map((e) => e.surface)).toEqual(["蝕"]);
      // not opted in → no compound-word guard even at minimumSurfaceLength 1
      expect(index.entries[0].singleCharacterKanjiGuard).toBe(false);
      expect(
        matchGlossarySurfacesInText("腐蝕した銅板。", index).map(
          (m) => m.matchedText
        )
      ).toEqual(["蝕"]);
    });

    it("matches an opted-in 蝕 next to kana / punctuation / brackets / text edge", () => {
      expect(eclipseMatches("蝕の時が来た。")).toEqual(["蝕"]);
      expect(eclipseMatches("「蝕」と呼ばれる。")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕。")).toEqual(["蝕"]);
    });

    it("rejects an opted-in 蝕 inside a kanji compound (different adjacent kanji)", () => {
      expect(eclipseMatches("腐蝕した銅板。")).toEqual([]);
      expect(eclipseMatches("蝕牙")).toEqual([]);
      expect(eclipseMatches("黒蝕病")).toEqual([]);
      expect(eclipseMatches("大蝕")).toEqual([]);
      expect(eclipseMatches("月蝕")).toEqual([]);
    });

    it("does NOT reject an opted-in 蝕 next to the same kanji or a Japanese iteration mark", () => {
      expect(eclipseMatches("蝕々")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕ゝ")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕ゞ")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕ヽ")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕ヾ")).toEqual(["蝕"]);
      expect(eclipseMatches("蝕蝕")).toEqual(["蝕", "蝕"]);
    });
  });
});
