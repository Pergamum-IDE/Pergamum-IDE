import { describe, expect, it } from "vitest";
import {
  createMenuAcceleratorLookup,
  nodePlatformToPergamumPlatform
} from "../../src/main/menuAccelerators";
import {
  toElectronAccelerator,
  type KeybindingCatalog,
  type KeybindingCommand,
  type PergamumPlatform
} from "../../src/shared/keybindings";

const platforms: readonly PergamumPlatform[] = ["win32", "linux", "darwin"];

function command(overrides: Partial<KeybindingCommand>): KeybindingCommand {
  return {
    id: "test.command",
    title: "Test",
    category: "Test",
    description: "test",
    scope: "app",
    executionHost: "renderer",
    source: "pergamum",
    readonly: false,
    readonlyReason: null,
    when: null,
    handlerStatus: "registered",
    ...overrides
  };
}

describe("toElectronAccelerator (#642)", () => {
  const cases: ReadonlyArray<
    readonly [string, Record<PergamumPlatform, string>, Record<PergamumPlatform, string>]
  > = [
    // [key, platform style, commandOrControl style]
    ["Mod-s", { win32: "Control+S", linux: "Control+S", darwin: "Command+S" }, { win32: "CommandOrControl+S", linux: "CommandOrControl+S", darwin: "CommandOrControl+S" }],
    ["Mod-Shift-s", { win32: "Control+Shift+S", linux: "Control+Shift+S", darwin: "Command+Shift+S" }, { win32: "CommandOrControl+Shift+S", linux: "CommandOrControl+Shift+S", darwin: "CommandOrControl+Shift+S" }],
    ["Mod-Alt-s", { win32: "Control+Alt+S", linux: "Control+Alt+S", darwin: "Command+Alt+S" }, { win32: "CommandOrControl+Alt+S", linux: "CommandOrControl+Alt+S", darwin: "CommandOrControl+Alt+S" }],
    ["Mod-,", { win32: "Control+,", linux: "Control+,", darwin: "Command+," }, { win32: "CommandOrControl+,", linux: "CommandOrControl+,", darwin: "CommandOrControl+," }],
    ["Mod-+", { win32: "Control+Plus", linux: "Control+Plus", darwin: "Command+Plus" }, { win32: "CommandOrControl+Plus", linux: "CommandOrControl+Plus", darwin: "CommandOrControl+Plus" }],
    ["Mod--", { win32: "Control+-", linux: "Control+-", darwin: "Command+-" }, { win32: "CommandOrControl+-", linux: "CommandOrControl+-", darwin: "CommandOrControl+-" }],
    ["F1", { win32: "F1", linux: "F1", darwin: "F1" }, { win32: "F1", linux: "F1", darwin: "F1" }],
    ["F12", { win32: "F12", linux: "F12", darwin: "F12" }, { win32: "F12", linux: "F12", darwin: "F12" }],
    ["Ctrl-Space", { win32: "Control+Space", linux: "Control+Space", darwin: "Control+Space" }, { win32: "Control+Space", linux: "Control+Space", darwin: "Control+Space" }],
    ["Alt-`", { win32: "Alt+`", linux: "Alt+`", darwin: "Alt+`" }, { win32: "Alt+`", linux: "Alt+`", darwin: "Alt+`" }],
    ["Alt-ArrowLeft", { win32: "Alt+Left", linux: "Alt+Left", darwin: "Alt+Left" }, { win32: "Alt+Left", linux: "Alt+Left", darwin: "Alt+Left" }],
    ["Mod-Alt-ArrowLeft", { win32: "Control+Alt+Left", linux: "Control+Alt+Left", darwin: "Command+Alt+Left" }, { win32: "CommandOrControl+Alt+Left", linux: "CommandOrControl+Alt+Left", darwin: "CommandOrControl+Alt+Left" }]
  ];

  it.each(platforms)("%s: platform style (default) is unchanged", (platform) => {
    for (const [key, platformStyle] of cases) {
      expect(toElectronAccelerator(key, platform), key).toBe(platformStyle[platform]);
    }
  });

  it.each(platforms)("%s: commandOrControl style keeps the menu's existing spelling", (platform) => {
    for (const [key, , menuStyle] of cases) {
      expect(
        toElectronAccelerator(key, platform, { modStyle: "commandOrControl" }),
        key
      ).toBe(menuStyle[platform]);
    }
  });
});

describe("nodePlatformToPergamumPlatform (#642)", () => {
  it("maps the main process platform", () => {
    expect(nodePlatformToPergamumPlatform("darwin")).toBe("darwin");
    expect(nodePlatformToPergamumPlatform("win32")).toBe("win32");
    expect(nodePlatformToPergamumPlatform("linux")).toBe("linux");
    expect(nodePlatformToPergamumPlatform("freebsd")).toBe("linux");
  });
});

