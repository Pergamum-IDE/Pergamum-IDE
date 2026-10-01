import { describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import {
  applicationCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  searchSelectionShortcutCommandIds,
  workspaceCommandIds
} from "../../src/shared/commandIds";
import {
  keybindingCommands,
  reservedKeybindings,
  resolveDefaultKeybindings,
  toElectronAccelerator,
  type PergamumPlatform
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

/**
 * #642: the Electron application menu takes the accelerators of Pergamum
 * custom commands from the keybinding catalog. Native role items keep their
 * own wiring. The menu structure itself is unchanged.
 */

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function template(platform: PergamumPlatform): MenuItemConstructorOptions[] {
  return buildApplicationMenu(
    "en",
    { getMainWindow: () => null },
    platform
  );
}

function flatten(
  items: readonly MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])
  ]);
}

interface MenuProjection {
  readonly label?: string;
  readonly type?: string;
  readonly id?: string;
  readonly role?: string;
  readonly accelerator?: string;
  readonly visible?: boolean;
  readonly submenu?: readonly MenuProjection[];
}

/** Stable serializable fields only (no functions). */
function project(item: MenuItemConstructorOptions): MenuProjection {
  return {
    ...(item.label === undefined ? {} : { label: item.label }),
    ...(item.type === undefined ? {} : { type: item.type }),
    ...(item.id === undefined ? {} : { id: item.id }),
    ...(item.role === undefined ? {} : { role: item.role }),
    ...(item.accelerator === undefined
      ? {}
      : { accelerator: item.accelerator as string }),
    ...(item.visible === undefined ? {} : { visible: item.visible }),
    ...(Array.isArray(item.submenu)
      ? { submenu: item.submenu.map(project) }
      : {})
  };
}

/** Hidden alias items carry no id; map their labels back to the command. */
const HIDDEN_ALIAS_COMMANDS: Readonly<Record<string, string>> = {
  "Zoom In (+)": applicationCommandIds.zoomIn,
  "Command Palette (F1)": commandPaletteCommandIds.open,
  "Save As (F12)": editorCommandIds.saveAs,
  "Application Settings (Ctrl+,)": workspaceCommandIds.openApplicationSettings
};

function menuAcceleratorsByCommand(
  platform: PergamumPlatform
): Map<string, string[]> {
  const byCommand = new Map<string, string[]>();
  for (const item of flatten(template(platform))) {
    if (item.role !== undefined || item.accelerator === undefined) {
      continue;
    }
    const commandId =
      item.id ?? (item.label === undefined ? undefined : HIDDEN_ALIAS_COMMANDS[item.label]);
    if (commandId === undefined) {
      continue;
    }
    const list = byCommand.get(commandId) ?? [];
    list.push(item.accelerator as string);
    byCommand.set(commandId, list);
  }
  return byCommand;
}

const CUSTOM_MENU_COMMANDS = [
  applicationCommandIds.openProject,
  editorCommandIds.newFile,
  editorCommandIds.close,
  editorCommandIds.saveDocument,
  editorCommandIds.saveAll,
  editorCommandIds.saveAs,
  commandPaletteCommandIds.open,
  searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
  searchSelectionShortcutCommandIds.openProjectReplaceFromSelection,
  workspaceCommandIds.openApplicationSettings,
  applicationCommandIds.zoomIn,
  applicationCommandIds.zoomOut,
  applicationCommandIds.resetZoom
] as const;

