import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import {
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

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

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function rows(platform: PergamumPlatform, userEntries: UserKeybindingEntry[]) {
  return resolveEffectiveKeybindings({ platform, userEntries }).keybindings;
}

function flatten(
  items: readonly MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])
  ]);
}

function menu(platform: PergamumPlatform, keybindingRows?: ReturnType<typeof rows>) {
  return flatten(
    buildApplicationMenu(
      "en",
      {
        getMainWindow: () => null,
        ...(keybindingRows === undefined ? {} : { keybindingRows })
      },
      platform
    )
  );
}

function accelerators(items: MenuItemConstructorOptions[]): Array<string | undefined> {
  return items.map((item) =>
    typeof item.accelerator === "string" ? item.accelerator : undefined
  );
}

describe("menu accelerators follow the effective keybindings (#645)", () => {
  it.each(platforms)("%s: no keybindings.json (empty effective rows) = the exact default menu", (platform) => {
    const projection = (items: MenuItemConstructorOptions[]) =>
      items.map((item) => [item.id, item.label, item.accelerator, item.role, item.visible]);
    expect(projection(menu(platform, rows(platform, [])))).toEqual(
      projection(menu(platform))
    );
  });

  it("a user override changes the menu accelerator (Save: Mod-s -> Mod-Alt-9)", () => {
    const items = menu("win32", rows("win32", [
      { key: "Mod-Alt-9", command: "editor.document.save" }
    ]));
    const save = items.find((item) => item.id === "editor.document.save");
    expect(save?.accelerator).toBe("CommandOrControl+Alt+9");
    expect(accelerators(items)).not.toContain("CommandOrControl+S");
  });

  it("the lookup accepts effective rows directly", () => {
    const lookup = createMenuAcceleratorLookup(
      "linux",
      undefined,
      undefined,
      rows("linux", [{ key: "Mod-Alt-9", command: "editor.file.new" }])
    );
    expect(lookup.get("editor.file.new")).toBe("CommandOrControl+Alt+9");
    expect(lookup.get("editor.document.save")).toBe("CommandOrControl+S");
  });

  it("the four hidden aliases (F1, F12, Mod-+, Mod-,) stay in place by default", () => {
    for (const platform of platforms) {
      const accels = accelerators(menu(platform, rows(platform, [])));
      for (const expected of ["F1", "F12", "CommandOrControl+Plus", "CommandOrControl+,"]) {
        expect(accels, `${platform} ${expected}`).toContain(expected);
      }
    }
  });

  it("unbinding an alias removes its hidden item but keeps the primary", () => {
    const items = menu("win32", rows("win32", [
      { key: "F1", command: "-workbench.commandPalette.open" }
    ]));
    const accels = accelerators(items);
    expect(accels).not.toContain("F1");
    expect(accels).toContain("CommandOrControl+P");
  });

  it("replacing the primary keeps the alias (palette: Mod-p -> Mod-Alt-9, F1 stays)", () => {
    const accels = accelerators(menu("win32", rows("win32", [
      { key: "Mod-Alt-9", command: "workbench.commandPalette.open" }
    ])));
    expect(accels).toContain("CommandOrControl+Alt+9");
    expect(accels).toContain("F1");
    expect(accels).not.toContain("CommandOrControl+P");
  });

  it("an entry the overlay rejects never reaches the menu (reload key, reserved, unknown command)", () => {
    const accels = accelerators(menu("win32", rows("win32", [
      { key: "F5", command: "editor.document.save" },
      { key: "Mod-Shift-r", command: "editor.file.new" },
      { key: "Mod-k", command: "no.such.command" }
    ])));
    expect(accels).not.toContain("F5");
    expect(accels).not.toContain("CommandOrControl+Shift+R");
    expect(accels).toContain("CommandOrControl+S");
    expect(accels).toContain("CommandOrControl+N");
  });

  it("native role items and the Quit / DevTools literals are unaffected by user entries", () => {
    const items = menu("win32", rows("win32", [
      { key: "Mod-Alt-9", command: "editor.selection.copy" },
      { key: "Mod-Alt-8", command: "app.quit" }
    ]));
    const copy = items.find((item) => item.role === "copy");
    expect(copy?.accelerator).toBeUndefined();
    const quit = items.find((item) => item.id === "app.quit");
    expect(quit?.accelerator).toBe("CommandOrControl+Q");
  });
});
