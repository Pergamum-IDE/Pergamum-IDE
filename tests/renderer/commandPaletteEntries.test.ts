import { describe, expect, it } from "vitest";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import { t, type Translate } from "../../src/shared/i18n";
import {
  commandPaletteResultCountKey,
  filterCommandPaletteEntries,
  firstEnabledCommandPaletteIndex,
  formatCommandPaletteResultCount,
  listCommandPaletteEntries,
  mergeCommandPaletteMatchRanges,
  moveCommandPaletteSelection,
  resolveCommandPaletteEnterSelection,
  type CommandPaletteEntry
} from "../../src/renderer/commandPaletteEntries";

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.save"),
    title: "保存",
    description: "現在の文書を保存",
    canonicalLabel: "Save Document",
    execute: () => undefined,
    isEnabled: () => true
  });
  registry.register({
    id: defineCommandId("test.command.openProject"),
    title: "プロジェクトを開く",
    execute: () => undefined,
    isEnabled: () => false
  });
  registry.register({
    id: defineCommandId("test.command.hidden"),
    title: "Hidden",
    palette: { visible: false },
    execute: () => undefined
  });

  return registry;
}

describe("listCommandPaletteEntries", () => {
  it("lists commands in registry order, excluding palette.visible=false", () => {
    const registry = buildRegistry();

    expect(listCommandPaletteEntries(registry).map((entry) => entry.id)).toEqual([
      "test.command.save",
      "test.command.openProject"
    ]);
  });

  it("carries title, description, canonicalLabel, and live enabled state", () => {
    const registry = buildRegistry();
    const entries = listCommandPaletteEntries(registry);

    expect(entries[0]).toEqual({
      id: "test.command.save",
      title: "保存",
      description: "現在の文書を保存",
      canonicalLabel: "Save Document",
      enabled: true,
      disabledReason: null
    });
    expect(entries[1]).toMatchObject({
      id: "test.command.openProject",
      title: "プロジェクトを開く",
      enabled: false,
      disabledReason: null
    });
  });

  it("defaults to visible when palette metadata is unset", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: defineCommandId("test.command.default"),
      title: "Default",
      execute: () => undefined
    });

    expect(listCommandPaletteEntries(registry)).toHaveLength(1);
  });

  it("reports when-gated commands as disabled against a context snapshot", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: defineCommandId("test.command.whenGated"),
      title: "When gated",
      execute: () => undefined,
      when: { key: "editor.isDirty" }
    });

    expect(
      listCommandPaletteEntries(registry, { "editor.isDirty": false })
    ).toEqual([
      {
        id: "test.command.whenGated",
        title: "When gated",
        description: undefined,
        canonicalLabel: undefined,
        enabled: false,
        disabledReason: null
      }
    ]);
    expect(
      listCommandPaletteEntries(registry, { "editor.isDirty": true })
    ).toMatchObject([{ enabled: true, disabledReason: null }]);
  });

  it("treats a missing snapshot the same as an empty context", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: defineCommandId("test.command.whenGated"),
      title: "When gated",
      execute: () => undefined,
      when: { key: "editor.isDirty" }
    });

    expect(listCommandPaletteEntries(registry)).toMatchObject([
      { enabled: false, disabledReason: null }
    ]);
  });

  it("carries readOnlyProject only for read-only disabled commands", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: defineCommandId("test.command.projectWrite"),
      title: "Project write",
      execute: () => undefined,
      when: { key: "project.access.readWrite" }
    });
    registry.register({
      id: defineCommandId("test.command.contextMismatch"),
      title: "Context mismatch",
      execute: () => undefined,
      when: { key: "editor.isDirty" }
    });

    expect(
      listCommandPaletteEntries(registry, {
        "project.access.readWrite": false,
        "project.access.readOnly": true,
        "editor.isDirty": false
      })
    ).toEqual([
      {
        id: "test.command.projectWrite",
        title: "Project write",
        description: undefined,
        canonicalLabel: undefined,
        enabled: false,
        disabledReason: "readOnlyProject"
      },
      {
        id: "test.command.contextMismatch",
        title: "Context mismatch",
        description: undefined,
        canonicalLabel: undefined,
        enabled: false,
        disabledReason: null
      }
    ]);
    expect(
      listCommandPaletteEntries(registry, {
        "project.access.readWrite": true,
        "project.access.readOnly": false
      })[0]
    ).toMatchObject({
      enabled: true,
      disabledReason: null
    });
  });
});