describe("application menu accelerators come from the catalog (#642)", () => {
  it.each(platforms)("%s: menu structure snapshot", (platform) => {
    expect(template(platform).map(project)).toMatchSnapshot();
  });

  it.each(platforms)(
    "%s: every custom menu command carries exactly its catalog accelerators (primary + hidden aliases)",
    (platform) => {
      const lookup = createMenuAcceleratorLookup(platform);
      const actual = menuAcceleratorsByCommand(platform);
      for (const commandId of CUSTOM_MENU_COMMANDS) {
        expect(
          [...(actual.get(commandId) ?? [])].sort(),
          commandId
        ).toEqual([...lookup.getAll(commandId)].sort());
      }
    }
  );

  it.each(platforms)(
    "%s: every app-scope catalog command with a menu item and a key is in the menu",
    (platform) => {
      const lookup = createMenuAcceleratorLookup(platform);
      const menuIds = new Set(
        flatten(template(platform))
          .filter((item) => item.role === undefined && item.id !== undefined)
          .map((item) => item.id as string)
      );
      const actual = menuAcceleratorsByCommand(platform);
      for (const command of keybindingCommands) {
        if (!menuIds.has(command.id) || lookup.getAll(command.id).length === 0) {
          continue;
        }
        expect(actual.get(command.id)?.length, command.id).toBe(
          lookup.getAll(command.id).length
        );
      }
    }
  );

  it.each(platforms)("%s: custom menu commands exist in the command metadata", (platform) => {
    const known = new Set(keybindingCommands.map((command) => command.id));
    for (const commandId of menuAcceleratorsByCommand(platform).keys()) {
      expect(known.has(commandId), commandId).toBe(true);
    }
  });

  it("keeps the expected hidden aliases: F1, F12, Mod-+ and Mod-, on every platform", () => {
    for (const platform of platforms) {
      const actual = menuAcceleratorsByCommand(platform);
      expect(actual.get(commandPaletteCommandIds.open)).toEqual(
        expect.arrayContaining(["CommandOrControl+P", "F1"])
      );
      expect(actual.get(editorCommandIds.saveAs)).toEqual(
        expect.arrayContaining(["CommandOrControl+Shift+S", "F12"])
      );
      expect(actual.get(applicationCommandIds.zoomIn)).toEqual(
        expect.arrayContaining(["CommandOrControl+=", "CommandOrControl+Plus"])
      );
      expect(actual.get(workspaceCommandIds.openApplicationSettings)).toEqual([
        "CommandOrControl+,"
      ]);
      for (const hidden of flatten(template(platform)).filter(
        (item) => item.label !== undefined && item.label in HIDDEN_ALIAS_COMMANDS
      )) {
        expect(hidden.visible).toBe(false);
        expect(hidden.acceleratorWorksWhenHidden).toBe(true);
      }
    }
  });

  it("the visible Application Settings item stays without an accelerator label", () => {
    for (const platform of platforms) {
      const visible = flatten(template(platform)).find(
        (item) => item.id === workspaceCommandIds.openApplicationSettings
      );
      expect(visible?.accelerator).toBeUndefined();
    }
  });
});

