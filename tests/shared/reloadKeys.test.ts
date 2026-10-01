import { describe, expect, it } from "vitest";
import {
  classifyReloadShortcut,
  defaultKeybindingCatalog,
  keybindingCommands,
  reservedKeybindings,
  resolveDefaultKeybindings,
  validateKeybindingCatalog,
  type KeybindingCatalog,
  type KeybindingCommand,
  type PergamumPlatform,
  type ReloadGuardInput
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function input(
  key: string,
  modifiers: Partial<Record<"control" | "meta" | "shift" | "alt", boolean>> = {}
): ReloadGuardInput {
  return { key, control: false, meta: false, shift: false, alt: false, ...modifiers };
}

/** The platform's Mod modifier for a synthetic input. */
function mod(platform: PergamumPlatform): { control?: boolean; meta?: boolean } {
  return platform === "darwin" ? { meta: true } : { control: true };
}

function command(overrides: Partial<KeybindingCommand>): KeybindingCommand {
  return {
    id: "custom.command",
    title: "Custom",
    category: "Test",
    description: "test",
    scope: "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    handlerStatus: "callbackDirect",
    ...overrides
  };
}

function catalogWith(
  commands: KeybindingCommand[],
  keys: Array<{ command: string; key: string }>
): KeybindingCatalog {
  return { commands, defaults: keys, reserved: reservedKeybindings };
}

function codes(catalog: KeybindingCatalog): string[] {
  return validateKeybindingCatalog(catalog)
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
}

describe("reload / forceReload reserved keys (#644)", () => {
  it("represents every reload key with a runtimeSuppression on all platforms", () => {
    const suppressed = new Map(
      reservedKeybindings
        .filter((entry) => entry.runtimeSuppression !== undefined)
        .map((entry) => [entry.key, entry])
    );
    expect([...suppressed.keys()].sort()).toEqual(
      ["F5", "Mod-F5", "Mod-Shift-r", "Mod-r", "Shift-F5"].sort()
    );
    expect(suppressed.get("F5")).toMatchObject({
      level: "forbidden",
      runtimeSuppression: "reload"
    });
    expect(suppressed.get("Mod-F5")).toMatchObject({
      level: "forbidden",
      runtimeSuppression: "forceReload"
    });
    expect(suppressed.get("Shift-F5")).toMatchObject({
      level: "forbidden",
      runtimeSuppression: "forceReload"
    });
    expect(suppressed.get("Mod-Shift-r")).toMatchObject({
      level: "forbidden",
      runtimeSuppression: "forceReload"
    });
    for (const entry of suppressed.values()) {
      expect([...entry.platforms].sort()).toEqual(["darwin", "linux", "win32"]);
    }
  });

  it("Mod-r is the one explicit exception: reload level, allowed only for ruby insertion", () => {
    const modR = reservedKeybindings.find((entry) => entry.key === "Mod-r");
    expect(modR).toMatchObject({
      level: "reload",
      runtimeSuppression: "reload",
      allowedCommands: ["editor.markdown.insertRuby"]
    });
    expect(modR?.reason).toMatch(/ruby/i);
    // No other reserved key carries an exception list.
    expect(
      reservedKeybindings.filter((entry) => entry.allowedCommands !== undefined)
    ).toHaveLength(1);
  });

  it("the shipped catalog passes: insertRuby keeps Mod-r on every platform", () => {
    expect(codes(defaultKeybindingCatalog)).toEqual([]);
    for (const platform of platforms) {
      const users = resolveDefaultKeybindings(platform)
        .filter((binding) => binding.key === "Mod-r")
        .map((binding) => binding.command);
      expect(users).toEqual(["editor.markdown.insertRuby"]);
    }
  });

  it.each(["Mod-Shift-r", "F5", "Mod-F5", "Shift-F5"])(
    "assigning %s to a custom command fails validation on every platform",
    (key) => {
      const catalog = catalogWith(
        [command({})],
        [{ command: "custom.command", key }]
      );
      const errors = validateKeybindingCatalog(catalog).filter(
        (d) => d.code === "reservedForbiddenKey"
      );
      expect(errors.map((d) => d.platform).sort()).toEqual([
        "darwin",
        "linux",
        "win32"
      ]);
    }
  );

  it("assigning Mod-r to any other command fails (the exception is not general)", () => {
    const catalog = catalogWith(
      [command({})],
      [{ command: "custom.command", key: "Mod-r" }]
    );
    expect(codes(catalog)).toContain("reservedReloadKey");
  });

  it("checks reload keys for EVERY source: nativeRole / standard commands are caught too", () => {
    const nativeRole = command({
      id: "native.reload",
      scope: "native",
      executionHost: "nativeRole",
      source: "nativeRole",
      readonly: true,
      readonlyReason: "nativeRole",
      handlerStatus: "nativeRole"
    });
    const standard = command({
      id: "standard.reload",
      scope: "editor",
      executionHost: "standard",
      source: "standard",
      readonly: true,
      readonlyReason: "standardBehavior",
      handlerStatus: "standard"
    });
    for (const key of ["F5", "Mod-Shift-r", "Mod-F5", "Shift-F5"]) {
      expect(
        codes(catalogWith([nativeRole], [{ command: "native.reload", key }])),
        `nativeRole ${key}`
      ).toContain("reservedForbiddenKey");
      expect(
        codes(catalogWith([standard], [{ command: "standard.reload", key }])),
        `standard ${key}`
      ).toContain("reservedForbiddenKey");
    }
    expect(
      codes(catalogWith([nativeRole], [{ command: "native.reload", key: "Mod-r" }]))
    ).toContain("reservedReloadKey");
  });

  it("darwin nativeOnly keys stay allowed for nativeRole / readonly commands", () => {
    // app.hide (Mod-h), app.quit (Mod-q), window.minimize (Mod-m) in the catalog.
    const darwinNative = validateKeybindingCatalog(defaultKeybindingCatalog).filter(
      (d) => d.platform === "darwin" && d.code === "reservedNativeOnlyKey"
    );
    expect(darwinNative).toEqual([]);
    const hide = resolveDefaultKeybindings("darwin").find(
      (binding) => binding.command === "app.hide"
    );
    expect(hide).toMatchObject({ key: "Mod-h", readonly: true, source: "nativeRole" });
  });

  it("flags inconsistent runtimeSuppression data", () => {
    const catalog: KeybindingCatalog = {
      commands: [],
      defaults: [],
      reserved: [
        {
          key: "F6",
          platforms: ["win32"],
          level: "discouraged",
          reason: "bad data",
          runtimeSuppression: "reload"
        }
      ]
    };
    expect(codes(catalog)).toContain("reservedRuntimeSuppressionInvalid");
  });

  it("no catalog command other than insertRuby uses a runtime-suppressed key", () => {
    const suppressedKeys = new Set(
      reservedKeybindings
        .filter((entry) => entry.runtimeSuppression !== undefined)
        .map((entry) => entry.key)
    );
    for (const platform of platforms) {
      for (const binding of resolveDefaultKeybindings(platform)) {
        if (binding.key !== null && suppressedKeys.has(binding.key)) {
          expect(binding.command).toBe("editor.markdown.insertRuby");
        }
      }
    }
    expect(keybindingCommands.some((c) => c.id === "editor.markdown.insertRuby")).toBe(true);
  });
});

describe("classifyReloadShortcut (#644)", () => {
  it.each(platforms)("%s: Mod-Shift-r is forceReload and needs no renderer", (platform) => {
    expect(
      classifyReloadShortcut(input("R", { ...mod(platform), shift: true }), platform)
    ).toEqual({ kind: "forceReload", reservedKey: "Mod-Shift-r", rendererMayHandle: false });
  });

  it.each(platforms)("%s: plain Mod-r is reload but the renderer may handle it (ruby)", (platform) => {
    expect(classifyReloadShortcut(input("r", mod(platform)), platform)).toEqual({
      kind: "reload",
      reservedKey: "Mod-r",
      rendererMayHandle: true
    });
    // Not classified as forceReload.
    expect(classifyReloadShortcut(input("r", mod(platform)), platform)?.kind).not.toBe(
      "forceReload"
    );
  });

  it.each(platforms)("%s: F5 / Mod-F5 / Shift-F5", (platform) => {
    expect(classifyReloadShortcut(input("F5"), platform)).toMatchObject({
      kind: "reload",
      rendererMayHandle: false
    });
    expect(classifyReloadShortcut(input("F5", mod(platform)), platform)).toMatchObject({
      kind: "forceReload",
      rendererMayHandle: false
    });
    expect(classifyReloadShortcut(input("F5", { shift: true }), platform)).toMatchObject({
      kind: "forceReload",
      rendererMayHandle: false
    });
  });

  it("Mod is Cmd on darwin and Ctrl elsewhere; the wrong one is not a reload key", () => {
    expect(classifyReloadShortcut(input("r", { meta: true }), "win32")).toBeNull();
    expect(classifyReloadShortcut(input("r", { control: true }), "darwin")).toBeNull();
    expect(
      classifyReloadShortcut(input("r", { control: true, meta: true }), "darwin")
    ).toBeNull();
  });

  it("modifiers are exact: Alt variants, other keys and lookalikes are not reload", () => {
    expect(classifyReloadShortcut(input("r", { control: true, alt: true }), "win32")).toBeNull();
    expect(classifyReloadShortcut(input("r"), "win32")).toBeNull();
    expect(classifyReloadShortcut(input("e", { control: true }), "win32")).toBeNull();
    expect(classifyReloadShortcut(input("F4"), "win32")).toBeNull();
    expect(classifyReloadShortcut(input("F6"), "win32")).toBeNull();
    expect(
      classifyReloadShortcut(input("F5", { alt: true }), "win32")
    ).toBeNull();
  });
});
