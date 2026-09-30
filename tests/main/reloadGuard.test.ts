import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  installReloadShortcutGuard,
  shouldSuppressReloadInput,
  type ReloadGuardKeyInput
} from "../../src/main/reloadGuard";
import type { PergamumPlatform } from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function keyInput(
  key: string,
  modifiers: Partial<Record<"control" | "meta" | "shift" | "alt", boolean>> = {},
  type: string = "keyDown"
): ReloadGuardKeyInput {
  return {
    type,
    key,
    control: false,
    meta: false,
    shift: false,
    alt: false,
    ...modifiers
  } as ReloadGuardKeyInput;
}

function mod(platform: PergamumPlatform): { control?: boolean; meta?: boolean } {
  return platform === "darwin" ? { meta: true } : { control: true };
}

describe("shouldSuppressReloadInput (#644)", () => {
  it.each(platforms)("%s: Mod-Shift-r and every F5 variant are suppressed", (platform) => {
    expect(
      shouldSuppressReloadInput(keyInput("R", { ...mod(platform), shift: true }), platform)
    ).toBe(true);
    expect(shouldSuppressReloadInput(keyInput("F5"), platform)).toBe(true);
    expect(shouldSuppressReloadInput(keyInput("F5", mod(platform)), platform)).toBe(true);
    expect(shouldSuppressReloadInput(keyInput("F5", { shift: true }), platform)).toBe(true);
  });

  it.each(platforms)(
    "%s: plain Mod-r is NEVER suppressed in main (ruby insertion must reach the renderer)",
    (platform) => {
      expect(shouldSuppressReloadInput(keyInput("r", mod(platform)), platform)).toBe(false);
      expect(shouldSuppressReloadInput(keyInput("R", mod(platform)), platform)).toBe(false);
    }
  );

  it("only keyDown is suppressed", () => {
    expect(shouldSuppressReloadInput(keyInput("F5", {}, "keyUp"), "win32")).toBe(false);
    expect(
      shouldSuppressReloadInput(keyInput("R", { control: true, shift: true }, "keyUp"), "win32")
    ).toBe(false);
  });

  it("ordinary shortcuts and wrong-platform modifiers are untouched", () => {
    expect(shouldSuppressReloadInput(keyInput("s", { control: true }), "win32")).toBe(false);
    expect(shouldSuppressReloadInput(keyInput("r", { control: true, alt: true }), "win32")).toBe(false);
    // Ctrl+Shift+R is not Mod-Shift-R on darwin.
    expect(
      shouldSuppressReloadInput(keyInput("R", { control: true, shift: true }), "darwin")
    ).toBe(false);
  });
});

describe("installReloadShortcutGuard (#644)", () => {
  function install(nodePlatform: NodeJS.Platform) {
    const webContents = new EventEmitter();
    installReloadShortcutGuard(
      webContents as unknown as Parameters<typeof installReloadShortcutGuard>[0],
      nodePlatform
    );
    return {
      fire(input: ReloadGuardKeyInput): boolean {
        const preventDefault = vi.fn();
        webContents.emit("before-input-event", { preventDefault }, input);
        return preventDefault.mock.calls.length > 0;
      },
      listeners: webContents.listenerCount("before-input-event")
    };
  }

  it("registers exactly one before-input-event listener", () => {
    expect(install("win32").listeners).toBe(1);
  });

  it("win32 / linux: prevents Ctrl+Shift+R and F5 but not Ctrl+R", () => {
    for (const platform of ["win32", "linux"] as const) {
      const guard = install(platform);
      expect(guard.fire(keyInput("R", { control: true, shift: true }))).toBe(true);
      expect(guard.fire(keyInput("F5"))).toBe(true);
      expect(guard.fire(keyInput("r", { control: true }))).toBe(false);
    }
  });

  it("darwin: prevents Cmd+Shift+R and F5 but not Cmd+R", () => {
    const guard = install("darwin");
    expect(guard.fire(keyInput("R", { meta: true, shift: true }))).toBe(true);
    expect(guard.fire(keyInput("F5"))).toBe(true);
    expect(guard.fire(keyInput("r", { meta: true }))).toBe(false);
  });
});

describe("main process source safety (#644)", () => {
  const read = (path: string): string => readFileSync(path, "utf8");

  it("installs the guard on the main window", () => {
    const main = read("src/main/main.ts");
    expect(main).toContain("installReloadShortcutGuard(mainWindow.webContents)");
  });

  it("registers no globalShortcut and no reload / forceReload role anywhere in main", () => {
    for (const path of ["src/main/main.ts", "src/main/menu.ts", "src/main/reloadGuard.ts"]) {
      const source = read(path);
      expect(source, path).not.toContain("globalShortcut");
      expect(source, path).not.toMatch(/role:\s*"reload"/);
      expect(source, path).not.toMatch(/role:\s*"forceReload"/);
      expect(source, path).not.toContain('roleItem("reload"');
      expect(source, path).not.toContain('roleItem("forceReload"');
    }
  });

  it("the before-input-event handler only prevents what shouldSuppressReloadInput allows (never blanket Mod-r)", () => {
    const guard = read("src/main/reloadGuard.ts");
    const handler = guard.slice(guard.indexOf('"before-input-event"'));
    expect(handler).toContain("shouldSuppressReloadInput(input, platform)");
    expect(handler.match(/preventDefault\(\)/g)).toHaveLength(1);
    expect(handler).not.toMatch(/key\s*===?\s*["'][rR]["']/);
    expect(guard).toContain("rendererMayHandle");
  });
});
