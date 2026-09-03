import { describe, expect, it } from "vitest";
import {
  DOCUMENT_MAP_DEFAULT_ADJUST_TAG_COLORS_FOR_VISIBILITY,
  DOCUMENT_MAP_DEFAULT_GLOSSARY_FALLBACK_COLOR,
  DOCUMENT_MAP_DEFAULT_NARRATION_COLOR,
  DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY,
  DocumentMapSettingsError,
  defaultDocumentMapSettings,
  isValidViewportLensOpacity,
  normalizeDocumentMapColor,
  parseDocumentMapSettingsForWrite,
  readDocumentMapSettings,
  reorderDocumentMapDialoguePairs
} from "../../src/shared/documentMapSettings";

describe("defaultDocumentMapSettings (#375)", () => {
  it("has the dark-grey narration / red fallback colours, one grey 「」 pair, tag-colour adjustment ON, and 0.28 lens opacity", () => {
    expect(defaultDocumentMapSettings()).toEqual({
      narrationColor: "#3c3c3c",
      glossaryFallbackColor: "#ff0000",
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#909090" }
      ],
      adjustTagColorsForVisibility: true,
      viewportLensOpacity: 0.28
    });
    expect(DOCUMENT_MAP_DEFAULT_NARRATION_COLOR).toBe("#3c3c3c");
    expect(DOCUMENT_MAP_DEFAULT_GLOSSARY_FALLBACK_COLOR).toBe("#ff0000");
    expect(DOCUMENT_MAP_DEFAULT_ADJUST_TAG_COLORS_FOR_VISIBILITY).toBe(true);
    expect(DOCUMENT_MAP_DEFAULT_VIEWPORT_LENS_OPACITY).toBe(0.28);
  });
});

describe("normalizeDocumentMapColor (#375)", () => {
  it("accepts #RGB / #RRGGBB in any case and lowercases to #rrggbb", () => {
    expect(normalizeDocumentMapColor("#ABC")).toBe("#aabbcc");
    expect(normalizeDocumentMapColor("#7C3AED")).toBe("#7c3aed");
  });

  it("returns null for a non-hex value", () => {
    for (const bad of ["red", "#12", "#1234567", "rgb(1,2,3)", "", 42, null]) {
      expect(normalizeDocumentMapColor(bad)).toBeNull();
    }
  });
});

describe("parseDocumentMapSettingsForWrite (#375, strict)", () => {
  const valid = {
    narrationColor: "#111111",
    glossaryFallbackColor: "#222222",
    dialogueDelimiterPairs: [
      { open: "「", close: "」", color: "#0000FF" },
      { open: "『", close: "』", color: "#7c3aed" }
    ]
  };

  it("accepts a well-formed object and normalises colours", () => {
    expect(parseDocumentMapSettingsForWrite(valid)).toEqual({
      narrationColor: "#111111",
      glossaryFallbackColor: "#222222",
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#0000ff" },
        { open: "『", close: "』", color: "#7c3aed" }
      ],
      // omitted → the built-in defaults (adjustment ON, 0.28 opacity)
      adjustTagColorsForVisibility: true,
      viewportLensOpacity: 0.28
    });
  });

  it("keeps an explicit adjustTagColorsForVisibility and rejects a non-boolean", () => {
    expect(
      parseDocumentMapSettingsForWrite({
        ...valid,
        adjustTagColorsForVisibility: false
      }).adjustTagColorsForVisibility
    ).toBe(false);
    expect(() =>
      parseDocumentMapSettingsForWrite({
        ...valid,
        adjustTagColorsForVisibility: "yes"
      })
    ).toThrow(DocumentMapSettingsError);
  });

  it("accepts an empty dialogueDelimiterPairs array", () => {
    expect(
      parseDocumentMapSettingsForWrite({
        ...valid,
        dialogueDelimiterPairs: []
      }).dialogueDelimiterPairs
    ).toEqual([]);
  });

  it("rejects an invalid narration / fallback colour", () => {
    expect(() =>
      parseDocumentMapSettingsForWrite({ ...valid, narrationColor: "black" })
    ).toThrow(DocumentMapSettingsError);
    expect(() =>
      parseDocumentMapSettingsForWrite({
        ...valid,
        glossaryFallbackColor: "#xyz"
      })
    ).toThrow(DocumentMapSettingsError);
  });

  it("rejects an empty open / close and an invalid pair colour", () => {
    expect(() =>
      parseDocumentMapSettingsForWrite({
        ...valid,
        dialogueDelimiterPairs: [{ open: "", close: "」", color: "#000000" }]
      })
    ).toThrow(/open/);
    expect(() =>
      parseDocumentMapSettingsForWrite({
        ...valid,
        dialogueDelimiterPairs: [{ open: "「", close: "", color: "#000000" }]
      })
    ).toThrow(/close/);
    expect(() =>
      parseDocumentMapSettingsForWrite({
        ...valid,
        dialogueDelimiterPairs: [{ open: "「", close: "」", color: "nope" }]
      })
    ).toThrow(/color/);
  });

  it("rejects a non-array dialogueDelimiterPairs", () => {
    expect(() =>
      parseDocumentMapSettingsForWrite({ ...valid, dialogueDelimiterPairs: {} })
    ).toThrow(DocumentMapSettingsError);
  });

  it("#375: accepts a viewportLensOpacity in 0.1..0.9 and rejects anything else", () => {
    for (const ok of [0.1, 0.28, 0.5, 0.9]) {
      expect(
        parseDocumentMapSettingsForWrite({ ...valid, viewportLensOpacity: ok })
          .viewportLensOpacity
      ).toBe(ok);
    }
    for (const bad of [
      0,
      1,
      -0.5,
      1.5,
      "0.5",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      null
    ]) {
      expect(() =>
        parseDocumentMapSettingsForWrite({
          ...valid,
          viewportLensOpacity: bad
        })
      ).toThrow(DocumentMapSettingsError);
    }
  });

  it("#375: an omitted viewportLensOpacity falls back to 0.28", () => {
    expect(
      parseDocumentMapSettingsForWrite(valid).viewportLensOpacity
    ).toBe(0.28);
  });
});

