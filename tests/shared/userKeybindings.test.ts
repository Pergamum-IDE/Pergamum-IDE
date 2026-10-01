import { describe, expect, it } from "vitest";
import {
  parseUserKeybindingsJson,
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  serializeUserKeybindingsJson,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function effective(
  platform: PergamumPlatform,
  userEntries: UserKeybindingEntry[],
  entryIndices?: number[]
) {
  return resolveEffectiveKeybindings({
    platform,
    userEntries,
    ...(entryIndices === undefined ? {} : { entryIndices })
  });
}

function keysOf(
  result: ReturnType<typeof effective>,
  command: string
): (string | null)[] {
  return result.keybindings
    .filter((binding) => binding.command === command)
    .map((binding) => binding.key);
}

/** The keys actually bound (unassigned placeholder rows left out). */
function assigned(result: ReturnType<typeof effective>, command: string): string[] {
  return keysOf(result, command).filter((key): key is string => key !== null);
}

function codes(result: ReturnType<typeof effective>): string[] {
  return result.diagnostics.map((d) => d.code);
}

describe("parseUserKeybindingsJson (#645)", () => {
  it("treats empty / whitespace input as no entries and no diagnostics", () => {
    for (const source of ["", "  \n "]) {
      expect(parseUserKeybindingsJson(source)).toEqual({
        entries: [],
        sourceIndices: [],
        diagnostics: []
      });
    }
  });

  it("parses an empty array and a valid array", () => {
    expect(parseUserKeybindingsJson("[]").entries).toEqual([]);
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([
        { key: "Mod-Alt-f", command: "editor.find.replace.open", when: "editorFocus" },
        { key: "F1", command: "-workbench.commandPalette.open" }
      ])
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.entries).toEqual([
      { key: "Mod-Alt-f", command: "editor.find.replace.open", when: "editorFocus" },
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]);
    expect(parsed.sourceIndices).toEqual([0, 1]);
  });

  it("normalizes a single uppercase letter only (Mod-Alt-F -> Mod-Alt-f)", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([
        { key: "Mod-Alt-F", command: "a" },
        { key: "Mod-H", command: "-b" },
        { key: "S", command: "c" },
        { key: "Mod-Shift-S", command: "d" },
        { key: "Ctrl+Space", command: "e" },
        { key: "ArrowLeft", command: "f" }
      ])
    );
    expect(parsed.entries.map((e) => e.key)).toEqual([
      "Mod-Alt-f",
      "Mod-h",
      "s",
      "Mod-Shift-s",
      "Ctrl+Space",
      "ArrowLeft"
    ]);
  });

  it("reports malformed JSON without applying anything (and without quoting the file)", () => {
    const parsed = parseUserKeybindingsJson('[{"key": "secret-text", ');
    expect(parsed.entries).toEqual([]);
    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0]).toMatchObject({ code: "jsonParseError", severity: "error" });
    expect(parsed.diagnostics[0]?.message).not.toContain("secret-text");
  });

  it("reports a non-array root", () => {
    const parsed = parseUserKeybindingsJson('{"key":"Mod-s"}');
    expect(parsed.entries).toEqual([]);
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(["rootMustBeArray"]);
  });

  it("skips non-object items, missing key and missing command, keeping the original indices", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([
        42,
        { command: "editor.find.open" },
        { key: "Mod-f" },
        null,
        { key: "Mod-k", command: "editor.markdown.link" }
      ])
    );
    expect(parsed.entries).toEqual([{ key: "Mod-k", command: "editor.markdown.link" }]);
    expect(parsed.sourceIndices).toEqual([4]);
    expect(
      parsed.diagnostics.map((d) => [d.code, d.index])
    ).toEqual([
      ["entryMustBeObject", 0],
      ["missingKey", 1],
      ["missingCommand", 2],
      ["entryMustBeObject", 3]
    ]);
  });

  it("warns about unknown fields, ignores them and does not keep them", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([
        { key: "Mod-k", command: "editor.markdown.link", args: { a: 1 }, mac: "Cmd-k" }
      ])
    );
    expect(parsed.entries).toEqual([{ key: "Mod-k", command: "editor.markdown.link" }]);
    expect(parsed.diagnostics.map((d) => [d.code, d.severity, d.index])).toEqual([
      ["unknownField", "warning", 0],
      ["unknownField", "warning", 0]
    ]);
  });

  it("rejects a non-string when", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([{ key: "Mod-k", command: "editor.markdown.link", when: 1 }])
    );
    expect(parsed.entries).toEqual([]);
    expect(parsed.diagnostics.map((d) => d.code)).toEqual(["invalidWhenType"]);
    expect(parsed.diagnostics[0]).toMatchObject({ field: "when", index: 0 });
  });

  it("separates type errors from missing fields and reports key and command problems together (#651)", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([
        { key: 1, command: "editor.find.open" },
        { key: "Mod-f", command: 2 },
        { key: 1, command: 2 },
        {},
        { key: "  ", command: "" }
      ])
    );
    expect(parsed.entries).toEqual([]);
    expect(parsed.diagnostics.map((d) => [d.index, d.code, d.field])).toEqual([
      [0, "invalidKeyType", "key"],
      [1, "invalidCommandType", "command"],
      [2, "invalidCommandType", "command"],
      [2, "invalidKeyType", "key"],
      [3, "missingCommand", "command"],
      [3, "missingKey", "key"],
      [4, "missingCommand", "command"],
      [4, "missingKey", "key"]
    ]);
    expect(parsed.diagnostics.every((d) => d.severity === "error")).toBe(true);
  });

  it("an unknown field is a warning that names the field and keeps the entry (#651)", () => {
    const parsed = parseUserKeybindingsJson(
      JSON.stringify([{ key: "Mod-s", command: "editor.document.save", args: {} }])
    );
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.diagnostics).toMatchObject([
      { code: "unknownField", severity: "warning", field: "args", index: 0 }
    ]);
  });

  it("adds line / column to a syntax error only as numbers, never quoting the file (#651)", () => {
    const parsed = parseUserKeybindingsJson(
      '[\n  {"key": "secret-text" "x"}\n]'
    );
    const [diagnostic] = parsed.diagnostics;
    expect(diagnostic?.code).toBe("jsonParseError");
    expect(diagnostic?.message).not.toContain("secret-text");
    // Best effort: when present, the position is a plain 1-based number pair.
    if (diagnostic?.line !== undefined) {
      expect(diagnostic.line).toBe(2);
      expect(diagnostic.column).toBeGreaterThan(0);
    }
    expect(diagnostic?.line === undefined).toBe(diagnostic?.column === undefined);
  });
});

