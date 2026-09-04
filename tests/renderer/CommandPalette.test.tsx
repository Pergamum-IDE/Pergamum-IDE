import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../../src/shared/api";
import { CommandRegistry, defineCommandId } from "../../src/shared/commandRegistry";
import type { CommandContext } from "../../src/shared/commandEnablement";
import { editorCommandIds } from "../../src/shared/commandIds";
import { t, type Translate } from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";
import {
  CommandPalette,
  CommandPaletteHighlightedText,
  commandPaletteItemClassName,
  resolveCommandPaletteFooterDetailMarquee,
  resolveCommandPaletteFooterModel,
  scrollCommandPaletteSelectionIntoView
} from "../../src/renderer/CommandPalette";
import {
  filterCommandPaletteEntries,
  resolveCommandPaletteEnterSelection,
  type CommandPaletteEntry
} from "../../src/renderer/commandPaletteEntries";
import { registerLineJumpCommands } from "../../src/renderer/lineJumpCommands";
import type { LineJumpEditorSnapshot } from "../../src/renderer/lineJumpQuery";
import type { CommandPaletteFooterDetailSettings } from "../../src/shared/settings";

const translate: Translate = (key) => key;
const realTranslateEn: Translate = (key, values) => t("en", key, values);
const realTranslateJa: Translate = (key, values) => t("ja", key, values);
const notComposing = () => false;
const noop = () => undefined;
const footerDetailDisabledSettings: CommandPaletteFooterDetailSettings = {
  enable: false,
  marquee: { delay: 2000, speed: 40 }
};

function projectDocument(relativePath: string): ProjectDocument {
  return {
    relativePath,
    name: relativePath.split(/[\\/]/).pop() ?? relativePath
  };
}

function buildRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.save"),
    title: "保存",
    description: "現在の文書を保存",
    canonicalLabel: "Save Document",
    execute: () => undefined,
    isEnabled: () => true
  });
  registry.register({
    id: defineCommandId("test.command.disabled"),
    title: "Disabled Command",
    execute: () => undefined,
    isEnabled: () => false
  });
  registry.register({
    id: defineCommandId("test.command.fallback"),
    title: "Fallback Only",
    execute: () => undefined
  });

  return registry;
}

function buildWhenGatedRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.whenGated"),
    title: "When Gated",
    execute: () => undefined,
    when: { key: "editor.isDirty" }
  });

  return registry;
}

function buildReadOnlyProjectWriteRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: defineCommandId("test.command.projectWrite"),
    title: "Project write",
    execute: () => undefined,
    when: { key: "project.access.readWrite" }
  });
  registry.register({
    id: defineCommandId("test.command.normalDisabled"),
    title: "Normal disabled",
    execute: () => undefined,
    when: { key: "editor.isDirty" }
  });

  return registry;
}

function buildTranslatedEditorDocumentCommandRegistry(
  translate: Translate
): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: editorCommandIds.saveDocument,
    title: translate("command.editor.document.save"),
    execute: () => undefined
  });
  registry.register({
    id: editorCommandIds.close,
    title: translate("command.editor.document.close"),
    execute: () => undefined
  });

  return registry;
}

function renderPalette(overrides: {
  registry?: CommandRegistry;
  commandContext?: CommandContext;
  translate?: Translate;
  initialInputValue?: string;
  onExecuteCommand?: (commandId: unknown, ...args: readonly unknown[]) => void;
  onBlockedCommand?: (commandId: unknown) => void;
  onOpenProjectFileQuickOpenCandidate?: (relativePath: string) => void;
  projectFileQuickOpenDocuments?: readonly ProjectDocument[];
  recentProjectFileQuickOpenDocuments?: readonly ProjectDocument[];
  lineJumpEditorSnapshot?: LineJumpEditorSnapshot | null;
  footerDetailSettings?: CommandPaletteFooterDetailSettings;
} = {}): string {
  return renderToStaticMarkup(
    React.createElement(CommandPalette, {
      commandRegistry: overrides.registry ?? buildRegistry(),
      translate: overrides.translate ?? translate,
      isComposing: notComposing,
      commandContext: overrides.commandContext ?? {},
      initialInputValue: overrides.initialInputValue,
      onExecuteCommand: overrides.onExecuteCommand ?? noop,
      onBlockedCommand: overrides.onBlockedCommand ?? noop,
      onOpenProjectFileQuickOpenCandidate:
        overrides.onOpenProjectFileQuickOpenCandidate ?? noop,
      projectFileQuickOpenDocuments: overrides.projectFileQuickOpenDocuments,
      recentProjectFileQuickOpenDocuments:
        overrides.recentProjectFileQuickOpenDocuments,
      onClose: noop,
      lineJumpEditorSnapshot: overrides.lineJumpEditorSnapshot,
      footerDetailSettings: overrides.footerDetailSettings
    })
  );
}

function buildLineJumpEditorSnapshot(
  lineCount: number,
  getLineText: (line: number) => string = () => ""
): LineJumpEditorSnapshot {
  return { lineCount, getLineText };
}

function buildLineJumpRegistry(
  goToLine: (line: number) => void = () => undefined
): CommandRegistry {
  const registry = new CommandRegistry();

  registerLineJumpCommands(
    registry,
    { goToLine },
    {
      goToLine: "Go to Line",
      goToLineDescription: "Move the cursor to a line in the active editor"
    }
  );

  return registry;
}

