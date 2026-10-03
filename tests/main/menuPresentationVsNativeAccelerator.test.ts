import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import {
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  type PergamumPlatform,
  type ResolvedKeybinding,
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

// #693: a shortcut label (presentation) is not a native accelerator. These
// tests look at the Electron template only.

const JMC = "assist.japaneseMachineCheck.openDialog";
const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function rows(
  platform: PergamumPlatform,
  userEntries: UserKeybindingEntry[]
): ResolvedKeybinding[] {
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

function menu(
  platform: PergamumPlatform,
  keybindingRows?: readonly ResolvedKeybinding[]
): MenuItemConstructorOptions[] {
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

const projection = (items: MenuItemConstructorOptions[]) =>
  items.map((item) => [
    item.id,
    item.label,
    item.accelerator,
    item.role,
    item.visible
  ]);

describe("presentation-only shortcuts are not native accelerators (#693)", () => {
  it.each(platforms)(
    "%s: a key assigned to Japanese Style Check adds no accelerator and no hidden item",
    (platform) => {
      const assigned = rows(platform, [{ key: "Mod-Alt-j", command: JMC }]);
      const items = menu(platform, assigned);
      const item = items.find((candidate) => candidate.id === JMC);

      expect(item).toBeDefined();
      expect(item?.accelerator).toBeUndefined();
      // The whole template is exactly the default one: nothing was added.
      expect(projection(items)).toEqual(projection(menu(platform, rows(platform, []))));
      expect(
        items.some((candidate) =>
          String(candidate.accelerator ?? "").toLowerCase().includes("alt+j")
        )
      ).toBe(false);
    }
  );

  it("a user key for Open Markdown File never becomes an accelerator (#556)", () => {
    const template = resolveDefaultKeybindings("win32").find(
      (row) => row.scope === "app" && row.source === "pergamum" && !row.readonly
    )!;
    const withOpen = [
      ...resolveDefaultKeybindings("win32"),
      {
        ...template,
        command: "editor.document.markdown.open",
        key: "Mod-Alt-o"
      }
    ];
    const items = menu("win32", withOpen);
    const open = items.find(
      (candidate) => candidate.id === "editor.document.markdown.open"
    );

    expect(open).toBeDefined();
    expect(open?.accelerator).toBeUndefined();
    expect(projection(items)).toEqual(projection(menu("win32")));
  });

  it.each(platforms)(
    "%s: the commands that opted in keep their native accelerators",
    (platform) => {
      const byId = (id: string) =>
        menu(platform, rows(platform, [])).find((item) => item.id === id);

      for (const id of [
        "editor.document.save",
        "editor.saveAll",
        "editor.close",
        "editor.file.new",
        "workspace.project.open",
        "workbench.commandPalette.open",
        "search.project.openFromSelection",
        "search.project.replace.openFromSelection",
        "app.zoom.in",
        "app.zoom.out",
        "app.zoom.reset"
      ]) {
        expect(byId(id)?.accelerator, `${platform} ${id}`).toBeDefined();
      }
      expect(byId("editor.document.save")?.accelerator).toBe("CommandOrControl+S");
      expect(byId("editor.close")?.accelerator).toBe("CommandOrControl+W");
    }
  );

  it("a user rebind of a native-accelerator command still reaches the accelerator", () => {
    const items = menu(
      "win32",
      rows("win32", [
        { key: "Mod-s", command: "-editor.document.save" },
        { key: "Mod-Alt-9", command: "editor.document.save" }
      ])
    );

    expect(items.find((item) => item.id === "editor.document.save")?.accelerator).toBe(
      "CommandOrControl+Alt+9"
    );
  });

  it.each(platforms)(
    "%s: Application Settings is bound through a hidden item; the visible item shows no accelerator",
    (platform) => {
      const items = menu(platform, rows(platform, []));
      const id = "workspace.applicationSettings.open";
      const visible = items.find((item) => item.id === id);
      const hidden = items.find(
        (item) =>
          item.visible === false && item.accelerator === "CommandOrControl+,"
      );

      expect(visible?.accelerator).toBeUndefined();
      expect(hidden).toBeDefined();
    }
  );

  it.each(platforms)("%s: the hidden aliases (F1, F12, Mod-+) stay", (platform) => {
    const accelerators = menu(platform, rows(platform, [])).map(
      (item) => item.accelerator
    );

    for (const expected of ["F1", "F12", "CommandOrControl+Plus"]) {
      expect(accelerators, `${platform} ${expected}`).toContain(expected);
    }
  });

  it("Quit and the native roles keep their own accelerators", () => {
    const win = menu("win32", rows("win32", []));
    const mac = menu("darwin", rows("darwin", []));

    expect(win.find((item) => item.id === "app.quit")?.accelerator).toBe(
      "CommandOrControl+Q"
    );
    expect(mac.find((item) => item.id === "app.quit")?.accelerator).toBe(
      "Command+Q"
    );
    // Close Window on macOS keeps its distinct accelerator (#636).
    expect(
      mac.find((item) => item.role === "close")?.accelerator
    ).toBe("CommandOrControl+Shift+W");
    expect(
      win.find((item) => item.role === "toggleDevTools")?.accelerator
    ).toBe("CommandOrControl+Shift+D");
  });

  it("macOS: the native menu cannot show a presentation-only key, so it shows none (and adds none)", () => {
    const mac = menu("darwin", rows("darwin", [{ key: "Mod-Alt-j", command: JMC }]));
    const item = mac.find((candidate) => candidate.id === JMC);

    expect(item).toBeDefined();
    expect(item?.accelerator).toBeUndefined();
    // No label text is faked either.
    expect(item?.label).not.toMatch(/\t|Cmd|⌘|Alt\+/);
  });
});
