import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  defaultKeybindingCatalog,
  formatKeybindingLabel,
  isValidKeybindingKey,
  keybindingCommands,
  defaultKeybindings,
  normalizeKeybindingKey,
  resolveDefaultKeybindings,
  toCodeMirrorKey,
  toElectronAccelerator,
  validateKeybindingCatalog,
  type KeybindingCatalog,
  type KeybindingCommand,
  type PergamumPlatform,
  type ReservedKeybinding
} from "../../src/shared/keybindings";

function keyOf(platform: PergamumPlatform, command: string): (string | null)[] {
  return resolveDefaultKeybindings(platform)
    .filter((binding) => binding.command === command)
    .map((binding) => binding.key);
}

function keyMap(platform: PergamumPlatform): Record<string, (string | null)[]> {
  const map: Record<string, (string | null)[]> = {};
  for (const binding of resolveDefaultKeybindings(platform)) {
    (map[binding.command] ??= []).push(binding.key);
  }
  return map;
}

function command(
  id: string,
  overrides: Partial<KeybindingCommand> = {}
): KeybindingCommand {
  return {
    id,
    title: id,
    category: "Test",
    scope: "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    description: "test command",
    handlerStatus: "notYetRegistered",
    ...overrides
  };
}

function catalog(
  commands: KeybindingCommand[],
  defaults: KeybindingCatalog["defaults"],
  reserved: readonly ReservedKeybinding[] = []
): KeybindingCatalog {
  return { commands, defaults, reserved };
}

describe("keybinding catalog data (#639)", () => {
  it("command metadata ids are unique", () => {
    const ids = keybindingCommands.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every command has a non-empty title and category", () => {
    for (const c of keybindingCommands) {
      expect(c.title.trim(), c.id).not.toBe("");
      expect(c.category.trim(), c.id).not.toBe("");
    }
  });

  it("default keybindings reference known commands", () => {
    const ids = new Set(keybindingCommands.map((c) => c.id));
    for (const entry of defaultKeybindings) {
      expect(ids.has(entry.command), entry.command).toBe(true);
    }
  });

  it("a Pergamum command is `registered` exactly when its id is in commandIds.ts", () => {
    const source = readFileSync("src/shared/commandIds.ts", "utf8");
    for (const c of keybindingCommands.filter((x) => x.source === "pergamum")) {
      expect(c.handlerStatus === "registered", c.id).toBe(
        source.includes(`"${c.id}"`)
      );
    }
  });

  it("the shipped catalog has no validation errors", () => {
    const errors = validateKeybindingCatalog().filter(
      (d) => d.severity === "error"
    );
    expect(errors).toEqual([]);
  });

  it("nativeRole commands are readonly", () => {
    const native = keybindingCommands.filter((c) => c.source === "nativeRole");
    expect(native.length).toBeGreaterThan(0);
    for (const c of native) {
      expect(c.readonly, c.id).toBe(true);
      expect(c.readonlyReason, c.id).toBe("nativeRole");
    }
  });

  it("standard commands are readonly", () => {
    const standard = keybindingCommands.filter((c) => c.source === "standard");
    expect(standard.length).toBeGreaterThan(0);
    for (const c of standard) {
      expect(c.readonly, c.id).toBe(true);
      expect(c.readonlyReason, c.id).toBe("standardBehavior");
    }
  });

  it("pergamum commands are customizable", () => {
    for (const c of keybindingCommands.filter((x) => x.source === "pergamum")) {
      expect(c.readonly, c.id).toBe(false);
      expect(c.readonlyReason, c.id).toBeNull();
    }
  });
});