describe("CommandPalette", () => {
  it("initializes the search input to '>'", () => {
    const markup = renderPalette();

    expect(markup).toContain('value="&gt;"');
  });

  it("renders commandId in the item secondary line and description in the footer", () => {
    const markup = renderPalette();

    expect(markup).toContain("現在の文書を保存");
    expect(markup).toContain("Save Document");
    expect(markup).toContain("test.command.save");
    expect(markup).toContain("Fallback Only");
    expect(markup).toContain("test.command.fallback");
  });

  it("uses Document wording for localized editor document command labels without changing command IDs", () => {
    expect(jaTranslations["command.editor.document.save"]).toBe(
      "現在の文書を保存"
    );
    expect(jaTranslations["command.editor.document.close"]).toBe(
      "現在の文書を閉じる"
    );
    expect(enTranslations["command.editor.document.save"]).toBe(
      "Save Current Document"
    );
    expect(enTranslations["command.editor.document.close"]).toBe(
      "Close Current Document"
    );
    expect(editorCommandIds.saveDocument).toBe("editor.document.save");
    expect(editorCommandIds.close).toBe("editor.close");

    const japaneseMarkup = renderPalette({
      registry: buildTranslatedEditorDocumentCommandRegistry(realTranslateJa),
      initialInputValue: ">"
    });
    const englishMarkup = renderPalette({
      registry: buildTranslatedEditorDocumentCommandRegistry(realTranslateEn),
      initialInputValue: ">"
    });

    expect(japaneseMarkup).toContain("現在の文書を保存");
    expect(japaneseMarkup).toContain("現在の文書を閉じる");
    expect(japaneseMarkup).toContain("editor.document.save");
    expect(japaneseMarkup).toContain("editor.close");
    expect(japaneseMarkup).not.toContain("現在のエディタを保存");
    expect(japaneseMarkup).not.toContain("現在のエディタを閉じる");
    expect(englishMarkup).toContain("Save Current Document");
    expect(englishMarkup).toContain("Close Current Document");
    expect(englishMarkup).toContain("editor.document.save");
    expect(englishMarkup).toContain("editor.close");
    expect(englishMarkup).not.toContain("Save Current Editor");
    expect(englishMarkup).not.toContain("Close Current Editor");
  });

  it("defines Command Palette command description keys in Japanese and English", () => {
    const descriptions = [
      [
        "command.workspace.project.create.description",
        "新しいPergamumプロジェクトを作成します。",
        "Create a new Pergamum project."
      ],
      [
        "command.workspace.project.open.description",
        "既存プロジェクトファイルを開きます。文書に編集がある場合は確認します。",
        "Open an existing project. Check for unsaved changes before switching projects."
      ],
      [
        "command.workspace.recentProjects.toggle.description",
        "最近開いたプロジェクトを切り替えます。文書に編集がある場合は確認します。",
        "Switch between recently opened projects. Check for unsaved changes before switching projects."
      ],
      [
        "command.editor.document.markdown.open.description",
        "主にプロジェクト外のMarkdownファイルを開きます。",
        "Open a Markdown file outside the current project."
      ],
      [
        "command.editor.document.save.description",
        "現在の文書を上書き保存します。",
        "Save the current document and overwrite the existing file."
      ],
      [
        "command.editor.saveAs.description",
        "現在の文書を任意の場所に別名で保存します。",
        "Save the current document with a different name and location."
      ],
      [
        "command.editor.document.close.description",
        "現在の文書を閉じます。変更がある場合は確認します。",
        "Close the current document. Check for unsaved changes before closing."
      ],
      [
        "command.editor.selection.cut.description",
        "現在のエディタ内で選択中のテキストを切り取ります。",
        "Cut the selected text in the current editor."
      ],
      [
        "command.editor.selection.copy.description",
        "現在のエディタ内で選択中のテキストをコピーします。",
        "Copy the selected text in the current editor."
      ],
      [
        "command.editor.selection.paste.description",
        "現在のエディタ内でカーソルの位置にテキストを貼り付けます。",
        "Paste text at the current cursor position in the editor."
      ],
      [
        "command.editor.selection.selectAll.description",
        "現在のエディタ内のテキストを全文選択します。",
        "Select all text in the current editor."
      ],
      [
        "command.workspace.files.toggle.description",
        "ファイルエクスプローラーを表示または非表示にします。",
        "Show or hide the File Explorer."
      ],
      [
        "command.workspace.files.createMarkdownFile.description",
        "ファイルエクスプローラーの選択位置に Markdown ファイルを作成します。",
        "Create a Markdown file at the current File Explorer selection."
      ],
      [
        "command.workspace.files.createFolder.description",
        "ファイルエクスプローラーの選択位置にフォルダを作成します。",
        "Create a folder at the current File Explorer selection."
      ],
      [
        "command.workspace.files.rename.description",
        "アクティブなエディターで開いている、保存済みのプロジェクト Markdown ファイルの名前を変更します。",
        "Rename the saved project Markdown file open in the active editor."
      ],
      [
        "command.workspace.search.focus.description",
        "左ペインに検索を表示します。",
        "Show the Search panel in the left pane."
      ],
      [
        "command.workspace.glossary.focus.description",
        "語彙集を表示します。",
        "Show the Glossary panel."
      ],
      [
        "command.workspace.applicationSettings.open.description",
        "Pergamum全体に有効な設定画面を表示します。",
        "Open application-wide settings."
      ],
      [
        "command.workbench.utilityWindow.open.description",
        "支援ウィンドウを表示します。",
        "Show the Utility Window."
      ],
      [
        "command.workbench.utilityWindow.close.description",
        "支援ウィンドウを非表示にします。",
        "Hide the Utility Window."
      ],
      [
        "command.workbench.utilityWindow.toggle.description",
        "支援ウィンドウの表示項目を切り替えます。",
        "Toggle the Utility Window."
      ],
      [
        "command.glossary.occurrences.previous.description",
        "（未実装です）",
        "Not implemented."
      ],
      [
        "command.glossary.occurrences.next.description",
        "（未実装です）",
        "Not implemented."
      ],
      [
        "command.glossary.occurrences.entry.open.description",
        "（未実装です）",
        "Not implemented."
      ],
      [
        "command.glossary.occurrences.tracking.close.description",
        "（未実装です）",
        "Not implemented."
      ]
    ] as const;

    for (const [key, japanese, english] of descriptions) {
      expect(jaTranslations[key]).toBe(japanese);
      expect(enTranslations[key]).toBe(english);
    }
  });

  it("renders the empty result state in the result list area", () => {
    const markup = renderPalette({
      registry: new CommandRegistry()
    });

    expect(markup).toContain("commandPaletteList");
    expect(markup).toContain("commandPaletteEmpty");
    expect(markup).toContain("commandPalette.noResults");
  });

  it("marks disabled commands with the disabled class and aria-disabled", () => {
    const markup = renderPalette();

    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="true"');
  });

  it("renders a status column for command items even when no icon is shown", () => {
    const registry = new CommandRegistry();

    registry.register({
      id: defineCommandId("test.command.enabledOnly"),
      title: "Enabled only",
      execute: () => undefined
    });

    const markup = renderPalette({
      registry,
      initialInputValue: ">enabled"
    });

    expect(markup).toContain("commandPaletteStatusColumn");
    expect(markup).toContain(
      '<span class="commandPaletteStatusColumn" aria-hidden="true"></span><div class="commandPaletteItemText">'
    );
    expect(markup).not.toContain("data-command-palette-status-icon");
    expect(markup).not.toContain("feather-shield");
    expect(markup).not.toContain("ionicon");
  });

  it("keeps command text behind the same status column with and without an icon", () => {
    const enabledRegistry = new CommandRegistry();

    enabledRegistry.register({
      id: defineCommandId("test.command.enabledOnly"),
      title: "Enabled only",
      description: "Enabled description",
      execute: () => undefined
    });

    const enabledMarkup = renderPalette({
      registry: enabledRegistry,
      initialInputValue: ">enabled"
    });
    const readOnlyMarkup = renderPalette({
      registry: buildReadOnlyProjectWriteRegistry(),
      commandContext: {
        "project.access.readWrite": false,
        "project.access.readOnly": true,
        "editor.isDirty": false
      },
      translate: realTranslateEn,
      initialInputValue: ">project"
    });

    for (const markup of [enabledMarkup, readOnlyMarkup]) {
      const columnIndex = markup.indexOf("commandPaletteStatusColumn");
      const textIndex = markup.indexOf("commandPaletteItemText");
      const primaryIndex = markup.indexOf("commandPaletteItemPrimary");
      const secondaryIndex = markup.indexOf("commandPaletteItemSecondary");

      expect(columnIndex).toBeGreaterThan(-1);
      expect(textIndex).toBeGreaterThan(columnIndex);
      expect(primaryIndex).toBeGreaterThan(textIndex);
      expect(secondaryIndex).toBeGreaterThan(primaryIndex);
    }
  });

  it("renders as a labeled dialog with a search input and a close button", () => {
    const markup = renderPalette();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("commandPaletteInput");
    expect(markup).toContain("commandPaletteCloseButton");
  });

  it("displays a when-gated command as disabled when the snapshot says it is false", () => {
    const markup = renderPalette({
      registry: buildWhenGatedRegistry(),
      commandContext: { "editor.isDirty": false }
    });

    expect(markup).toContain("When Gated");
    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="true"');
  });

  it("displays a when-gated command as enabled when the snapshot says it is true", () => {
    const markup = renderPalette({
      registry: buildWhenGatedRegistry(),
      commandContext: { "editor.isDirty": true }
    });

    expect(markup).toContain("When Gated");
    expect(markup).not.toContain("commandPaletteItemDisabled");
    expect(markup).toContain('aria-disabled="false"');
  });

  it("renders the read-only disabled reason in English and Japanese", () => {
    const registry = buildReadOnlyProjectWriteRegistry();
    const commandContext = {
      "project.access.readWrite": false,
      "project.access.readOnly": true
    };
    const englishMarkup = renderPalette({
      registry,
      commandContext,
      translate: realTranslateEn,
      initialInputValue: ">project"
    });
    const japaneseMarkup = renderPalette({
      registry,
      commandContext,
      translate: realTranslateJa,
      initialInputValue: ">project"
    });

    expect(englishMarkup).toContain("Unavailable in read-only mode");
    expect(japaneseMarkup).toContain(
      "読み取り専用のため使用できません"
    );
  });

  it("renders the Shield icon for readOnlyProject disabled commands", () => {
    const markup = renderPalette({
      registry: buildReadOnlyProjectWriteRegistry(),
      commandContext: {
        "project.access.readWrite": false,
        "project.access.readOnly": true,
        "editor.isDirty": false
      },
      translate: realTranslateEn,
      initialInputValue: ">project"
    });
    const iconIndex = markup.indexOf("commandPaletteStatusColumn");
    const primaryIndex = markup.indexOf("commandPaletteItemPrimary");

    expect(markup).toContain(
      'data-command-palette-status-icon="readOnlyProject"'
    );
    expect(markup).toContain("commandPaletteStatusIcon-readOnlyProject");
    expect(markup).toContain("feather-shield");
    expect(iconIndex).toBeGreaterThan(-1);
    expect(primaryIndex).toBeGreaterThan(iconIndex);
  });

  it("renders the Ban icon for disabled commands without a specific disabled reason", () => {
    const markup = renderPalette({
      registry: buildReadOnlyProjectWriteRegistry(),
      commandContext: {
        "project.access.readWrite": true,
        "project.access.readOnly": false,
        "editor.isDirty": false
      },
      translate: realTranslateEn,
      initialInputValue: ">normal"
    });

    expect(markup).toContain("Normal disabled");
    expect(markup).not.toContain("Unavailable in read-only mode");
    expect(markup).not.toContain("feather-shield");
    expect(markup).toContain(
      'data-command-palette-status-icon="conditionUnavailable"'
    );
    expect(markup).toContain("commandPaletteStatusIcon-conditionUnavailable");
    expect(markup).toContain("ionicon");
  });

  it("renders the Construct icon for reserved not-implemented palette modes", () => {
    const markup = renderPalette({
      initialInputValue: "@alice"
    });

    expect(markup).toContain("commandPalette.reserved.glossary");
    expect(markup).toContain(
      'data-command-palette-status-icon="notImplemented"'
    );
    expect(markup).toContain("commandPaletteStatusIcon-notImplemented");
    expect(markup).toContain("ionicon");
  });

  it("uses the original primary label as the result accessible name", () => {
    const markup = renderPalette();

    expect(markup).toContain('aria-label="Save Document"');
    expect(markup).not.toContain('aria-label="現在の文書を保存"');
  });

  it("keeps the selected disabled item visually distinct", () => {
    expect(commandPaletteItemClassName(true, false)).toBe(
      "commandPaletteItem commandPaletteItemSelected commandPaletteItemDisabled"
    );
  });

  it("keeps the selected item visible with nearest scrolling", () => {
    const scrollIntoView = vi.fn();

    scrollCommandPaletteSelectionIntoView({ scrollIntoView });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("does not scroll when the result list has no selected item", () => {
    expect(() => scrollCommandPaletteSelectionIntoView(null)).not.toThrow();
  });

  it("renders fixed footer hints and the selected command footer detail, without a result count, for the default empty query", () => {
    const markup = renderPalette();

    expect(markup).toContain("commandPaletteFooter");
    expect(markup).toContain("commandPalette.footer.selectHint");
    expect(markup).toContain("commandPalette.footer.runHint");
    expect(markup).toContain("commandPalette.footer.closeHint");
    expect(markup).toContain(
      '<span class="commandPaletteFooterStatusText">現在の文書を保存</span>'
    );
    expect(markup).not.toContain("commandPalette.footer.searchHint");
    expect(markup).not.toContain("commandPalette.footer.results");
  });

  it("shows the real English/Japanese search hint text when footer details are disabled", () => {
    expect(
      renderPalette({
        translate: realTranslateEn,
        footerDetailSettings: footerDetailDisabledSettings
      })
    ).toContain(
      "Search commands"
    );
    expect(
      renderPalette({
        translate: realTranslateJa,
        footerDetailSettings: footerDetailDisabledSettings
      })
    ).toContain(
      "コマンドを検索します"
    );
  });

  it("does not show the command-mode search hint for a fully empty input, and renders the project file quick-open placeholder instead", () => {
    const englishMarkup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ""
    });
    const japaneseMarkup = renderPalette({
      translate: realTranslateJa,
      initialInputValue: ""
    });

    expect(englishMarkup).toContain(
      '<div class="commandPaletteFooterStatus"></div>'
    );
    expect(englishMarkup).toContain(
      'placeholder="Type a folder or file name"'
    );
    expect(englishMarkup).not.toContain('placeholder="Search commands"');
    expect(japaneseMarkup).toContain(
      'placeholder="フォルダ名・ファイル名を入力してください"'
    );
    expect(japaneseMarkup).not.toContain('placeholder="コマンドを検索"');
  });

  it("renders the command-search placeholder in command mode", () => {
    const englishMarkup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ">"
    });
    const japaneseMarkup = renderPalette({
      translate: realTranslateJa,
      initialInputValue: ">"
    });

    expect(englishMarkup).toContain('placeholder="Search commands"');
    expect(japaneseMarkup).toContain('placeholder="コマンドを検索"');
  });

  it("renders '1 result', not '1 results', for a real English query with exactly one match (dogfood regression)", () => {
    // Renders the actual CommandPalette JSX tree end-to-end (real registry
    // filtering, real resolveCommandPaletteFooterModel call, real translate
    // bound to the real en.ts dictionary) rather than only asserting on the
    // pure footer-model function, since a wiring bug between statusKey/
    // statusValues and the rendered JSX would not show up in a model-only
    // test.
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ">fallback",
      footerDetailSettings: footerDetailDisabledSettings
    });

    expect(markup).toContain("1 result");
    expect(markup).not.toContain("1 results");
  });

  it("renders '{count} results' for a real English query with multiple matches", () => {
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: ">test.command",
      footerDetailSettings: footerDetailDisabledSettings
    });

    expect(markup).toContain("3 results");
    expect(markup).not.toContain("1 results");
    expect(markup).not.toContain("1 result");
  });

  it("renders the Japanese counter form for a real one-result query", () => {
    const markup = renderPalette({
      translate: realTranslateJa,
      initialInputValue: ">fallback",
      footerDetailSettings: footerDetailDisabledSettings
    });

    expect(markup).toContain("1件の結果");
  });

  it("does not hard-code either plural results key in CommandPalette.tsx, and passes statusValues through to translate", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).not.toContain("commandPalette.footer.results.other");
    expect(source).not.toContain("commandPalette.footer.results.one");
    expect(source).toContain("translate(footer.statusKey, footer.statusValues)");
  });

  it("uses compact key-only footer hints that do not read like clickable actions", () => {
    expect(enTranslations["commandPalette.footer.selectHint"]).toBe("↑↓");
    expect(enTranslations["commandPalette.footer.runHint"]).toBe("Enter");
    expect(enTranslations["commandPalette.footer.closeHint"]).toBe("Esc");
    expect(jaTranslations["commandPalette.footer.selectHint"]).toBe("↑↓");
    expect(jaTranslations["commandPalette.footer.runHint"]).toBe("Enter");
    expect(jaTranslations["commandPalette.footer.closeHint"]).toBe("Esc");
  });

  it("measures real overflow and enables footer detail marquee with configured delay and speed", () => {
    expect(
      resolveCommandPaletteFooterDetailMarquee({
        enabled: true,
        reducedMotion: false,
        scrollWidth: 260,
        clientWidth: 100,
        delayMs: 2000,
        speedPxPerSecond: 40
      })
    ).toEqual({
      overflowing: true,
      active: true,
      distancePx: 160,
      durationMs: 4000,
      delayMs: 2000,
      speedPxPerSecond: 40
    });
  });

  it("does not enable footer detail marquee when the text fits", () => {
    expect(
      resolveCommandPaletteFooterDetailMarquee({
        enabled: true,
        reducedMotion: false,
        scrollWidth: 100,
        clientWidth: 100,
        delayMs: 2000,
        speedPxPerSecond: 40
      })
    ).toMatchObject({
      overflowing: false,
      active: false
    });
  });

  it("suppresses footer detail marquee when reduced motion is preferred", () => {
    expect(
      resolveCommandPaletteFooterDetailMarquee({
        enabled: true,
        reducedMotion: true,
        scrollWidth: 260,
        clientWidth: 100,
        delayMs: 2000,
        speedPxPerSecond: 40
      })
    ).toMatchObject({
      overflowing: true,
      active: false
    });
  });

  it("uses measured scrollWidth/clientWidth, CSS animation, and selected command detail identity to reset the marquee", () => {
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).not.toContain("<marquee");
    expect(source).not.toContain("CommandPaletteDescriptionMarquee");
    expect(source).not.toContain("useCommandPaletteDescriptionMarquee");
    expect(source).not.toContain("commandPalette.description");
    // #370 marquee fix: overflow is measured from a dedicated unconstrained
    // twin span, not the visible ellipsized text element.
    expect(source).toContain("scrollWidth: measure.scrollWidth");
    expect(source).toContain("clientWidth: container.clientWidth");
    expect(source).toContain('className="commandPaletteFooterStatusMeasure"');
    expect(source).toContain("resetKey:");
    expect(source).toContain("detailResetKey: String(selectedEntry.id)");
    expect(source).toContain("footerDetailResetKey");
    expect(source).toContain(
      "--command-palette-footer-detail-marquee-delay"
    );
    expect(source).toContain(
      "--command-palette-footer-detail-marquee-duration"
    );
  });

  it("uses adaptive top-anchored height while keeping large result sets scrollable", () => {
    const styles = readFileSync("src/renderer/styles.css", "utf8");

    expect(styles).toContain(".commandPaletteBackdrop");
    expect(styles).toContain("align-items: flex-start;");
    expect(styles).toContain(".commandPalette {\n  display: flex;");
    expect(styles).toContain("width: min(35rem, calc(100vw - 2rem));");
    expect(styles).toContain("max-height: min(30rem, calc(100vh - 24vh));");
    expect(styles).toContain("border-radius: 0.5rem;");
    expect(styles).toContain(".commandPaletteInputRow {\n  display: flex;\n  flex: 0 0 auto;");
    expect(styles).toContain("padding: 0.625rem 0.75rem;");
    expect(styles).toContain(".commandPaletteList {\n  flex: 0 1 auto;");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain("padding: 0.375rem;");
    expect(styles).toContain(".commandPaletteFooter {\n  display: flex;\n  flex: 0 0 auto;");
    expect(styles).toContain("gap: 1em;");
    expect(styles).toContain(".commandPaletteEmpty {\n  display: flex;\n  min-height: 6rem;");
    expect(styles).toContain(".commandPaletteItem {\n  display: flex;");
    expect(styles).toContain("align-items: stretch;");
    expect(styles).toContain("gap: 0.55em;");
    expect(styles).toContain("min-height: 3rem;");
    expect(styles).toContain("padding: 0.52em 0.6em;");
    expect(styles).toContain(".commandPaletteStatusColumn");
    expect(styles).toContain("flex: 0 0 1.25rem;");
    expect(styles).toContain("min-height: 2.25rem;");
    expect(styles).toContain("align-items: center;");
    expect(styles).toContain(".commandPaletteItemText");
    expect(styles).toContain("gap: 0.15em;");
    expect(styles).toContain(
      "color: var(--color-project-read-only);"
    );
    expect(styles).toContain("box-shadow: inset 0.1875rem 0 0 #c9d3dc;");
    expect(styles).toContain("border-radius: 0.125em;");
    expect(styles).toContain("padding: 0 0.08em;");
    expect(styles).toContain(".commandPaletteFooterStatusText-marquee");
    expect(styles).toContain("@keyframes commandPaletteFooterDetailMarquee");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    // #370 marquee fix: an off-screen, unconstrained measurement twin.
    expect(styles).toContain(".commandPaletteFooterStatusMeasure {");
    expect(styles).toContain(".commandPaletteFooterStatus {\n  position: relative;");
  });
});

