import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  editorCommandIds,
  searchSelectionShortcutCommandIds
} from "../../src/shared/commandIds";
import { ActivityBar } from "../../src/renderer/ActivityBar";
import {
  formatKeybindingLabel,
  type ResolvedKeybinding
} from "../../src/shared/keybindings";
import { resolveDefaultKeybindings } from "../../src/shared/keybindings/resolve";
import {
  createCommandShortcutResolver,
  formatCommandTooltip,
  primaryKey,
  useCommandShortcutResolver
} from "../../src/renderer/commandShortcuts";
import {
  resetEffectiveKeybindings,
  setEffectiveKeybindings
} from "../../src/renderer/keybindings/effectiveKeybindingStore";
import { getRuntimePlatform } from "../../src/renderer/platformModifier";

const winRows = resolveDefaultKeybindings("win32");

function withKey(
  rows: readonly ResolvedKeybinding[],
  commandId: string,
  key: string | null
): ResolvedKeybinding[] {
  return rows.map((row) => (row.command === commandId ? { ...row, key } : row));
}

function fakeRow(command: string, key: string | null): ResolvedKeybinding {
  return {
    ...winRows[0],
    command,
    key
  };
}

describe("commandShortcuts (#718 Slice 2)", () => {
  beforeEach(() => {
    resetEffectiveKeybindings();
  });

  afterEach(() => {
    resetEffectiveKeybindings();
  });

  describe("primaryKey", () => {
    it("returns the first bound key in catalog order", () => {
      const key = primaryKey(winRows, editorCommandIds.saveDocument);
      expect(key).toBe("Mod-s");
    });

    it("returns primary key when multiple bindings exist for a command", () => {
      const rows: ResolvedKeybinding[] = [
        fakeRow("workbench.commandPalette.open", "Mod-p"),
        fakeRow("workbench.commandPalette.open", "F1")
      ];
      expect(primaryKey(rows, "workbench.commandPalette.open")).toBe("Mod-p");
    });

    it("skips null entries and returns undefined if all are null", () => {
      const rows: ResolvedKeybinding[] = [
        fakeRow("custom.test.command", null)
      ];
      expect(primaryKey(rows, "custom.test.command")).toBeUndefined();
    });

    it("returns undefined for unknown commands", () => {
      expect(primaryKey(winRows, "nonexistent.command.id")).toBeUndefined();
    });
  });

  describe("createCommandShortcutResolver", () => {
    it("formats shortcuts according to the target platform", () => {
      const winResolve = createCommandShortcutResolver("win32", winRows);
      const macRows = resolveDefaultKeybindings("darwin");
      const macResolve = createCommandShortcutResolver("darwin", macRows);

      const winCut = winResolve(editorCommandIds.cutSelection);
      const macCut = macResolve(editorCommandIds.cutSelection);

      expect(winCut).toBe(formatKeybindingLabel("Mod-x", "win32"));
      expect(macCut).toBe(formatKeybindingLabel("Mod-x", "darwin"));
      expect(winCut).not.toBe(macCut);
    });

    it("respects user overrides", () => {
      const overridden = withKey(winRows, editorCommandIds.saveDocument, "Mod-Shift-s");
      const resolve = createCommandShortcutResolver("win32", overridden);

      expect(resolve(editorCommandIds.saveDocument)).toBe(
        formatKeybindingLabel("Mod-Shift-s", "win32")
      );
    });

    it("returns undefined for explicitly unbound commands", () => {
      const unbound = withKey(winRows, editorCommandIds.saveDocument, null);
      const resolve = createCommandShortcutResolver("win32", unbound);

      expect(resolve(editorCommandIds.saveDocument)).toBeUndefined();
    });

    it("returns undefined for empty, null, or undefined command ids", () => {
      const resolve = createCommandShortcutResolver("win32", winRows);

      expect(resolve("")).toBeUndefined();
      expect(resolve(null)).toBeUndefined();
      expect(resolve(undefined)).toBeUndefined();
    });
  });

  describe("formatCommandTooltip", () => {
    it("appends formatted shortcut in parentheses when present", () => {
      expect(formatCommandTooltip("Save", "Ctrl+S")).toBe("Save (Ctrl+S)");
      expect(formatCommandTooltip("Bold", "Ctrl+B")).toBe("Bold (Ctrl+B)");
    });

    it("returns baseLabel as-is when shortcut is undefined", () => {
      expect(formatCommandTooltip("Search", undefined)).toBe("Search");
    });

    it("returns baseLabel as-is when shortcut is empty or whitespace", () => {
      expect(formatCommandTooltip("Search", "")).toBe("Search");
      expect(formatCommandTooltip("Search", "   ")).toBe("Search");
    });

    it("never renders empty parentheses", () => {
      const resultEmpty = formatCommandTooltip("Open", "");
      const resultWhitespace = formatCommandTooltip("Open", "  \t  ");
      const resultUndefined = formatCommandTooltip("Open", undefined);

      expect(resultEmpty).not.toContain("()");
      expect(resultWhitespace).not.toContain("()");
      expect(resultUndefined).not.toContain("()");
    });
  });

  describe("useCommandShortcutResolver in React context", () => {
    function TestConsumer({ commandId }: { commandId: string }): JSX.Element {
      const resolveShortcut = useCommandShortcutResolver();
      const shortcut = resolveShortcut(commandId);
      return <span data-testid="shortcut">{shortcut ?? "none"}</span>;
    }

    it("resolves default shortcut during component render", () => {
      const platform = getRuntimePlatform();
      const markup = renderToStaticMarkup(
        <TestConsumer commandId={editorCommandIds.saveDocument} />
      );
      const expectedLabel = formatKeybindingLabel("Mod-s", platform);
      expect(markup).toContain(expectedLabel);
    });

    it("reflects live store updates when effective keybindings change", () => {
      const platform = getRuntimePlatform();
      const defaultRows = resolveDefaultKeybindings(platform);

      // 1. Initial render with defaults
      const markup1 = renderToStaticMarkup(
        <TestConsumer commandId={editorCommandIds.saveDocument} />
      );
      expect(markup1).toContain(formatKeybindingLabel("Mod-s", platform));

      // 2. User rebinds saveDocument to Mod-Shift-s
      const customRows = withKey(defaultRows, editorCommandIds.saveDocument, "Mod-Shift-s");
      setEffectiveKeybindings(platform, customRows);

      const markup2 = renderToStaticMarkup(
        <TestConsumer commandId={editorCommandIds.saveDocument} />
      );
      expect(markup2).toContain(formatKeybindingLabel("Mod-Shift-s", platform));

      // 3. User explicitly unbinds saveDocument
      const unboundRows = withKey(defaultRows, editorCommandIds.saveDocument, null);
      setEffectiveKeybindings(platform, unboundRows);

      const markup3 = renderToStaticMarkup(
        <TestConsumer commandId={editorCommandIds.saveDocument} />
      );
      expect(markup3).toContain("none");
    });
  });

  describe("Activity Bar Search special-case mapping (#718)", () => {
    it("displays shortcut from search.project.openFromSelection and supports live update / unbind", () => {
      const platform = getRuntimePlatform();
      const defaultRows = resolveDefaultKeybindings(platform);
      const searchShortcut = formatKeybindingLabel("Mod-Shift-f", platform);

      const renderActivityBar = () =>
        renderToStaticMarkup(
          <ActivityBar
            activeMode="files"
            isApplicationSettingsActive={false}
            translate={(key) => (key === "activity.search" ? "検索" : key)}
            onSelectMode={() => undefined}
            onOpenApplicationSettings={() => undefined}
          />
        );

      // 1. Initial render: displays search.project.openFromSelection shortcut
      const markup1 = renderActivityBar();
      expect(markup1).toContain('aria-label="検索"');
      expect(markup1).toContain(`title="検索 (${searchShortcut})"`);

      // 2. User rebinds search.project.openFromSelection to Mod-Alt-f
      const rebindKey = "Mod-Alt-f";
      const customRows = withKey(
        defaultRows,
        searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
        rebindKey
      );
      setEffectiveKeybindings(platform, customRows);

      const markup2 = renderActivityBar();
      const newShortcut = formatKeybindingLabel(rebindKey, platform);
      expect(markup2).toContain(`title="検索 (${newShortcut})"`);

      // 3. User unbinds search.project.openFromSelection
      const unboundRows = withKey(
        defaultRows,
        searchSelectionShortcutCommandIds.openProjectSearchFromSelection,
        null
      );
      setEffectiveKeybindings(platform, unboundRows);

      const markup3 = renderActivityBar();
      expect(markup3).toContain('aria-label="検索"');
      expect(markup3).toContain('title="検索"');
      expect(markup3).not.toContain("()");
    });
  });
});