describe("serializeUserKeybindingsJson (#645)", () => {
  it("writes pretty JSON (2 spaces) with a trailing newline", () => {
    expect(
      serializeUserKeybindingsJson([
        { key: "Mod-Alt-F", command: "editor.find.replace.open", when: "editorFocus" },
        { key: "F1", command: "-workbench.commandPalette.open" }
      ])
    ).toBe(`[
  {
    "key": "Mod-Alt-f",
    "command": "editor.find.replace.open",
    "when": "editorFocus"
  },
  {
    "key": "F1",
    "command": "-workbench.commandPalette.open"
  }
]
`);
    expect(serializeUserKeybindingsJson([])).toBe("[]\n");
  });

  it("round-trips through parse", () => {
    const entries: UserKeybindingEntry[] = [
      { key: "Mod-Shift-x", command: "editor.markdown.bold" },
      { key: "Mod-h", command: "-editor.find.replace.open", when: "editorFocus" }
    ];
    expect(parseUserKeybindingsJson(serializeUserKeybindingsJson(entries)).entries).toEqual(entries);
  });
});

describe("resolveEffectiveKeybindings (#645)", () => {
  it.each(platforms)("%s: no user entries = exactly the defaults", (platform) => {
    const result = effective(platform, []);
    expect(result.diagnostics).toEqual([]);
    expect(result.keybindings).toEqual(resolveDefaultKeybindings(platform));
  });

  it("a positive entry ADDS a binding; replacing a default = unbind the old key + add the new one", () => {
    const added = effective("win32", [
      { key: "Mod-Alt-f", command: "editor.find.replace.open" }
    ]);
    expect(added.diagnostics).toEqual([]);
    expect(assigned(added, "editor.find.replace.open")).toEqual(["Mod-h", "Mod-Alt-f"]);

    const replaced = effective("win32", [
      { key: "Mod-h", command: "-editor.find.replace.open" },
      { key: "Mod-Alt-f", command: "editor.find.replace.open" }
    ]);
    expect(replaced.diagnostics).toEqual([]);
    expect(assigned(replaced, "editor.find.replace.open")).toEqual(["Mod-Alt-f"]);
  });

  it("replacing the primary keeps the alias (command palette: Mod-p + F1)", () => {
    const result = effective("linux", [
      { key: "Mod-p", command: "-workbench.commandPalette.open" },
      { key: "Mod-Shift-x", command: "workbench.commandPalette.open" }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(assigned(result, "workbench.commandPalette.open")).toEqual(["F1", "Mod-Shift-x"]);
  });

  it("every positive entry of a command is added as another binding, in file order", () => {
    const result = effective("win32", [
      { key: "Mod-Shift-x", command: "workbench.commandPalette.open" },
      { key: "Mod-Shift-y", command: "workbench.commandPalette.open" }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(assigned(result, "workbench.commandPalette.open")).toEqual([
      "Mod-p",
      "F1",
      "Mod-Shift-x",
      "Mod-Shift-y"
    ]);
  });

  it("unbind removes exactly one alias and leaves the others", () => {
    const result = effective("win32", [
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(assigned(result, "workbench.commandPalette.open")).toEqual(["Mod-p"]);

    const primary = effective("win32", [
      { key: "Mod-p", command: "-workbench.commandPalette.open" }
    ]);
    expect(assigned(primary, "workbench.commandPalette.open")).toEqual(["F1"]);
  });

  it("an unbound default stays as an unassigned row that remembers its default key", () => {
    const result = effective("win32", [
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]);
    const rows = result.keybindings.filter(
      (b) => b.command === "workbench.commandPalette.open"
    );
    expect(rows.map((b) => [b.key, b.defaultKey])).toEqual([
      ["Mod-p", undefined],
      [null, "F1"]
    ]);
  });

  it("user rows are marked origin user; untouched defaults carry no origin", () => {
    const result = effective("win32", [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" }
    ]);
    const bold = result.keybindings.filter((b) => b.command === "editor.markdown.bold");
    expect(bold.map((b) => [b.key, b.origin])).toEqual([
      ["Mod-b", undefined],
      ["Mod-Alt-9", "user"]
    ]);
  });

  it("an unassigned placeholder (no default) is filled by the first positive entry", () => {
    const result = effective("win32", [
      { key: "Mod-Alt-9", command: "workspace.keyboardShortcuts.open" }
    ]);
    expect(keysOf(result, "workspace.keyboardShortcuts.open")).toEqual(["Mod-Alt-9"]);
  });

  it("unbinding the only binding leaves one unassigned row (the command stays listed)", () => {
    const result = effective("win32", [
      { key: "Mod-f", command: "-editor.find.open" }
    ]);
    expect(keysOf(result, "editor.find.open")).toEqual([null]);
  });

  it("unbind prefers the row whose `when` matches, and warns when nothing matches", () => {
    const matched = effective("win32", [
      { key: "Mod-h", command: "-editor.find.replace.open", when: "editorFocus" }
    ]);
    expect(keysOf(matched, "editor.find.replace.open")).toEqual([null]);

    const missing = effective("win32", [
      { key: "Mod-q", command: "-editor.find.replace.open" }
    ]);
    expect(codes(missing)).toEqual(["unbindTargetNotFound"]);
    expect(missing.diagnostics[0]?.severity).toBe("warning");
    expect(keysOf(missing, "editor.find.replace.open")).toEqual(["Mod-h"]);
  });

  it("an unbind with an unknown `when` is invalid and unbinds nothing (#651)", () => {
    const result = effective("win32", [
      { key: "Mod-h", command: "-editor.find.replace.open", when: "foo && bar" }
    ]);
    expect(keysOf(result, "editor.find.replace.open")).toEqual(["Mod-h"]);
    expect(result.diagnostics).toMatchObject([
      {
        code: "unsupportedWhen",
        severity: "error",
        field: "when",
        when: "foo && bar",
        command: "editor.find.replace.open",
        key: "Mod-h",
        index: 0
      }
    ]);
    expect(result.diagnostics[0]?.message).toBe(
      'Entry 0: "when" is not supported for editor.find.replace.open'
    );
  });

  it("conflictingKey names the other command (#651)", () => {
    const result = effective("win32", [
      { key: "Mod-b", command: "editor.markdown.italic" }
    ]);
    expect(result.diagnostics[0]).toMatchObject({
      code: "conflictingKey",
      relatedCommand: "editor.markdown.bold"
    });
  });

  it("applies unbinds BEFORE positives regardless of file order (the issue's example)", () => {
    const result = effective("win32", [
      { key: "Mod-Alt-f", command: "editor.find.replace.open", when: "editorFocus" },
      { key: "Mod-h", command: "-editor.find.replace.open", when: "editorFocus" }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(assigned(result, "editor.find.replace.open")).toEqual(["Mod-Alt-f"]);
  });

  it("unbind + add keeps the other default bindings (palette: P -> X leaves F1)", () => {
    const result = effective("win32", [
      { key: "Mod-p", command: "-workbench.commandPalette.open" },
      { key: "Mod-Shift-x", command: "workbench.commandPalette.open" }
    ]);
    expect(assigned(result, "workbench.commandPalette.open").sort()).toEqual(
      ["F1", "Mod-Shift-x"].sort()
    );
  });

  it("a user key for a command whose default is null on the platform adds it (and only then)", () => {
    const base = effective("darwin", []);
    expect(keysOf(base, "workbench.commandPalette.heading.open")).toEqual([null]);
    const bound = effective("darwin", [
      { key: "Mod-Alt-h", command: "workbench.commandPalette.heading.open" }
    ]);
    // Mod-Alt-h is reserved (macOS Hide Others): rejected, stays null.
    expect(codes(bound)).toContain("reservedNativeOnlyKey");
    expect(keysOf(bound, "workbench.commandPalette.heading.open")).toEqual([null]);
    const ok = effective("darwin", [
      { key: "Mod-Alt-x", command: "workbench.commandPalette.heading.open" }
    ]);
    expect(ok.diagnostics).toEqual([]);
    expect(keysOf(ok, "workbench.commandPalette.heading.open")).toEqual(["Mod-Alt-x"]);
  });

  it("ignores unknown commands with a diagnostic", () => {
    const result = effective("win32", [{ key: "Mod-k", command: "no.such.command" }]);
    expect(result.diagnostics).toMatchObject([
      { code: "unknownCommand", severity: "error", index: 0, command: "no.such.command" }
    ]);
    expect(result.keybindings).toEqual(resolveDefaultKeybindings("win32"));
    expect(codes(effective("win32", [{ key: "F1", command: "-no.such.command" }]))).toEqual([
      "unknownCommand"
    ]);
  });

  it("ignores readonly / nativeRole / standard commands with a diagnostic", () => {
    for (const command of [
      "editor.selection.copy",
      "editor.selection.paste",
      "editor.undo",
      "editor.redo",
      "window.minimize",
      "window.toggleFullscreen",
      "editor.cursor.lineStart",
      "editor.comment.toggle"
    ]) {
      for (const entry of [
        { key: "Mod-Alt-9", command },
        { key: "Mod-c", command: `-${command}` }
      ]) {
        const result = effective("win32", [entry]);
        expect(codes(result), entry.command).toEqual(["readonlyCommand"]);
        expect(result.keybindings).toEqual(resolveDefaultKeybindings("win32"));
      }
    }
  });

  it("ignores reserved keys using the #644 validation (reload keys, darwin reserved)", () => {
    for (const key of ["Mod-Shift-r", "F5", "Mod-F5", "Shift-F5"]) {
      const result = effective("win32", [{ key, command: "editor.markdown.bold" }]);
      expect(codes(result), key).toContain("reservedForbiddenKey");
      expect(keysOf(result, "editor.markdown.bold")).toEqual(["Mod-b"]);
    }
    // A Windows user spelling Mod as Ctrl is caught too.
    expect(
      codes(effective("win32", [{ key: "Ctrl-F5", command: "editor.markdown.bold" }]))
    ).toContain("reservedForbiddenKey");
    // Mod-r for another command: the Ruby exception is not general.
    // (an app-scope command, so nothing else in its scope owns Mod-r).
    expect(
      codes(effective("win32", [{ key: "Mod-r", command: "editor.file.new" }]))
    ).toContain("reservedReloadKey");
    // Mod-r for ruby itself is explicitly allowed.
    const ruby = effective("win32", [{ key: "Mod-r", command: "editor.markdown.insertRuby" }]);
    expect(ruby.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // darwin: forbidden / nativeOnly keys.
    expect(
      codes(effective("darwin", [{ key: "Mod-Shift-3", command: "editor.markdown.bold" }]))
    ).toContain("reservedForbiddenKey");
    expect(
      codes(effective("darwin", [{ key: "Mod-q", command: "editor.markdown.bold" }]))
    ).toContain("reservedNativeOnlyKey");
    expect(
      codes(effective("win32", [{ key: "Mod-q", command: "editor.markdown.bold" }]))
    ).not.toContain("reservedNativeOnlyKey");
  });

  it("a discouraged key is accepted with a warning", () => {
    const result = effective("darwin", [{ key: "Ctrl-a", command: "editor.markdown.bold" }]);
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ["reservedDiscouragedKey", "warning"]
    ]);
    expect(assigned(result, "editor.markdown.bold")).toEqual(["Mod-b", "Ctrl-a"]);
  });

  it("ignores invalid notation with a diagnostic", () => {
    for (const key of ["Mod-", "Mod+s", "Mod-ss", "Mod-Mod-s", "Cmd-s", ""]) {
      const result = effective("win32", [{ key, command: "editor.markdown.bold" }]);
      expect(codes(result), key).toEqual(["invalidKeyNotation"]);
      expect(keysOf(result, "editor.markdown.bold")).toEqual(["Mod-b"]);
    }
  });

  it("ignores a conflicting entry and keeps the defaults (same scope)", () => {
    // Mod-i is italic (editor scope).
    const result = effective("win32", [{ key: "Mod-i", command: "editor.markdown.bold" }]);
    expect(result.diagnostics).toMatchObject([
      { code: "conflictingKey", severity: "error", index: 0, command: "editor.markdown.bold", key: "Mod-i" }
    ]);
    expect(keysOf(result, "editor.markdown.bold")).toEqual(["Mod-b"]);
    expect(keysOf(result, "editor.markdown.italic")).toEqual(["Mod-i"]);
  });

  it("treats Ctrl and Mod as the same physical key off macOS when checking conflicts", () => {
    expect(
      codes(effective("win32", [{ key: "Ctrl-i", command: "editor.markdown.bold" }]))
    ).toEqual(["conflictingKey"]);
    // On darwin Ctrl-i is a different key from Cmd-i.
    expect(
      effective("darwin", [{ key: "Ctrl-i", command: "editor.markdown.bold" }]).diagnostics
    ).toEqual([]);
  });

  it("a conflict with a readonly default in the same scope is rejected too", () => {
    // editor.comment.toggle (standard, editor scope) owns Mod-/.
    expect(
      codes(effective("win32", [{ key: "Mod-/", command: "editor.markdown.bold" }]))
    ).toEqual(["conflictingKey"]);
  });

  it("different scopes do not conflict (the catalog's own rule)", () => {
    // Mod-c is workspace.files.copy (pane) and nativeRole copy; an editor-scope
    // command may use it only if the editor scope has no Mod-c.
    const result = effective("win32", [{ key: "Mod-Alt-9", command: "editor.markdown.bold" }]);
    expect(result.diagnostics).toEqual([]);
  });

  it("re-binding to the key the command already has is a harmless warning", () => {
    const result = effective("win32", [{ key: "Mod-b", command: "editor.markdown.bold" }]);
    expect(codes(result)).toEqual(["duplicateUserEntry"]);
    expect(keysOf(result, "editor.markdown.bold")).toEqual(["Mod-b"]);
  });

  it("two user entries that want the same key: the later one is rejected deterministically", () => {
    const result = effective("win32", [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" },
      { key: "Mod-Alt-9", command: "editor.markdown.italic" }
    ]);
    expect(result.diagnostics).toMatchObject([{ code: "conflictingKey", index: 1 }]);
    expect(assigned(result, "editor.markdown.bold")).toEqual(["Mod-b", "Mod-Alt-9"]);
    expect(keysOf(result, "editor.markdown.italic")).toEqual(["Mod-i"]);
  });

  it("an unbind frees a key for another command's entry", () => {
    const result = effective("win32", [
      { key: "Mod-i", command: "editor.markdown.bold" },
      { key: "Mod-i", command: "-editor.markdown.italic" }
    ]);
    expect(result.diagnostics).toEqual([]);
    expect(assigned(result, "editor.markdown.bold")).toEqual(["Mod-b", "Mod-i"]);
    expect(keysOf(result, "editor.markdown.italic")).toEqual([null]);
  });

  it("rejects an unsupported `when`, accepts the command's own", () => {
    const bad = effective("win32", [
      { key: "Mod-Alt-9", command: "editor.markdown.bold", when: "editorFocus && x" }
    ]);
    expect(codes(bad)).toEqual(["unsupportedWhen"]);
    expect(keysOf(bad, "editor.markdown.bold")).toEqual(["Mod-b"]);
    const good = effective("win32", [
      {
        key: "Mod-Alt-9",
        command: "editor.markdown.bold",
        when: "editorFocus && markdownDocument && !readOnly"
      }
    ]);
    expect(good.diagnostics).toEqual([]);
    expect(good.keybindings.find((b) => b.key === "Mod-Alt-9")?.when).toBe(
      "editorFocus && markdownDocument && !readOnly"
    );
  });

  it("reports the original file index from entryIndices", () => {
    const result = effective(
      "win32",
      [
        { key: "Mod-i", command: "editor.markdown.bold" },
        { key: "Mod-k", command: "no.such.command" }
      ],
      [3, 7]
    );
    expect(result.diagnostics.map((d) => [d.code, d.index])).toEqual([
      ["conflictingKey", 3],
      ["unknownCommand", 7]
    ]);
  });

  it("is deterministic", () => {
    const entries: UserKeybindingEntry[] = [
      { key: "Mod-Alt-9", command: "editor.markdown.bold" },
      { key: "F1", command: "-workbench.commandPalette.open" },
      { key: "Mod-i", command: "editor.markdown.bold" }
    ];
    expect(effective("linux", entries)).toEqual(effective("linux", entries));
  });

  it("platform: Mod is Ctrl-style on win32 / linux and Cmd-style on darwin", () => {
    for (const platform of platforms) {
      const result = effective(platform, [
        { key: "Mod-Alt-9", command: "editor.markdown.bold" }
      ]);
      expect(result.diagnostics).toEqual([]);
      // The same canonical key is stored; platforms resolve Mod at use sites.
      expect(assigned(result, "editor.markdown.bold")).toEqual(["Mod-b", "Mod-Alt-9"]);
    }
  });

  it("effective rows never include an unsupported entry (no row with an unknown when)", () => {
    const result = effective("win32", [
      { key: "Mod-Alt-9", command: "editor.markdown.bold", when: "bogus" }
    ]);
    expect(result.keybindings.some((b) => b.when === "bogus")).toBe(false);
  });
});
