import { describe, expect, it } from "vitest";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import { t, type Translate } from "../../src/shared/i18n";
import {
  COMMAND_PALETTE_PAGE_STEP,
  commandPaletteResultCountKey,
  filterCommandPaletteEntries,
  firstEnabledCommandPaletteIndex,
  formatCommandPaletteResultCount,
  listCommandPaletteEntries,
  mergeCommandPaletteMatchRanges,
  moveCommandPaletteSelection,
  resolveCommandPalettePagedSelection,
  resolveCommandPaletteEnterSelection,
  resolveCommandPaletteSelection,
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
    expect(filterCommandPaletteEntries(entries, "")[0]?.secondary).toEqual({
      field: "commandId",
      text: "test.command.save",
      ranges: []
    });
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

  it("matches by description while keeping commandId as the secondary line", () => {
    const results = filterCommandPaletteEntries(entries, "文書");

    expect(results.map((entry) => entry.id)).toEqual(["test.command.save"]);
    expect(results[0]?.matches).toEqual([
      {
        field: "description",
        ranges: [{ start: 3, end: 5 }]
      }
    ]);
    expect(results[0]?.secondary).toEqual({
      field: "commandId",
      text: "test.command.save",
      ranges: []
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

  it("falls back to commandId in the secondary line", () => {
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
        { enabled: false },
        { enabled: true }
      ])
    ).toBe(1);
  });

  it("returns null when no entry is enabled", () => {
    expect(
      firstEnabledCommandPaletteIndex([{ enabled: false }])
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

describe("resolveCommandPaletteSelection (#316)", () => {
  const enabled = (): Pick<CommandPaletteEntry, "enabled"> => ({ enabled: true });
  const disabled = (): Pick<CommandPaletteEntry, "enabled"> => ({
    enabled: false
  });

  it("returns null for an empty list (active none — ENTER does nothing)", () => {
    expect(resolveCommandPaletteSelection([])).toBeNull();
    expect(resolveCommandPaletteSelection([], 0)).toBeNull();
    expect(resolveCommandPaletteSelection([], 3)).toBeNull();
  });

  it("keeps a still-valid, still-enabled current index", () => {
    const entries = [enabled(), enabled(), enabled()];

    expect(resolveCommandPaletteSelection(entries, 2)).toBe(2);
  });

  it("seeds the first enabled row when there is no current index", () => {
    expect(
      resolveCommandPaletteSelection([disabled(), enabled(), enabled()])
    ).toBe(1);
  });

  it("replaces an out-of-range current index with the first enabled row", () => {
    const entries = [disabled(), enabled()];

    expect(resolveCommandPaletteSelection(entries, 5)).toBe(1);
    expect(resolveCommandPaletteSelection(entries, -1)).toBe(1);
  });

  it("replaces a current index that now points at a disabled row", () => {
    const entries = [enabled(), disabled(), enabled()];

    expect(resolveCommandPaletteSelection(entries, 1)).toBe(0);
  });

  it("falls back to index 0 when every remaining entry is disabled", () => {
    expect(resolveCommandPaletteSelection([disabled(), disabled()])).toBe(0);
    expect(resolveCommandPaletteSelection([disabled(), disabled()], 1)).toBe(0);
  });
});

describe("resolveCommandPalettePagedSelection (#316 follow-up)", () => {
  it("uses a fixed page step of 8", () => {
    expect(COMMAND_PALETTE_PAGE_STEP).toBe(8);
  });

  it("returns null only for an empty list", () => {
    expect(resolveCommandPalettePagedSelection(0, null, "home")).toBeNull();
    expect(resolveCommandPalettePagedSelection(0, 0, "pageDown")).toBeNull();
  });

  it("Home goes to the first index, End to the last", () => {
    expect(resolveCommandPalettePagedSelection(20, 12, "home")).toBe(0);
    expect(resolveCommandPalettePagedSelection(20, 12, "end")).toBe(19);
  });

  it("PageDown jumps down by the page step and clamps at the last index", () => {
    expect(resolveCommandPalettePagedSelection(20, 2, "pageDown")).toBe(10);
    expect(resolveCommandPalettePagedSelection(20, 15, "pageDown")).toBe(19);
  });

  it("PageUp jumps up by the page step and clamps at the first index", () => {
    expect(resolveCommandPalettePagedSelection(20, 15, "pageUp")).toBe(7);
    expect(resolveCommandPalettePagedSelection(20, 3, "pageUp")).toBe(0);
  });

  it("treats a null current index as position 0", () => {
    expect(resolveCommandPalettePagedSelection(20, null, "pageDown")).toBe(8);
    expect(resolveCommandPalettePagedSelection(20, null, "pageUp")).toBe(0);
    expect(resolveCommandPalettePagedSelection(20, null, "end")).toBe(19);
  });

  it("honors a caller-supplied page step", () => {
    expect(resolveCommandPalettePagedSelection(20, 0, "pageDown", 3)).toBe(3);
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