describe("isValidViewportLensOpacity (#375)", () => {
  it("is true only for a finite number in 0.1..0.9 (inclusive)", () => {
    expect(isValidViewportLensOpacity(0.1)).toBe(true);
    expect(isValidViewportLensOpacity(0.9)).toBe(true);
    expect(isValidViewportLensOpacity(0.28)).toBe(true);
    expect(isValidViewportLensOpacity(0)).toBe(false);
    expect(isValidViewportLensOpacity(1)).toBe(false);
    expect(isValidViewportLensOpacity(-0.2)).toBe(false);
    expect(isValidViewportLensOpacity(Number.NaN)).toBe(false);
    expect(isValidViewportLensOpacity(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidViewportLensOpacity("0.5")).toBe(false);
    expect(isValidViewportLensOpacity(undefined)).toBe(false);
  });
});

describe("readDocumentMapSettings (#375, tolerant)", () => {
  it("falls back per-field and never throws", () => {
    expect(readDocumentMapSettings(undefined)).toEqual(
      defaultDocumentMapSettings()
    );
    expect(
      readDocumentMapSettings({
        narrationColor: "not-a-color",
        glossaryFallbackColor: "#00ff00",
        dialogueDelimiterPairs: "bad"
      })
    ).toEqual({
      narrationColor: "#3c3c3c",
      glossaryFallbackColor: "#00ff00",
      dialogueDelimiterPairs: [
        { open: "「", close: "」", color: "#909090" }
      ],
      adjustTagColorsForVisibility: true,
      viewportLensOpacity: 0.28
    });
  });

  it("honours an explicit adjustTagColorsForVisibility=false and ignores a non-boolean", () => {
    expect(
      readDocumentMapSettings({ adjustTagColorsForVisibility: false })
        .adjustTagColorsForVisibility
    ).toBe(false);
    expect(
      readDocumentMapSettings({ adjustTagColorsForVisibility: 0 })
        .adjustTagColorsForVisibility
    ).toBe(true);
  });

  it("#375: keeps an in-range viewportLensOpacity, clamps an out-of-range number, and falls back otherwise", () => {
    expect(
      readDocumentMapSettings({ viewportLensOpacity: 0.5 }).viewportLensOpacity
    ).toBe(0.5);
    // Finite but out of range → clamped into [0.1, 0.9].
    expect(
      readDocumentMapSettings({ viewportLensOpacity: 0 }).viewportLensOpacity
    ).toBe(0.1);
    expect(
      readDocumentMapSettings({ viewportLensOpacity: 5 }).viewportLensOpacity
    ).toBe(0.9);
    // Non-number / non-finite → the default.
    for (const bad of ["0.5", Number.NaN, null, {}]) {
      expect(
        readDocumentMapSettings({ viewportLensOpacity: bad }).viewportLensOpacity
      ).toBe(0.28);
    }
  });

  it("drops a single bad pair but keeps the rest", () => {
    expect(
      readDocumentMapSettings({
        dialogueDelimiterPairs: [
          { open: "「", close: "」", color: "#0000ff" },
          { open: "", close: "」", color: "#000000" },
          { open: "『", close: "』", color: "#7c3aed" }
        ]
      }).dialogueDelimiterPairs
    ).toEqual([
      { open: "「", close: "」", color: "#0000ff" },
      { open: "『", close: "』", color: "#7c3aed" }
    ]);
  });
});

describe("reorderDocumentMapDialoguePairs (#375)", () => {
  const pairs = [
    { open: "a", close: "A", color: "#000000" },
    { open: "b", close: "B", color: "#111111" },
    { open: "c", close: "C", color: "#222222" }
  ];

  it("moves a pair and returns a new array (input untouched)", () => {
    const moved = reorderDocumentMapDialoguePairs(pairs, 2, 0);
    expect(moved.map((p) => p.open)).toEqual(["c", "a", "b"]);
    expect(pairs.map((p) => p.open)).toEqual(["a", "b", "c"]);
  });

  it("clamps and no-ops out-of-range / same-index moves", () => {
    expect(reorderDocumentMapDialoguePairs(pairs, 0, 99).map((p) => p.open)).toEqual(
      ["b", "c", "a"]
    );
    expect(
      reorderDocumentMapDialoguePairs(pairs, 1, 1).map((p) => p.open)
    ).toEqual(["a", "b", "c"]);
    expect(
      reorderDocumentMapDialoguePairs(pairs, -1, 0).map((p) => p.open)
    ).toEqual(["a", "b", "c"]);
  });
});
