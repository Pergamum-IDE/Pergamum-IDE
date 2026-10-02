import { readFileSync } from "node:fs";
import type { MenuItemConstructorOptions } from "electron";
import { describe, expect, it, vi } from "vitest";
import { buildNativeMenuTemplate } from "../../src/main/applicationMenuAdapter";
import { createMenuAcceleratorLookup } from "../../src/main/menuAccelerators";
import {
  applicationCommandIds,
  editorCommandIds
} from "../../src/shared/commandIds";
import { t, type Language } from "../../src/shared/i18n";
import {
  resolveDefaultKeybindings,
  resolveEffectiveKeybindings,
  toElectronAccelerator,
  type PergamumPlatform,
  type ResolvedKeybinding,
  type UserKeybindingEntry
} from "../../src/shared/keybindings";

/**
 * #666: the macOS native Application Menu is built from the canonical Menu
 * Model (+ its darwin overlay) by the Electron native adapter - nothing else.
 * These are static / automated contracts on the generated template. They do
 * NOT show how macOS draws the menu (glyphs, Services integration, AppKit
 * behavior): that needs a physical Mac.
 */

type Item = MenuItemConstructorOptions;

function macTemplate(
  language: Language = "en",
  rows?: readonly ResolvedKeybinding[],
  hooks: {
    sendCommand?: (commandId: string) => boolean;
    requestApplicationQuit?: () => void;
  } = {}
): Item[] {
  return buildNativeMenuTemplate({
    language,
    platform: "darwin",
    accelerators: createMenuAcceleratorLookup(
      "darwin",
      undefined,
      undefined,
      rows
    ),
    sendCommand: hooks.sendCommand ?? (() => true),
    requestApplicationQuit: hooks.requestApplicationQuit
  });
}

const submenu = (item: Item): Item[] => item.submenu as Item[];

function flatten(items: readonly Item[]): Item[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : [])
  ]);
}

function userRows(entries: UserKeybindingEntry[]): ResolvedKeybinding[] {
  return resolveEffectiveKeybindings({
    platform: "darwin" as PergamumPlatform,
    userEntries: entries
  }).keybindings as ResolvedKeybinding[];
}

/** An Electron accelerator in a canonical, macOS-semantic form. */
function macAccelerator(accelerator: string): string {
  const parts = accelerator
    .replace(/CommandOrControl/gi, "Command")
    .replace(/\bCmd\b/gi, "Command")
    .replace(/\bOption\b/gi, "Alt")
    .split("+");
  const key = parts.pop()!.toUpperCase();

  return [...parts.map((part) => part.toLowerCase()).sort(), key].join("+");
}

