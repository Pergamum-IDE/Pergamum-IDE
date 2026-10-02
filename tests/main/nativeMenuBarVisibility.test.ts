import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  hideNativeMenuBar,
  shouldHideNativeMenuBar
} from "../../src/main/nativeMenuBarVisibility";

function fakeWindow(destroyed = false) {
  return {
    isDestroyed: () => destroyed,
    setMenuBarVisibility: vi.fn()
  };
}

describe("native menu bar visibility (#663)", () => {
  it("hides the visible native bar on Windows and Linux only", () => {
    expect(shouldHideNativeMenuBar("win32")).toBe(true);
    expect(shouldHideNativeMenuBar("linux")).toBe(true);
    expect(shouldHideNativeMenuBar("darwin")).toBe(false);
    expect(shouldHideNativeMenuBar("freebsd")).toBe(false);
  });

  it.each(["win32", "linux"] as const)(
    "%s: calls setMenuBarVisibility(false) on every live window",
    (platform) => {
      const first = fakeWindow();
      const second = fakeWindow();
      const destroyed = fakeWindow(true);

      hideNativeMenuBar([first, second, destroyed], platform);

      expect(first.setMenuBarVisibility).toHaveBeenCalledWith(false);
      expect(second.setMenuBarVisibility).toHaveBeenCalledWith(false);
      expect(destroyed.setMenuBarVisibility).not.toHaveBeenCalled();
    }
  );

  it("macOS: leaves the native global menu untouched", () => {
    const window = fakeWindow();

    hideNativeMenuBar([window], "darwin");

    expect(window.setMenuBarVisibility).not.toHaveBeenCalled();
  });

  describe("wiring", () => {
    const menu = readFileSync("src/main/menu.ts", "utf8");
    const main = readFileSync("src/main/main.ts", "utf8");

    it("keeps the Application Menu installed as the accelerator / role backend", () => {
      for (const source of [menu, main]) {
        expect(source).not.toMatch(/setApplicationMenu\(\s*null\s*\)/);
        expect(source).not.toMatch(/removeMenu\(/);
      }
      expect(menu).toContain("Menu.setApplicationMenu(");
    });

    it("hides the native bar again after every menu (re)install", () => {
      const install = menu.indexOf("Menu.setApplicationMenu(");
      const hide = menu.indexOf("hideNativeMenuBar(", install);

      expect(install).toBeGreaterThan(-1);
      expect(hide).toBeGreaterThan(install);
    });

    it("hides the native bar of each created main window", () => {
      expect(main).toContain("hideNativeMenuBar([mainWindow])");
    });

    it("does not use autoHideMenuBar (Alt would bring the native bar back)", () => {
      expect(main).not.toContain("autoHideMenuBar");
      expect(menu).not.toContain("autoHideMenuBar");
    });

    it("does not change the OS title bar (no frameless / custom titlebar)", () => {
      expect(main).not.toMatch(/frame:\s*false/);
      expect(main).not.toContain("titleBarStyle");
      expect(main).not.toContain("titleBarOverlay");
    });
  });
});
