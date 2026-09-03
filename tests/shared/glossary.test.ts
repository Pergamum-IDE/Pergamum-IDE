import { describe, expect, it } from "vitest";
import {
  GlossaryBoundaryPolicy,
  setGlossaryAtomBoundaryEndPolicy,
  setGlossaryAtomBoundaryStartPolicy
} from "../../src/shared/glossaryAtomFlags";
import {
  GlossaryValidationError,
  nonRepresentativeGlossaryAtoms,
  normalizeGlossaryRgbHex,
  primaryGlossaryTag,
  representativeGlossaryAtom,
  validateCreateGlossaryEntryInput,
  validateCreateGlossaryTagInput,
  validateDeleteGlossaryTagInput,
  validateGlossaryEntry,
  validateGlossaryMatchFlags,
  validateGlossaryTag,
  validateReorderGlossaryEntryIds,
  validateUpdateGlossaryEntryInput,
  validateUpdateGlossaryTagInput,
  type GlossaryAtom
} from "../../src/shared/glossary";

const BOUNDARY_START_AUTO = setGlossaryAtomBoundaryStartPolicy(
  0,
  GlossaryBoundaryPolicy.Auto
);
const BOUNDARY_BOTH_AUTO = setGlossaryAtomBoundaryEndPolicy(
  BOUNDARY_START_AUTO,
  GlossaryBoundaryPolicy.Auto
);

const timestamp = "2026-09-02T00:00:00.000Z";
const entryId = "018f4b8c-7a2b-7c3d-8e4f-100000000001";
const atomId1 = "018f4b8c-7a2b-7c3d-8e4f-200000000001";
const atomId2 = "018f4b8c-7a2b-7c3d-8e4f-200000000002";
const tagId1 = "018f4b8c-7a2b-7c3d-8e4f-300000000001";
const tagId2 = "018f4b8c-7a2b-7c3d-8e4f-300000000002";

