import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
  GlossaryValidationError,
  validateCreateGlossaryEntryInput,
  validateGlossaryEntry,
  validateGlossaryEntryId,
  validateGlossaryEntryKind,
  validateGlossaryForm,
  validateGlossaryFormMatchBoundary,
  validateGlossarySurfaceLookupInput,
  validateUpdateGlossaryEntryInput
} from "../../src/shared/glossary";

const entryId = "018f4b8c-7a2b-7c3d-8e4f-123456789abc";
const canonicalFormId = "018f4b8c-7a2b-7c3d-8e4f-123456789abd";
const aliasFormId = "018f4b8c-7a2b-7c3d-8e4f-123456789abe";

describe("glossary validation", () => {
  it("accepts a valid glossary entry with canonical and non-canonical forms", () => {
    expect(
      validateGlossaryEntry({
        id: entryId,
        kind: "place",
        description: "王国の首都",
        forms: [
          {
            id: canonicalFormId,
            entryId,
            surface: "王都アルセリア",
            relation: null,
            warningPolicy: null,
            matchBoundaryStart: "strict",
            matchBoundaryEnd: "none",
            isCanonical: true,
            createdAt: "2026-08-11T12:00:00.000Z",
            updatedAt: "2026-08-11T12:00:00.000Z"
          },
          {
            id: aliasFormId,
            entryId,
            surface: "アルセリア",
            relation: "alias",
            warningPolicy: "warn",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "strict",
            isCanonical: false,
            createdAt: "2026-08-11T12:00:00.000Z",
            updatedAt: "2026-08-11T12:00:00.000Z"
          }
        ],
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toMatchObject({
      id: entryId,
      kind: "place",
      description: "王国の首都"
    });
  });

  it("accepts create, update, and exact surface lookup input", () => {
    expect(
      validateCreateGlossaryEntryInput({
        kind: "item",
        canonicalSurface: "魔導炉",
        description: ""
      })
    ).toEqual({
      kind: "item",
      canonicalSurface: "魔導炉",
      description: "",
      matchBoundaryStart: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
      matchBoundaryEnd: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
      allowSingleCharacterMatch: false
    });

    expect(
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "concept",
        description: "魔力を生成する技術",
        canonicalSurface: "魔導炉",
        forms: [
          {
            surface: "旧式魔導炉",
            relation: "alias",
            warningPolicy: "default",
            matchBoundaryStart: "strict",
            matchBoundaryEnd: "none"
          }
        ]
      })
    ).toEqual({
      id: entryId,
      kind: "concept",
      description: "魔力を生成する技術",
      canonicalSurface: "魔導炉",
      forms: [
        {
          surface: "旧式魔導炉",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "strict",
          matchBoundaryEnd: "none",
          allowSingleCharacterMatch: false
        }
      ]
    });

    expect(
      validateGlossarySurfaceLookupInput({
        surface: "魔導炉"
      })
    ).toEqual({
      surface: "魔導炉"
    });
  });

  it("accepts an explicit canonical match boundary on update input", () => {
    expect(
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "使用人",
        canonicalSurface: "メイド",
        matchBoundaryStart: "none",
        matchBoundaryEnd: "auto",
        forms: []
      })
    ).toEqual({
      id: entryId,
      kind: "term",
      description: "使用人",
      canonicalSurface: "メイド",
      matchBoundaryStart: "none",
      matchBoundaryEnd: "auto",
      forms: []
    });
  });

  it("rejects an invalid canonical match boundary on update input", () => {
    expect(() =>
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "使用人",
        canonicalSurface: "メイド",
        matchBoundaryStart: "word",
        forms: []
      })
    ).toThrow(GlossaryValidationError);
  });

  it("rejects non-v7 and non-lowercase IDs", () => {
    expect(() => validateGlossaryEntryId(1)).toThrow(GlossaryValidationError);
    expect(() =>
      validateGlossaryEntryId("018f4b8c-7a2b-4c3d-8e4f-123456789abc")
    ).toThrow(GlossaryValidationError);
    expect(() =>
      validateGlossaryEntryId("018F4B8C-7A2B-7C3D-8E4F-123456789ABC")
    ).toThrow(GlossaryValidationError);
  });

  it("validates glossary form match boundaries", () => {
    expect(validateGlossaryFormMatchBoundary("auto")).toBe("auto");
    expect(validateGlossaryFormMatchBoundary("strict")).toBe("strict");
    expect(validateGlossaryFormMatchBoundary("none")).toBe("none");
    expect(() => validateGlossaryFormMatchBoundary("word")).toThrow(
      GlossaryValidationError
    );
  });

  it("rejects invalid entry kinds and required textual fields", () => {
    expect(() => validateGlossaryEntryKind("chapter")).toThrow(
      GlossaryValidationError
    );

    expect(() =>
      validateCreateGlossaryEntryInput({
        kind: "term",
        canonicalSurface: " ",
        description: "空白のみの canonical surface"
      })
    ).toThrow(GlossaryValidationError);

    expect(() =>
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "invalid",
        canonicalSurface: " ",
        forms: []
      })
    ).toThrow(GlossaryValidationError);
  });

  it("validates update input forms and rejects invalid warning policies", () => {
    expect(() =>
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "invalid",
        canonicalSurface: "魔導炉",
        forms: [
          {
            surface: "旧式魔導炉",
            relation: "alias",
            warningPolicy: "block",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "auto"
          }
        ]
      })
    ).toThrow(GlossaryValidationError);
  });

  it("requires match boundaries for update input forms", () => {
    expect(() =>
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "invalid",
        canonicalSurface: "魔導炉",
        forms: [
          {
            surface: "旧式魔導炉",
            relation: "alias",
            warningPolicy: "default"
          }
        ]
      })
    ).toThrow(GlossaryValidationError);
  });

  it("rejects duplicate surfaces only within the update input entry", () => {
    expect(() =>
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "invalid",
        canonicalSurface: "魔導炉",
        forms: [
          {
            surface: " 魔導炉 ",
            relation: "variant",
            warningPolicy: "warn",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "auto"
          }
        ]
      })
    ).toThrow(GlossaryValidationError);

    expect(
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "term",
        description: "別エントリの重複はここでは検査しない",
        canonicalSurface: "帝国",
        forms: []
      })
    ).toMatchObject({
      canonicalSurface: "帝国",
      forms: []
    });
  });

  it("rejects invalid canonical form relation and warning policy", () => {
    expect(() =>
      validateGlossaryForm({
        id: canonicalFormId,
        entryId,
        surface: "王都アルセリア",
        relation: "alias",
        warningPolicy: null,
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        isCanonical: true,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);

    expect(() =>
      validateGlossaryForm({
        id: canonicalFormId,
        entryId,
        surface: "王都アルセリア",
        relation: null,
        warningPolicy: "default",
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        isCanonical: true,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);
  });

  it("rejects invalid non-canonical form relation and warning policy", () => {
    expect(() =>
      validateGlossaryForm({
        id: aliasFormId,
        entryId,
        surface: "アルセリア",
        relation: null,
        warningPolicy: "default",
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        isCanonical: false,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);

    expect(() =>
      validateGlossaryForm({
        id: aliasFormId,
        entryId,
        surface: "アルセリア",
        relation: "alias",
        warningPolicy: null,
        matchBoundaryStart: "auto",
        matchBoundaryEnd: "auto",
        isCanonical: false,
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);
  });

  it("rejects entries without exactly one canonical form", () => {
    const form = {
      id: canonicalFormId,
      entryId,
      surface: "王都アルセリア",
      relation: null,
      warningPolicy: null,
      matchBoundaryStart: "auto",
      matchBoundaryEnd: "auto",
      isCanonical: true,
      createdAt: "2026-08-11T12:00:00.000Z",
      updatedAt: "2026-08-11T12:00:00.000Z"
    };

    expect(() =>
      validateGlossaryEntry({
        id: entryId,
        kind: "place",
        description: "王国の首都",
        forms: [],
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);

    expect(() =>
      validateGlossaryEntry({
        id: entryId,
        kind: "place",
        description: "王国の首都",
        forms: [form, { ...form, id: aliasFormId }],
        createdAt: "2026-08-11T12:00:00.000Z",
        updatedAt: "2026-08-11T12:00:00.000Z"
      })
    ).toThrow(GlossaryValidationError);
  });

  it("trims glossary surface inputs while preserving description whitespace", () => {
    expect(
      validateCreateGlossaryEntryInput({
        kind: "item",
        canonicalSurface: "  魔導炉  ",
        description: "  説明文  "
      })
    ).toEqual({
      kind: "item",
      canonicalSurface: "魔導炉",
      description: "  説明文  ",
      matchBoundaryStart: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
      matchBoundaryEnd: DEFAULT_GLOSSARY_FORM_MATCH_BOUNDARY,
      allowSingleCharacterMatch: false
    });

    expect(
      validateUpdateGlossaryEntryInput({
        id: entryId,
        kind: "concept",
        description: "  説明文  ",
        canonicalSurface: "  魔導炉  ",
        forms: [
          {
            surface: "  旧式魔導炉  ",
            relation: "alias",
            warningPolicy: "default",
            matchBoundaryStart: "auto",
            matchBoundaryEnd: "strict"
          }
        ]
      })
    ).toEqual({
      id: entryId,
      kind: "concept",
      description: "  説明文  ",
      canonicalSurface: "魔導炉",
      forms: [
        {
          surface: "旧式魔導炉",
          relation: "alias",
          warningPolicy: "default",
          matchBoundaryStart: "auto",
          matchBoundaryEnd: "strict",
          allowSingleCharacterMatch: false
        }
      ]
    });

    expect(
      validateGlossarySurfaceLookupInput({
        surface: "  魔導炉  "
      })
    ).toEqual({
      surface: "魔導炉"
    });
  });
});