describe("CommandPalette highlighting and footer model", () => {
  const entries: CommandPaletteEntry[] = [
    {
      id: defineCommandId("test.command.save"),
      title: "Save Document",
      description: "Write the current editor to disk",
      enabled: true
    },
    {
      id: defineCommandId("test.command.disabled"),
      title: "Disabled Command",
      description: "Disabled command description",
      enabled: false
    }
  ];

  it("renders no highlight markup when there are no matched ranges", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: "Save Document",
        ranges: []
      })
    );

    expect(markup).toBe("Save Document");
    expect(markup).not.toContain("<mark");
  });

  it("safely renders highlighted text without raw HTML injection", () => {
    const markup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: "<script>Save</script>",
        ranges: [{ start: 8, end: 12 }]
      })
    );

    expect(markup).toContain("&lt;script&gt;");
    expect(markup).toContain("<mark");
    expect(markup).not.toContain("<script>");
  });

  it("highlights matched ranges from the filtering result in every visible matched field", () => {
    const result = filterCommandPaletteEntries(entries, "document")[0];
    const primaryMarkup = renderToStaticMarkup(
      React.createElement(CommandPaletteHighlightedText, {
        text: result.primary.text,
        ranges: result.primary.ranges
      })
    );

    expect(result.primary).toEqual({
      field: "title",
      text: "Save Document",
      ranges: [{ start: 5, end: 13 }]
    });
    expect(primaryMarkup).toContain(
      'Save <mark class="commandPaletteMatch">Document</mark>'
    );
  });

  it("shows an enabled selected command description as footer detail before result count or hints in the footer model", () => {
    const results = filterCommandPaletteEntries(entries, "command");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "command",
        inputValue: ">command",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: null,
      detailText: "Write the current editor to disk",
      detailResetKey: "test.command.save",
      canRunSelected: true
    });
  });

  it("shows result count only for command queries when footer detail display is disabled", () => {
    const results = filterCommandPaletteEntries(entries, "command");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "command",
        inputValue: ">command",
        entries: results,
        selectedIndex: 0,
        detailEnabled: false
      })
    ).toEqual({
      statusKey: "commandPalette.footer.results.other",
      statusValues: { count: 2 },
      canRunSelected: true
    });
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: "",
        entries: results,
        selectedIndex: 0,
        detailEnabled: false
      }).statusKey
    ).toBeNull();
  });

  it("uses the singular one form when exactly one result matches (#129 i18n follow-up)", () => {
    const results = filterCommandPaletteEntries(entries, "save");

    expect(results).toHaveLength(1);
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: results,
        selectedIndex: 0,
        detailEnabled: false
      })
    ).toEqual({
      statusKey: "commandPalette.footer.results.one",
      statusValues: { count: 1 },
      canRunSelected: true
    });
  });

  it("uses a disabled status and dims Enter when the selected item is disabled, even when it has a description", () => {
    const results = filterCommandPaletteEntries(entries, "disabled");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "disabled",
        inputValue: ">disabled",
        entries: results,
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("uses the read-only disabled status key only for readOnlyProject disabled entries", () => {
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: [
          {
            id: defineCommandId("test.command.save"),
            title: "Save",
            description: "Save the current document",
            enabled: false,
            disabledReason: "readOnlyProject",
            matches: [],
            primary: { field: "title", text: "Save", ranges: [] },
            secondary: {
              field: "commandId",
              text: "test.command.save",
              ranges: []
            }
          }
        ],
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "command.disabled.readOnlyProject",
      canRunSelected: false
    });
    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "save",
        inputValue: ">save",
        entries: [
          {
            id: defineCommandId("test.command.save"),
            title: "Save",
            description: "Save the current document",
            enabled: false,
            disabledReason: null,
            matches: [],
            primary: { field: "title", text: "Save", ranges: [] },
            secondary: {
              field: "commandId",
              text: "test.command.save",
              ranges: []
            }
          }
        ],
        selectedIndex: 0
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("shows the command-mode search hint for an empty query once the > prefix has been typed", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: ">",
        entries: results,
        selectedIndex: 0,
        detailEnabled: false
      })
    ).toEqual({
      statusKey: "commandPalette.footer.searchHint",
      canRunSelected: true
    });
  });

  it("does not show the search hint for a fully empty input (native placeholder covers that state instead)", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: "",
        entries: results,
        selectedIndex: 0,
        detailEnabled: false
      }).statusKey
    ).toBeNull();
  });

  it("prioritizes the disabled selected command message over the command-mode search hint", () => {
    const results = filterCommandPaletteEntries(entries, "");

    expect(
      resolveCommandPaletteFooterModel({
        mode: "command",
        query: "",
        inputValue: ">",
        entries: results,
        selectedIndex: 1
      })
    ).toEqual({
      statusKey: "commandPalette.footer.disabled",
      canRunSelected: false
    });
  });

  it("shows a null status and canRunSelected: false for every reserved mode, regardless of entries/selection (#145)", () => {
    const results = filterCommandPaletteEntries(entries, "");

    for (const mode of ["file", "line", "heading", "glossary"] as const) {
      expect(
        resolveCommandPaletteFooterModel({
          mode,
          query: "abc",
          inputValue: "abc",
          entries: results,
          selectedIndex: 0
        })
      ).toEqual({ statusKey: null, canRunSelected: false });
    }
  });
});

