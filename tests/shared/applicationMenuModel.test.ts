import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applicationMenuModel,
  getApplicationMenuModel,
  type ApplicationMenuItem,
  type ApplicationMenuSubmenuItem
} from "../../src/shared/applicationMenuModel";
import {
  applicationCommandIds,
  assistCommandIds,
  commandPaletteCommandIds,
  editorCommandIds,
  glossaryTabCommandIds,
  projectSettingsCommandIds,
  searchSelectionShortcutCommandIds,
  workspaceCommandIds
} from "../../src/shared/commandIds";

/** A compact, readable structure: labels as keys, commands / roles tagged. */
function outline(items: readonly ApplicationMenuItem[]): unknown[] {
  return items.map((item) => {
    switch (item.type) {
      case "separator":
        return "---";
      case "command":
        return `command:${item.commandId}`;
      case "nativeRole":
        return `role:${item.role}`;
      case "submenu":
        return {
          [("key" in item.label ? item.label.key : item.label.literal) +
          (item.role ? `@${item.role}` : "")]: outline(item.items)
        };
    }
  });
}

function topLevelLabels(
  items: readonly ApplicationMenuSubmenuItem[]
): string[] {
  return items.map((item) =>
    "key" in item.label ? item.label.key : item.label.literal
  );
}

function topLevel(platform: "win32" | "linux" | "darwin", key: string) {
  const menu = getApplicationMenuModel(platform).find(
    (item) => "key" in item.label && item.label.key === key
  );
  if (!menu) {
    throw new Error(`missing top-level menu ${key}`);
  }
  return menu;
}

function allItems(
  items: readonly ApplicationMenuItem[]
): ApplicationMenuItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.type === "submenu" ? allItems(item.items) : [])
  ]);
}

