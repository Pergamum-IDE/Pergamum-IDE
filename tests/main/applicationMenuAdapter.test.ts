import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  buildNativeMenuTemplate,
  type NativeMenuAdapterContext
} from "../../src/main/applicationMenuAdapter";
import {
  createMenuAcceleratorLookup,
  NATIVE_MENU_ACCELERATOR_COMMAND_IDS,
  type MenuAcceleratorLookup
} from "../../src/main/menuAccelerators";
import { applicationMenuModel } from "../../src/shared/applicationMenuModel";
import {
  applicationCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  workspaceCommandIds
} from "../../src/shared/commandIds";
import type { PergamumPlatform } from "../../src/shared/keybindings";

/**
 * #662: the boundary between the canonical menu model and its Electron
 * adapter. (`menu.test.ts` covers the same behavior through
 * `buildApplicationMenu`; these tests use no Electron mock at all and stub
 * the pieces the model must NOT own: accelerators, dispatch, quit.)
 */

/** A lookup whose accelerators are unmistakably not from the model. */
function sentinelLookup(): MenuAcceleratorLookup {
  return {
    get: (commandId) => `Sentinel+${commandId}`,
    getAll: (commandId) => [`Sentinel+${commandId}`, `Alias+${commandId}`]
  };
}

function context(
  overrides: Partial<NativeMenuAdapterContext> = {}
): NativeMenuAdapterContext & {
  sendCommand: ReturnType<typeof vi.fn<(id: string) => boolean>>;
} {
  const sendCommand = vi.fn<(id: string) => boolean>(() => true);
  return {
    language: "en",
    platform: "win32",
    accelerators: createMenuAcceleratorLookup("win32"),
    ...overrides,
    sendCommand
  } as never;
}

function flatten(
  items: readonly MenuItemConstructorOptions[]
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])
  ]);
}

function build(
  platform: PergamumPlatform,
  overrides: Partial<NativeMenuAdapterContext> = {}
) {
  const ctx = context({ platform, ...overrides });
  return { ctx, template: buildNativeMenuTemplate(ctx) };
}

function byId(
  template: readonly MenuItemConstructorOptions[],
  id: string
): MenuItemConstructorOptions {
  const item = flatten(template).find((candidate) => candidate.id === id);
  if (!item) {
    throw new Error(`no menu item with id ${id}`);
  }
  return item;
}

function click(item: MenuItemConstructorOptions): void {
  item.click?.({} as never, undefined, {} as never);
}