describe("filterCommandPaletteEntries", () => {
  const entries: CommandPaletteEntry[] = [
    {
      id: defineCommandId("test.command.save"),
      title: "保存",
      description: "現在の文書を保存",
      canonicalLabel: "Save Document",
      enabled: true
    },
    {
      id: defineCommandId("test.command.openProject"),
      title: "プロジェクトを開く",
      enabled: true
    }
  ];

  it("returns all entries for an empty query", () => {
    expect(filterCommandPaletteEntries(entries, "").map((entry) => entry.id)).toEqual(
      entries.map((entry) => entry.id)
    );
    expect(
      filterCommandPaletteEntries(entries, "   ").map((entry) => entry.id)
    ).toEqual(entries.map((entry) => entry.id));
    expect(filterCommandPaletteEntries(entries, "")[0]?.matches).toEqual([]);
  });

  it("matches by id case-insensitively and reports the id ranges from the filtering result", () => {
    const results = filterCommandPaletteEntries(entries, "command.save");

    expect(results.map((entry) => entry.id)).toEqual(["test.command.save"]);
    expect(results[0]?.secondary).toEqual({
      field: "commandId",
      text: "test.command.save",
      ranges: [{ start: 5, end: 17 }]
    });
  });

  it("matches by title", () => {
    const results = filterCommandPaletteEntries(entries, "プロジェクト");

    expect(results.map((entry) => entry.id)).toEqual([
      "test.command.openProject"
    ]);
    expect(results[0]?.primary.ranges).toEqual([{ start: 0, end: 6 }]);
  });

  it("matches by description", () => {
    const results = filterCommandPaletteEntries(entries, "文書");

    expect(results.map((entry) => entry.id)).toEqual(["test.command.save"]);
    expect(results[0]?.secondary).toEqual({
      field: "description",
      text: "現在の文書を保存",
      ranges: [{ start: 3, end: 5 }]
    });
  });

  it("matches by canonicalLabel case-insensitively", () => {
    const results = filterCommandPaletteEntries(entries, "document");

    expect(results.map((entry) => entry.id)).toEqual(["test.command.save"]);
    expect(results[0]?.primary).toEqual({
      field: "canonicalLabel",
      text: "Save Document",
      ranges: [{ start: 5, end: 13 }]
    });
  });

  it("returns no entries when nothing matches", () => {
    expect(filterCommandPaletteEntries(entries, "zzz")).toEqual([]);
  });

  it("shows title as the secondary line when title matched but canonicalLabel is primary", () => {
    const results = filterCommandPaletteEntries(
      [
        {
          id: defineCommandId("test.command.localized"),
          title: "Localized title",
          canonicalLabel: "Canonical title",
          enabled: true
        }
      ],
      "localized"
    );

    expect(results[0]?.primary).toMatchObject({
      field: "canonicalLabel",
      text: "Canonical title"
    });
    expect(results[0]?.secondary).toEqual({
      field: "title",
      text: "Localized title",
      ranges: [{ start: 0, end: 9 }]
    });
  });

  it("falls back to commandId in the secondary line when no description is present", () => {
    const results = filterCommandPaletteEntries(
      [
        {
          id: defineCommandId("test.command.fallback"),
          title: "Fallback Only",
          enabled: true
        }
      ],
      ""
    );

    expect(results[0]?.primary).toEqual({
      field: "title",
      text: "Fallback Only",
      ranges: []
    });
    expect(results[0]?.secondary).toEqual({
      field: "commandId",
      text: "test.command.fallback",
      ranges: []
    });
  });

  it("does not produce a match explained only by a hidden field", () => {
    const results = filterCommandPaletteEntries(entries, "openProject");

    expect(results).toHaveLength(1);
    expect(results[0]?.secondary.field).toBe("commandId");
    expect(results[0]?.secondary.text).toBe("test.command.openProject");
  });

  it("sorts and merges matched ranges before rendering uses them", () => {
    expect(
      mergeCommandPaletteMatchRanges([
        { start: 5, end: 8 },
        { start: 1, end: 3 },
        { start: 2, end: 6 }
      ])
    ).toEqual([{ start: 1, end: 8 }]);
  });
});

