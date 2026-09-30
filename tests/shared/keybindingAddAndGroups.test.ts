import { describe, expect, it } from "vitest";
import {
  applyKeybindingEdit,
  groupKeyboardShortcutRows,
  listKeyboardShortcutRows,
  resolveEffectiveKeybindings,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

function rowsFor(entries: UserKeybindingEntry[], platform: "win32" | "darwin" = "win32") {
  const { keybindings } = resolveEffectiveKeybindings({ platform, userEntries: entries });
  return listKeyboardShortcutRows(keybindings, platform);
}

function add(entries: UserKeybindingEntry[], commandId: string, newKey: string) {
  return applyKeybindingEdit({
    platform: "win32",
    entries,
    request: { kind: "add", target: { commandId }, newKey }
  });
}

describe("command groups (#648)", () => {
  it("groups the bindings of one command together, in row order", () => {
    const groups = groupKeyboardShortcutRows(
      rowsFor([{ key: "Mod-Alt-9", command: "editor.markdown.bold" }])
    );
    const bold = groups.find((g) => g.commandId === "editor.markdown.bold")!;
    expect(bold.bindings.map((b) => b.keyLabel)).toEqual(["Ctrl+B", "Ctrl+Alt+9"]);
    expect(bold.bindings.map((b) => b.originKind)).toEqual(["default", "user"]);
    expect(groups.filter((g) => g.commandId === "editor.markdown.bold")).toHaveLength(1);
  });

  it("has exactly one group per command", () => {
    const rows = rowsFor([]);
    const groups = groupKeyboardShortcutRows(rows);
    expect(new Set(groups.map((g) => g.commandId)).size).toBe(groups.length);
    expect(groups.reduce((n, g) => n + g.bindings.length, 0)).toBe(rows.length);
  });

  it("group metadata never contradicts the metadata of its rows (commandId fixes scope / when / source / readonly)", () => {
    for (const platform of ["win32", "darwin"] as const) {
      const rows = rowsFor(
        [
          { key: "F1", command: "-workbench.commandPalette.open" },
          { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
        ],
        platform
      );
      for (const group of groupKeyboardShortcutRows(rows)) {
        for (const binding of group.bindings) {
          expect([binding.scope, binding.when, binding.source, binding.readonly]).toEqual([
            group.scope,
            group.when,
            group.source,
            group.readonly
          ]);
          expect(binding.editable).toBe(group.editable);
        }
      }
    }
  });

  it("an unassigned command is a group with a single unassigned row", () => {
    const groups = groupKeyboardShortcutRows(rowsFor([]));
    const unassigned = groups.find(
      (g) => g.editable && g.bindings.length === 1 && g.bindings[0]!.key === null
    );
    expect(unassigned).toBeDefined();
    expect(unassigned!.canAdd).toBe(true);
    expect(unassigned!.bindings[0]!.originKind).toBeNull();
  });

  it("derives default / user / unbound origins", () => {
    const groups = groupKeyboardShortcutRows(
      rowsFor([
        { key: "F1", command: "-workbench.commandPalette.open" },
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
      ])
    );
    const palette = groups.find((g) => g.commandId === "workbench.commandPalette.open")!;
    const byKind = Object.fromEntries(palette.bindings.map((b) => [b.originKind, b]));
    expect(byKind.default?.keyLabel).toBe("Ctrl+P");
    expect(byKind.unbound?.key).toBeNull();
    expect(byKind.unbound?.defaultKeyLabel).toBe("F1");
    expect(byKind.user?.keyLabel).toBe("Ctrl+Alt+P");
  });

  it("only editable (pergamum, not readonly) groups can add; readonly ones cannot", () => {
    const groups = groupKeyboardShortcutRows(rowsFor([]));
    const readonly = groups.filter((g) => g.readonly || g.source !== "pergamum");
    expect(readonly.length).toBeGreaterThan(0);
    expect(readonly.every((g) => !g.canAdd && !g.editable)).toBe(true);
    const editable = groups.filter((g) => g.editable);
    expect(editable.length).toBeGreaterThan(0);
    expect(editable.every((g) => g.canAdd)).toBe(true);
  });
});

describe("adding a keybinding (#648)", () => {
  it("appends a positive entry and keeps everything else", () => {
    const existing: UserKeybindingEntry[] = [
      { key: "F1", command: "-workbench.commandPalette.open" },
      { key: "Mod-Alt-8", command: "editor.markdown.italic" }
    ];
    const result = add(existing, "workbench.commandPalette.open", "Mod-Alt-p");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toEqual([
        ...existing,
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
      ]);
    }
  });

  it("keeps the default bindings: the result lists default + new key", () => {
    const result = add([], "editor.markdown.bold", "Mod-Alt-9");
    expect(result.ok).toBe(true);
    if (result.ok) {
      const rows = rowsFor(result.entries).filter((r) => r.commandId === "editor.markdown.bold");
      expect(rows.map((r) => r.keyLabel)).toEqual(["Ctrl+B", "Ctrl+Alt+9"]);
    }
  });

  it("adds to an unassigned command", () => {
    const unassigned = groupKeyboardShortcutRows(rowsFor([])).find(
      (g) => g.editable && g.bindings.every((b) => b.key === null)
    )!;
    const result = add([], unassigned.commandId, "Mod-Alt-7");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toEqual([{ key: "Mod-Alt-7", command: unassigned.commandId }]);
    }
  });

  it("an unbound default stays unbound when another key is added", () => {
    const result = add(
      [{ key: "F1", command: "-workbench.commandPalette.open" }],
      "workbench.commandPalette.open",
      "Mod-Alt-p"
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entries).toEqual([
        { key: "F1", command: "-workbench.commandPalette.open" },
        { key: "Mod-Alt-p", command: "workbench.commandPalette.open" }
      ]);
      const keys = rowsFor(result.entries)
        .filter((r) => r.commandId === "workbench.commandPalette.open")
        .map((r) => r.key);
      expect(keys).toContain("Mod-p");
      expect(keys).toContain("Mod-Alt-p");
      expect(keys).not.toContain("F1");
    }
  });

  it("rejects the same key on the same command as a duplicate", () => {
    expect(add([], "editor.markdown.bold", "Mod-b")).toMatchObject({
      ok: false,
      reason: "duplicate"
    });
    expect(
      add(
        [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }],
        "editor.markdown.bold",
        "Mod-Alt-9"
      )
    ).toMatchObject({ ok: false, reason: "duplicate" });
  });

  it("rejects another command key as a conflict, naming the command", () => {
    expect(add([], "editor.markdown.bold", "Mod-i")).toMatchObject({
      ok: false,
      reason: "conflict",
      conflict: { commandId: "editor.markdown.italic" }
    });
  });

  it("rejects reserved keys, read-only commands, unknown commands and unsupported keys", () => {
    expect(add([], "editor.markdown.bold", "F5")).toMatchObject({ ok: false, reason: "reserved" });
    expect(add([], "editor.selection.copy", "Mod-Alt-9")).toMatchObject({
      ok: false,
      reason: "readonly"
    });
    expect(add([], "no.such.command", "Mod-Alt-9")).toMatchObject({ ok: false, reason: "invalid" });
    expect(add([], "editor.markdown.bold", "q")).toMatchObject({
      ok: false,
      reason: "unsupported"
    });
    expect(add([], "editor.markdown.bold", "")).toMatchObject({ ok: false });
  });

  it("never changes the entries of a refused add", () => {
    const existing: UserKeybindingEntry[] = [
      { key: "Mod-Alt-8", command: "editor.markdown.italic" }
    ];
    const snapshot = structuredClone(existing);
    add(existing, "editor.markdown.bold", "Mod-Alt-8");
    expect(existing).toEqual(snapshot);
  });
});
