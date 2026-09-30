// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  eventMatchesCatalogKey
} from "../../src/renderer/keybindings/catalogKeyMatch";
import {
  RENDERER_SHORTCUT_COMMAND_IDS,
  RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS,
  createRendererShortcutBindings,
  matchRendererShortcut,
  rendererShortcutCommandIds,
  resolveRendererShortcutKeybindings
} from "../../src/renderer/keybindings/rendererShortcuts";
import { EDITOR_KEYMAP_COMMAND_IDS } from "../../src/renderer/keybindings/editorKeybindingHandlers";
import { shouldHandleTabSwitchShortcut } from "../../src/renderer/editorTabShortcuts";
import { shouldHandleActiveFindShortcut } from "../../src/renderer/editorFindShortcuts";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import {
  keybindingCommands,
  reservedKeybindings,
  normalizeKeybindingKey,
  type PergamumPlatform
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function ev(
  key: string,
  modifiers: Partial<
    Record<"ctrlKey" | "metaKey" | "shiftKey" | "altKey", boolean>
  > = {},
  extra: { code?: string; isComposing?: boolean } = {}
) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
    ...extra
  };
}

describe("resolveRendererShortcutKeybindings (#643)", () => {
  it("has exactly the expected number of renderer shortcut commands", () => {
    // 5 palette + 4 pane toggles + 3 (preview / image / syntax checker)
    // + 2 tabs + 2 find + 5 file explorer.
    expect(RENDERER_SHORTCUT_COMMAND_IDS).toHaveLength(21);
    expect(RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS).toHaveLength(5);
    expect([...RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS].sort()).toEqual([
      "editor.find.next",
      "editor.find.previous",
      "editor.image.insert",
      "editor.markdown.toggleSyntaxChecker",
      "editor.preview.toggle"
    ]);
  });

  it.each(platforms)("%s: only customizable app / pane / window-listener bindings with a key", (platform) => {
    for (const binding of resolveRendererShortcutKeybindings(platform)) {
      expect(binding.source, binding.command).toBe("pergamum");
      expect(binding.readonly, binding.command).toBe(false);
      expect(binding.key, binding.command).not.toBeNull();
      if (binding.scope === "editor") {
        expect(
          RENDERER_WINDOW_LISTENER_EDITOR_COMMAND_IDS,
          binding.command
        ).toContain(binding.command);
      } else {
        expect(["app", "pane"], binding.command).toContain(binding.scope);
      }
    }
  });

  it("darwin leaves out the # / % palette shortcuts (catalog key null)", () => {
    const darwin = resolveRendererShortcutKeybindings("darwin").map((b) => b.command);
    expect(darwin).not.toContain(rendererShortcutCommandIds.commandPaletteHeading);
    expect(darwin).not.toContain(rendererShortcutCommandIds.commandPaletteProjectSearch);
    const win = resolveRendererShortcutKeybindings("win32").map((b) => b.command);
    expect(win).toContain(rendererShortcutCommandIds.commandPaletteHeading);
    expect(win).toContain(rendererShortcutCommandIds.commandPaletteProjectSearch);
  });

  it.each(platforms)("%s: binding snapshot", (platform) => {
    expect(createRendererShortcutBindings(platform)).toMatchSnapshot();
  });
});

