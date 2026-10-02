import { readFileSync } from "node:fs";
import type { MenuItemConstructorOptions } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #666: install / rebuild contract of the native Application Menu, run through
 * the real `installApplicationMenu` with a fake Electron `Menu`:
 *   - the saved language is read at (re)install time (language changes are
 *     "restart required" in this product, so there is no live language rebuild)
 *   - an effective-keybindings change rebuilds the menu and the last enablement
 *     the renderer reported is re-applied
 *   - the visible native bar is hidden on Windows / Linux, never on macOS
 */

interface FakeMenuItem {
  readonly template: MenuItemConstructorOptions;
  enabled: boolean;
}

interface FakeMenu {
  readonly template: MenuItemConstructorOptions[];
  getMenuItemById(id: string): FakeMenuItem | null;
}

const electronMock = vi.hoisted(() => ({
  current: null as unknown,
  windows: [] as Array<{
    isDestroyed: () => boolean;
    setMenuBarVisibility: (visible: boolean) => void;
  }>,
  language: "ja" as "ja" | "en"
}));

vi.mock("electron", () => {
  const flatten = (
    items: readonly MenuItemConstructorOptions[]
  ): MenuItemConstructorOptions[] =>
    items.flatMap((item) => [
      item,
      ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])
    ]);

  return {
    Menu: {
      buildFromTemplate: (template: MenuItemConstructorOptions[]): FakeMenu => {
        const byId = new Map<string, FakeMenuItem>();
        for (const item of flatten(template)) {
          if (typeof item.id === "string" && !byId.has(item.id)) {
            byId.set(item.id, { template: item, enabled: true });
          }
        }
        return {
          template,
          getMenuItemById: (id) => byId.get(id) ?? null
        };
      },
      setApplicationMenu: (menu: unknown) => {
        electronMock.current = menu;
      },
      getApplicationMenu: () => electronMock.current
    },
    BrowserWindow: { getAllWindows: () => electronMock.windows },
    ipcMain: { on: vi.fn() },
    app: { getPath: vi.fn() }
  };
});

vi.mock("../../src/main/settingsStore", () => ({
  loadSettings: async () => ({
    workbench: { language: electronMock.language }
  })
}));

import {
  applyApplicationMenuEnablement,
  installApplicationMenu
} from "../../src/main/menu";
import { editorCommandIds } from "../../src/shared/commandIds";
import {
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

const realPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

function rows(platform: PergamumPlatform, entries: UserKeybindingEntry[] = []) {
  return resolveEffectiveKeybindings({ platform, userEntries: entries })
    .keybindings;
}

const options = (keybindingRows: ReturnType<typeof rows>) => ({
  getMainWindow: () => null,
  keybindingRows
});

const currentMenu = (): FakeMenu => electronMock.current as FakeMenu;

function fakeWindow() {
  return {
    isDestroyed: () => false,
    setMenuBarVisibility: vi.fn()
  };
}

beforeEach(() => {
  electronMock.current = null;
  electronMock.windows = [];
  electronMock.language = "ja";
});

afterEach(() => {
  setPlatform(realPlatform);
});

describe("macOS native menu install / rebuild (#666)", () => {
  it("installs the darwin menu in the saved language and does not hide the native menu bar", async () => {
    setPlatform("darwin");
    const window = fakeWindow();
    electronMock.windows = [window];

    await installApplicationMenu(options(rows("darwin")));

    expect(currentMenu().template.map((item) => item.label)).toEqual([
      "Pergamum",
      "ファイル",
      "編集",
      "表示",
      "アシスト",
      "ウィンドウ",
      "ヘルプ"
    ]);
    // The global macOS menu is the visible one: never hidden.
    expect(window.setMenuBarVisibility).not.toHaveBeenCalled();
  });

  it("Windows / Linux: the Application Menu is installed and its visible bar is hidden", async () => {
    for (const platform of ["win32", "linux"] as const) {
      setPlatform(platform);
      const window = fakeWindow();
      electronMock.windows = [window];

      await installApplicationMenu(options(rows(platform)));

      expect(currentMenu().template.map((item) => item.label)).not.toContain(
        "Pergamum"
      );
      expect(window.setMenuBarVisibility).toHaveBeenCalledWith(false);
    }
  });

  it("language is read when the menu is (re)installed: the next install follows the saved language", async () => {
    setPlatform("darwin");

    electronMock.language = "en";
    await installApplicationMenu(options(rows("darwin")));
    expect(
      currentMenu().template.map((item) => item.label)
    ).toContain("Assist");

    electronMock.language = "ja";
    await installApplicationMenu(options(rows("darwin")));
    expect(
      currentMenu().template.map((item) => item.label)
    ).toContain("アシスト");
  });

  it("an effective-keybindings change rebuilds the menu with the new accelerator and keeps the last enablement", async () => {
    setPlatform("darwin");

    await installApplicationMenu(options(rows("darwin")));
    const first = currentMenu();
    expect(first.getMenuItemById(editorCommandIds.saveDocument)?.template.accelerator).toBe(
      "CommandOrControl+S"
    );

    // The renderer reports enablement; the item is disabled in the live menu.
    applyApplicationMenuEnablement({ [editorCommandIds.saveDocument]: false });
    expect(first.getMenuItemById(editorCommandIds.saveDocument)?.enabled).toBe(false);

    // Keyboard Shortcuts save / keybindings.json reload: the same runtime path.
    await installApplicationMenu(
      options(
        rows("darwin", [
          { key: "Mod-Alt-9", command: "editor.document.save" },
          { key: "Mod-s", command: "-editor.document.save" }
        ])
      )
    );
    const rebuilt = currentMenu();

    expect(rebuilt).not.toBe(first);
    expect(
      rebuilt.getMenuItemById(editorCommandIds.saveDocument)?.template.accelerator
    ).toBe("CommandOrControl+Alt+9");
    // A rebuilt menu starts enabled; the last reported state is restored.
    expect(rebuilt.getMenuItemById(editorCommandIds.saveDocument)?.enabled).toBe(false);
  });
});

describe("language policy (#666)", () => {
  it("a language change is applied after a restart: the menu is only rebuilt at startup and for keybindings", () => {
    const main = readFileSync("src/main/main.ts", "utf8");
    const calls = main.match(/installApplicationMenu\(/g) ?? [];

    // Startup + the keybindings runtime-apply path - nothing in a settings save.
    expect(calls).toHaveLength(2);
    expect(main).toContain("applyKeybindingsToMenu");
    expect(main).not.toMatch(/saveSettings[\s\S]{0,400}installApplicationMenu\(/);
  });

  it("the product tells the user that the language applies after a restart", () => {
    const ja = readFileSync("src/shared/i18n/ja.ts", "utf8");
    const en = readFileSync("src/shared/i18n/en.ts", "utf8");

    expect(ja).toContain('"settings.languageRestartRequired"');
    expect(en).toContain('"settings.languageRestartRequired"');
  });
});