describe("CommandPalette reserved Quick Access modes (#145)", () => {
  // `#` heading mode is implemented (#141); only `@` glossary stays reserved.
  const reservedCases = [
    { initialInputValue: "@alice", mode: "glossary", key: "commandPalette.reserved.glossary" },
    { initialInputValue: "＠alice", mode: "glossary", key: "commandPalette.reserved.glossary" }
  ] as const;

  it.each(reservedCases.map((c) => [c.initialInputValue, c] as const))(
    "shows the reserved-mode message for %j, not the command results list",
    (_input, testCase) => {
      const markup = renderPalette({
        initialInputValue: testCase.initialInputValue
      });

      expect(markup).toContain("commandPaletteReservedPlaceholder");
      expect(markup).toContain(testCase.key);
      // Reserved-mode precedence: no command list, no empty-result text, no
      // result count, and no selectable/clickable result item — so Enter
      // and click can never resolve to a command in a reserved mode.
      expect(markup).not.toContain("commandPaletteList");
      expect(markup).not.toContain("commandPaletteEmpty");
      expect(markup).not.toContain("commandPalette.noResults");
      expect(markup).not.toContain("commandPaletteItem");
      expect(markup).not.toContain("commandPalette.footer.results");
    }
  );

  it("renders no-prefix file mode as quick-open empty results when there is no Project", () => {
    const markup = renderPalette({ initialInputValue: "abc" });

    expect(markup).toContain("commandPaletteList");
    expect(markup).toContain("commandPaletteEmpty");
    expect(markup).toContain(
      "commandPalette.projectFileQuickOpen.noResults"
    );
    expect(markup).not.toContain("commandPalette.noResults");
    expect(markup).not.toContain("commandPaletteReservedPlaceholder");
    expect(markup).not.toContain("commandPalette.reserved.file");
  });

  it("renders real project file quick-open copy for no-prefix empty results in English and Japanese", () => {
    const englishMarkup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: "missing"
    });
    const japaneseMarkup = renderPalette({
      translate: realTranslateJa,
      initialInputValue: "missing"
    });

    expect(englishMarkup).toContain("Type a valid file name");
    expect(englishMarkup).not.toContain("No results found");
    expect(englishMarkup).not.toContain("No matching commands");
    expect(japaneseMarkup).toContain("有効なファイル名を入力してください");
    expect(japaneseMarkup).not.toContain("検索結果がありません");
    expect(japaneseMarkup).not.toContain("一致するコマンドがありません");
  });

  it("keeps real command-search empty results in command mode", () => {
    const englishMarkup = renderPalette({
      registry: new CommandRegistry(),
      translate: realTranslateEn,
      initialInputValue: ">missing"
    });
    const japaneseMarkup = renderPalette({
      registry: new CommandRegistry(),
      translate: realTranslateJa,
      initialInputValue: ">missing"
    });

    expect(englishMarkup).toContain("No matching commands");
    expect(englishMarkup).not.toContain("No results found");
    expect(japaneseMarkup).toContain("一致するコマンドがありません");
    expect(japaneseMarkup).not.toContain("検索結果がありません");
  });

  it("renders project file quick-open candidates as filename plus relative path", () => {
    const markup = renderPalette({
      initialInputValue: "chap",
      projectFileQuickOpenDocuments: [
        projectDocument("manuscript/part1/chapter01.md")
      ]
    });

    expect(markup).toContain("commandPaletteItemPrimary");
    expect(markup).toContain("commandPaletteItemSecondary");
    expect(markup).toContain("chapter01.md");
    expect(markup).toContain("manuscript/part1/chapter01.md");
  });

  it("bolds the filename prefix match without injecting HTML", () => {
    const markup = renderPalette({
      initialInputValue: "<script>",
      projectFileQuickOpenDocuments: [projectDocument("Drafts/<script>.md")]
    });

    expect(markup).toContain(
      '<mark class="commandPaletteMatch">&lt;script&gt;</mark>.md'
    );
    expect(markup).not.toContain("<script>");
  });

  it("bolds the relative path segment prefix match on the secondary line", () => {
    const markup = renderPalette({
      initialInputValue: "part",
      projectFileQuickOpenDocuments: [
        projectDocument("manuscript/part1/chapter01.md")
      ]
    });

    expect(markup).toContain(
      'manuscript/<mark class="commandPaletteMatch">part</mark>1/chapter01.md'
    );
  });

  it("renders recent Project files for an empty no-prefix query only", () => {
    const markup = renderPalette({
      initialInputValue: "",
      projectFileQuickOpenDocuments: [
        projectDocument("all-files-are-not-listed.md")
      ],
      recentProjectFileQuickOpenDocuments: [
        projectDocument("recent/chapter05.md")
      ]
    });

    expect(markup).toContain("chapter05.md");
    expect(markup).toContain("recent/chapter05.md");
    expect(markup).not.toContain("all-files-are-not-listed.md");
  });

  it("dims the Enter hint in every reserved mode, same as a disabled selection", () => {
    for (const testCase of reservedCases) {
      const markup = renderPalette({
        initialInputValue: testCase.initialInputValue
      });

      expect(markup).toContain("commandPaletteFooterHintUnavailable");
    }
  });

  it("keeps the select/run/close footer key hints visible in reserved modes", () => {
    const markup = renderPalette({ initialInputValue: "@alice" });

    expect(markup).toContain("commandPalette.footer.selectHint");
    expect(markup).toContain("commandPalette.footer.runHint");
    expect(markup).toContain("commandPalette.footer.closeHint");
  });

  it("shows no footer status text (no result count, no search hint) in reserved modes", () => {
    const markup = renderPalette({
      translate: realTranslateEn,
      initialInputValue: "@alice"
    });

    expect(markup).toContain('<div class="commandPaletteFooterStatus"></div>');
  });

  it("computes empty entries for every reserved mode, so Enter/click can never execute or block a command (#145)", () => {
    // CommandPalette.tsx has no logging calls at all (see the wiring
    // describe block below) and only calls onExecuteCommand/onBlockedCommand
    // from a truthy entries[index] lookup. Reserved modes route through this
    // same `entries` computation, gated on mode === "command", so no command
    // lifecycle event (command.invoked / command.ignored / command.blocked)
    // can be emitted from a reserved mode without a code path existing to
    // call either callback in the first place.
    const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

    expect(source).toContain(
      'mode === "command"\n      ? filterCommandPaletteEntries('
    );
    expect(source).toContain(": [];");
  });

  it("resolves no Enter selection when entries is empty, as it always is in a reserved mode", () => {
    expect(resolveCommandPaletteEnterSelection([], 0)).toBeNull();
    expect(resolveCommandPaletteEnterSelection([], null)).toBeNull();
    expect(resolveCommandPaletteEnterSelection([], 5)).toBeNull();
  });

  it("recognizes '@' as a reserved prefix and '#' as heading-jump mode, not as file queries", () => {
    // Unknown leading characters (e.g. "%") fall back to file mode per #139;
    // '@' stays a reserved prefix with its own message; ':' is line jump
    // (#140) and '#' is heading jump (#141), each distinct from the plain
    // no-prefix file message.
    const fileMarkup = renderPalette({ initialInputValue: "%abc" });
    const glossaryMarkup = renderPalette({ initialInputValue: "@abc" });
    const headingMarkup = renderPalette({ initialInputValue: "#abc" });

    expect(fileMarkup).toContain(
      "commandPalette.projectFileQuickOpen.noResults"
    );
    expect(glossaryMarkup).toContain("commandPalette.reserved.glossary");
    // Heading mode: no reserved placeholder, its own empty copy instead.
    expect(headingMarkup).not.toContain("commandPaletteReservedPlaceholder");
    expect(headingMarkup).toContain("commandPalette.headingJump.noOpenHeadings");
    expect(headingMarkup).not.toContain(
      "commandPalette.projectFileQuickOpen.noResults"
    );
  });

  it("no longer treats ':' as a reserved mode (#140): it shows a line-jump message instead", () => {
    const markup = renderPalette({ initialInputValue: ":abc" });

    expect(markup).toContain("commandPalette.lineJump.invalid");
    expect(markup).not.toContain("commandPalette.reserved");
  });
});

