import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { workspaceCommandIds } from "../../src/shared/commandIds";
import { CommandRegistry } from "../../src/shared/commandRegistry";
import { enTranslations as en } from "../../src/shared/i18n/en";
import { jaTranslations as ja } from "../../src/shared/i18n/ja";
import {
  createWorkspaceCommands,
  createWorkspaceCommandTitles
} from "../../src/renderer/workspaceCommands";
import {
  shouldShowFullScreenWelcomeSurface,
  shouldShowWelcomeSurface
} from "../../src/renderer/welcomeSurface";
import { createInitialOpenDocumentsState } from "../../src/renderer/openDocuments";

const app = readFileSync("src/renderer/App.tsx", "utf8");

describe("Keyboard Shortcuts special tab wiring (#646)", () => {
  it("is a special tab id next to settings", () => {
    const tabs = readFileSync("src/renderer/workspaceTabs.ts", "utf8");
    expect(tabs).toContain('| "keyboardShortcuts"');
  });

  it("App.tsx adds only the minimal ResumeHub-sized wiring and delegates to the screen component", () => {
    expect(app).toContain('import { KeyboardShortcutsScreen } from "./KeyboardShortcutsScreen";');
    expect(app).toContain("isKeyboardShortcutsTabOpen");
    expect(app).toContain("function openKeyboardShortcutsTab()");
    expect(app).toContain('setActiveSpecialTabId("keyboardShortcuts")');
    expect(app).toContain('id: "keyboardShortcuts"');
    expect(app).toContain("<KeyboardShortcutsScreen translate={translate} language={displayLanguage} />");
    expect(app).toContain("openKeyboardShortcuts: () => {\n          openKeyboardShortcutsTab();");
    // The screen's logic lives in its own component, not in App.
    expect(app).not.toContain("filterKeyboardShortcutRows");
    expect(app).not.toContain("getKeyboardShortcutItems");
  });

  it("the tab can be activated and closed like the other special tabs", () => {
    expect(app).toContain('tabId === "keyboardShortcuts" && isKeyboardShortcutsTabOpen');
    expect(app).toContain('if (tabId === "keyboardShortcuts") {\n      setIsKeyboardShortcutsTabOpen(false);');
  });

  it("an open Keyboard Shortcuts tab suppresses the Welcome surface", () => {
    const openDocumentsState = createInitialOpenDocumentsState();
    expect(
      shouldShowWelcomeSurface({ openDocumentsState, isSettingsTabOpen: false })
    ).toBe(true);
    expect(
      shouldShowWelcomeSurface({
        openDocumentsState,
        isSettingsTabOpen: false,
        isKeyboardShortcutsTabOpen: true
      })
    ).toBe(false);
    expect(
      shouldShowFullScreenWelcomeSurface({
        openDocumentsState,
        isSettingsTabOpen: false,
        isKeyboardShortcutsTabOpen: true,
        projectIsOpen: false
      })
    ).toBe(false);
  });

  it("is registered as a Command Palette command with a title and description (no key)", async () => {
    const opened: string[] = [];
    const commands = createWorkspaceCommands(
      {
        focusSidebarMode: () => undefined,
        openApplicationSettings: () => undefined,
        openKeyboardShortcuts: () => {
          opened.push("keyboardShortcuts");
        },
        showResumeHub: () => undefined,
        canShowResumeHub: () => true
      },
      createWorkspaceCommandTitles((key) => `t:${key}`)
    );
    const command = commands.find((c) => c.id === workspaceCommandIds.openKeyboardShortcuts);
    expect(command?.title).toBe("t:command.workspace.keyboardShortcuts.open");
    expect(command?.description).toBe("t:command.workspace.keyboardShortcuts.open.description");
    // Visible in the palette (not hidden) and runnable.
    expect(command?.palette?.visible).not.toBe(false);
    const registry = new CommandRegistry();
    registry.register(command!);
    await registry.execute(workspaceCommandIds.openKeyboardShortcuts, { source: "commandPalette" });
    expect(opened).toEqual(["keyboardShortcuts"]);
  });

  it("every keyboardShortcuts i18n key exists in both ja and en", () => {
    const keys = (dictionary: Record<string, string>) =>
      Object.keys(dictionary)
        .filter(
          (key) =>
            key.startsWith("keyboardShortcuts.") ||
            key === "menu.keyboardShortcuts" ||
            key.startsWith("command.workspace.keyboardShortcuts.")
        )
        .sort();
    expect(keys(ja as unknown as Record<string, string>)).toEqual(
      keys(en as unknown as Record<string, string>)
    );
    expect(keys(ja as unknown as Record<string, string>).length).toBeGreaterThan(20);
  });

  it("Japanese user-facing strings match the spec", () => {
    expect(ja["menu.keyboardShortcuts"]).toBe("キーボードショートカット...");
    expect(ja["keyboardShortcuts.title"]).toBe("キーボードショートカット");
    expect(ja["keyboardShortcuts.search.placeholder"]).toBe("検索...");
    expect(ja["keyboardShortcuts.openLocation"]).toBe("keybindings.json の場所を開く");
    expect(ja["keyboardShortcuts.unassigned"]).toBe("未割当");
    expect(ja["keyboardShortcuts.empty"]).toBe("一致するショートカットはありません。");
    expect(ja["keyboardShortcuts.source.pergamum"]).toBe("Pergamum");
    expect(ja["keyboardShortcuts.source.nativeRole"]).toBe("Native");
    expect(ja["keyboardShortcuts.source.standard"]).toBe("標準機能");
    expect(ja["keyboardShortcuts.diagnostics.summary.errors"]).toBe(
      "keybindings.json に {count} 件のエラーがあります。"
    );
  });
});

describe("#646 stays view-only", () => {
  it("adds no keybindings.json text editor, key capture, reset, conflict UI or file watcher", () => {
    for (const path of [
      "src/renderer/KeyboardShortcutsScreen.tsx",
      "src/renderer/keyboardShortcutSearch.ts",
      "src/main/keybindingsIpc.ts",
      "src/main/keybindingsStore.ts"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source, path).not.toMatch(/<textarea|contentEditable|KeyCapture|captureKey|resetShortcut|resolveConflict/);
      expect(source, path).not.toMatch(/fs\.watch|watchFile|chokidar|globalShortcut/);
    }
  });
});