describe("native menu adapter (#662)", () => {
  it("builds one template entry per top-level model menu of the platform", () => {
    expect(build("win32").template.map((item) => item.label)).toEqual([
      "File",
      "Edit",
      "View",
      "Assist",
      "Help"
    ]);
    expect(build("darwin").template.map((item) => item.label)).toEqual([
      "Pergamum",
      "File",
      "Edit",
      "View",
      "Assist",
      "Window",
      "Help"
    ]);
  });

  it("resolves labels from the translation keys for the context language", () => {
    const ja = build("win32", { language: "ja" }).template;
    expect(ja.map((item) => item.label)).toEqual([
      "ファイル",
      "編集",
      "表示",
      "アシスト",
      "ヘルプ"
    ]);
  });

  describe("command items", () => {
    it("id = commandId, and click dispatches that commandId through sendCommand", () => {
      const { ctx, template } = build("win32");
      const save = byId(template, editorCommandIds.saveDocument);

      click(save);

      expect(ctx.sendCommand).toHaveBeenCalledTimes(1);
      expect(ctx.sendCommand).toHaveBeenCalledWith(
        editorCommandIds.saveDocument
      );
    });

    it("every non-role, visible item with a click dispatches its own id", () => {
      const { ctx, template } = build("win32");
      const commandItems = flatten(template).filter(
        (item) => item.id !== undefined && item.click !== undefined
      );

      expect(commandItems.length).toBeGreaterThan(10);
      for (const item of commandItems) {
        ctx.sendCommand.mockClear();
        click(item);
        expect(ctx.sendCommand).toHaveBeenCalledWith(item.id);
      }
    });
  });

  describe("accelerators come from the lookup, never from the model", () => {
    it("uses the lookup's primary key for command items", () => {
      const { template } = build("win32", {
        accelerators: sentinelLookup()
      });

      expect(byId(template, editorCommandIds.saveDocument).accelerator).toBe(
        `Sentinel+${editorCommandIds.saveDocument}`
      );
    });

    it("binds no accelerator when the lookup has none (e.g. no effective keybindings)", () => {
      const { template } = build("win32", {
        accelerators: createMenuAcceleratorLookup("win32", undefined, undefined, [])
      });

      for (const item of flatten(template)) {
        if (item.id !== undefined && item.role === undefined) {
          // Quit's accelerator is a fixed lifecycle key, not a catalog one.
          if (item.id === applicationCommandIds.quitApplication) continue;
          expect(item.accelerator, String(item.id)).toBeUndefined();
        }
      }
      expect(flatten(template).filter((item) => item.visible === false)).toEqual(
        []
      );
    });

    it("keeps Open Markdown Document menu-only even if the lookup has a key", () => {
      const { template } = build("win32", { accelerators: sentinelLookup() });

      expect(
        byId(template, editorCommandIds.openMarkdownDocument).accelerator
      ).toBeUndefined();
    });

    it("every catalog-accelerated menu command is in the model", () => {
      const commandIds = new Set(
        flatten(buildNativeMenuTemplate(context())).map((item) => item.id)
      );
      for (const id of NATIVE_MENU_ACCELERATOR_COMMAND_IDS) {
        expect(commandIds.has(id), id).toBe(true);
      }
    });
  });

  describe("hidden accelerator aliases", () => {
    it("adds a hidden, working alias item right after Command Palette, Save As and Zoom In", () => {
      const { ctx, template } = build("win32");
      const items = flatten(template);

      for (const [id, aliasLabel, aliasKey] of [
        [commandPaletteCommandIds.open, "Command Palette (F1)", "F1"],
        [editorCommandIds.saveAs, "Save As (F12)", "F12"],
        [applicationCommandIds.zoomIn, "Zoom In (+)", "CommandOrControl+Plus"]
      ] as const) {
        const primaryIndex = items.findIndex((item) => item.id === id);
        const alias = items[primaryIndex + 1];
        expect(alias.label).toBe(aliasLabel);
        expect(alias.accelerator).toBe(aliasKey);
        expect(alias.visible).toBe(false);
        expect(alias.acceleratorWorksWhenHidden).toBe(true);
        expect(alias.id).toBeUndefined();

        ctx.sendCommand.mockClear();
        click(alias);
        expect(ctx.sendCommand).toHaveBeenCalledWith(id);
      }
    });

    it("Application Settings: visible item has no accelerator, the hidden item carries it", () => {
      const { ctx, template } = build("win32");
      const items = flatten(template);
      const index = items.findIndex(
        (item) => item.id === workspaceCommandIds.openApplicationSettings
      );

      expect(items[index].accelerator).toBeUndefined();
      expect(items[index + 1]).toMatchObject({
        label: "Application Settings (Ctrl+,)",
        accelerator: "CommandOrControl+,",
        visible: false
      });

      click(items[index + 1]);
      expect(ctx.sendCommand).toHaveBeenCalledWith(
        workspaceCommandIds.openApplicationSettings
      );
    });

    it("creates no alias item without a second key", () => {
      const { template } = build("win32", {
        accelerators: {
          get: () => "Primary+X",
          getAll: () => ["Primary+X"]
        }
      });

      expect(flatten(template).filter((item) => item.visible === false)).toHaveLength(
        1
      ); // only Application Settings' (primary) hidden item
    });
  });

  describe("native roles", () => {
    it("maps role items to the Electron role without a Pergamum click handler", () => {
      const { template } = build("win32");
      const roles = flatten(template).filter((item) => item.role !== undefined);

      expect(roles.map((item) => item.role)).toEqual([
        "undo",
        "redo",
        "cut",
        "copy",
        "paste",
        "selectAll",
        "toggleDevTools",
        "togglefullscreen",
        "help"
      ]);
      for (const item of roles) {
        expect(item.click, String(item.role)).toBeUndefined();
      }
    });

    it("edit roles keep the command id so enablement still reaches them", () => {
      const { template } = build("win32");

      expect(byId(template, editorCommandIds.copySelection).role).toBe("copy");
      expect(byId(template, editorCommandIds.undo).role).toBe("undo");
    });

    it("Toggle Developer Tools overrides Electron's default accelerator (#535)", () => {
      const { template } = build("win32");
      const devTools = flatten(template).find(
        (item) => item.role === "toggleDevTools"
      );

      expect(devTools?.accelerator).toBe("CommandOrControl+Shift+D");
    });

    it("the Help menu is the native help role", () => {
      const { template } = build("win32");

      expect(template.at(-1)).toMatchObject({ role: "help", label: "Help" });
    });
  });

  describe("Quit", () => {
    it("is a command-routed item, not Electron's quit role", () => {
      for (const platform of ["win32", "linux", "darwin"] as const) {
        const { template } = build(platform);
        const quit = byId(template, applicationCommandIds.quitApplication);

        expect(quit.role).toBeUndefined();
        expect(quit.label).toBe("Quit Pergamum");
        expect(quit.accelerator).toBe(
          platform === "darwin" ? "Command+Q" : "CommandOrControl+Q"
        );
      }
    });

    it("goes through the renderer; the main fallback runs only if it was unreachable", () => {
      const requestApplicationQuit = vi.fn();
      const delivered = build("win32", { requestApplicationQuit });
      click(byId(delivered.template, applicationCommandIds.quitApplication));
      expect(delivered.ctx.sendCommand).toHaveBeenCalledWith(
        applicationCommandIds.quitApplication
      );
      expect(requestApplicationQuit).not.toHaveBeenCalled();

      const unreachable = build("win32", { requestApplicationQuit });
      unreachable.ctx.sendCommand.mockReturnValue(false);
      click(byId(unreachable.template, applicationCommandIds.quitApplication));
      expect(requestApplicationQuit).toHaveBeenCalledTimes(1);
    });

    it("lives in the File menu on Windows / Linux and the app menu on macOS", () => {
      const win = build("win32").template;
      expect(win[0].label).toBe("File");
      expect(
        (win[0].submenu as MenuItemConstructorOptions[]).at(-1)?.id
      ).toBe(applicationCommandIds.quitApplication);

      const mac = build("darwin").template;
      expect(
        (mac[0].submenu as MenuItemConstructorOptions[]).at(-1)?.id
      ).toBe(applicationCommandIds.quitApplication);
      expect(
        flatten([mac[1]]).some(
          (item) => item.id === applicationCommandIds.quitApplication
        )
      ).toBe(false);
    });
  });

  describe("macOS differences", () => {
    it("File menu ends with the native Close Window role on Cmd+Shift+W; Cmd+W stays editor.close", () => {
      const { template } = build("darwin");
      const file = template.find((item) => item.label === "File");
      const items = file?.submenu as MenuItemConstructorOptions[];

      expect(items.at(-1)).toEqual({
        role: "close",
        label: "Close",
        accelerator: "CommandOrControl+Shift+W"
      });
      expect(byId(template, editorCommandIds.close).accelerator).toBe(
        "CommandOrControl+W"
      );
    });

    it("has the App menu hide group and the Window menu roles", () => {
      const { template } = build("darwin");
      const roles = flatten(template)
        .map((item) => item.role)
        .filter(Boolean);

      expect(roles).toEqual(
        expect.arrayContaining([
          "services",
          "hide",
          "hideOthers",
          "unhide",
          "close",
          "minimize",
          "zoom",
          "front"
        ])
      );
      const hide = flatten(template).find((item) => item.role === "hide");
      expect(hide?.label).toBe("Hide Pergamum");
    });

    it("Windows / Linux have none of the macOS-only roles", () => {
      for (const platform of ["win32", "linux"] as const) {
        const roles = flatten(build(platform).template).map((item) => item.role);
        for (const macOnly of [
          "services",
          "hide",
          "hideOthers",
          "unhide",
          "close",
          "minimize",
          "zoom",
          "front"
        ]) {
          expect(roles).not.toContain(macOnly);
        }
      }
    });
  });

  it("does not mutate the shared model", () => {
    const before = JSON.stringify(applicationMenuModel);
    build("darwin");
    build("win32");
    expect(JSON.stringify(applicationMenuModel)).toBe(before);
  });
});