describe("CommandPalette snapshot and UI-level block wiring", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

  it("derives mode from the #139 parser, not the retired resolver (#145)", () => {
    expect(source).toContain(
      'import {\n  parseQuickAccessInput,\n  type QuickAccessMode\n} from "./quickAccessInputParser";'
    );
    expect(source).toContain("parseQuickAccessInput(inputValue)");
    expect(source).toContain("parseQuickAccessInput(value)");
    expect(source).not.toContain("quickAccessPrefixResolver");
    expect(source).not.toContain("resolveQuickAccessInput");
  });

  it("implements line mode through the imported pure resolvers, not ad-hoc logic (#140)", () => {
    expect(source).toContain("resolveLineJumpPaletteState(");
    expect(source).toContain("resolveLineJumpFooterModel(");
    expect(source).toContain("lineJumpMessageKey(");
  });

  it("does not implement the remaining reserved-mode actions — only the reserved message and mode dispatch", () => {
    // File mode (#143), line jump (#140) and heading jump (#141) are
    // implemented. `@` glossary remains reserved and must not gain its own
    // search/execution logic here.
    expect(source).not.toContain("symbolJump");
    expect(source).not.toContain("glossarySearch");
  });

  it("captures commandContext once via a lazy useState initializer, not the live prop", () => {
    expect(source).toContain(
      "const [snapshot] = useState<CommandContext>(() => commandContext);"
    );

    const afterCapture = source.slice(
      source.indexOf("const [snapshot] = useState<CommandContext>")
    );

    // Every entries computation should read the captured snapshot, not the
    // (potentially stale-by-design) live commandContext prop directly.
    expect(afterCapture.match(/listCommandPaletteEntries\(/g)?.length).toBe(3);
    expect(
      afterCapture.match(/listCommandPaletteEntries\(commandRegistry, snapshot\)/g)
        ?.length
    ).toBe(3);
  });

  it("blocks a disabled entry at the UI layer on click without executing it", () => {
    const startIndex = source.indexOf("function executeEntryAt(");
    const endIndex = source.indexOf("function handleKeyDown(");
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain("if (!entry.enabled) {");
    expect(body.indexOf("onBlockedCommand(entry.id)")).toBeLessThan(
      body.indexOf("onExecuteCommand(entry.id)")
    );
  });

  it("blocks a disabled entry at the UI layer on Enter without executing it", () => {
    const startIndex = source.indexOf('case "Enter": {');
    const endIndex = source.indexOf("default:");
    const body = source.slice(startIndex, endIndex);

    // #316: ENTER acts on the single derived `activeEntry`, never a re-resolve.
    expect(body).toContain("const entry = activeEntry;");
    expect(body).toContain("if (!entry.enabled) {");
    expect(body.indexOf("onBlockedCommand(entry.id)")).toBeLessThan(
      body.indexOf("onExecuteCommand(entry.id)")
    );
  });
});

