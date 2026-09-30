import { describe, expect, it } from "vitest";
import { filterKeyboardShortcutRows } from "../../src/renderer/keyboardShortcutSearch";
import type { KeyboardShortcutRow } from "../../src/shared/keybindings";

function row(overrides: Partial<KeyboardShortcutRow>): KeyboardShortcutRow {
  return {
    commandId: "editor.markdown.bold",
    title: "Bold",
    category: "Markdown",
    description: "",
    scope: "editor",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    handlerStatus: "registered",
    when: "editorFocus && markdownDocument && !readOnly",
    key: "Mod-b",
    keyLabel: "Ctrl+B",
    ...overrides
  };
}

const sourceLabel = (source: KeyboardShortcutRow["source"]): string =>
  source === "pergamum" ? "Pergamum" : source === "nativeRole" ? "Native" : "標準機能";

const rows: KeyboardShortcutRow[] = [
  row({}),
  row({
    commandId: "editor.markdown.insertRuby",
    title: "ルビを挿入",
    key: "Mod-r",
    keyLabel: "Ctrl+R"
  }),
  row({
    commandId: "editor.selection.copy",
    title: "Copy",
    category: "Edit",
    scope: "native",
    source: "nativeRole",
    readonly: true,
    when: "native",
    key: "Mod-c",
    keyLabel: "Ctrl+C"
  }),
  row({
    commandId: "editor.comment.toggle",
    title: "Toggle Comment",
    category: "Editor",
    source: "standard",
    readonly: true,
    when: "standard",
    key: "Mod-/",
    keyLabel: "Ctrl+/"
  }),
  row({
    commandId: "workspace.keyboardShortcuts.open",
    title: "Open Keyboard Shortcuts",
    category: "View",
    scope: "app",
    when: null,
    key: null,
    keyLabel: null
  })
];

function ids(query: string): string[] {
  return filterKeyboardShortcutRows(rows, query, sourceLabel).map((r) => r.commandId);
}

describe("filterKeyboardShortcutRows (#646)", () => {
  it("an empty or blank query shows every row in its order", () => {
    expect(ids("")).toEqual(rows.map((r) => r.commandId));
    expect(ids("   ")).toEqual(rows.map((r) => r.commandId));
  });

  it("matches the command title (case-insensitive, Japanese too)", () => {
    expect(ids("bold")).toEqual(["editor.markdown.bold"]);
    expect(ids("BOLD")).toEqual(["editor.markdown.bold"]);
    expect(ids("ルビ")).toEqual(["editor.markdown.insertRuby"]);
  });

  it("matches the commandId", () => {
    expect(ids("editor.markdown.bold")).toEqual(["editor.markdown.bold"]);
    expect(ids("insertruby")).toEqual(["editor.markdown.insertRuby"]);
  });

  it("matches the key label and the raw key", () => {
    expect(ids("Ctrl+B")).toEqual(["editor.markdown.bold"]);
    expect(ids("ctrl+c")).toEqual(["editor.selection.copy"]);
    expect(ids("Mod-r")).toEqual(["editor.markdown.insertRuby"]);
  });

  it("matches the category", () => {
    expect(ids("Markdown")).toEqual([
      "editor.markdown.bold",
      "editor.markdown.insertRuby"
    ]);
    expect(ids("view")).toEqual(["workspace.keyboardShortcuts.open"]);
  });

  it("matches the scope", () => {
    expect(ids("native")).toEqual(["editor.selection.copy"]);
  });

  it("matches the when text", () => {
    expect(ids("markdownDocument")).toEqual([
      "editor.markdown.bold",
      "editor.markdown.insertRuby"
    ]);
  });

  it("matches the visible source label", () => {
    expect(ids("Native")).toEqual(["editor.selection.copy"]);
    expect(ids("標準機能")).toEqual(["editor.comment.toggle"]);
    expect(ids("pergamum")).toEqual([
      "editor.markdown.bold",
      "editor.markdown.insertRuby",
      "workspace.keyboardShortcuts.open"
    ]);
  });

  it("unassigned rows are searchable by their other fields", () => {
    expect(ids("keyboardShortcuts.open")).toEqual(["workspace.keyboardShortcuts.open"]);
  });

  it("returns nothing when no field matches", () => {
    expect(ids("zzz-no-such-shortcut")).toEqual([]);
  });

  it("does not reorder the rows", () => {
    expect(ids("e")).toEqual(
      rows
        .filter((r) =>
          [r.title, r.commandId, r.keyLabel, r.key, r.category, r.scope, r.when, sourceLabel(r.source)]
            .filter((v): v is string => v !== null)
            .some((v) => v.toLowerCase().includes("e"))
        )
        .map((r) => r.commandId)
    );
  });
});