describe("native role items stay separate from custom accelerators (#642)", () => {
  function acceptable(key: string, platform: PergamumPlatform): string[] {
    return [
      toElectronAccelerator(key, platform),
      toElectronAccelerator(key, platform, { modStyle: "commandOrControl" })
    ];
  }

  function catalogKey(commandId: string, platform: PergamumPlatform): string {
    const row = resolveDefaultKeybindings(platform).find(
      (binding) => binding.command === commandId && binding.key !== null
    );
    expect(row, `${commandId} on ${platform}`).toBeDefined();
    return row?.key as string;
  }

  it("Quit (command-routed, nativeRole metadata) matches the catalog's app.quit key", () => {
    for (const platform of platforms) {
      const quit = flatten(template(platform)).find(
        (item) => item.id === applicationCommandIds.quitApplication
      );
      expect(quit?.role).toBeUndefined();
      expect(acceptable(catalogKey("app.quit", platform), platform)).toContain(
        quit?.accelerator
      );
    }
  });

  it("Toggle Developer Tools matches the catalog's developer.toggleDevTools key", () => {
    for (const platform of platforms) {
      const item = flatten(template(platform)).find(
        (candidate) => candidate.role === "toggleDevTools"
      );
      expect(
        acceptable(catalogKey("developer.toggleDevTools", platform), platform)
      ).toContain(item?.accelerator);
    }
  });

  it("darwin: the native close role is Cmd+Shift+W (catalog window.close) and Cmd+W is editor.close", () => {
    const items = flatten(template("darwin"));
    const closeRole = items.find((item) => item.role === "close");
    expect(acceptable(catalogKey("window.close", "darwin"), "darwin")).toContain(
      closeRole?.accelerator
    );
    expect(closeRole?.accelerator).toBe("CommandOrControl+Shift+W");
    expect(
      items.find((item) => item.id === editorCommandIds.close)?.accelerator
    ).toBe("CommandOrControl+W");
  });

  it("role items never get a custom accelerator from the catalog lookup", () => {
    for (const platform of platforms) {
      const lookup = createMenuAcceleratorLookup(platform);
      for (const item of flatten(template(platform))) {
        if (
          item.role !== undefined &&
          item.id !== undefined &&
          item.role !== "close" &&
          item.role !== "toggleDevTools"
        ) {
          expect(item.accelerator, `${item.role}`).toBeUndefined();
          expect(lookup.get(item.id), item.id).toBeUndefined();
        }
      }
    }
  });

  it("does not add menu items for preview / image / syntax checker", () => {
    for (const platform of platforms) {
      const ids = new Set(
        flatten(template(platform)).map((item) => item.id).filter(Boolean)
      );
      for (const commandId of [
        "editor.preview.toggle",
        "editor.image.insert",
        "editor.markdown.toggleSyntaxChecker"
      ]) {
        expect(ids.has(commandId), commandId).toBe(false);
      }
    }
  });

  it("darwin: Cmd+H / Cmd+M / Cmd+Q are not claimed as custom accelerators", () => {
    const custom = menuAcceleratorsByCommand("darwin");
    const all = [...custom.values()].flat();
    expect(all).not.toContain("CommandOrControl+H");
    expect(all).not.toContain("CommandOrControl+M");
  });
});

describe("reload safety (#642)", () => {
  it.each(platforms)("%s: no reload / forceReload role or item", (platform) => {
    for (const item of flatten(template(platform))) {
      expect(item.role).not.toBe("reload");
      expect(item.role).not.toBe("forceReload");
      expect(item.label ?? "").not.toMatch(/reload/i);
    }
  });

  it.each(platforms)("%s: Mod-r / Mod-Shift-r / F5 are never menu accelerators", (platform) => {
    const accelerators = flatten(template(platform))
      .map((item) => item.accelerator)
      .filter((accelerator): accelerator is string => typeof accelerator === "string");
    // #644: every reload / forceReload key, including the hidden aliases' keys.
    for (const banned of [
      "CommandOrControl+R",
      "CommandOrControl+Shift+R",
      "F5",
      "CommandOrControl+F5",
      "Shift+F5"
    ]) {
      expect(accelerators).not.toContain(banned);
    }
  });
});

describe("menu accelerators vs the reserved reload keys (#644)", () => {
  it("no menu accelerator (visible or hidden) resolves to a runtime-suppressed key", () => {
    for (const platform of platforms) {
      const suppressed = new Set(
        reservedKeybindings
          .filter((entry) => entry.runtimeSuppression !== undefined)
          .map((entry) =>
            toElectronAccelerator(entry.key, platform, {
              modStyle: "commandOrControl"
            })
          )
      );
      for (const item of flatten(template(platform))) {
        if (typeof item.accelerator === "string") {
          expect(suppressed.has(item.accelerator), `${platform} ${item.accelerator}`).toBe(false);
        }
      }
    }
  });
});

describe("darwin reserved keys (#642)", () => {
  it("no custom darwin menu accelerator uses a forbidden or nativeOnly reserved key", () => {
    const reserved = new Set(
      reservedKeybindings
        .filter(
          (entry) =>
            entry.platforms.includes("darwin") &&
            (entry.level === "forbidden" || entry.level === "nativeOnly")
        )
        .map((entry) =>
          toElectronAccelerator(entry.key, "darwin", {
            modStyle: "commandOrControl"
          })
        )
    );
    for (const accelerators of menuAcceleratorsByCommand("darwin").values()) {
      for (const accelerator of accelerators) {
        expect(reserved.has(accelerator), accelerator).toBe(false);
      }
    }
  });
});