describe("canonical application menu model (#662)", () => {
  describe("top-level structure per platform", () => {
    it.each(["win32", "linux"] as const)(
      "%s: File / Edit / View / Assist / Help",
      (platform) => {
        expect(topLevelLabels(getApplicationMenuModel(platform))).toEqual([
          "menu.file",
          "menu.edit",
          "menu.view",
          "menu.assist",
          "menu.help"
        ]);
      }
    );

    it("darwin: Pergamum / File / Edit / View / Assist / Window / Help", () => {
      expect(topLevelLabels(getApplicationMenuModel("darwin"))).toEqual([
        "Pergamum",
        "menu.file",
        "menu.edit",
        "menu.view",
        "menu.assist",
        "menu.window",
        "menu.help"
      ]);
    });

    it("the macOS application menu name is a literal, not a translation key", () => {
      const [app] = getApplicationMenuModel("darwin");
      expect(app.label).toEqual({ literal: "Pergamum" });
    });

    it("platform resolution does not mutate the shared model", () => {
      getApplicationMenuModel("win32");
      expect(applicationMenuModel).toHaveLength(7);
    });
  });

  describe("File menu", () => {
    it("Windows / Linux: ends with command-routed Quit, no native Close role", () => {
      const items = topLevel("win32", "menu.file").items;
      expect(outline(items)).toEqual([
        `command:${applicationCommandIds.createProject}`,
        `command:${applicationCommandIds.openProject}`,
        `command:${applicationCommandIds.closeProject}`,
        "---",
        { "menu.file.import": [
          `command:${applicationCommandIds.openBulkTextImportDialog}`
        ] },
        "---",
        `command:${editorCommandIds.newFile}`,
        `command:${editorCommandIds.openMarkdownDocument}`,
        `command:${editorCommandIds.close}`,
        `command:${editorCommandIds.saveDocument}`,
        `command:${editorCommandIds.saveAll}`,
        `command:${editorCommandIds.saveAs}`,
        "---",
        `command:${projectSettingsCommandIds.open}`,
        `command:${workspaceCommandIds.openKeyboardShortcuts}`,
        `command:${workspaceCommandIds.openApplicationSettings}`,
        "---",
        `command:${applicationCommandIds.quitApplication}`
      ]);
      expect(topLevel("linux", "menu.file").items).toEqual(items);
    });

    it("macOS: ends with the native Close Window role, Quit moves to the app menu", () => {
      const items = topLevel("darwin", "menu.file").items;
      expect(outline(items).slice(-2)).toEqual(["---", "role:close"]);
      expect(
        allItems(items).some(
          (item) =>
            item.type === "command" &&
            item.commandId === applicationCommandIds.quitApplication
        )
      ).toBe(false);
    });

    it("File > Import is a nested submenu holding Bulk Text Files", () => {
      const file = topLevel("win32", "menu.file");
      const imports = file.items.find(
        (item): item is ApplicationMenuSubmenuItem =>
          item.type === "submenu"
      );
      expect(imports?.label).toEqual({ key: "menu.file.import" });
      expect(outline(imports?.items ?? [])).toEqual([
        `command:${applicationCommandIds.openBulkTextImportDialog}`
      ]);
    });
  });

  describe("Edit / View / Assist / Help", () => {
    it("Edit keeps native edit roles (with their enablement ids) then project search", () => {
      const items = topLevel("win32", "menu.edit").items;
      expect(outline(items)).toEqual([
        "role:undo",
        "role:redo",
        "---",
        "role:cut",
        "role:copy",
        "role:paste",
        "---",
        "role:selectAll",
        "---",
        `command:${searchSelectionShortcutCommandIds.openProjectSearchFromSelection}`,
        `command:${searchSelectionShortcutCommandIds.openProjectReplaceFromSelection}`
      ]);
      const roles = items.filter((item) => item.type === "nativeRole");
      expect(
        roles.map((item) => item.type === "nativeRole" && item.commandId)
      ).toEqual([
        editorCommandIds.undo,
        editorCommandIds.redo,
        editorCommandIds.cutSelection,
        editorCommandIds.copySelection,
        editorCommandIds.pasteSelection,
        editorCommandIds.selectAllSelection
      ]);
    });

    it("View: Command Palette, DevTools role, zoom commands, full screen role", () => {
      expect(outline(topLevel("win32", "menu.view").items)).toEqual([
        `command:${commandPaletteCommandIds.open}`,
        "---",
        "role:toggleDevTools",
        "---",
        `command:${applicationCommandIds.zoomIn}`,
        `command:${applicationCommandIds.zoomOut}`,
        `command:${applicationCommandIds.resetZoom}`,
        "---",
        "role:togglefullscreen"
      ]);
    });

    it("Assist groups line endings / Japanese style check / indent, then glossary management", () => {
      expect(outline(topLevel("win32", "menu.assist").items)).toEqual([
        `command:${assistCommandIds.showLineEndingDistribution}`,
        `command:${assistCommandIds.openJapaneseMachineCheckDialog}`,
        `command:${assistCommandIds.insertParagraphIndent}`,
        `command:${assistCommandIds.removeParagraphIndent}`,
        "---",
        `command:${glossaryTabCommandIds.manageEntries}`,
        `command:${glossaryTabCommandIds.manageTags}`
      ]);
    });

    it("Help is the native help submenu: Resume Hub, then About", () => {
      const help = topLevel("win32", "menu.help");
      expect(help.role).toBe("help");
      expect(outline(help.items)).toEqual([
        `command:${workspaceCommandIds.showResumeHub}`,
        "---",
        `command:${applicationCommandIds.openAbout}`
      ]);
    });
  });

  describe("macOS-only menus", () => {
    it("Pergamum app menu: About, Services, Hide group, Quit", () => {
      const [app] = getApplicationMenuModel("darwin");
      expect(outline(app.items)).toEqual([
        `command:${applicationCommandIds.openAbout}`,
        "---",
        "role:services",
        "---",
        "role:hide",
        "role:hideOthers",
        "role:unhide",
        "---",
        `command:${applicationCommandIds.quitApplication}`
      ]);
      const hide = app.items.find(
        (item) => item.type === "nativeRole" && item.role === "hide"
      );
      expect(hide && "label" in hide ? hide.label : undefined).toEqual({
        key: "menu.hide",
        values: { appName: "Pergamum" }
      });
    });

    it("Window menu holds the native window roles", () => {
      expect(outline(topLevel("darwin", "menu.window").items)).toEqual([
        "role:minimize",
        "role:zoom",
        "---",
        "role:front"
      ]);
    });

    it("the macOS-only menus are absent elsewhere", () => {
      for (const platform of ["win32", "linux"] as const) {
        const labels = topLevelLabels(getApplicationMenuModel(platform));
        expect(labels).not.toContain("Pergamum");
        expect(labels).not.toContain("menu.window");
      }
    });
  });

  describe("item semantics", () => {
    const everyItem = allItems(applicationMenuModel);

    it("shortcut / alias semantics are explicit, not strings", () => {
      const byCommand = (id: string) =>
        everyItem.find(
          (item) => item.type === "command" && item.commandId === id
        );

      // #556: Open Markdown Document is intentionally menu-only.
      expect(byCommand(editorCommandIds.openMarkdownDocument)).toMatchObject({
        keybinding: "none"
      });
      // #591: bound, but the visible item shows no shortcut label.
      expect(
        byCommand(workspaceCommandIds.openApplicationSettings)
      ).toMatchObject({ keybinding: "primaryUnlabeled" });
      // #642 aliases (F1, F12, Mod-+).
      for (const id of [
        commandPaletteCommandIds.open,
        editorCommandIds.saveAs,
        applicationCommandIds.zoomIn
      ]) {
        expect(byCommand(id)).toMatchObject({ keyAlias: true });
      }
    });

    it("carries no Electron types, click handlers, or accelerator strings", () => {
      // Comments explain the shortcut rules; only code is checked.
      const source = readFileSync("src/shared/applicationMenuModel.ts", "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(source).not.toMatch(/from "electron"/);
      expect(source).not.toMatch(/MenuItemConstructorOptions/);
      expect(source).not.toMatch(/CommandOrControl|Command\+|Ctrl\+|Shift\+/);
      for (const item of everyItem) {
        expect(item).not.toHaveProperty("click");
        expect(item).not.toHaveProperty("accelerator");
        expect(item).not.toHaveProperty("enabled");
      }
    });

    it("every command item names a command; every label is a key or literal", () => {
      for (const item of everyItem) {
        if (item.type === "command") {
          expect(item.commandId.length).toBeGreaterThan(0);
        }
        if (item.type !== "separator") {
          const label = item.label;
          expect("key" in label || "literal" in label).toBe(true);
        }
      }
    });
  });
});
