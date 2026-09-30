import { describe, expect, it } from "vitest";
import {
  DEFAULT_KEYBOARD_SHORTCUT_FILTER,
  applyKeyboardShortcutFilter,
  deriveKeyboardShortcutCategories,
  isDefaultKeyboardShortcutFilter,
  normalizeKeyboardShortcutFilter,
  type KeyboardShortcutFilterState
} from "../../src/renderer/keyboardShortcutSearch";
import {
  groupKeyboardShortcutRows,
  isReadonlyCommandGroup,
  isModifiedCommandGroup,
  isUnassignedCommandGroup,
  listKeyboardShortcutRows,
  resolveEffectiveKeybindings,
  type KeyboardShortcutCommandGroup,
  type KeyboardShortcutRow,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

const sourceLabel = (source: KeyboardShortcutRow["source"]): string =>
  source === "pergamum" ? "Pergamum" : source === "nativeRole" ? "Native" : "標準機能";
const originLabel = (origin: "default" | "user" | "unbound"): string =>
  origin === "default" ? "既定" : origin === "user" ? "ユーザー" : "解除済み";

function groupsFor(entries: UserKeybindingEntry[] = []): KeyboardShortcutCommandGroup[] {
  const { keybindings } = resolveEffectiveKeybindings({ platform: "win32", userEntries: entries });
  return groupKeyboardShortcutRows(listKeyboardShortcutRows(keybindings, "win32"));
}

function ids(groups: readonly KeyboardShortcutCommandGroup[]): string[] {
  return groups.map((g) => g.commandId);
}

function filter(overrides: Partial<KeyboardShortcutFilterState>): KeyboardShortcutFilterState {
  return { ...DEFAULT_KEYBOARD_SHORTCUT_FILTER, ...overrides };
}

function apply(groups: KeyboardShortcutCommandGroup[], f: KeyboardShortcutFilterState) {
  return applyKeyboardShortcutFilter(groups, f, sourceLabel, originLabel);
}

function syntheticRow(overrides: Partial<KeyboardShortcutRow>): KeyboardShortcutRow {
  return {
    commandId: "x.command",
    title: "Command",
    category: "Cat",
    description: "",
    scope: "editor",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    handlerStatus: "registered",
    when: null,
    key: "Mod-b",
    keyLabel: "Ctrl+B",
    rowId: "x",
    origin: "default",
    editable: true,
    canReset: false,
    defaultKey: null,
    defaultKeyLabel: null,
    originKind: "default",
    ...overrides
  };
}

describe("shared group predicates (#649)", () => {
  const bold = "editor.markdown.bold";
  const palette = "workbench.commandPalette.open";
  const find = (groups: KeyboardShortcutCommandGroup[], id: string) =>
    groups.find((g) => g.commandId === id)!;

  it("a default-only group is not modified", () => {
    expect(isModifiedCommandGroup(find(groupsFor(), bold))).toBe(false);
  });

  it("a user-added binding makes the group modified", () => {
    const g = find(groupsFor([{ key: "Mod-Alt-9", command: bold }]), bold);
    expect(isModifiedCommandGroup(g)).toBe(true);
  });

  it("an unbound default makes the group modified", () => {
    const g = find(groupsFor([{ key: "F1", command: `-${palette}` }]), palette);
    expect(isModifiedCommandGroup(g)).toBe(true);
  });

  it("a changed default (unbind + user key) is modified", () => {
    const g = find(
      groupsFor([
        { key: "Mod-b", command: `-${bold}` },
        { key: "Mod-Alt-9", command: bold }
      ]),
      bold
    );
    expect(isModifiedCommandGroup(g)).toBe(true);
  });

  it("an originally key-less command is unassigned", () => {
    const g = groupsFor().find(
      (x) => x.editable && x.bindings.every((b) => b.key === null && b.originKind === null)
    )!;
    expect(isUnassignedCommandGroup(g)).toBe(true);
  });

  it("a command whose every key was removed is unassigned", () => {
    const g = find(groupsFor([{ key: "Mod-b", command: `-${bold}` }]), bold);
    expect(isUnassignedCommandGroup(g)).toBe(true);
  });

  it("an unbound alias next to a live key is NOT unassigned", () => {
    const g = find(groupsFor([{ key: "F1", command: `-${palette}` }]), palette);
    expect(g.bindings.some((b) => b.originKind === "unbound")).toBe(true);
    expect(isUnassignedCommandGroup(g)).toBe(false);
  });

  it("a user key on an otherwise unassigned command makes it not unassigned", () => {
    const g = find(
      groupsFor([
        { key: "Mod-b", command: `-${bold}` },
        { key: "Mod-Alt-9", command: bold }
      ]),
      bold
    );
    expect(isUnassignedCommandGroup(g)).toBe(false);
  });

  it("assignable is exactly canAdd", () => {
    for (const g of groupsFor()) {
      expect(isReadonlyCommandGroup(g)).toBe(!g.canAdd);
    }
  });
});

describe("applyKeyboardShortcutFilter (#649)", () => {
  const all = groupsFor();

  it("hides ReadOnly groups by default and shows them when asked", () => {
    const hidden = apply(all, DEFAULT_KEYBOARD_SHORTCUT_FILTER);
    expect(hidden.every((g) => g.canAdd)).toBe(true);
    expect(ids(hidden)).toContain("editor.markdown.bold");
    const native = all.find((g) => g.source === "nativeRole")!;
    const standard = all.find((g) => g.source === "standard")!;
    expect(ids(hidden)).not.toContain(native.commandId);
    expect(ids(hidden)).not.toContain(standard.commandId);
    const shown = apply(all, filter({ showReadonly: true }));
    expect(ids(shown)).toContain(native.commandId);
    expect(ids(shown)).toContain(standard.commandId);
    expect(shown).toHaveLength(all.length);
  });

  it("hides read-only groups by default", () => {
    const readonly = all.filter((g) => g.readonly);
    expect(readonly.length).toBeGreaterThan(0);
    expect(apply(all, DEFAULT_KEYBOARD_SHORTCUT_FILTER).some((g) => g.readonly)).toBe(false);
    expect(apply(all, filter({ showReadonly: true })).some((g) => g.readonly)).toBe(true);
  });

  it("category filters groups", () => {
    const category = all.find((g) => g.commandId === "editor.markdown.bold")!.category;
    const result = apply(all, filter({ category }));
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((g) => g.category === category)).toBe(true);
  });

  it("search AND category", () => {
    const category = all.find((g) => g.commandId === "editor.markdown.bold")!.category;
    expect(ids(apply(all, filter({ category, query: "editor.markdown.bold" })))).toEqual([
      "editor.markdown.bold"
    ]);
    expect(apply(all, filter({ category: "__none__", query: "editor.markdown.bold" }))).toEqual(
      []
    );
  });

  it("search AND modified, and modified shows the whole group", () => {
    const groups = groupsFor([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }]);
    const result = apply(groups, filter({ view: "modified", query: "palette" }));
    expect(ids(result)).toEqual(["workbench.commandPalette.open"]);
    expect(result[0]!.bindings.map((b) => b.originKind)).toEqual(
      expect.arrayContaining(["default", "user"])
    );
    expect(result[0]!.bindings.length).toBeGreaterThanOrEqual(3);
    expect(apply(groups, filter({ view: "modified", query: "bold" }))).toEqual([]);
  });

  it("search AND unassigned", () => {
    const groups = groupsFor([{ key: "Mod-b", command: "-editor.markdown.bold" }]);
    expect(ids(apply(groups, filter({ view: "unassigned", query: "bold" })))).toEqual([
      "editor.markdown.bold"
    ]);
    expect(apply(groups, filter({ view: "unassigned", query: "workbench.commandPalette" }))).toEqual([]);
  });

  it("category AND modified / unassigned", () => {
    const groups = groupsFor([{ key: "Mod-b", command: "-editor.markdown.bold" }]);
    const category = groups.find((g) => g.commandId === "editor.markdown.bold")!.category;
    expect(ids(apply(groups, filter({ category, view: "modified" })))).toContain(
      "editor.markdown.bold"
    );
    expect(apply(groups, filter({ category: "__none__", view: "modified" }))).toEqual([]);
    expect(ids(apply(groups, filter({ category, view: "unassigned" })))).toContain(
      "editor.markdown.bold"
    );
  });

  it("unassigned + not-ReadOnly only: ReadOnly commands stay hidden unless shown", () => {
    const groups: KeyboardShortcutCommandGroup[] = groupKeyboardShortcutRows([
      syntheticRow({ commandId: "a.free", key: null, keyLabel: null, originKind: null }),
      syntheticRow({
        commandId: "n.native",
        source: "nativeRole",
        readonly: true,
        editable: false,
        key: null,
        keyLabel: null,
        originKind: null
      })
    ]);
    expect(ids(apply(groups, filter({ view: "unassigned" })))).toEqual(["a.free"]);
    expect(ids(apply(groups, filter({ view: "unassigned", showReadonly: true })))).toEqual([
      "a.free",
      "n.native"
    ]);
  });

  it("all filters compose", () => {
    const groups = groupsFor([{ key: "Mod-Alt-p", command: "workbench.commandPalette.open" }]);
    const category = groups.find((g) => g.commandId === "workbench.commandPalette.open")!.category;
    const result = apply(groups, {
      query: "ユーザー",
      category,
      view: "modified",
      showReadonly: false
    });
    expect(ids(result)).toEqual(["workbench.commandPalette.open"]);
  });

  it("an empty result is an empty list", () => {
    expect(apply(all, filter({ query: "zzzz-no-such-shortcut" }))).toEqual([]);
  });
});