describe("createMenuAcceleratorLookup (#642)", () => {
  it.each(platforms)("%s: catalog-derived accelerators for the menu commands", (platform) => {
    const lookup = createMenuAcceleratorLookup(platform);
    expect(lookup.get("editor.file.new")).toBe("CommandOrControl+N");
    expect(lookup.get("editor.document.save")).toBe("CommandOrControl+S");
    expect(lookup.get("editor.saveAs")).toBe("CommandOrControl+Shift+S");
    expect(lookup.getAll("editor.saveAs")).toEqual([
      "CommandOrControl+Shift+S",
      "F12"
    ]);
    expect(lookup.get("editor.saveAll")).toBe("CommandOrControl+Alt+S");
    expect(lookup.getAll("workbench.commandPalette.open")).toEqual([
      "CommandOrControl+P",
      "F1"
    ]);
    expect(lookup.get("workspace.applicationSettings.open")).toBe(
      "CommandOrControl+,"
    );
    expect(lookup.getAll("app.zoom.in")).toEqual([
      "CommandOrControl+=",
      "CommandOrControl+Plus"
    ]);
    expect(lookup.get("app.zoom.out")).toBe("CommandOrControl+-");
    expect(lookup.get("app.zoom.reset")).toBe("CommandOrControl+0");
    expect(lookup.get("editor.close")).toBe("CommandOrControl+W");
    expect(lookup.get("workspace.project.open")).toBe("CommandOrControl+Shift+O");
    expect(lookup.get("search.project.openFromSelection")).toBe(
      "CommandOrControl+Shift+F"
    );
    expect(lookup.get("search.project.replace.openFromSelection")).toBe(
      "CommandOrControl+Shift+H"
    );
  });

  it("returns undefined / [] for unknown commands", () => {
    const lookup = createMenuAcceleratorLookup("win32");
    expect(lookup.get("no.such.command")).toBeUndefined();
    expect(lookup.getAll("no.such.command")).toEqual([]);
  });

  it("returns undefined for a key that is unassigned on the platform (key=null)", () => {
    const catalog: KeybindingCatalog = {
      commands: [command({ id: "menu.thing" })],
      defaults: [{ command: "menu.thing", key: "Mod-#", mac: null }],
      reserved: []
    };
    expect(createMenuAcceleratorLookup("win32", catalog, null).get("menu.thing")).toBe(
      "CommandOrControl+#"
    );
    const darwin = createMenuAcceleratorLookup("darwin", catalog, null);
    expect(darwin.get("menu.thing")).toBeUndefined();
    expect(darwin.getAll("menu.thing")).toEqual([]);
  });

  it("never returns nativeRole / standard commands, nor non-app scopes", () => {
    const lookup = createMenuAcceleratorLookup("darwin");
    for (const id of [
      "app.quit",
      "app.hide",
      "app.hideOthers",
      "window.close",
      "window.minimize",
      "window.toggleFullscreen",
      "developer.toggleDevTools",
      "editor.selection.copy",
      "editor.undo",
      "editor.comment.toggle",
      // editor / pane scope: not application-menu commands
      "editor.preview.toggle",
      "editor.image.insert",
      "editor.markdown.toggleSyntaxChecker",
      "editor.markdown.insertRuby",
      "workspace.files.toggle"
    ]) {
      expect(lookup.get(id), id).toBeUndefined();
    }
  });

  it("keeps catalog alias order and skips readonly rows in a custom catalog", () => {
    const catalog: KeybindingCatalog = {
      commands: [
        command({ id: "a" }),
        command({
          id: "b",
          source: "nativeRole",
          executionHost: "nativeRole",
          readonly: true,
          readonlyReason: "nativeRole",
          handlerStatus: "nativeRole"
        })
      ],
      defaults: [
        { command: "a", key: "Mod-k" },
        { command: "a", key: "F2" },
        { command: "b", key: "Mod-q" }
      ],
      reserved: []
    };
    const lookup = createMenuAcceleratorLookup("linux", catalog, null);
    expect(lookup.getAll("a")).toEqual(["CommandOrControl+K", "F2"]);
    expect(lookup.get("b")).toBeUndefined();
  });

  it("only serves commands that have a menu item (the palette prefix shortcuts are renderer listeners)", () => {
    for (const platform of platforms) {
      const lookup = createMenuAcceleratorLookup(platform);
      for (const id of [
        "workbench.commandPalette.file.open",
        "workbench.commandPalette.heading.open",
        "workbench.commandPalette.glossary.open",
        "workbench.commandPalette.line.open",
        "workbench.commandPalette.projectSearch.open"
      ]) {
        expect(lookup.getAll(id), `${id} on ${platform}`).toEqual([]);
      }
    }
    // ... while the unrestricted lookup would have exposed Mod-o.
    expect(
      createMenuAcceleratorLookup("win32", undefined, null).get(
        "workbench.commandPalette.file.open"
      )
    ).toBe("CommandOrControl+O");
  });

  it("never yields a reload / forceReload accelerator (Mod-r is Ruby, in editor scope)", () => {
    for (const platform of platforms) {
      const lookup = createMenuAcceleratorLookup(platform);
      const all = [
        "workspace.project.open",
        "editor.file.new",
        "editor.document.save",
        "editor.saveAs",
        "editor.saveAll",
        "editor.close",
        "workbench.commandPalette.open",
        "workspace.applicationSettings.open",
        "app.zoom.in",
        "app.zoom.out",
        "app.zoom.reset"
      ].flatMap((id) => lookup.getAll(id));
      expect(all).not.toContain("CommandOrControl+R");
      expect(all).not.toContain("CommandOrControl+Shift+R");
      expect(all).not.toContain("F5");
    }
  });
});