describe("catalog consistency (#643)", () => {
  const known = new Map(keybindingCommands.map((c) => [c.id, c]));

  it("every renderer shortcut command exists in the command metadata and default keys", () => {
    for (const id of RENDERER_SHORTCUT_COMMAND_IDS) {
      const command = known.get(id);
      expect(command, id).toBeDefined();
      expect(command?.source, id).toBe("pergamum");
      expect(command?.readonly, id).toBe(false);
    }
    const withKeys = new Set(
      resolveRendererShortcutKeybindings("win32").map((b) => b.command)
    );
    for (const id of RENDERER_SHORTCUT_COMMAND_IDS) {
      expect(withKeys.has(id), id).toBe(true);
    }
  });

  it("no readonly / nativeRole / standard command is a renderer shortcut target", () => {
    for (const command of keybindingCommands) {
      if (command.readonly || command.source !== "pergamum") {
        expect(RENDERER_SHORTCUT_COMMAND_IDS, command.id).not.toContain(command.id);
      }
    }
  });

  it("menu-only app commands are not renderer listeners (no double registration with #642)", () => {
    for (const platform of platforms) {
      const menu = createMenuAcceleratorLookup(platform);
      for (const id of RENDERER_SHORTCUT_COMMAND_IDS) {
        expect(menu.getAll(id), `${id} on ${platform}`).toEqual([]);
      }
    }
  });

  it("the CodeMirror keymap (#641) and window listeners overlap only intentionally", () => {
    const overlap = RENDERER_SHORTCUT_COMMAND_IDS.filter((id) =>
      EDITOR_KEYMAP_COMMAND_IDS.includes(id)
    ).sort();
    // Editor focus: CodeMirror consumes the event first; elsewhere the window
    // listener handles it. Nothing else may be in both.
    expect(overlap).toEqual([
      "editor.image.insert",
      "editor.markdown.toggleSyntaxChecker"
    ]);
  });

  it.each(platforms)("%s: no duplicate key within one scope among renderer shortcuts", (platform) => {
    const seen = new Map<string, string>();
    for (const binding of resolveRendererShortcutKeybindings(platform)) {
      const key = `${binding.scope}:${normalizeKeybindingKey(binding.key as string)}`;
      expect(seen.get(key), key).toBeUndefined();
      seen.set(key, binding.command);
    }
  });

  it("darwin renderer shortcuts avoid forbidden / nativeOnly reserved keys", () => {
    const reserved = new Set(
      reservedKeybindings
        .filter(
          (r) =>
            r.platforms.includes("darwin") &&
            (r.level === "forbidden" || r.level === "nativeOnly")
        )
        .map((r) => normalizeKeybindingKey(r.key))
    );
    for (const binding of resolveRendererShortcutKeybindings("darwin")) {
      expect(
        reserved.has(normalizeKeybindingKey(binding.key as string)),
        `${binding.command} ${binding.key}`
      ).toBe(false);
    }
  });

  it("App.tsx registers every global shortcut through a catalog command id (no key literals)", () => {
    const source = readFileSync("src/renderer/App.tsx", "utf8");
    const start = source.indexOf("useGlobalKeyboardShortcuts([");
    const end = source.indexOf("\n  function closeSpecialTab", start);
    const block = source.slice(start, end);
    expect(block).not.toMatch(/match:\s*\{/);
    expect(block).not.toContain("ignoreShiftAndAltState");
    expect(block.match(/commandId: rendererShortcutCommandIds\./g)).toHaveLength(12);
  });
});

describe("matchRendererShortcut (#643)", () => {
  it("Mod-o is Ctrl+O on win32 / linux and Cmd+O on darwin", () => {
    const id = rendererShortcutCommandIds.commandPaletteFile;
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "win32")).toBe(true);
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "linux")).toBe(true);
    expect(matchRendererShortcut(ev("o", { metaKey: true }), id, "darwin")).toBe(true);
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), id, "darwin")).toBe(false);
    expect(matchRendererShortcut(ev("o", { metaKey: true }), id, "win32")).toBe(false);
  });

  it("Alt-ArrowLeft is Option+Left on win32; darwin needs Cmd+Option+Left", () => {
    const id = rendererShortcutCommandIds.tabsPrevious;
    expect(matchRendererShortcut(ev("ArrowLeft", { altKey: true }), id, "win32")).toBe(true);
    expect(matchRendererShortcut(ev("ArrowLeft", { altKey: true }), id, "darwin")).toBe(false);
    expect(
      matchRendererShortcut(ev("ArrowLeft", { altKey: true, metaKey: true }), id, "darwin")
    ).toBe(true);
    expect(
      matchRendererShortcut(ev("ArrowLeft", { altKey: true, ctrlKey: true }), id, "win32")
    ).toBe(false);
  });

  it("Shift-required bindings do not match without Shift", () => {
    const id = rendererShortcutCommandIds.previewToggle;
    expect(matchRendererShortcut(ev("p", { ctrlKey: true }), id, "win32")).toBe(false);
    expect(
      matchRendererShortcut(ev("P", { ctrlKey: true, shiftKey: true }), id, "win32")
    ).toBe(true);
  });

  it("F3 / Shift+F3 and F2 are exact", () => {
    const next = rendererShortcutCommandIds.findNext;
    const prev = rendererShortcutCommandIds.findPrevious;
    expect(matchRendererShortcut(ev("F3"), next, "win32")).toBe(true);
    expect(matchRendererShortcut(ev("F3", { shiftKey: true }), next, "win32")).toBe(false);
    expect(matchRendererShortcut(ev("F3", { shiftKey: true }), prev, "win32")).toBe(true);
    expect(matchRendererShortcut(ev("F3", { ctrlKey: true }), next, "win32")).toBe(false);
    const rename = rendererShortcutCommandIds.filesRename;
    expect(matchRendererShortcut(ev("F2"), rename, "linux")).toBe(true);
    expect(matchRendererShortcut(ev("F2", { shiftKey: true }), rename, "linux")).toBe(false);
    expect(matchRendererShortcut(ev("F2", { altKey: true }), rename, "linux")).toBe(false);
  });

  it("Delete fires alone; Shift+Delete and Alt+Delete do not (strict, decided in #643)", () => {
    const id = rendererShortcutCommandIds.filesDelete;
    expect(matchRendererShortcut(ev("Delete"), id, "win32")).toBe(true);
    expect(matchRendererShortcut(ev("Delete", { shiftKey: true }), id, "win32")).toBe(false);
    expect(matchRendererShortcut(ev("Delete", { altKey: true }), id, "win32")).toBe(false);
    expect(matchRendererShortcut(ev("Delete", { ctrlKey: true }), id, "win32")).toBe(false);
  });

  it("file explorer Mod-c / x / v: Cmd on darwin, Ctrl elsewhere, nothing extra", () => {
    for (const [key, id] of [
      ["c", rendererShortcutCommandIds.filesCopy],
      ["x", rendererShortcutCommandIds.filesCut],
      ["v", rendererShortcutCommandIds.filesPaste]
    ] as const) {
      expect(matchRendererShortcut(ev(key, { ctrlKey: true }), id, "win32")).toBe(true);
      expect(matchRendererShortcut(ev(key, { metaKey: true }), id, "darwin")).toBe(true);
      expect(matchRendererShortcut(ev(key, { ctrlKey: true }), id, "darwin")).toBe(false);
      expect(
        matchRendererShortcut(ev(key, { ctrlKey: true, shiftKey: true }), id, "win32")
      ).toBe(false);
      expect(
        matchRendererShortcut(ev(key, { ctrlKey: true, altKey: true }), id, "win32")
      ).toBe(false);
    }
  });

  it("an unknown command or a null platform key never matches", () => {
    expect(matchRendererShortcut(ev("o", { ctrlKey: true }), "no.such.command", "win32")).toBe(
      false
    );
    expect(
      matchRendererShortcut(
        ev("#", { metaKey: true, shiftKey: true }),
        rendererShortcutCommandIds.commandPaletteHeading,
        "darwin"
      )
    ).toBe(false);
  });

  it("never matches during composition, and AltGraph is not Ctrl+Alt", () => {
    const id = rendererShortcutCommandIds.commandPaletteGlossary;
    expect(
      matchRendererShortcut(ev("@", { ctrlKey: true }, { isComposing: true }), id, "win32")
    ).toBe(false);
    expect(
      matchRendererShortcut(
        {
          ...ev("@", { ctrlKey: true, altKey: true }),
          getModifierState: (key: string) => key === "AltGraph"
        },
        id,
        "win32"
      )
    ).toBe(false);
  });

  it("matches letters on the logical key (layout-independent behavior preserved)", () => {
    // Dvorak: the physical KeyO position types "r"; the key "o" is elsewhere.
    const id = rendererShortcutCommandIds.commandPaletteFile;
    expect(
      matchRendererShortcut(ev("o", { ctrlKey: true }, { code: "KeyS" }), id, "win32")
    ).toBe(true);
    expect(
      matchRendererShortcut(ev("r", { ctrlKey: true }, { code: "KeyO" }), id, "win32")
    ).toBe(false);
  });
});