describe("categories and normalization (#649)", () => {
  const groups: KeyboardShortcutCommandGroup[] = groupKeyboardShortcutRows([
    syntheticRow({ commandId: "a.one", category: "Zeta" }),
    syntheticRow({ commandId: "b.two", category: "Alpha" }),
    syntheticRow({ commandId: "c.three", category: "Zeta" }),
    syntheticRow({
      commandId: "n.native",
      category: "OnlyNative",
      source: "nativeRole",
      readonly: true,
      editable: false
    })
  ]);

  it("lists categories in first-appearance order (not alphabetical), deduplicated", () => {
    expect(deriveKeyboardShortcutCategories(groups, false)).toEqual(["Zeta", "Alpha"]);
  });

  it("omits categories that belong only to hidden ReadOnly groups, and adds them when shown", () => {
    expect(deriveKeyboardShortcutCategories(groups, false)).not.toContain("OnlyNative");
    expect(deriveKeyboardShortcutCategories(groups, true)).toEqual([
      "Zeta",
      "Alpha",
      "OnlyNative"
    ]);
  });

  it("does not depend on query or view", () => {
    // The derivation takes only the groups and the toggle.
    expect(deriveKeyboardShortcutCategories.length).toBe(2);
  });

  it("turning the toggle OFF resets a vanished selected category to all", () => {
    const on = filter({ showReadonly: true, category: "OnlyNative" });
    expect(normalizeKeyboardShortcutFilter(on, groups)).toBe(on);
    const off = { ...on, showReadonly: false };
    expect(normalizeKeyboardShortcutFilter(off, groups)).toEqual({ ...off, category: "all" });
  });

  it("keeps a category that is still offered", () => {
    const f = filter({ category: "Alpha" });
    expect(normalizeKeyboardShortcutFilter(f, groups)).toBe(f);
  });

  it("the default filter is recognised, and clearing returns to it", () => {
    expect(isDefaultKeyboardShortcutFilter(DEFAULT_KEYBOARD_SHORTCUT_FILTER)).toBe(true);
    for (const changed of [
      filter({ query: "x" }),
      filter({ category: "Alpha" }),
      filter({ view: "modified" }),
      filter({ showReadonly: true })
    ]) {
      expect(isDefaultKeyboardShortcutFilter(changed)).toBe(false);
    }
    expect(DEFAULT_KEYBOARD_SHORTCUT_FILTER).toEqual({
      query: "",
      category: "all",
      view: "all",
      showReadonly: false
    });
  });
});