describe("firstEnabledCommandPaletteIndex", () => {
  it("returns the index of the first enabled entry", () => {
    expect(
      firstEnabledCommandPaletteIndex([
        { id: defineCommandId("test.a"), title: "a", enabled: false },
        { id: defineCommandId("test.b"), title: "b", enabled: true }
      ])
    ).toBe(1);
  });

  it("returns null when no entry is enabled", () => {
    expect(
      firstEnabledCommandPaletteIndex([
        { id: defineCommandId("test.a"), title: "a", enabled: false }
      ])
    ).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(firstEnabledCommandPaletteIndex([])).toBeNull();
  });
});

describe("moveCommandPaletteSelection", () => {
  it("clamps at the last index when moving down past the end", () => {
    expect(moveCommandPaletteSelection(3, 2, 1)).toBe(2);
  });

  it("clamps at the first index when moving up past the start", () => {
    expect(moveCommandPaletteSelection(3, 0, -1)).toBe(0);
  });

  it("starts at index 0 when moving down from no selection", () => {
    expect(moveCommandPaletteSelection(3, null, 1)).toBe(0);
  });

  it("starts at the last index when moving up from no selection", () => {
    expect(moveCommandPaletteSelection(3, null, -1)).toBe(2);
  });

  it("returns null when there are no entries", () => {
    expect(moveCommandPaletteSelection(0, null, 1)).toBeNull();
  });
});

describe("resolveCommandPaletteEnterSelection", () => {
  const entries: CommandPaletteEntry[] = [
    { id: defineCommandId("test.enabled"), title: "Enabled", enabled: true },
    { id: defineCommandId("test.disabled"), title: "Disabled", enabled: false }
  ];

  it("returns the entry for an enabled selection", () => {
    expect(resolveCommandPaletteEnterSelection(entries, 0)).toEqual(
      entries[0]
    );
  });

  it("returns the entry even when it is disabled, for the caller to decide", () => {
    expect(resolveCommandPaletteEnterSelection(entries, 1)).toEqual(
      entries[1]
    );
  });

  it("returns null when nothing is selected", () => {
    expect(resolveCommandPaletteEnterSelection(entries, null)).toBeNull();
  });

  it("is not confused by an out-of-range index", () => {
    expect(resolveCommandPaletteEnterSelection(entries, 99)).toBeNull();
  });
});

describe("commandPaletteResultCountKey", () => {
  it("uses the one form only for an exact count of 1", () => {
    expect(commandPaletteResultCountKey(1)).toBe(
      "commandPalette.footer.results.one"
    );
  });

  it("uses the other form for 0 and every other count", () => {
    expect(commandPaletteResultCountKey(0)).toBe(
      "commandPalette.footer.results.other"
    );
    expect(commandPaletteResultCountKey(2)).toBe(
      "commandPalette.footer.results.other"
    );
    expect(commandPaletteResultCountKey(100)).toBe(
      "commandPalette.footer.results.other"
    );
  });
});

describe("formatCommandPaletteResultCount", () => {
  const translateEn: Translate = (key, values) => t("en", key, values);
  const translateJa: Translate = (key, values) => t("ja", key, values);

  it("formats English result counts without a bare '1 results'", () => {
    expect(formatCommandPaletteResultCount(translateEn, 0)).toBe("0 results");
    expect(formatCommandPaletteResultCount(translateEn, 1)).toBe("1 result");
    expect(formatCommandPaletteResultCount(translateEn, 2)).toBe("2 results");
  });

  it("formats Japanese result counts with the counter attached for every count", () => {
    expect(formatCommandPaletteResultCount(translateJa, 0)).toBe(
      "0件の結果"
    );
    expect(formatCommandPaletteResultCount(translateJa, 1)).toBe(
      "1件の結果"
    );
    expect(formatCommandPaletteResultCount(translateJa, 2)).toBe(
      "2件の結果"
    );
  });
});