describe("eventMatchesCatalogKey options (#643)", () => {
  it("Ctrl-Space matches Ctrl+Space only", () => {
    const space = { ...ev(" ", { ctrlKey: true }), code: "Space" };
    expect(eventMatchesCatalogKey(space, "Ctrl-Space", "win32")).toBe(true);
    expect(eventMatchesCatalogKey(space, "Ctrl-Space", "darwin")).toBe(true);
    expect(
      eventMatchesCatalogKey({ ...space, ctrlKey: false, metaKey: true }, "Ctrl-Space", "darwin")
    ).toBe(false);
    expect(
      eventMatchesCatalogKey({ ...space, shiftKey: true }, "Ctrl-Space", "win32")
    ).toBe(false);
    expect(
      eventMatchesCatalogKey(ev(" ", { ctrlKey: true }, { code: "Space" }), "Ctrl-Space", "win32", {
        keyBasis: "logical"
      })
    ).toBe(true);
  });

  it("symbol tolerance applies only to Mod-only symbol keys", () => {
    const hash = ev("#", { ctrlKey: true, shiftKey: true });
    expect(
      eventMatchesCatalogKey(hash, "Mod-#", "win32", { tolerateSymbolModifiers: true })
    ).toBe(true);
    expect(eventMatchesCatalogKey(hash, "Mod-#", "win32")).toBe(false);
    // A catalog key that itself carries Shift stays exact.
    expect(
      eventMatchesCatalogKey(
        ev("p", { ctrlKey: true }),
        "Mod-Shift-p",
        "win32",
        { tolerateSymbolModifiers: true, keyBasis: "logical" }
      )
    ).toBe(false);
  });
});