describe("description in filtering (#649 addendum)", () => {
  const described: KeyboardShortcutCommandGroup[] = groupKeyboardShortcutRows([
    syntheticRow({ commandId: "a.one", category: "Cat", description: "Zyzzyva helper" }),
    syntheticRow({
      commandId: "a.two",
      category: "Cat",
      description: "Other text",
      key: null,
      keyLabel: null,
      originKind: null
    }),
    syntheticRow({
      commandId: "a.three",
      category: "Other",
      description: "Zyzzyva again",
      originKind: "user",
      origin: "user"
    }),
    syntheticRow({
      commandId: "n.native",
      category: "Cat",
      description: "Zyzzyva native",
      source: "nativeRole",
      readonly: true,
      editable: false
    })
  ]);

  it("matches the description, case-insensitively and partially", () => {
    expect(ids(apply(described, filter({ query: "ZYZZ" })))).toEqual(["a.one", "a.three"]);
    expect(ids(apply(described, filter({ query: "other text" })))).toEqual(["a.two"]);
  });

  it("returns the whole group for a description-only match", () => {
    const groups = groupKeyboardShortcutRows([
      syntheticRow({ commandId: "m.cmd", description: "Zyzzyva", rowId: "1" }),
      syntheticRow({
        commandId: "m.cmd",
        description: "Zyzzyva",
        key: "Mod-Alt-9",
        keyLabel: "Ctrl+Alt+9",
        rowId: "2",
        origin: "user",
        originKind: "user"
      })
    ]);
    const result = apply(groups, filter({ query: "zyzzyva" }));
    expect(result).toHaveLength(1);
    expect(result[0]!.bindings).toHaveLength(2);
  });

  it("composes with category, view and showReadonly (AND)", () => {
    expect(ids(apply(described, filter({ query: "zyzzyva", category: "Other" })))).toEqual([
      "a.three"
    ]);
    expect(ids(apply(described, filter({ query: "zyzzyva", view: "modified" })))).toEqual([
      "a.three"
    ]);
    expect(ids(apply(described, filter({ query: "other", view: "unassigned" })))).toEqual([
      "a.two"
    ]);
    expect(ids(apply(described, filter({ query: "zyzzyva" })))).not.toContain("n.native");
    expect(ids(apply(described, filter({ query: "zyzzyva", showReadonly: true })))).toContain(
      "n.native"
    );
  });
});
