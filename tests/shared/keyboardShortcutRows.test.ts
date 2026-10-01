import { describe, expect, it } from "vitest";
import {
  keybindingCommands,
  listKeyboardShortcutRows,
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function row(overrides: Partial<ResolvedKeybinding>): ResolvedKeybinding {
  return {
    command: "test.command",
    key: null,
    title: "Test",
    category: "Test",
    scope: "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    description: "test",
    handlerStatus: "registered",
    ...overrides
  };
}

describe("listKeyboardShortcutRows (#646)", () => {
  it.each(platforms)("%s: every field is present for a binding row", (platform) => {
    const save = listKeyboardShortcutRows(
      resolveDefaultKeybindings(platform),
      platform
    ).find((item) => item.commandId === "editor.document.save");
    expect(save).toMatchObject({
      title: "Save",
      commandId: "editor.document.save",
      category: "File",
      scope: "app",
      executionHost: "renderer",
      source: "pergamum",
      readonly: false,
      readonlyReason: null,
      handlerStatus: "registered",
      when: "activeDocument",
      key: "Mod-s"
    });
    expect(typeof save?.description).toBe("string");
  });

  it("formats the key label for the platform (Ctrl+S vs Cmd+S, Cmd+Option+S)", () => {
    const labelOf = (platform: PergamumPlatform, commandId: string) =>
      listKeyboardShortcutRows(resolveDefaultKeybindings(platform), platform)
        .filter((item) => item.commandId === commandId)
        .map((item) => item.keyLabel);
    expect(labelOf("win32", "editor.document.save")).toEqual(["Ctrl+S"]);
    expect(labelOf("linux", "editor.document.save")).toEqual(["Ctrl+S"]);
    expect(labelOf("darwin", "editor.document.save")).toEqual(["Cmd+S"]);
    expect(labelOf("win32", "editor.saveAll")).toEqual(["Ctrl+Alt+S"]);
    expect(labelOf("darwin", "editor.saveAll")).toEqual(["Cmd+Option+S"]);
    expect(labelOf("win32", "editor.markdown.insertBlockquote")).toEqual(["Ctrl+Shift+Q"]);
    expect(labelOf("darwin", "editor.markdown.insertBlockquote")).toEqual(["Cmd+Option+Q"]);
  });

  it("the label comes from the shared formatter, not the raw notation", () => {
    for (const item of listKeyboardShortcutRows(
      resolveDefaultKeybindings("win32"),
      "win32"
    )) {
      if (item.key !== null) {
        expect(item.keyLabel, item.commandId).not.toContain("Mod");
        expect(item.keyLabel, item.commandId).not.toBeNull();
      }
    }
  });

  it("a command with several keys yields one row per binding", () => {
    const rows = listKeyboardShortcutRows(
      resolveDefaultKeybindings("win32"),
      "win32"
    ).filter((item) => item.commandId === "workbench.commandPalette.open");
    expect(rows.map((item) => item.keyLabel)).toEqual(["Ctrl+P", "F1"]);
  });

  it("key=null rows carry key and keyLabel null (unassigned)", () => {
    const heading = listKeyboardShortcutRows(
      resolveDefaultKeybindings("darwin"),
      "darwin"
    ).find((item) => item.commandId === "workbench.commandPalette.heading.open");
    expect(heading).toMatchObject({ key: null, keyLabel: null });
    const newCommand = listKeyboardShortcutRows(
      resolveDefaultKeybindings("win32"),
      "win32"
    ).find((item) => item.commandId === "workspace.keyboardShortcuts.open");
    expect(newCommand).toMatchObject({ key: null, keyLabel: null, source: "pergamum" });
  });

  it("includes native and standard rows as readonly", () => {
    const rows = listKeyboardShortcutRows(
      resolveDefaultKeybindings("win32"),
      "win32"
    );
    const copy = rows.find((item) => item.commandId === "editor.selection.copy");
    expect(copy).toMatchObject({
      source: "nativeRole",
      readonly: true,
      readonlyReason: "nativeRole"
    });
    const lineStart = rows.find((item) => item.commandId === "editor.cursor.lineStart");
    expect(lineStart).toMatchObject({
      source: "standard",
      readonly: true,
      readonlyReason: "standardBehavior"
    });
  });

  it("leaves out notYetRegistered commands but keeps unassigned commands that do something", () => {
    const rows = listKeyboardShortcutRows(
      [
        row({ command: "a.registered", handlerStatus: "registered", key: null }),
        row({ command: "b.callback", handlerStatus: "callbackDirect", key: null }),
        row({
          command: "c.native",
          handlerStatus: "nativeRole",
          source: "nativeRole",
          executionHost: "nativeRole",
          scope: "native",
          readonly: true,
          readonlyReason: "nativeRole",
          key: null
        }),
        row({
          command: "d.standard",
          handlerStatus: "standard",
          source: "standard",
          executionHost: "standard",
          readonly: true,
          readonlyReason: "standardBehavior",
          key: null
        }),
        row({ command: "e.notYet", handlerStatus: "notYetRegistered", key: null })
      ],
      "win32"
    );
    expect(rows.map((item) => item.commandId)).toEqual([
      "a.registered",
      "b.callback",
      "c.native",
      "d.standard"
    ]);
    // In the shipped catalog: the three Markdown list commands are hidden.
    const shipped = listKeyboardShortcutRows(resolveDefaultKeybindings("win32"), "win32");
    const ids = new Set(shipped.map((item) => item.commandId));
    for (const command of keybindingCommands) {
      expect(ids.has(command.id), command.id).toBe(
        command.handlerStatus !== "notYetRegistered"
      );
    }
    expect(ids.has("editor.markdown.list.ordered")).toBe(false);
  });

  it("sorts by category, title, commandId and keeps a command's keys in order", () => {
    const rows = listKeyboardShortcutRows(
      [
        row({ command: "z.cmd", title: "B", category: "Cat" , key: "Mod-2" }),
        row({ command: "y.cmd", title: "A", category: "Cat", key: "Mod-3" }),
        row({ command: "x.cmd", title: "A", category: "Bat", key: "Mod-1" }),
        row({ command: "y.cmd", title: "A", category: "Cat", key: "F9" })
      ],
      "win32"
    );
    expect(rows.map((item) => [item.commandId, item.key])).toEqual([
      ["x.cmd", "Mod-1"],
      ["y.cmd", "Mod-3"],
      ["y.cmd", "F9"],
      ["z.cmd", "Mod-2"]
    ]);
  });

  it("is stable: the same input gives the same output", () => {
    const rows = resolveDefaultKeybindings("linux");
    expect(listKeyboardShortcutRows(rows, "linux")).toEqual(
      listKeyboardShortcutRows([...rows], "linux")
    );
  });

  it("works on the effective keybindings (user overrides show up)", () => {
    const { keybindings } = resolveEffectiveKeybindings({
      platform: "win32",
      userEntries: [
        { key: "Mod-b", command: "-editor.markdown.bold" },
        { key: "Mod-Alt-9", command: "editor.markdown.bold" }
      ]
    });
    const bold = listKeyboardShortcutRows(keybindings, "win32").filter(
      (item) => item.commandId === "editor.markdown.bold"
    );
    expect(bold.map((item) => item.keyLabel)).toEqual([null, "Ctrl+Alt+9"]);
  });

  it("returns only serializable data", () => {
    const rows = listKeyboardShortcutRows(resolveDefaultKeybindings("darwin"), "darwin");
    expect(() => structuredClone(rows)).not.toThrow();
  });
});