describe("resolveDefaultKeybindings (#639)", () => {
  it.each(["win32", "linux", "darwin"] as const)(
    "%s resolution snapshot",
    (platform) => {
      expect(keyMap(platform)).toMatchSnapshot();
    }
  );

  it("includes metadata from the command", () => {
    const save = resolveDefaultKeybindings("win32").find(
      (b) => b.command === "editor.document.save"
    );
    expect(save).toMatchObject({
      key: "Mod-s",
      title: "Save",
      category: "File",
      scope: "app",
      executionHost: "renderer",
      source: "pergamum",
      readonly: false,
      readonlyReason: null,
      when: "activeDocument",
      handlerStatus: "registered"
    });
  });

  it("supports multiple default keys and commands with no default key", () => {
    expect(keyOf("win32", "workbench.commandPalette.open")).toEqual([
      "Mod-p",
      "F1"
    ]);
    expect(keyOf("win32", "editor.markdown.list.ordered")).toEqual([null]);
  });

  it("platform override null produces key=null", () => {
    expect(keyOf("darwin", "workbench.commandPalette.heading.open")).toEqual([
      null
    ]);
    expect(keyOf("win32", "workbench.commandPalette.heading.open")).toEqual([
      "Mod-#"
    ]);
    expect(keyOf("darwin", "workbench.commandPalette.projectSearch.open")).toEqual(
      [null]
    );
    expect(keyOf("linux", "workbench.commandPalette.projectSearch.open")).toEqual(
      ["Mod-%"]
    );
  });

  it("encodes the PO decisions", () => {
    for (const platform of ["win32", "linux", "darwin"] as const) {
      expect(keyOf(platform, "editor.saveAll")).toEqual(["Mod-Alt-s"]);
      expect(keyOf(platform, "editor.markdown.insertRuby")).toEqual(["Mod-r"]);
    }
    expect(keyOf("darwin", "editor.find.replace.open")).toEqual(["Mod-Alt-f"]);
    expect(keyOf("win32", "editor.find.replace.open")).toEqual(["Mod-h"]);
    expect(keyOf("darwin", "glossary.completion.open")).toEqual(["Alt-`"]);
    expect(keyOf("linux", "glossary.completion.open")).toEqual(["Ctrl-Space"]);
    expect(keyOf("darwin", "editor.tabCapture.toggle")).toEqual(["Shift-Alt-m"]);
    expect(keyOf("win32", "editor.tabCapture.toggle")).toEqual(["Ctrl-m"]);
  });

  it("rejects an unknown platform", () => {
    expect(() =>
      resolveDefaultKeybindings("freebsd" as unknown as PergamumPlatform)
    ).toThrow(RangeError);
  });

  it("applies win/linux overrides independently", () => {
    const cat = catalog(
      [command("a")],
      [{ command: "a", key: "Mod-a", win: "Mod-b", linux: null }]
    );
    expect(resolveDefaultKeybindings("win32", cat)[0]?.key).toBe("Mod-b");
    expect(resolveDefaultKeybindings("linux", cat)[0]?.key).toBeNull();
    expect(resolveDefaultKeybindings("darwin", cat)[0]?.key).toBe("Mod-a");
  });
});

describe("key formatting (#639)", () => {
  it("formats Mod-s per platform", () => {
    expect(formatKeybindingLabel("Mod-s", "win32")).toBe("Ctrl+S");
    expect(formatKeybindingLabel("Mod-s", "linux")).toBe("Ctrl+S");
    expect(formatKeybindingLabel("Mod-s", "darwin")).toBe("Cmd+S");
  });

  it("keeps literal Ctrl on darwin", () => {
    expect(formatKeybindingLabel("Ctrl-Space", "darwin")).toBe("Ctrl+Space");
    expect(formatKeybindingLabel("Ctrl-Space", "win32")).toBe("Ctrl+Space");
  });

  it("formats Alt / arrows / punctuation", () => {
    expect(formatKeybindingLabel("Alt-ArrowLeft", "win32")).toBe("Alt+Left");
    expect(formatKeybindingLabel("Alt-ArrowLeft", "darwin")).toBe("Option+Left");
    expect(formatKeybindingLabel("Mod-Shift-p", "win32")).toBe("Ctrl+Shift+P");
    expect(formatKeybindingLabel("Mod-,", "darwin")).toBe("Cmd+,");
    expect(formatKeybindingLabel("F2", "linux")).toBe("F2");
  });

  it("converts to Electron accelerators", () => {
    expect(toElectronAccelerator("Mod-Shift-p", "win32")).toBe("Control+Shift+P");
    expect(toElectronAccelerator("Mod-Shift-p", "darwin")).toBe("Command+Shift+P");
    expect(toElectronAccelerator("Mod-+", "win32")).toBe("Control+Plus");
    expect(toElectronAccelerator("Alt-ArrowLeft", "linux")).toBe("Alt+Left");
    expect(toElectronAccelerator("Ctrl-Space", "darwin")).toBe("Control+Space");
  });

  it("converts to CodeMirror keys", () => {
    expect(toCodeMirrorKey("Shift-Alt-m", "darwin")).toBe("Alt-Shift-m");
    expect(toCodeMirrorKey("Mod-s", "win32")).toBe("Ctrl-s");
    expect(toCodeMirrorKey("Mod-s", "darwin")).toBe("Mod-s");
    expect(toCodeMirrorKey("Ctrl-Mod-f", "win32")).toBe("Ctrl-f");
  });

  it("accepts canonical notation examples", () => {
    for (const key of [
      "Mod-s",
      "Mod-Shift-p",
      "Mod-Alt-s",
      "Ctrl-Space",
      "Alt-ArrowLeft",
      "Shift-Alt-m",
      "F2",
      "Mod-,",
      "Mod-.",
      "Mod-#",
      "Mod--",
      "Alt-`"
    ]) {
      expect(isValidKeybindingKey(key), key).toBe(true);
    }
  });

  it("rejects invalid notation", () => {
    for (const key of [
      "",
      "Mod-",
      "Mod-S",
      "Mod+s",
      "CommandOrControl-s",
      "Mod-Mod-s",
      "Mod-ss",
      "Mod-F25",
      "Cmd-s",
      "Mod-space"
    ]) {
      expect(isValidKeybindingKey(key), key).toBe(false);
    }
    expect(() => formatKeybindingLabel("Mod-S", "win32")).toThrow(RangeError);
  });

  it("normalizes modifier order", () => {
    expect(normalizeKeybindingKey("Shift-Alt-m")).toBe(
      normalizeKeybindingKey("Alt-Shift-m")
    );
    expect(normalizeKeybindingKey("nope-")).toBeNull();
  });
});