describe("window listeners stay guarded and catalog-driven (#643)", () => {
  const target = document.body;

  it("tab switching uses the catalog keys and keeps the modal / composition guards", () => {
    const base = { ...ev("ArrowLeft", { altKey: true }), target };
    expect(shouldHandleTabSwitchShortcut(base, false, "win32")).toBe("previous");
    expect(
      shouldHandleTabSwitchShortcut({ ...base, key: "ArrowRight" }, false, "win32")
    ).toBe("next");
    expect(shouldHandleTabSwitchShortcut(base, true, "win32")).toBeNull();
    expect(
      shouldHandleTabSwitchShortcut({ ...base, isComposing: true }, false, "win32")
    ).toBeNull();
    expect(
      shouldHandleTabSwitchShortcut({ ...base, defaultPrevented: true }, false, "win32")
    ).toBeNull();
    expect(shouldHandleTabSwitchShortcut(base, false, "darwin")).toBeNull();
    expect(
      shouldHandleTabSwitchShortcut({ ...base, metaKey: true }, false, "darwin")
    ).toBe("previous");
  });

  it("F3 navigation uses the catalog keys and keeps the guards", () => {
    const f3 = { ...ev("F3"), target };
    expect(shouldHandleActiveFindShortcut(f3, false)).toBe("next");
    expect(shouldHandleActiveFindShortcut({ ...f3, shiftKey: true }, false)).toBe("previous");
    expect(shouldHandleActiveFindShortcut({ ...f3, ctrlKey: true }, false)).toBeNull();
    expect(shouldHandleActiveFindShortcut(f3, true)).toBeNull();
    expect(shouldHandleActiveFindShortcut({ ...f3, isComposing: true }, false)).toBeNull();
  });
});
