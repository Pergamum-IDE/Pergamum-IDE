import { describe, expect, it } from "vitest";
import {
  defaultKeybindingCatalog,
  defaultKeybindings,
  formatKeybindingLabel,
  parseKeybindingKey,
  reservedKeybindings,
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  toCodeMirrorKey,
  toElectronAccelerator,
  validateKeybindingCatalog,
  type PergamumPlatform,
  type ResolvedKeybinding
} from "../../src/shared/keybindings";

/**
 * #654: cross-platform verification that does not need the physical OS.
 * Windows and Linux are dogfooded by hand; macOS is verified here statically
 * (resolver, reserved-key tables, native-role ownership, generated labels and
 * accelerators). This is NOT a physical macOS check.
 */

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function assigned(platform: PergamumPlatform): ResolvedKeybinding[] {
  return resolveDefaultKeybindings(platform).filter(
    (row): row is ResolvedKeybinding & { key: string } => row.key !== null
  );
}

function ownersOf(platform: PergamumPlatform, key: string): string[] {
  const wanted = toCodeMirrorKey(key, platform);
  return assigned(platform)
    .filter((row) => toCodeMirrorKey(row.key as string, platform) === wanted)
    .map((row) => row.command);
}

describe("Mod resolution per platform (#654)", () => {
  it("every Mod default is Ctrl on win32 / linux and Cmd on darwin, in labels, accelerators and CodeMirror keys", () => {
    for (const entry of defaultKeybindings) {
      if (entry.key === null || !parseKeybindingKey(entry.key)?.modifiers.has("Mod")) {
        continue;
      }
      for (const platform of platforms) {
        const row = assigned(platform).find(
          (candidate) =>
            candidate.command === entry.command && candidate.key === entry.key
        );
        if (row === undefined) {
          continue; // overridden on this platform
        }
        const label = formatKeybindingLabel(entry.key, platform);
        const accelerator = toElectronAccelerator(entry.key, platform);
        const codeMirror = toCodeMirrorKey(entry.key, platform);
        if (platform === "darwin") {
          expect(label, entry.key).toMatch(/^Cmd\+/);
          expect(accelerator, entry.key).toMatch(/^Command\+/);
          expect(codeMirror, entry.key).toMatch(/^Cmd-/);
        } else {
          expect(label, entry.key).toMatch(/^Ctrl\+/);
          expect(accelerator, entry.key).toMatch(/^Control\+/);
          expect(codeMirror, entry.key).toMatch(/^Ctrl-/);
        }
        expect(label).not.toContain("Mod");
      }
    }
  });

  it("representative commands: Save, Command Palette, Bold, Ruby", () => {
    const expected: Record<string, [string, string]> = {
      "editor.document.save": ["Ctrl+S", "Cmd+S"],
      "workbench.commandPalette.open": ["Ctrl+P", "Cmd+P"],
      "editor.markdown.bold": ["Ctrl+B", "Cmd+B"],
      "editor.markdown.insertRuby": ["Ctrl+R", "Cmd+R"]
    };
    for (const [command, [other, mac]] of Object.entries(expected)) {
      for (const platform of platforms) {
        const label = assigned(platform).find((row) => row.command === command)?.key;
        expect(formatKeybindingLabel(label as string, platform)).toBe(
          platform === "darwin" ? mac : other
        );
      }
    }
  });

  it("Alt is shown as Option only on darwin", () => {
    expect(formatKeybindingLabel("Mod-Alt-s", "darwin")).toBe("Cmd+Option+S");
    expect(formatKeybindingLabel("Mod-Alt-s", "win32")).toBe("Ctrl+Alt+S");
    expect(formatKeybindingLabel("Mod-Alt-s", "linux")).toBe("Ctrl+Alt+S");
  });

  it("win32 and linux resolve to exactly the same defaults", () => {
    expect(resolveDefaultKeybindings("win32")).toEqual(resolveDefaultKeybindings("linux"));
  });
});

describe("literal Ctrl defaults (#654)", () => {
  /** The only commands whose common default is a literal Ctrl (not Mod). */
  const ctrlFixedCommon = defaultKeybindings
    .filter((entry) => entry.key !== null && parseKeybindingKey(entry.key)?.modifiers.has("Ctrl"))
    .map((entry) => `${entry.command} ${entry.key} mac=${String(entry.mac)}`)
    .sort();

  it("are exactly glossary completion (Ctrl-Space) and tab capture (Ctrl-m), both replaced on darwin", () => {
    expect(ctrlFixedCommon).toEqual([
      "editor.tabCapture.toggle Ctrl-m mac=Shift-Alt-m",
      "glossary.completion.open Ctrl-Space mac=Alt-`"
    ]);
  });

  it("darwin keeps literal Ctrl only for the native fullscreen role (Ctrl-Cmd-F)", () => {
    const withCtrl = assigned("darwin")
      .filter((row) => parseKeybindingKey(row.key as string)?.modifiers.has("Ctrl"))
      .map((row) => `${row.command} ${row.key} ${row.source}`);
    expect(withCtrl).toEqual(["window.toggleFullscreen Ctrl-Mod-f nativeRole"]);
  });

  it("win32 / linux never use a Cmd-only meaning: no resolved key mentions Cmd", () => {
    for (const platform of ["win32", "linux"] as const) {
      for (const row of assigned(platform)) {
        expect(formatKeybindingLabel(row.key as string, platform)).not.toMatch(/Cmd|Option/);
      }
    }
  });
});