describe("validateKeybindingCatalog (#639)", () => {
  it("detects duplicate command ids", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog([command("a"), command("a")], [])
    );
    expect(diagnostics.map((d) => d.code)).toContain("duplicateCommandId");
  });

  it("detects empty title/category and unknown commands", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a", { title: " ", category: "" })],
        [{ command: "missing", key: "Mod-a" }]
      )
    );
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("emptyCommandTitle");
    expect(codes).toContain("emptyCommandCategory");
    expect(codes).toContain("unknownCommand");
  });

  it("detects invalid key notation in defaults and reserved data", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a")],
        [{ command: "a", key: "Mod-A", mac: "Cmd-s" }],
        [{ key: "Mod+q", platforms: ["darwin"], level: "forbidden", reason: "" }]
      )
    );
    expect(
      diagnostics.filter((d) => d.code === "invalidKeyNotation")
    ).toHaveLength(3);
  });

  it("detects invalid platform names in reserved data", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [],
        [],
        [
          {
            key: "Mod-q",
            platforms: ["amiga" as unknown as PergamumPlatform],
            level: "forbidden",
            reason: ""
          }
        ]
      )
    );
    expect(diagnostics.map((d) => d.code)).toContain("invalidPlatform");
  });

  it("detects duplicate customizable keys in the same platform and scope", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a"), command("b"), command("c", { scope: "editor" })],
        [
          { command: "a", key: "Shift-Alt-m" },
          { command: "b", key: "Alt-Shift-m" },
          { command: "c", key: "Alt-Shift-m" }
        ]
      )
    );
    const duplicates = diagnostics.filter((d) => d.code === "duplicateKey");
    // One per platform; the editor-scoped "c" is not part of it.
    expect(duplicates).toHaveLength(3);
    expect(duplicates[0]?.message).toContain("a, b");
    expect(duplicates[0]?.severity).toBe("error");
  });

  it("does not report the same key on different platforms as duplicate", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a"), command("b")],
        [
          { command: "a", key: "Mod-a", mac: "Mod-x" },
          { command: "b", key: null, mac: "Mod-a" }
        ]
      )
    );
    expect(
      diagnostics.filter((d) => d.code === "duplicateKey")
    ).toHaveLength(0);
  });

  it("reports readonly duplicates separately as warnings", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [
          command("a"),
          command("b", {
            source: "standard",
            readonly: true,
            readonlyReason: "standardBehavior"
          })
        ],
        [
          { command: "a", key: "Mod-a" },
          { command: "b", key: "Mod-a" }
        ]
      )
    );
    expect(diagnostics.some((d) => d.code === "duplicateKey")).toBe(false);
    const readonlyDup = diagnostics.filter(
      (d) => d.code === "duplicateReadonlyKey"
    );
    expect(readonlyDup).toHaveLength(3);
    expect(readonlyDup[0]?.severity).toBe("warning");
  });

  it("detects forbidden reserved key usage only on listed platforms", () => {
    const reserved: ReservedKeybinding[] = [
      {
        key: "Mod-Shift-3",
        platforms: ["darwin"],
        level: "forbidden",
        reason: "screenshot"
      }
    ];
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a")],
        [{ command: "a", key: "Shift-Mod-3" }],
        reserved
      )
    );
    const hits = diagnostics.filter((d) => d.code === "reservedForbiddenKey");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.platform).toBe("darwin");
  });

  it("restricts nativeOnly keys to native scope / nativeRole", () => {
    const reserved: ReservedKeybinding[] = [
      { key: "Mod-m", platforms: ["darwin"], level: "nativeOnly", reason: "min" }
    ];
    const bad = validateKeybindingCatalog(
      catalog([command("a")], [{ command: "a", key: "Mod-m" }], reserved)
    );
    expect(bad.map((d) => d.code)).toContain("reservedNativeOnlyKey");

    const good = validateKeybindingCatalog(
      catalog(
        [
          command("n", {
            scope: "native",
            source: "nativeRole",
            executionHost: "nativeRole",
            readonly: true,
            readonlyReason: "nativeRole"
          })
        ],
        [{ command: "n", key: "Mod-m" }],
        reserved
      )
    );
    expect(good.map((d) => d.code)).not.toContain("reservedNativeOnlyKey");
  });

  it("warns on discouraged keys", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("a")],
        [{ command: "a", key: "Ctrl-a" }],
        [{ key: "Ctrl-a", platforms: ["darwin"], level: "discouraged", reason: "" }]
      )
    );
    expect(diagnostics.map((d) => d.code)).toEqual(["reservedDiscouragedKey"]);
  });

  it("allows reload-level Mod-r only for allowedCommands", () => {
    const reserved: ReservedKeybinding[] = [
      {
        key: "Mod-r",
        platforms: ["darwin", "win32", "linux"],
        level: "reload",
        reason: "",
        allowedCommands: ["ruby"]
      }
    ];
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [command("ruby"), command("other", { scope: "editor" })],
        [
          { command: "ruby", key: "Mod-r" },
          { command: "other", key: "Mod-r" }
        ],
        reserved
      )
    );
    const hits = diagnostics.filter((d) => d.code === "reservedReloadKey");
    expect(hits).toHaveLength(3);
    expect(hits.every((d) => d.command === "other")).toBe(true);
  });

  it("forbids Mod-Shift-r and F5 for custom commands on every platform", () => {
    for (const key of ["Mod-Shift-r", "F5"]) {
      const diagnostics = validateKeybindingCatalog({
        ...defaultKeybindingCatalog,
        commands: [...keybindingCommands, command("custom.reload")],
        defaults: [...defaultKeybindings, { command: "custom.reload", key }]
      });
      const hits = diagnostics.filter(
        (d) => d.code === "reservedForbiddenKey" && d.command === "custom.reload"
      );
      expect(hits.map((d) => d.platform).sort(), key).toEqual([
        "darwin",
        "linux",
        "win32"
      ]);
    }
  });

  it("the shipped catalog only uses Mod-r for Ruby", () => {
    for (const platform of ["win32", "linux", "darwin"] as const) {
      const users = resolveDefaultKeybindings(platform)
        .filter((b) => b.key === "Mod-r")
        .map((b) => b.command);
      expect(users).toEqual(["editor.markdown.insertRuby"]);
    }
  });

  it("encodes blockquote and tab navigation defaults", () => {
    expect(keyOf("win32", "editor.markdown.insertBlockquote")).toEqual(["Mod-Shift-q"]);
    expect(keyOf("darwin", "editor.markdown.insertBlockquote")).toEqual(["Mod-Alt-q"]);
    expect(keyOf("linux", "workspace.tabs.previous")).toEqual(["Alt-ArrowLeft"]);
    expect(keyOf("darwin", "workspace.tabs.previous")).toEqual(["Mod-Alt-ArrowLeft"]);
    expect(keyOf("win32", "workspace.tabs.next")).toEqual(["Alt-ArrowRight"]);
    expect(keyOf("darwin", "workspace.tabs.next")).toEqual(["Mod-Alt-ArrowRight"]);
  });

  it("requires nativeRole and standard commands to be readonly", () => {
    const diagnostics = validateKeybindingCatalog(
      catalog(
        [
          command("n", { source: "nativeRole" }),
          command("s", { source: "standard" })
        ],
        []
      )
    );
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain("nativeRoleNotReadonly");
    expect(codes).toContain("standardNotReadonly");
  });

  it("the shipped darwin catalog avoids forbidden / nativeOnly reserved keys", () => {
    const diagnostics = validateKeybindingCatalog(defaultKeybindingCatalog);
    expect(
      diagnostics.filter((d) => d.code.startsWith("reserved"))
    ).toEqual([]);
  });
});
