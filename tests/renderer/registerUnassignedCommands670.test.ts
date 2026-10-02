import { describe, expect, it, vi } from "vitest";
import { keybindingCommands } from "../../src/shared/keybindings/commands";
import { defaultKeybindings } from "../../src/shared/keybindings/defaults";
import { resolveDefaultKeybindings } from "../../src/shared/keybindings/resolve";
import {
  KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS,
  filterKeyboardShortcutRows
} from "../../src/renderer/keyboardShortcutSearch";
import { assistCommandIds, editorCommandIds, applicationCommandIds, workspaceCommandIds, projectSettingsCommandIds, glossaryTabCommandIds } from "../../src/shared/commandIds";
import { t } from "../../src/shared/i18n";
import { isJapaneseMachineCheckPath } from "../../src/shared/japaneseMachineCheck";

const target12CommandIds = [
  assistCommandIds.showLineEndingDistribution,
  assistCommandIds.insertParagraphIndent,
  assistCommandIds.removeParagraphIndent,
  glossaryTabCommandIds.manageEntries,
  glossaryTabCommandIds.manageTags,
  assistCommandIds.openExportDialog,
  assistCommandIds.openJapaneseMachineCheckDialog,
  applicationCommandIds.openBulkTextImportDialog,
  projectSettingsCommandIds.open,
  editorCommandIds.toggleInstantJapaneseLint,
  workspaceCommandIds.showResumeHub,
  applicationCommandIds.openAbout
];

describe("Issue #670: Keyboard Shortcuts categories and unassigned commands", () => {
  it("defines Assist and Help in KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS with localized labels", () => {
    expect(KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS["Assist"]).toBe(
      "keyboardShortcuts.category.assist"
    );
    expect(KEYBOARD_SHORTCUT_CATEGORY_LABEL_KEYS["Help"]).toBe(
      "keyboardShortcuts.category.help"
    );

    expect(t("ja", "keyboardShortcuts.category.assist")).toBe("アシスト");
    expect(t("ja", "keyboardShortcuts.category.help")).toBe("ヘルプ");
    expect(t("en", "keyboardShortcuts.category.assist")).toBe("Assist");
    expect(t("en", "keyboardShortcuts.category.help")).toBe("Help");
  });

  it("places all 12 target commands in their expected categories in keybindingCommands", () => {
    const commandsById = new Map(
      keybindingCommands.map((command) => [command.id, command])
    );

    for (const id of target12CommandIds) {
      expect(commandsById.has(id), `Missing command ${id}`).toBe(true);
    }

    // Assist
    expect(commandsById.get(assistCommandIds.showLineEndingDistribution)?.category).toBe("Assist");
    expect(commandsById.get(assistCommandIds.insertParagraphIndent)?.category).toBe("Assist");
    expect(commandsById.get(assistCommandIds.removeParagraphIndent)?.category).toBe("Assist");
    expect(commandsById.get(glossaryTabCommandIds.manageEntries)?.category).toBe("Assist");
    expect(commandsById.get(glossaryTabCommandIds.manageTags)?.category).toBe("Assist");
    expect(commandsById.get(assistCommandIds.openExportDialog)?.category).toBe("Assist");
    expect(commandsById.get(assistCommandIds.openJapaneseMachineCheckDialog)?.category).toBe("Assist");

    // View
    expect(commandsById.get(applicationCommandIds.openBulkTextImportDialog)?.category).toBe("View");
    expect(commandsById.get(projectSettingsCommandIds.open)?.category).toBe("View");

    // Editor
    expect(commandsById.get(editorCommandIds.toggleInstantJapaneseLint)?.category).toBe("Editor");

    // Help
    expect(commandsById.get(workspaceCommandIds.showResumeHub)?.category).toBe("Help");
    expect(commandsById.get(applicationCommandIds.openAbout)?.category).toBe("Help");
  });

  it("ensures none of the 12 target commands have a built-in default keybinding", () => {
    const boundCommandIds = new Set(defaultKeybindings.map((d) => d.command));

    for (const id of target12CommandIds) {
      expect(boundCommandIds.has(id), `Command ${id} should have no built-in default keybinding`).toBe(false);
    }

    const resolved = resolveDefaultKeybindings("win32");
    for (const id of target12CommandIds) {
      const row = resolved.find((r) => r.command === id);
      expect(row, `Missing resolved row for ${id}`).toBeDefined();
      expect(row?.key).toBeNull();
    }
  });

  it("checks japaneseMachineCheck document path helper", () => {
    expect(isJapaneseMachineCheckPath("doc.md")).toBe(true);
    expect(isJapaneseMachineCheckPath("doc.markdown")).toBe(true);
    expect(isJapaneseMachineCheckPath("doc.txt")).toBe(true);
    expect(isJapaneseMachineCheckPath("image.png")).toBe(false);
  });
});