describe("macOS reserved keys (#654)", () => {
  const darwinReserved = (key: string) =>
    reservedKeybindings.find((entry) => entry.key === key && entry.platforms.includes("darwin"));

  it.each([
    ["Mod-Space", "forbidden"],
    ["Ctrl-Space", "forbidden"],
    ["Ctrl-Mod-Space", "forbidden"],
    ["Mod-Shift-3", "forbidden"],
    ["Mod-Shift-4", "forbidden"],
    ["Mod-Shift-5", "forbidden"],
    ["Mod-Tab", "forbidden"],
    ["Mod-`", "forbidden"],
    ["Mod-Alt-Escape", "forbidden"],
    ["Ctrl-Mod-q", "forbidden"],
    ["Mod-h", "nativeOnly"],
    ["Mod-Alt-h", "nativeOnly"],
    ["Mod-m", "nativeOnly"],
    ["Mod-q", "nativeOnly"],
    ["Mod-Shift-q", "nativeOnly"]
  ] as const)("%s is reserved on darwin as %s", (key, level) => {
    expect(darwinReserved(key)?.level).toBe(level);
  });

  it("the macOS-only keys are not reserved on win32 / linux", () => {
    const macOnly = reservedKeybindings.filter(
      (entry) => entry.runtimeSuppression === undefined
    );
    for (const entry of macOnly) {
      expect(entry.platforms, entry.key).toEqual(["darwin"]);
    }
  });

  it("the shifted-symbol spellings of the screenshot keys (Mod-# / $ / %) are reserved too, on darwin only", () => {
    for (const key of ["Mod-#", "Mod-$", "Mod-%"]) {
      for (const platform of ["win32", "linux"] as const) {
        const result = resolveEffectiveKeybindings({
          platform,
          userEntries: [{ key, command: "editor.markdown.bold" }]
        });
        expect(result.diagnostics.map((d) => d.code), `${platform} ${key}`).toEqual([]);
      }
      const darwin = resolveEffectiveKeybindings({
        platform: "darwin",
        userEntries: [{ key, command: "editor.markdown.bold" }]
      });
      expect(darwin.diagnostics.map((d) => [d.code, d.severity]), key).toEqual([
        ["reservedForbiddenKey", "error"]
      ]);
      expect(
        darwin.keybindings.some((row) => row.origin === "user"),
        `${key} must not be applied on darwin`
      ).toBe(false);
    }
  });

  it("the shipped catalog has no validation error (it validates every platform)", () => {
    expect(
      validateKeybindingCatalog(defaultKeybindingCatalog).filter(
        (d) => d.severity === "error"
      )
    ).toEqual([]);
  });
});

describe("macOS native roles and OS text-editing keys (#654)", () => {
  it("Cmd+M / Cmd+H / Cmd+Q / Cmd+Opt+H belong to native roles only", () => {
    expect(ownersOf("darwin", "Mod-m")).toEqual(["window.minimize"]);
    expect(ownersOf("darwin", "Mod-h")).toEqual(["app.hide"]);
    expect(ownersOf("darwin", "Mod-q")).toEqual(["app.quit"]);
    expect(ownersOf("darwin", "Mod-Alt-h")).toEqual(["app.hideOthers"]);
    for (const command of ["window.minimize", "app.hide", "app.quit", "app.hideOthers"]) {
      const row = assigned("darwin").find((candidate) => candidate.command === command)!;
      expect(row.source, command).toBe("nativeRole");
      expect(row.readonly, command).toBe(true);
    }
  });

  it("Cmd+W is the editor's Close Tab; the native close role has Cmd+Shift+W", () => {
    expect(ownersOf("darwin", "Mod-w")).toEqual(["editor.close"]);
    expect(ownersOf("darwin", "Mod-Shift-w")).toEqual(["window.close"]);
  });

  it("the copy / cut / paste / select all / undo / redo roles are readonly nativeRole on every platform", () => {
    for (const platform of platforms) {
      for (const command of [
        "editor.selection.copy",
        "editor.selection.cut",
        "editor.selection.paste",
        "editor.selection.selectAll",
        "editor.undo",
        "editor.redo"
      ]) {
        const row = assigned(platform).find((candidate) => candidate.command === command)!;
        expect(row.source, `${platform} ${command}`).toBe("nativeRole");
        expect(row.readonly).toBe(true);
      }
    }
  });

  it("no Pergamum command takes Option+Left/Right (word movement) or Cmd+Arrow (line / document movement) on darwin", () => {
    const taken = new Set(["Alt-ArrowLeft", "Alt-ArrowRight", "Mod-ArrowLeft", "Mod-ArrowRight", "Mod-ArrowUp", "Mod-ArrowDown"]);
    for (const row of assigned("darwin")) {
      const key = row.key as string;
      if (taken.has(key)) {
        expect(row.source, `${row.command} ${key}`).not.toBe("pergamum");
      }
    }
  });

  it("no Pergamum default on darwin is a bare Ctrl+letter (macOS Emacs-style text editing keys)", () => {
    for (const row of assigned("darwin")) {
      if (row.source !== "pergamum") {
        continue;
      }
      expect(row.key, row.command).not.toMatch(/^Ctrl-[a-z]$/);
    }
  });
});