describe("CommandPalette line jump mode (#140 / #148)", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");

  it("does not show command search results in line mode", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      initialInputValue: ":42"
    });

    expect(markup).not.toContain("commandPaletteEmpty");
    expect(markup).not.toContain("commandPalette.noResults");
  });

  it("shows an executable 'Go to line N' result for a valid, in-range query", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":42"
    });

    expect(markup).toContain("Go to line 42");
    expect(markup).toContain("commandPaletteItemSelected");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).not.toContain("commandPaletteItemDisabled");
    expect(markup).not.toContain("commandPaletteFooterHintUnavailable");
  });

  it("normalizes the displayed line number for :007 and :1,000 (the exact-match candidate)", () => {
    const registry = buildLineJumpRegistry();
    const snapshot = buildLineJumpEditorSnapshot(2000);
    const context = { "editor.kind.markdown": true };

    expect(
      renderPalette({
        registry,
        lineJumpEditorSnapshot: snapshot,
        commandContext: context,
        translate: realTranslateEn,
        initialInputValue: ":007"
      })
    ).toContain("Go to line 7");
    expect(
      renderPalette({
        registry,
        lineJumpEditorSnapshot: snapshot,
        commandContext: context,
        translate: realTranslateEn,
        initialInputValue: ":1,000"
      })
    ).toContain("Go to line 1000");
  });

  it("shows Enter a line number for an empty query", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":"
    });

    expect(markup).toContain("Enter a line number");
  });

  it("shows Use half-width digits for full-width digit queries", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":１２"
    });

    expect(markup).toContain("Use half-width digits");
  });

  it("shows Enter a whole line number for decimal queries", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":1.5"
    });

    expect(markup).toContain("Enter a whole line number");
  });

  it("shows Enter a valid line number for invalid and unsafe-integer queries", () => {
    const invalidMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":abc"
    });
    const unsafeMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":9,007,199,254,740,992"
    });

    expect(invalidMarkup).toContain("Enter a valid line number");
    expect(unsafeMarkup).toContain("Enter a valid line number");
  });

  it("shows Line number is out of range (no new 'No matching lines' message) when a valid query has zero candidates", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(100),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":99999"
    });

    expect(markup).toContain("Line number is out of range");
    expect(markup).not.toContain("No matching lines");
    expect(markup).not.toContain("一致する行がありません");
    expect(markup).not.toContain("commandPaletteItem\"");
  });

  it("treats Number.MAX_SAFE_INTEGER as parser-valid but normally out of range", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(100),
      commandContext: { "editor.kind.markdown": true },
      translate: realTranslateEn,
      initialInputValue: ":9,007,199,254,740,991"
    });

    expect(markup).toContain("Line number is out of range");
  });

  it("renders a disabled line-jump result (not a parser message) when the active tab is not an editor", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("Go to line 1");
    expect(markup).toContain("commandPaletteItemDisabled");
    expect(markup).toContain("commandPaletteItemSelected");
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("This command is currently unavailable");
    expect(markup).toContain("commandPaletteFooterHintUnavailable");
  });

  it("renders a disabled result, not the generic message, for a Glossary Editor active tab", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false, "editor.kind.glossary": true },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("commandPalette.lineJump.invalid");
    expect(markup).toContain("commandPaletteItemDisabled");
  });

  it("does not show a result count in line mode", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: { "editor.kind.markdown": true },
      initialInputValue: ":42"
    });

    expect(markup).not.toContain("commandPalette.footer.results");
  });

  it("blocks (does not execute) a disabled line-jump result on Enter/click, emitting command.blocked semantics via onBlockedCommand", () => {
    const body = source.slice(
      source.indexOf("function executeLineJumpResult("),
      source.indexOf("function handleKeyDown(")
    );

    expect(body).toContain('if (lineJumpState.kind === "disabled") {');
    expect(body).toContain("onBlockedCommand(editorCommandIds.goToLine);");
  });

  it("is a no-op for every message state (empty/invalid/unsafe/out-of-range) — Enter calls no callback", () => {
    const body = source.slice(
      source.indexOf("function executeLineJumpResult("),
      source.indexOf("function handleKeyDown(")
    );

    // Only "disabled" and "executable" branches call a callback; every
    // other LineJumpPaletteState kind falls through without calling
    // onExecuteCommand or onBlockedCommand.
    expect(body).not.toContain("onExecuteCommand(");
    expect(body).toContain("executeLineJumpCandidateAt(selectedIndex ?? 0);");
    expect(body.match(/onBlockedCommand\(/g)?.length).toBe(1);
  });

  it("routes Enter in line mode to executeLineJumpResult, not the command-mode entry resolver", () => {
    const startIndex = source.indexOf('case "Enter": {');
    const endIndex = source.indexOf("default:");
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain('if (mode === "line") {');
    expect(body).toContain("executeLineJumpResult();");
    // Line mode returns before the command-mode `activeEntry` is consulted.
    expect(body.indexOf('if (mode === "line")')).toBeLessThan(
      body.indexOf("const entry = activeEntry;")
    );
  });

  it("preserves existing command mode and file mode, and the glossary reserved mode", () => {
    const commandMarkup = renderPalette({ initialInputValue: ">save" });
    const fileMarkup = renderPalette({ initialInputValue: "abc" });
    const headingMarkup = renderPalette({ initialInputValue: "#intro" });
    const glossaryMarkup = renderPalette({ initialInputValue: "@alice" });

    expect(commandMarkup).toContain("commandPaletteList");
    expect(fileMarkup).toContain(
      "commandPalette.projectFileQuickOpen.noResults"
    );
    // #141: heading mode is a real candidate list now, not a reserved row.
    expect(headingMarkup).not.toContain("commandPaletteReservedPlaceholder");
    expect(headingMarkup).toContain("commandPalette.headingJump.noOpenHeadings");
    expect(glossaryMarkup).toContain("commandPalette.reserved.glossary");
  });
});