describe("macOS native menu structure (#666)", () => {
  it.each([
    [
      "en",
      ["Pergamum", "File", "Edit", "View", "Assist", "Window", "Help"]
    ],
    [
      "ja",
      [
        "Pergamum",
        t("ja", "menu.file"),
        t("ja", "menu.edit"),
        t("ja", "menu.view"),
        t("ja", "menu.assist"),
        t("ja", "menu.window"),
        t("ja", "menu.help")
      ]
    ]
  ] as const)(
    "%s: Pergamum / File / Edit / View / Assist / Window / Help, labels from the translations",
    (language, expected) => {
      expect(macTemplate(language).map((item) => item.label)).toEqual([
        ...expected
      ]);
    }
  );

  it("the Japanese Assist menu is アシスト (no Renderer mnemonic suffix natively)", () => {
    const labels = macTemplate("ja").map((item) => item.label);

    expect(labels).toContain("アシスト");
    for (const label of labels) {
      expect(label).not.toMatch(/\([A-Z]\)$/);
      expect(label).not.toContain("&");
    }
  });

  it("the Pergamum application menu keeps its exact layout", () => {
    const [app] = macTemplate("en");
    const items = submenu(app);

    expect(
      items.map((item) =>
        item.type === "separator"
          ? "---"
          : (item.role ?? `command:${item.id}`)
      )
    ).toEqual([
      `command:${applicationCommandIds.openAbout}`,
      "---",
      "services",
      "---",
      "hide",
      "hideOthers",
      "unhide",
      "---",
      `command:${applicationCommandIds.quitApplication}`
    ]);
    expect(items.map((item) => item.label)).toEqual([
      "About Pergamum",
      undefined,
      "Services",
      undefined,
      "Hide Pergamum",
      "Hide Others",
      "Show All",
      undefined,
      "Quit Pergamum"
    ]);
  });

  it("Services / Hide / Hide Others / Show All are native roles with no Pergamum handler", () => {
    const [app] = macTemplate("en");

    for (const role of ["services", "hide", "hideOthers", "unhide"] as const) {
      const item = submenu(app).find((candidate) => candidate.role === role)!;

      expect(item, role).toBeTruthy();
      expect(item.click, role).toBeUndefined();
      // The role keeps Electron's own accelerator (Cmd+H, Cmd+Option+H, ...).
      expect(item.accelerator, role).toBeUndefined();
    }
  });

  it("the Window menu is the three native window roles", () => {
    const window = macTemplate("en").find((item) => item.label === "Window")!;
    const items = submenu(window);

    expect(
      items.map((item) => (item.type === "separator" ? "---" : item.role))
    ).toEqual(["minimize", "zoom", "---", "front"]);
    for (const item of items.filter((candidate) => candidate.role)) {
      expect(item.click).toBeUndefined();
    }
  });

  it("the Edit menu keeps native edit roles (OS text editing), not Renderer commands", () => {
    const edit = macTemplate("en").find((item) => item.label === "Edit")!;
    const roles = submenu(edit).filter((item) =>
      ["undo", "redo", "cut", "copy", "paste", "selectAll"].includes(
        item.role ?? ""
      )
    );

    expect(roles.map((item) => item.role)).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
      "selectAll"
    ]);
    for (const item of roles) {
      // The command id is only the enablement identity; behavior is the role.
      expect(item.click, item.role).toBeUndefined();
      expect(item.accelerator, item.role).toBeUndefined();
      expect(typeof item.id).toBe("string");
    }
  });

  it("the View menu keeps the DevTools and Full Screen roles", () => {
    const view = macTemplate("en").find((item) => item.label === "View")!;
    const devTools = submenu(view).find((item) => item.role === "toggleDevTools")!;
    const fullScreen = submenu(view).find((item) => item.role === "togglefullscreen")!;

    expect(devTools.click).toBeUndefined();
    expect(devTools.accelerator).toBe("CommandOrControl+Shift+D");
    // macOS owns the Full Screen shortcut (Ctrl+Cmd+F): the role default stays.
    expect(fullScreen.click).toBeUndefined();
    expect(fullScreen.accelerator).toBeUndefined();
  });

  it("Help is the native help role, with About as the same command as the app menu", () => {
    const template = macTemplate("en", undefined, {
      sendCommand: (commandId) => {
        sent.push(commandId);
        return true;
      }
    });
    const sent: string[] = [];
    const help = template.at(-1)!;

    expect(help.role).toBe("help");
    expect(help.label).toBe("Help");

    const aboutItems = flatten(template).filter(
      (item) => item.id === applicationCommandIds.openAbout
    );
    expect(aboutItems).toHaveLength(2);
    for (const item of aboutItems) {
      item.click?.({} as never, undefined, {} as never);
    }
    expect(sent).toEqual([
      applicationCommandIds.openAbout,
      applicationCommandIds.openAbout
    ]);
  });
});

describe("macOS Quit and Close policies (#666)", () => {
  it("Quit is the app.quit command (dirty-document preflight), never Electron's quit role", () => {
    const quit = flatten(macTemplate("en")).find(
      (item) => item.id === applicationCommandIds.quitApplication
    )!;

    expect(quit.role).toBeUndefined();
    expect(quit.accelerator).toBe("Command+Q");
  });

  it("Quit goes to the renderer first; the main fallback runs only when it is unreachable", () => {
    const requestApplicationQuit = vi.fn();
    const delivered = macTemplate("en", undefined, {
      sendCommand: () => true,
      requestApplicationQuit
    });
    const click = (template: Item[]) =>
      flatten(template)
        .find((item) => item.id === applicationCommandIds.quitApplication)!
        .click?.({} as never, undefined, {} as never);

    click(delivered);
    expect(requestApplicationQuit).not.toHaveBeenCalled();

    click(
      macTemplate("en", undefined, {
        sendCommand: () => false,
        requestApplicationQuit
      })
    );
    expect(requestApplicationQuit).toHaveBeenCalledTimes(1);
  });

  it("Cmd+W is editor.close, Cmd+Shift+W is the native Close Window role, and they never collide", () => {
    const items = flatten(macTemplate("en"));
    const closeTab = items.find((item) => item.id === editorCommandIds.close)!;
    const closeWindow = items.find((item) => item.role === "close")!;

    expect(macAccelerator(closeTab.accelerator!)).toBe("command+W");
    expect(macAccelerator(closeWindow.accelerator!)).toBe("command+shift+W");
    expect(closeWindow.click).toBeUndefined();
    expect(macAccelerator(closeTab.accelerator!)).not.toBe(
      macAccelerator(closeWindow.accelerator!)
    );
  });
});

