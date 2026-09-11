import { describe, expect, it } from "vitest";
import type { GlossaryEntry } from "../../src/shared/glossary";
import { DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE } from "../../src/renderer/glossaryEntryEditorPaneState";
import {
  normalizeGlossaryRepresentativeFromEditorSelection,
  resolveGlossaryEntryEditorPaneTargetFromSelection
} from "../../src/renderer/glossarySelectionResolution";

const timestamp = "2026-01-01T00:00:00.000Z";

function entry(
  id: string,
  atomValues: readonly string[]
): GlossaryEntry {
  return {
    id,
    description: "",
    atoms: atomValues.map((value, index) => ({
      id: `${id}-atom-${index}`,
      entryId: id,
      sortOrder: index,
      value,
      matchFlags: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    })),
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

describe("normalizeGlossaryRepresentativeFromEditorSelection (#436 Slice 12)", () => {
  const cases: ReadonlyArray<readonly [string | null | undefined, string]> = [
    ["", ""],
    [null, ""],
    [undefined, ""],
    ["  アリス  ", "アリス"],
    ["\nアリス\n", "アリス"],
    ["迷子たちと\n千年領主", "迷子たちと千年領主"],
    ["迷子たちと\r\n千年領主", "迷子たちと千年領主"],
    ["迷子たちと\r千年領主", "迷子たちと千年領主"],
    ["\n\n", ""],
    [" \n \r\n ", ""],
    ["アリス　姫", "アリス　姫"] // internal ideographic space preserved
  ];

  for (const [input, expected] of cases) {
    it(`normalizes ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(normalizeGlossaryRepresentativeFromEditorSelection(input)).toBe(
        expected
      );
    });
  }

  it("preserves internal ordinary spaces", () => {
    expect(
      normalizeGlossaryRepresentativeFromEditorSelection("foo bar")
    ).toBe("foo bar");
  });
});

describe("resolveGlossaryEntryEditorPaneTargetFromSelection (#436 Slice 12)", () => {
  it("empty selection resolves to create with the default representative", () => {
    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection(null, [])
    ).toEqual({
      kind: "create",
      presetRepresentative: DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
    });
    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("   \n  ", [])
    ).toEqual({
      kind: "create",
      presetRepresentative: DEFAULT_GLOSSARY_ENTRY_PRESET_REPRESENTATIVE
    });
  });

  it("no exact Atom match resolves to create, seeded with the normalized selection", () => {
    const entries = [entry("e1", ["徳川家康", "家康"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("織田信長", entries)
    ).toEqual({ kind: "create", presetRepresentative: "織田信長" });
  });

  it("an exact match on the REPRESENTATIVE atom resolves to edit", () => {
    const entries = [entry("e1", ["徳川家康", "家康"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("徳川家康", entries)
    ).toEqual({ kind: "edit", entryId: "e1" });
  });

  it("an exact match on a NON-representative atom resolves to edit of the parent entry", () => {
    const entries = [entry("e1", ["徳川家康", "家康"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("家康", entries)
    ).toEqual({ kind: "edit", entryId: "e1" });
  });

  it("multiple atoms matching within the SAME entry still count as one match", () => {
    // Pathological but shouldn't happen in practice — same value twice.
    const entries = [entry("e1", ["家康", "家康"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("家康", entries)
    ).toEqual({ kind: "edit", entryId: "e1" });
  });

  it("matches across MULTIPLE distinct entries resolve to ambiguous, deduplicated by entry", () => {
    const entries = [
      entry("e1", ["家康"]),
      entry("e2", ["家康", "内府"]) // 2 atoms, still 1 entry contribution
    ];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("家康", entries)
    ).toEqual({ kind: "ambiguous", entryIds: ["e1", "e2"] });
  });

  it("trims and strips internal line breaks before matching (multi-line selection)", () => {
    const entries = [entry("e1", ["迷子たちと千年領主"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection(
        "迷子たちと\n千年領主",
        entries
      )
    ).toEqual({ kind: "edit", entryId: "e1" });
  });

  it("is an EXACT match only — no partial, no case-insensitive, no fuzzy", () => {
    const entries = [entry("e1", ["Alice"])];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("alice", entries)
    ).toEqual({ kind: "create", presetRepresentative: "alice" });
    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("Alic", entries)
    ).toEqual({ kind: "create", presetRepresentative: "Alic" });
    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("Alice2", entries)
    ).toEqual({ kind: "create", presetRepresentative: "Alice2" });
  });

  it("ignores matchFlags entirely — an atom with any matchFlags value still counts as an exact-value match", () => {
    const entries: GlossaryEntry[] = [
      {
        id: "e1",
        description: "",
        atoms: [
          {
            id: "atom-1",
            entryId: "e1",
            sortOrder: 0,
            value: "アリス",
            matchFlags: 0b111,
            createdAt: timestamp,
            updatedAt: timestamp
          }
        ],
        tags: [],
        createdAt: timestamp,
        updatedAt: timestamp
      }
    ];

    expect(
      resolveGlossaryEntryEditorPaneTargetFromSelection("アリス", entries)
    ).toEqual({ kind: "edit", entryId: "e1" });
  });
});
