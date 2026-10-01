import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { workspaceCommandIds } from "../../src/shared/commandIds";
import { APPLICATION_MENU_CHANNELS } from "../../src/shared/api";
import type { Language } from "../../src/shared/i18n";

vi.mock("electron", () => ({
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn(),
    getApplicationMenu: vi.fn()
  },
  app: { getPath: vi.fn() },
  ipcMain: { on: vi.fn() }
}));

import { buildApplicationMenu } from "../../src/main/menu";

type Platform = "win32" | "linux" | "darwin";
const platforms: readonly Platform[] = ["win32", "linux", "darwin"];

function fileMenu(
  platform: Platform,
  language: Language = "ja",
  send: (channel: string, ...args: unknown[]) => void = vi.fn()
): MenuItemConstructorOptions[] {
  const window = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send }
  };
  const template = buildApplicationMenu(language, { getMainWindow: () => window }, platform);
  const labelOf = language === "ja" ? "ファイル" : "File";
  const file = template.find((item) => item.label === labelOf);
  return (file?.submenu ?? []) as MenuItemConstructorOptions[];
}

describe("File menu Keyboard Shortcuts entry (#646)", () => {
  it.each(platforms)("%s: has キーボードショートカット... right before アプリケーション設定...", (platform) => {
    const items = fileMenu(platform);
    const labels = items.map((item) => item.label);
    const shortcuts = labels.indexOf("キーボードショートカット...");
    const settings = labels.indexOf("アプリケーション設定...");
    expect(shortcuts).toBeGreaterThan(-1);
    expect(settings).toBe(shortcuts + 1);
  });

  it("the English label is Keyboard Shortcuts...", () => {
    const labels = fileMenu("win32", "en").map((item) => item.label);
    const at = labels.indexOf("Keyboard Shortcuts...");
    expect(at).toBeGreaterThan(-1);
    expect(labels[at + 1]).toBe("Application Settings...");
  });

  it("is a command item with no accelerator (a menu entry, not a new shortcut)", () => {
    for (const platform of platforms) {
      const item = fileMenu(platform).find(
        (candidate) => candidate.label === "キーボードショートカット..."
      );
      expect(item?.id).toBe(workspaceCommandIds.openKeyboardShortcuts);
      expect(item?.accelerator).toBeUndefined();
      expect(item?.role).toBeUndefined();
    }
  });

  it("clicking it sends the open Keyboard Shortcuts command over the menu channel", () => {
    const send = vi.fn();
    const item = fileMenu("win32", "ja", send).find(
      (candidate) => candidate.label === "キーボードショートカット..."
    );
    (item?.click as () => void)();
    expect(send).toHaveBeenCalledWith(
      APPLICATION_MENU_CHANNELS.command,
      workspaceCommandIds.openKeyboardShortcuts
    );
  });

  it("Application Settings and its hidden Ctrl+, alias are unchanged", () => {
    for (const platform of platforms) {
      const items = fileMenu(platform);
      const settings = items.find((item) => item.label === "アプリケーション設定...");
      expect(settings?.id).toBe(workspaceCommandIds.openApplicationSettings);
      expect(settings?.accelerator).toBeUndefined();
      expect(
        items.some(
          (item) => item.visible === false && item.accelerator === "CommandOrControl+,"
        )
      ).toBe(true);
    }
  });
});