describe("macOS native accelerators (#666)", () => {
  it("every accelerator in the darwin template is unique (visible and hidden items)", () => {
    const accelerators = flatten(macTemplate("en"))
      .map((item) => item.accelerator)
      .filter((accelerator): accelerator is string => typeof accelerator === "string")
      .map(macAccelerator);

    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  it("custom (Pergamum command) items never claim a macOS reserved or native-owned key", () => {
    const reserved = new Set(
      [
        "Command+Space",
        "Control+Space",
        "Command+Shift+3",
        "Command+Shift+4",
        "Command+Shift+5",
        "Command+Tab",
        "Command+`",
        "Command+Alt+Escape",
        "Control+Command+Q",
        // owned by the native roles
        "Command+H",
        "Command+Alt+H",
        "Command+M"
      ].map(macAccelerator)
    );

    for (const item of flatten(macTemplate("en"))) {
      // Custom items are the ones with a click handler. Quit is the lifecycle
      // item whose Cmd+Q is the macOS Quit key.
      if (
        typeof item.click !== "function" ||
        typeof item.accelerator !== "string" ||
        item.id === applicationCommandIds.quitApplication
      ) {
        continue;
      }
      expect(reserved.has(macAccelerator(item.accelerator)), String(item.label)).toBe(
        false
      );
    }
  });

  it("a user override reaches the native menu; an unbound command loses its accelerator; aliases stay", () => {
    const overridden = flatten(
      macTemplate(
        "en",
        userRows([
          { key: "Mod-Alt-9", command: "editor.document.save" },
          { key: "Mod-s", command: "-editor.document.save" }
        ])
      )
    );
    const save = overridden.find((item) => item.id === editorCommandIds.saveDocument)!;

    expect(macAccelerator(save.accelerator!)).toBe("alt+command+9");
    // The F12 / F1 / Mod-+ hidden aliases are untouched.
    const hidden = overridden.filter((item) => item.visible === false);
    expect(hidden.map((item) => item.accelerator)).toEqual(
      expect.arrayContaining(["F1", "F12"])
    );

    const unbound = flatten(
      macTemplate(
        "en",
        userRows([{ key: "Mod-s", command: "-editor.document.save" }])
      )
    ).find((item) => item.id === editorCommandIds.saveDocument)!;
    expect(unbound.accelerator).toBeUndefined();
  });

  it("the generated accelerators are Electron Command / Alt / Control strings (glyphs are drawn by macOS)", () => {
    // Static: the strings handed to Electron. How macOS renders them (the
    // command / option / shift / control glyphs) is NOT verified here.
    expect(toElectronAccelerator("Mod-s", "darwin")).toBe("Command+S");
    expect(toElectronAccelerator("Mod-Alt-f", "darwin")).toBe("Command+Alt+F");
    expect(toElectronAccelerator("Ctrl-Mod-f", "darwin")).toBe(
      "Control+Command+F"
    );
    // The menu itself uses CommandOrControl, which Electron resolves to
    // Command on macOS.
    const save = flatten(macTemplate("en")).find(
      (item) => item.id === editorCommandIds.saveDocument
    )!;
    expect(save.accelerator).toBe("CommandOrControl+S");
    expect(macAccelerator(save.accelerator!)).toBe("command+S");
  });

  it("matches the effective rows of the darwin catalog (no shortcut literal is repeated)", () => {
    const rows = resolveDefaultKeybindings("darwin");
    const lookup = createMenuAcceleratorLookup("darwin", undefined, undefined, rows);
    const save = flatten(macTemplate("en")).find(
      (item) => item.id === editorCommandIds.saveDocument
    )!;

    expect(save.accelerator).toBe(lookup.get(editorCommandIds.saveDocument));
  });
});

describe("macOS boundaries (#666)", () => {
  const strip = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("no Renderer-only metadata (mnemonic, shortcutDisplayId) leaks into the native template", () => {
    for (const item of flatten(macTemplate("ja"))) {
      expect(item).not.toHaveProperty("mnemonic");
      expect(item).not.toHaveProperty("shortcutDisplayId");
      expect(String(item.label ?? "")).not.toContain("&");
    }
    expect(
      strip(readFileSync("src/main/applicationMenuAdapter.ts", "utf8"))
    ).not.toMatch(/mnemonic|shortcutDisplayId/);
  });

  it("the adapter builds from the canonical model; menu.ts holds no macOS structure", () => {
    const adapter = readFileSync("src/main/applicationMenuAdapter.ts", "utf8");
    const menu = strip(readFileSync("src/main/menu.ts", "utf8"));

    expect(adapter).toContain('from "../shared/applicationMenuModel"');
    expect(adapter).toContain("getApplicationMenuModel(");
    for (const macOnly of ["services", "hideOthers", "unhide", "front", "minimize"]) {
      expect(menu, macOnly).not.toContain(macOnly);
    }
  });

  it("the Renderer holds no macOS menu structure", () => {
    for (const path of [
      "src/renderer/ApplicationMenuBar.tsx",
      "src/renderer/applicationMenuProjection.ts",
      "src/renderer/applicationMenuKeyboard.ts",
      "src/renderer/applicationMenuIntegration.ts"
    ]) {
      const source = strip(readFileSync(path, "utf8"));

      for (const macOnly of ["hideOthers", '"services"', '"unhide"', '"front"']) {
        expect(source, `${path} ${macOnly}`).not.toContain(macOnly);
      }
    }
  });
});