function atom(overrides: Partial<GlossaryAtom> = {}): GlossaryAtom {
  return {
    id: atomId1,
    entryId,
    sortOrder: 0,
    value: "織田信長",
    matchFlags: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function tag(overrides: Record<string, unknown> = {}) {
  return {
    id: tagId1,
    label: "武将",
    description: null,
    backgroundRgb: "#1f77b4",
    foregroundRgb: "#ffffff",
    sortOrder: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    description: "戦国大名",
    atoms: [atom()],
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

describe("validateGlossaryMatchFlags (#375)", () => {
  it("keeps a non-negative safe integer verbatim, folds anything else to 0", () => {
    expect(validateGlossaryMatchFlags(0)).toBe(0);
    expect(validateGlossaryMatchFlags(7)).toBe(7);
    expect(validateGlossaryMatchFlags(-3)).toBe(0);
    expect(validateGlossaryMatchFlags(2.5)).toBe(0);
  });

  it("rejects a non-number", () => {
    expect(() => validateGlossaryMatchFlags("1011")).toThrow(
      GlossaryValidationError
    );
  });
});

describe("normalizeGlossaryRgbHex (#375)", () => {
  it("normalizes to lowercase #rrggbb, expanding a 3-digit form, accepting no leading #", () => {
    expect(normalizeGlossaryRgbHex("#AABBCC")).toBe("#aabbcc");
    expect(normalizeGlossaryRgbHex("AABBCC")).toBe("#aabbcc");
    expect(normalizeGlossaryRgbHex("#abc")).toBe("#aabbcc");
    expect(normalizeGlossaryRgbHex("  #0F0  ")).toBe("#00ff00");
  });

  it("rejects a malformed color", () => {
    expect(() => normalizeGlossaryRgbHex("#12")).toThrow(
      GlossaryValidationError
    );
    expect(() => normalizeGlossaryRgbHex("red")).toThrow(
      GlossaryValidationError
    );
  });
});

describe("validateGlossaryTag (#375)", () => {
  it("accepts a tag and normalizes its colors", () => {
    const result = validateGlossaryTag(
      tag({ backgroundRgb: "#A0B0C0", foregroundRgb: "#000" })
    );
    expect(result.backgroundRgb).toBe("#a0b0c0");
    expect(result.foregroundRgb).toBe("#000000");
    expect(result.label).toBe("武将");
    expect(result.description).toBeNull();
  });

  it("folds a blank description to null and trims the label", () => {
    expect(validateGlossaryTag(tag({ description: "   " })).description).toBeNull();
    expect(validateGlossaryTag(tag({ label: "  武将  " })).label).toBe("武将");
  });

  it("rejects an empty label", () => {
    expect(() => validateGlossaryTag(tag({ label: "" }))).toThrow(
      GlossaryValidationError
    );
  });
});

describe("validateGlossaryEntry (#375)", () => {
  it("accepts an entry with one atom and no tags", () => {
    const result = validateGlossaryEntry(entry());
    expect(result.atoms).toHaveLength(1);
    expect(result.tags).toEqual([]);
    expect("kind" in result).toBe(false);
  });

  it("accepts an entry with multiple packed atoms and tags", () => {
    const result = validateGlossaryEntry(
      entry({
        atoms: [
          atom({ id: atomId1, sortOrder: 0, value: "織田信長" }),
          atom({
            id: atomId2,
            sortOrder: 1,
            value: "第六天魔王",
            matchFlags: BOUNDARY_START_AUTO
          })
        ],
        tags: [tag({ id: tagId1, label: "武将" })]
      })
    );
    expect(result.atoms.map((a) => a.value)).toEqual([
      "織田信長",
      "第六天魔王"
    ]);
    expect(result.tags.map((t) => t.label)).toEqual(["武将"]);
  });

  it("rejects an entry with zero atoms", () => {
    expect(() => validateGlossaryEntry(entry({ atoms: [] }))).toThrow(
      /at least one atom/
    );
  });

  it("rejects atoms whose sortOrder is not packed 0..n-1", () => {
    expect(() =>
      validateGlossaryEntry(
        entry({
          atoms: [
            atom({ id: atomId1, sortOrder: 0 }),
            atom({ id: atomId2, sortOrder: 2, value: "x" })
          ]
        })
      )
    ).toThrow(/sortOrder must be 1/);
  });

  it("rejects duplicate atom values within an entry", () => {
    expect(() =>
      validateGlossaryEntry(
        entry({
          atoms: [
            atom({ id: atomId1, sortOrder: 0, value: "同じ" }),
            atom({ id: atomId2, sortOrder: 1, value: "同じ" })
          ]
        })
      )
    ).toThrow(/duplicates another atom value/);
  });

  it("rejects an atom that belongs to a different entry", () => {
    expect(() =>
      validateGlossaryEntry(
        entry({ atoms: [atom({ entryId: tagId2 })] })
      )
    ).toThrow(/must belong to/);
  });
});

describe("representative atom derivations (#375)", () => {
  const built = validateGlossaryEntry(
    entry({
      atoms: [
        atom({ id: atomId1, sortOrder: 0, value: "織田信長" }),
        atom({ id: atomId2, sortOrder: 1, value: "第六天魔王" })
      ]
    })
  );

  it("representativeGlossaryAtom returns the sortOrder 0 atom", () => {
    expect(representativeGlossaryAtom(built)?.value).toBe("織田信長");
  });

  it("nonRepresentativeGlossaryAtoms returns the rest in order", () => {
    expect(nonRepresentativeGlossaryAtoms(built).map((a) => a.value)).toEqual([
      "第六天魔王"
    ]);
  });

  it("primaryGlossaryTag is tags[0] (assignment order), or null when tagless", () => {
    expect(
      primaryGlossaryTag({
        tags: [
          { id: "t2", label: "b" },
          { id: "t1", label: "a" }
        ] as never
      })?.id
    ).toBe("t2");
    expect(primaryGlossaryTag({ tags: [] })).toBeNull();
  });
});

describe("validateCreateGlossaryEntryInput (#375)", () => {
  it("accepts a description, >=1 atoms (array order = sortOrder), and 0..n tag ids", () => {
    const result = validateCreateGlossaryEntryInput({
      description: "説明",
      atoms: [
        { value: "  桜田門  ", matchFlags: 0 },
        {
          value: "警視庁",
          matchFlags: BOUNDARY_BOTH_AUTO
        }
      ],
      tagIds: [tagId1, tagId2]
    });
    expect(result.atoms.map((a) => a.value)).toEqual(["桜田門", "警視庁"]);
    // start policy Auto (bits 1-2) | end policy Auto (bits 3-4) = 0b1010.
    expect(result.atoms[1].matchFlags).toBe(0b1010);
    expect(result.tagIds).toEqual([tagId1, tagId2]);
  });

  it("allows an empty tag list", () => {
    expect(
      validateCreateGlossaryEntryInput({
        description: "",
        atoms: [{ value: "x", matchFlags: 0 }],
        tagIds: []
      }).tagIds
    ).toEqual([]);
  });

  it("rejects zero atoms and blank atom values", () => {
    expect(() =>
      validateCreateGlossaryEntryInput({
        description: "",
        atoms: [],
        tagIds: []
      })
    ).toThrow(/at least one atom/);
    expect(() =>
      validateCreateGlossaryEntryInput({
        description: "",
        atoms: [{ value: "   ", matchFlags: 0 }],
        tagIds: []
      })
    ).toThrow(GlossaryValidationError);
  });

  it("rejects a duplicate tag id", () => {
    expect(() =>
      validateCreateGlossaryEntryInput({
        description: "",
        atoms: [{ value: "x", matchFlags: 0 }],
        tagIds: [tagId1, tagId1]
      })
    ).toThrow(/duplicate tag id/);
  });
});

describe("validateUpdateGlossaryEntryInput (#375)", () => {
  it("keeps an atom id when supplied and drops it when absent", () => {
    const result = validateUpdateGlossaryEntryInput({
      id: entryId,
      description: "d",
      atoms: [
        { id: atomId1, value: "keep", matchFlags: 0 },
        { value: "new", matchFlags: 0 }
      ],
      tagIds: []
    });
    expect(result.atoms[0].id).toBe(atomId1);
    expect(result.atoms[1].id).toBeUndefined();
  });
});

describe("validateReorderGlossaryEntryIds (#375)", () => {
  const a = "018f4b8c-7a2b-7c3d-8e4f-1000000000a1";
  const b = "018f4b8c-7a2b-7c3d-8e4f-1000000000a2";

  it("returns the id list unchanged when it is a well-formed set of ids", () => {
    expect(validateReorderGlossaryEntryIds([a, b])).toEqual([a, b]);
    expect(validateReorderGlossaryEntryIds([])).toEqual([]);
  });

  it("rejects a non-array", () => {
    expect(() =>
      validateReorderGlossaryEntryIds({ 0: a } as unknown)
    ).toThrow(GlossaryValidationError);
  });

  it("rejects a malformed entry id", () => {
    expect(() =>
      validateReorderGlossaryEntryIds([a, "not-a-uuid"])
    ).toThrow(GlossaryValidationError);
  });

  it("rejects a duplicate entry id", () => {
    expect(() => validateReorderGlossaryEntryIds([a, b, a])).toThrow(
      /duplicate entry id/
    );
  });
});

describe("tag CRUD inputs (#375)", () => {
  it("validates create / update / delete tag inputs", () => {
    expect(
      validateCreateGlossaryTagInput({
        label: "地名",
        description: null,
        backgroundRgb: "#123456",
        foregroundRgb: "#FFFFFF"
      })
    ).toEqual({
      label: "地名",
      description: null,
      backgroundRgb: "#123456",
      foregroundRgb: "#ffffff"
    });

    expect(
      validateUpdateGlossaryTagInput({
        id: tagId1,
        label: "地名",
        description: "説明",
        backgroundRgb: "#123456",
        foregroundRgb: "#000000"
      }).id
    ).toBe(tagId1);

    expect(validateDeleteGlossaryTagInput({ id: tagId1 })).toEqual({
      id: tagId1
    });
  });

  it("#375: caps a tag LABEL at 32 characters after trimming (create + update)", () => {
    const base = {
      description: null,
      backgroundRgb: "#123456",
      foregroundRgb: "#ffffff"
    };
    const len32 = "あ".repeat(32);
    const len33 = "あ".repeat(33);

    // Exactly 32 is fine; surrounding whitespace does not count.
    expect(
      validateCreateGlossaryTagInput({ ...base, label: `  ${len32}  ` }).label
    ).toBe(len32);
    expect(
      validateUpdateGlossaryTagInput({ ...base, id: tagId1, label: len32 }).label
    ).toBe(len32);

    // 33 trimmed characters is rejected.
    expect(() =>
      validateCreateGlossaryTagInput({ ...base, label: len33 })
    ).toThrow(/32 characters or fewer/);
    expect(() =>
      validateUpdateGlossaryTagInput({ ...base, id: tagId1, label: len33 })
    ).toThrow(/32 characters or fewer/);

    // Empty (after trim) is still rejected.
    expect(() =>
      validateCreateGlossaryTagInput({ ...base, label: "   " })
    ).toThrow();
  });

  it("#375: the 32-char cap is TAG-LABEL only — Atom values / representative terms stay unbounded", () => {
    const longTerm = "寿限無寿限無五劫の擦り切れ海砂利水魚の水行末雲来末風来末".repeat(3);
    const result = validateCreateGlossaryEntryInput({
      description: "",
      atoms: [{ value: longTerm, matchFlags: 0 }],
      tagIds: []
    });
    expect(result.atoms[0].value).toBe(longTerm);
    expect(longTerm.length).toBeGreaterThan(32);
  });
});