describe("CommandPalette line jump prefix candidates (#148)", () => {
  const source = readFileSync("src/renderer/CommandPalette.tsx", "utf8");
  const editorContext = { "editor.kind.markdown": true };

  it("':1' returns prefix candidates 1, 10-19, 100...", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(105),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    for (const line of [1, 10, 11, 19, 100]) {
      expect(markup).toContain(`Go to line ${line}`);
    }
  });

  it("':12' returns 12, 120, 121, ...", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });

    expect(markup).toContain("Go to line 12");
    expect(markup).toContain("Go to line 120");
    expect(markup).toContain("Go to line 121");
  });

  it("does not use contains matching: ':1' never includes 21 or 31", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(50),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("Go to line 21");
    expect(markup).not.toContain("Go to line 31");
  });

  it("puts the exact match first, and it is the initially selected candidate", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });
    const exactIndex = markup.indexOf("Go to line 12<");
    const nextIndex = markup.indexOf("Go to line 120");

    expect(exactIndex).toBeGreaterThan(-1);
    expect(nextIndex).toBeGreaterThan(exactIndex);
    // The exact match's <li> is the first one, and it is selected.
    const firstLiStart = markup.indexOf("<li ");
    const firstLiEnd = markup.indexOf("</li>", firstLiStart);
    const firstLi = markup.slice(firstLiStart, firstLiEnd);

    expect(firstLi).toContain("Go to line 12<");
    expect(firstLi).toContain('aria-selected="true"');
  });

  it("does not duplicate the exact match among the additional candidates", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(130),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":12"
    });
    const occurrences = markup.split("Go to line 12<").length - 1;

    expect(occurrences).toBe(1);
  });

  it("resets selection to the first candidate for a freshly rendered query (never preserves a prior index)", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const firstLiStart = markup.indexOf("<li ");
    const firstLiEnd = markup.indexOf("</li>", firstLiStart);
    const firstLi = markup.slice(firstLiStart, firstLiEnd);

    expect(firstLi).toContain("Go to line 1<");
    expect(firstLi).toContain('aria-selected="true"');
    expect((markup.match(/aria-selected="true"/g) ?? []).length).toBe(1);
  });

  it("stops candidate generation at the hard-coded maximum of 20", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(1000000),
      commandContext: editorContext,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;

    expect(rowCount).toBe(20);
  });

  it("shows the remaining-candidate count in the footer when total matches exceed the display limit of 20", () => {
    // Lines 1..200 starting with "1": "1" (1), "10".."19" (10), "100".."199"
    // (100) -> 111 total matches, 20 displayed, 91 remaining.
    const englishMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const japaneseMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200),
      commandContext: editorContext,
      translate: realTranslateJa,
      initialInputValue: ":1"
    });

    expect(englishMarkup).toContain("91 more candidates");
    expect(japaneseMarkup).toContain("ほかに91件の候補があります");
  });

  it("uses remaining count (total - displayed), not the total count", () => {
    // 105 lines starting with "1": 1, 10-19, 100-105 -> 1 + 10 + 6 = 17
    // total matches, all of which fit within the 20-candidate display limit,
    // so there is nothing left over.
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(105),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("more candidates");
  });

  it("shows no remaining-count footer status for exactly 20 total candidates", () => {
    // Lines 1..108 starting with "1": "1" (1), "10".."19" (10), "100".."108"
    // (9) -> exactly 20 total matches, all displayed, none remaining.
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(108),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;

    expect(rowCount).toBe(20);
    expect(markup).not.toContain("more candidates");
  });

  it("does not fetch preview text (getLineText) for candidates beyond the display limit", () => {
    const getLineText = vi.fn(() => "text");
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(200, getLineText),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("91 more candidates");
    // Called twice per render (initial selectedIndex computation + render
    // body, see the earlier #148 performance note) — 20 displayed
    // candidates each time, never once for the 91 undisplayed matches.
    expect(getLineText.mock.calls.length).toBe(40);
  });

  it("shows no remaining-count footer status for message states (invalid/out-of-range) or the disabled row", () => {
    const invalidMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      translate: realTranslateEn,
      initialInputValue: ":abc"
    });
    const outOfRangeMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(10),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":99999"
    });
    const disabledMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    for (const markup of [invalidMarkup, outOfRangeMarkup, disabledMarkup]) {
      expect(markup).not.toContain("more candidates");
    }
  });

  it("keeps the display limit at 20 and only displays the first 20 candidates", () => {
    const source2 = readFileSync("src/renderer/lineJumpCandidates.ts", "utf8");

    expect(source2).toContain("DEFAULT_MAX_LINE_JUMP_CANDIDATES = 20");
  });

  it("does not change command lifecycle behavior: executeLineJumpResult/executeLineJumpCandidateAt are unaffected by the remaining-count footer", () => {
    const functionBody = source.slice(
      source.indexOf("function executeLineJumpCandidateAt("),
      source.indexOf("function handleKeyDown(")
    );

    expect(functionBody).not.toContain("remainingCount");
    expect(functionBody).not.toContain("moreCandidates");
  });

  it("shows a preview for each candidate, reusing the existing line preview formatting", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(20, (line) =>
        line === 1 ? "   const answer = 42;" : `text ${line}`
      ),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("commandPaletteItemSecondary");
    expect(markup).toContain("const answer = 42;");
    expect(markup).not.toContain(">   const answer = 42;<");
  });

  it("shows Empty line / 空行 for a candidate whose target line is blank", () => {
    const englishMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(3, () => "   "),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const japaneseMarkup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(3, () => ""),
      commandContext: editorContext,
      translate: realTranslateJa,
      initialInputValue: ":1"
    });

    expect(englishMarkup).toContain("Empty line");
    expect(japaneseMarkup).toContain("空行");
  });

  it("renders acceptably when multiple candidates are empty lines", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(19, (line) =>
        line % 2 === 0 ? "" : `text ${line}`
      ),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });
    const rowCount = (markup.match(/commandPaletteItemPrimary/g) ?? []).length;
    const emptyCount = (markup.match(/\(Empty line\)/g) ?? []).length;

    expect(rowCount).toBe(11); // 1, 10-19
    expect(emptyCount).toBe(5); // 10, 12, 14, 16, 18
  });

  it("does not show a preview for the disabled row (non-editor context)", () => {
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      commandContext: { "editor.kind.markdown": false },
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).not.toContain("commandPaletteItemSecondary");
  });

  it("only calls getLineText for lines that actually become candidates (#148 performance), not once per rejected line", () => {
    const getLineText = vi.fn(() => "text");
    const markup = renderPalette({
      registry: buildLineJumpRegistry(),
      lineJumpEditorSnapshot: buildLineJumpEditorSnapshot(1000000, getLineText),
      commandContext: editorContext,
      translate: realTranslateEn,
      initialInputValue: ":1"
    });

    expect(markup).toContain("Go to line 1");
    // Candidate generation runs twice on initial mount (the lazy
    // `selectedIndex` useState initializer, then the render body's own
    // `lineJumpState`) — same pre-existing pattern as command-mode entries
    // being computed in both `updateInput` and the render body. Each
    // getLineText call is O(1) once cached (see createLineJumpEditorSnapshot
    // / lineJumpQuery.test.ts), so this bounded 2x is not a meaningful cost.
    expect(getLineText.mock.calls.length).toBe(40);
  });

  it("ArrowUp/ArrowDown operate on the candidate list length in line mode, not the (empty) command entries array", () => {
    const startIndex = source.indexOf('case "ArrowDown": {');
    const endIndex = source.indexOf('case "Enter": {');
    const body = source.slice(startIndex, endIndex);

    expect(body).toContain("moveCommandPaletteSelection(selectionLength, current, 1)");
    expect(body).toContain("moveCommandPaletteSelection(selectionLength, current, -1)");

    const selectionLengthDecl = source.slice(
      source.indexOf("const selectionLength ="),
      source.indexOf("useEffect(() => {\n    scrollCommandPaletteSelectionIntoView")
    );

    expect(selectionLengthDecl).toContain("lineJumpCandidates?.length");
  });

  it("attaches selectedItemRef to the selected candidate row, so scroll-into-view targets it", () => {
    const executableBlockStart = source.indexOf(
      'lineJumpState.kind === "executable" ? ('
    );
    const executableBlockEnd = source.indexOf(
      ") : lineJumpState.kind"
    );
    const body = source.slice(executableBlockStart, executableBlockEnd);

    expect(body).toContain(
      "ref={index === selectedIndex ? selectedItemRef : null}"
    );

    const effectStart = source.indexOf(
      "useEffect(() => {\n    scrollCommandPaletteSelectionIntoView"
    );
    const effectBody = source.slice(effectStart, effectStart + 200);

    expect(effectBody).toContain("[selectionLength, mode, query, selectedIndex]");
  });

  it("executes the clicked candidate through onClick={() => executeLineJumpCandidateAt(index)}", () => {
    const executableBlockStart = source.indexOf(
      'lineJumpState.kind === "executable" ? ('
    );
    const executableBlockEnd = source.indexOf(
      ") : lineJumpState.kind"
    );
    const body = source.slice(executableBlockStart, executableBlockEnd);

    expect(body).toContain("onClick={() => executeLineJumpCandidateAt(index)}");
  });

  it("executes the selected candidate's line through the command registry on Enter, via executeLineJumpCandidateAt", () => {
    const functionBody = source.slice(
      source.indexOf("function executeLineJumpCandidateAt("),
      source.indexOf("/** Handles Enter for line mode")
    );

    expect(functionBody).toContain(
      "onExecuteCommand(editorCommandIds.goToLine, candidate.line);"
    );
  });

  it("does not put candidate generation directly in CommandPalette.tsx: it calls the pure resolveLineJumpPaletteState/resolveLineJumpCandidates helpers", () => {
    expect(source).not.toContain("startsWith(");
    expect(source).toContain("resolveLineJumpPaletteState(");
  });
});
