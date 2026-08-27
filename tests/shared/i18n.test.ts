import { describe, expect, it } from "vitest";
import {
  languageDefinitions,
  supportedLanguages,
  t
} from "../../src/shared/i18n";
import { enTranslations } from "../../src/shared/i18n/en";
import { jaTranslations } from "../../src/shared/i18n/ja";

const matchBoundaryKeys = [
  "glossaryEditor.advancedMatchingSettings",
  "glossaryEditor.matchBoundaryStart",
  "glossaryEditor.matchBoundaryEnd",
  "glossaryEditor.matchBoundary.auto.label",
  "glossaryEditor.matchBoundary.strict.label",
  "glossaryEditor.matchBoundary.none.label",
  "glossaryEditor.matchBoundary.auto.description",
  "glossaryEditor.matchBoundary.strict.description",
  "glossaryEditor.matchBoundary.none.description"
] as const;

const glossaryNavigatorSearchKeys = [
  "glossaryNavigator.search",
  "glossaryNavigator.searchPlaceholder",
  "glossaryNavigator.emptySearchResult"
] as const;

const disallowedBoundaryWords = [
  "左端",
  "右端",
  "left boundary",
  "right boundary"
];

describe("supported UI languages (#186)", () => {
  it("keeps selectable UI language values exactly ja and en", () => {
    expect([...supportedLanguages]).toEqual(["ja", "en"]);
  });

  it("derives supportedLanguages from the language definition map", () => {
    expect([...supportedLanguages]).toEqual(Object.keys(languageDefinitions));
  });

  it("defines stable native names for the settings language selector", () => {
    expect(
      supportedLanguages.map(
        (language) => languageDefinitions[language].nativeName
      )
    ).toEqual(["日本語", "English"]);
  });
});

describe("glossary entry deletion translations", () => {
  it("labels the delete button and its confirmation message for ja and en", () => {
    expect(t("ja", "glossaryEditor.deleteEntry")).toBe("削除");
    expect(t("en", "glossaryEditor.deleteEntry")).toBe("Delete");
    expect(t("ja", "glossaryEditor.deleteEntryConfirmMessage")).toBe(
      "この語彙を削除します。よろしいですか？"
    );
    expect(t("en", "glossaryEditor.deleteEntryConfirmMessage")).toBe(
      "Delete this glossary entry?"
    );
  });
});

describe("dirty close choice dogfood translations (#192)", () => {
  it("defines the save-and-close choice label for ja and en", () => {
    expect(t("ja", "dialog.dirtyClose.saveAndClose")).toBe("保存して閉じる");
    expect(t("en", "dialog.dirtyClose.saveAndClose")).toBe("Save and Close");
  });

  it("defines the non-blocking sound playback warning status message", () => {
    expect(t("ja", "status.soundPlaybackFailed")).toBe(
      "警告: 音声を再生できません"
    );
    expect(t("en", "status.soundPlaybackFailed")).toBe(
      "Warning: Could not play sound"
    );
  });
});

describe("file I/O workflow translations (#202)", () => {
  it("defines Save As command and menu labels for ja and en", () => {
    expect(t("ja", "command.editor.saveAs")).toBe("名前を付けて保存...");
    expect(t("en", "command.editor.saveAs")).toBe("Save As...");
    expect(t("ja", "menu.saveAs")).toBe("名前を付けて保存...");
    expect(t("en", "menu.saveAs")).toBe("Save As...");
  });

  it("defines one-button file read/save failure dialog strings", () => {
    expect(t("ja", "dialog.fileOpenFailed.title")).toBe(
      "ファイルを読み込めませんでした"
    );
    expect(t("en", "dialog.fileOpenFailed.title")).toBe("Could not read file");
    expect(t("ja", "dialog.fileOpenFailed.message")).toBe(
      "ファイルを開けませんでした。ファイルの場所、読み込み権限、文字コードを確認してください。"
    );
    expect(t("en", "dialog.fileOpenFailed.message")).toBe(
      "Pergamum could not open the file. Check the file location, permissions, and encoding."
    );
    expect(t("ja", "dialog.fileSaveFailed.title")).toBe(
      "ファイルを保存できませんでした"
    );
    expect(t("en", "dialog.fileSaveFailed.title")).toBe("Could not save file");
    expect(t("ja", "dialog.fileSaveFailed.message")).toBe(
      "ファイルを保存できませんでした。\n\n編集中の本文はこのタブに保持されています。\n保存先、ファイル名、書き込み権限、空き容量などを確認してください。"
    );
    expect(t("en", "dialog.fileSaveFailed.message")).toBe(
      "Pergamum could not save the file. Your text is still kept in the editor. Check the save location and permissions."
    );
  });

  it("defines read-only Save As policy dialog strings for ja and en", () => {
    expect(t("ja", "command.disabled.readOnlyProject")).toBe(
      "読み取り専用のため使用できません"
    );
    expect(t("en", "command.disabled.readOnlyProject")).toBe(
      "Unavailable in read-only mode"
    );
    expect(t("ja", "dialog.icon.info")).toBe("情報");
    expect(t("en", "dialog.icon.info")).toBe("Information");
    expect(t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.title")).toBe(
      "このプロジェクトは使用中として記録されています"
    );
    expect(t("en", "dialog.readOnlyProjectSaveAsInsideRoot.title")).toBe(
      "This project is recorded as in use"
    );
    expect(t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.message")).toBe(
      "このプロジェクトは使用中として記録されているため、読み取り専用で開かれています。"
    );
    expect(
      t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.messageAfterTarget")
    ).toBe(
      "選択した保存先は、この読み取り専用プロジェクトの配下です。\n" +
        "ここへ保存すると、このプロジェクト内に新しいファイルを書き込みます。\n\n" +
        "そのファイルは、現在のプロジェクト状態にすぐ反映されない可能性があります。\n\n" +
        "保存しますか？"
    );
    expect(t("en", "dialog.readOnlyProjectSaveAsInsideRoot.message")).toBe(
      "This project is open in read-only mode because it is recorded as in use."
    );
    expect(
      t("en", "dialog.readOnlyProjectSaveAsInsideRoot.messageAfterTarget")
    ).toBe(
      "The selected save location is inside this read-only project.\n" +
        "Saving here will write a new file into this project.\n\n" +
        "That file may not be reflected in the current project state immediately.\n\n" +
        "Save anyway?"
    );
    expect(t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.targetLabel")).toBe(
      "保存先:"
    );
    expect(t("en", "dialog.readOnlyProjectSaveAsInsideRoot.targetLabel")).toBe(
      "Target file:"
    );
    expect(t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.message")).not.toContain(
      "{path}"
    );
    expect(t("en", "dialog.readOnlyProjectSaveAsInsideRoot.message")).not.toContain(
      "{path}"
    );
    expect(t("ja", "dialog.readOnlyProjectSaveAsInsideRoot.save")).toBe(
      "理解して保存"
    );
    expect(t("en", "dialog.readOnlyProjectSaveAsInsideRoot.save")).toBe(
      "Save Anyway"
    );
    expect(t("ja", "dialog.saveAsRejected.protected.title")).toBe(
      "この場所には保存できません"
    );
    expect(t("en", "dialog.saveAsRejected.protected.title")).toBe(
      "Cannot save to this location"
    );
    expect(t("ja", "dialog.saveAsRejected.protected.message")).toBe(
      "選択された保存先は Pergamum のプロジェクトファイルまたは内部管理ファイルです。\n\n" +
        "プロジェクトを破損する可能性があるため、この場所には保存できません。\n" +
        "別の場所または別のファイル名を選択してください。"
    );
    expect(t("en", "dialog.saveAsRejected.protected.message")).toBe(
      "The selected save location is a Pergamum project file or internal management file.\n\n" +
        "Saving there could damage the project, so Pergamum cannot save to this location.\n" +
        "Choose another location or file name."
    );
    expect(t("ja", "dialog.saveAsRejected.targetLabel")).toBe("保存先:");
    expect(t("en", "dialog.saveAsRejected.targetLabel")).toBe(
      "Save location:"
    );
    expect(t("ja", "dialog.saveAsRejected.unverifiable.title")).toBe(
      "保存先を検証できませんでした"
    );
    expect(t("en", "dialog.saveAsRejected.unverifiable.title")).toBe(
      "Could not verify save location"
    );
    expect(t("ja", "dialog.saveAsRejected.unverifiable.message")).toBe(
      "選択された保存先が Pergamum の内部管理ファイルでないことを確認できませんでした。\n\n" +
        "安全のため、この場所には保存しません。\n" +
        "時間をおいて再度お試しください。問題が続く場合は、別の場所を選択してください。"
    );
    expect(t("en", "dialog.saveAsRejected.unverifiable.message")).toBe(
      "Pergamum could not verify that the selected save location is not an internal management file.\n\n" +
        "For safety, Pergamum will not save to this location.\n" +
        "Choose another location."
    );
  });

  it("defines read-only project open confirmation dialog strings for ja and en", () => {
    expect(t("ja", "dialog.readOnlyProjectOpen.title")).toBe(
      "読み取り専用で開きますか？"
    );
    expect(t("en", "dialog.readOnlyProjectOpen.title")).toBe(
      "Open in read-only mode?"
    );
    expect(t("ja", "dialog.readOnlyProjectOpen.message")).toBe(
      "このプロジェクトは既に別のPergamumで開かれています。\n\n" +
        "読み取り専用で開くことができます。\n" +
        "編集や通常保存はできませんが、内容を確認したり、別ファイルとして保存したりできます。\n\n" +
        "プロジェクトを開きますか？"
    );
    expect(t("en", "dialog.readOnlyProjectOpen.message")).toBe(
      "This project is already open in another Pergamum instance.\n\n" +
        "You can open it in read-only mode.\n" +
        "Editing and normal Save are unavailable, but you can view the contents or save a copy with Save As.\n\n" +
        "Do you want to open the project?"
    );
    expect(
      t("ja", "dialog.readOnlyProjectOpen.messageWithOwner", {
        openedAt: "2026-08-25 08:21:00",
        hostname: "writer-host"
      })
    ).toBe(
      "このプロジェクトは既に別の Pergamum で開かれています。\n\n" +
        "2026-08-25 08:21:00 から writer-host で開かれています。\n\n" +
        "読み取り専用で開くことができます。\n" +
        "編集や通常保存はできませんが、内容を確認したり、別ファイルとして保存したりできます。\n\n" +
        "プロジェクトを開きますか？"
    );
    expect(
      t("en", "dialog.readOnlyProjectOpen.messageWithOwner", {
        openedAt: "2026-08-25 08:21:00",
        hostname: "writer-host"
      })
    ).toBe(
      "This project is already open in another Pergamum instance.\n\n" +
        "It has been open on writer-host since 2026-08-25 08:21:00.\n\n" +
        "You can open it in read-only mode.\n" +
        "Editing and normal Save are unavailable, but you can view the contents or save a copy with Save As.\n\n" +
        "Do you want to open the project?"
    );
    expect(t("ja", "dialog.readOnlyProjectOpen.lockSetupFailedMessage")).toBe(
      "このプロジェクトの書き込みロックを作成できませんでした。\n\n" +
        "ファイルシステムの権限、同期中のフォルダ、または一時的なファイル操作の失敗が原因の可能性があります。\n\n" +
        "読み取り専用で開くことができます。\n" +
        "編集や通常保存はできませんが、内容を確認したり、別ファイルとして保存したりできます。\n\n" +
        "プロジェクトを開きますか？"
    );
    expect(t("en", "dialog.readOnlyProjectOpen.lockSetupFailedMessage")).toBe(
      "Pergamum could not create a writable lock for this project.\n\n" +
        "This may be caused by file system permissions, a syncing folder, or a temporary file operation failure.\n\n" +
        "You can open it in read-only mode.\n" +
        "Editing and normal Save are unavailable, but you can view the contents or save a copy with Save As.\n\n" +
        "Do you want to open the project?"
    );
    expect(t("ja", "dialog.readOnlyProjectOpen.openReadOnly")).toBe(
      "理解したうえで読み取り専用で開く"
    );
    expect(t("en", "dialog.readOnlyProjectOpen.openReadOnly")).toBe(
      "Open Read-Only, I Understand"
    );
  });

});

describe("application settings translations (#181)", () => {
  it("defines an explicit Application Settings tab title for ja and en", () => {
    expect(t("ja", "settings.application.title")).toBe(
      "アプリケーション設定"
    );
    expect(t("en", "settings.application.title")).toBe(
      "Application Settings"
    );
  });

  it("labels the side navigation and command as Application Settings open actions", () => {
    expect(t("ja", "activity.applicationSettings")).toBe(
      "アプリケーション設定"
    );
    expect(t("en", "activity.applicationSettings")).toBe(
      "Application Settings"
    );
    expect(t("ja", "command.workspace.applicationSettings.open")).toBe(
      "アプリケーション設定を開く"
    );
    expect(t("en", "command.workspace.applicationSettings.open")).toBe(
      "Open Application Settings"
    );
  });
});

describe("Application Settings core control translations (#195)", () => {
  it("defines Application Settings page and section labels for ja and en", () => {
    for (const language of ["ja", "en"] as const) {
      for (const key of [
        "settings.application.description",
        "settings.application.section.general",
        "settings.application.section.appearance",
        "settings.application.section.editor",
        "settings.application.section.files",
        "settings.application.section.commandPalette",
        "settings.application.section.sound"
      ] as const) {
        expect(t(language, key).length).toBeGreaterThan(0);
      }
    }
  });

  it("no longer defines the legacy Advanced Settings toggle/confirmation copy (#232)", () => {
    const legacyKeys = [
      "settings.application.advanced.enabled.label",
      "settings.application.advanced.enabled.description",
      "settings.application.advanced.disabledDescription",
      "settings.application.advanced.enableConfirm.title",
      "settings.application.advanced.enableConfirm.message",
      "settings.application.advanced.enableConfirm.confirm",
      "settings.workbench.advancedSettings.enabled.label",
      "settings.workbench.advancedSettings.enabled.description",
      "settings.category.advanced.label"
    ];

    for (const key of legacyKeys) {
      expect(Object.keys(jaTranslations)).not.toContain(key);
      expect(Object.keys(enTranslations)).not.toContain(key);
    }
  });

  it("defines the search-example placeholder for the Settings search input, distinct from its accessible label (#234)", () => {
    expect(t("ja", "settings.search.placeholder")).toBe(
      "検索語句を入力（例：エディタ、sound）"
    );
    expect(t("en", "settings.search.placeholder")).toBe(
      "Enter search terms (e.g. editor, sound)"
    );
    expect(t("ja", "settings.search.label")).toBe("設定を検索");
    expect(t("en", "settings.search.label")).toBe("Search settings");
    expect(t("ja", "settings.search.placeholder")).not.toBe(
      t("ja", "settings.search.label")
    );
  });

  it("defines the unwired-setting future-version notice for ja and en (#236)", () => {
    expect(t("ja", "settings.unwiredSettingNotice")).toBe(
      "この設定は今後のバージョンで有効化予定です。"
    );
    expect(t("en", "settings.unwiredSettingNotice")).toBe(
      "This setting is planned for a future version."
    );
  });

  it("defines catalog label and description keys used by Application Settings controls", () => {
    for (const language of ["ja", "en"] as const) {
      for (const key of [
        "settings.workbench.language.label",
        "settings.workbench.language.description",
        "settings.workbench.statusBar.visible.label",
        "settings.workbench.statusBar.visible.description",
        "settings.workbench.statusBar.characterCount.visible.label",
        "settings.workbench.statusBar.characterCount.visible.description",
        "settings.workbench.fontFamily.label",
        "settings.workbench.fontFamily.description",
        "settings.workbench.sound.enabled.label",
        "settings.workbench.sound.enabled.description",
        "settings.workbench.sound.dialog.enabled.label",
        "settings.workbench.sound.dialog.enabled.description",
        "settings.workbench.sound.newline.enabled.label",
        "settings.workbench.sound.newline.enabled.description",
        "settings.workbench.sound.keypress.enabled.label",
        "settings.workbench.sound.keypress.enabled.description",
        "settings.commandPalette.description.enable.label",
        "settings.commandPalette.description.enable.description",
        "settings.commandPalette.description.marquee.delay.label",
        "settings.commandPalette.description.marquee.delay.description",
        "settings.commandPalette.description.marquee.speed.label",
        "settings.commandPalette.description.marquee.speed.description",
        "settings.unit.ms",
        "settings.unit.pxPerSecond",
        "settings.editor.fontFamily.label",
        "settings.editor.fontFamily.description",
        "settings.editor.characterCount.exclude.whitespace.label",
        "settings.editor.characterCount.exclude.whitespace.description",
        "settings.editor.characterCount.exclude.lineBreaks.label",
        "settings.editor.characterCount.exclude.lineBreaks.description",
        "settings.editor.characterCount.exclude.headings.label",
        "settings.editor.characterCount.exclude.headings.description",
        "settings.editor.characterCount.exclude.markdownSyntax.label",
        "settings.editor.characterCount.exclude.markdownSyntax.description",
        "settings.editor.characterCount.exclude.markdownComments.label",
        "settings.editor.characterCount.exclude.markdownComments.description",
        "settings.files.newFile.lineEnding.label",
        "settings.files.newFile.lineEnding.description",
        "settings.files.newFile.encoding.label",
        "settings.files.newFile.encoding.description"
      ] as const) {
        expect(t(language, key).length).toBeGreaterThan(0);
      }
    }
  });

  it("defines the status-bar character count message for ja and en (#259)", () => {
    expect(t("ja", "status.characterCount", { count: 123 })).toBe("123文字");
    expect(t("en", "status.characterCount", { count: 123 })).toBe(
      "123 characters"
    );
  });
});

describe("glossary form match boundary translations", () => {
  it("defines every advanced matching settings key for ja and en", () => {
    for (const key of matchBoundaryKeys) {
      expect(t("ja", key).length).toBeGreaterThan(0);
      expect(t("en", key).length).toBeGreaterThan(0);
    }
  });

  it("labels the disclosure and both boundary fields without left/right vocabulary", () => {
    expect(t("ja", "glossaryEditor.advancedMatchingSettings")).toBe(
      "機械検索用詳細設定"
    );
    expect(t("en", "glossaryEditor.advancedMatchingSettings")).toBe(
      "Advanced matching settings"
    );
    expect(t("ja", "glossaryEditor.matchBoundaryStart")).toBe(
      "一致開始側の境界"
    );
    expect(t("en", "glossaryEditor.matchBoundaryStart")).toBe(
      "Match start boundary"
    );
    expect(t("ja", "glossaryEditor.matchBoundaryEnd")).toBe(
      "一致終了側の境界"
    );
    expect(t("en", "glossaryEditor.matchBoundaryEnd")).toBe(
      "Match end boundary"
    );
  });

  it("labels the auto/strict/none options using the internal values as keys, not left/right", () => {
    expect(t("ja", "glossaryEditor.matchBoundary.auto.label")).toBe("自動");
    expect(t("ja", "glossaryEditor.matchBoundary.strict.label")).toBe("厳密");
    expect(t("ja", "glossaryEditor.matchBoundary.none.label")).toBe("なし");
    expect(t("en", "glossaryEditor.matchBoundary.auto.label")).toBe("Auto");
    expect(t("en", "glossaryEditor.matchBoundary.strict.label")).toBe(
      "Strict"
    );
    expect(t("en", "glossaryEditor.matchBoundary.none.label")).toBe("None");
  });

  it("warns in the ja strict description that behavior may become stricter in the future", () => {
    expect(t("ja", "glossaryEditor.matchBoundary.strict.description")).toContain(
      "今後より厳しくなる場合があります"
    );
  });

  it("warns in the en strict description that behavior may become stricter in the future", () => {
    const description = t(
      "en",
      "glossaryEditor.matchBoundary.strict.description"
    );

    expect(description).toMatch(/future/i);
    expect(description).toMatch(/stricter/i);
  });

  it("never exposes left/right boundary vocabulary in the new translation content", () => {
    for (const key of matchBoundaryKeys) {
      for (const language of supportedLanguages) {
        const value = t(language, key);

        for (const disallowedWord of disallowedBoundaryWords) {
          expect(value).not.toContain(disallowedWord);
        }
      }
    }
  });
});

describe("glossary navigator search translations", () => {
  it("defines search input and empty search result keys for ja and en", () => {
    for (const key of glossaryNavigatorSearchKeys) {
      expect(t("ja", key).length).toBeGreaterThan(0);
      expect(t("en", key).length).toBeGreaterThan(0);
    }
  });

  it("uses the Issue 79 search labels and empty result text", () => {
    expect(t("ja", "glossaryNavigator.search")).toBe("語彙を検索");
    expect(t("ja", "glossaryNavigator.searchPlaceholder")).toBe("語彙を検索");
    expect(t("ja", "glossaryNavigator.emptySearchResult")).toBe(
      "一致する語彙がありません"
    );
    expect(t("en", "glossaryNavigator.search")).toBe("Search glossary");
    expect(t("en", "glossaryNavigator.searchPlaceholder")).toBe(
      "Search glossary"
    );
    expect(t("en", "glossaryNavigator.emptySearchResult")).toBe(
      "No glossary entries match your search."
    );
  });
});

const glossaryOccurrenceNavigationKeys = [
  "glossaryEditor.previousOccurrenceLabel",
  "glossaryEditor.nextOccurrenceLabel",
  "glossaryEditor.previousOccurrence",
  "glossaryEditor.nextOccurrence",
  "status.glossaryOccurrenceNoActiveDocument",
  "status.glossaryOccurrenceNotFound"
] as const;

describe("glossary occurrence navigation translations", () => {
  it("defines the occurrence navigation keys for ja and en", () => {
    for (const key of glossaryOccurrenceNavigationKeys) {
      expect(t("ja", key).length).toBeGreaterThan(0);
      expect(t("en", key).length).toBeGreaterThan(0);
    }
  });

  it("uses the Issue 81 display labels, aria text, and status messages", () => {
    expect(t("ja", "glossaryEditor.previousOccurrenceLabel")).toBe("◀");
    expect(t("ja", "glossaryEditor.nextOccurrenceLabel")).toBe("▶");
    expect(t("ja", "glossaryEditor.previousOccurrence")).toBe(
      "前の使用箇所"
    );
    expect(t("ja", "glossaryEditor.nextOccurrence")).toBe("次の使用箇所");
    expect(t("ja", "status.glossaryOccurrenceNoActiveDocument")).toBe(
      "移動先の文書がありません"
    );
    expect(t("ja", "status.glossaryOccurrenceNotFound")).toBe(
      "この文書内に使用箇所がありません"
    );

    expect(t("en", "glossaryEditor.previousOccurrenceLabel")).toBe("◀");
    expect(t("en", "glossaryEditor.nextOccurrenceLabel")).toBe("▶");
    expect(t("en", "glossaryEditor.previousOccurrence")).toBe(
      "Previous occurrence"
    );
    expect(t("en", "glossaryEditor.nextOccurrence")).toBe("Next occurrence");
    expect(t("en", "status.glossaryOccurrenceNoActiveDocument")).toBe(
      "No document to search."
    );
    expect(t("en", "status.glossaryOccurrenceNotFound")).toBe(
      "No occurrences in this document."
    );
  });
});

describe("NotificationToast foundation translations (#266)", () => {
  it("defines the external-Markdown-open notification message for ja and en", () => {
    expect(t("ja", "notification.externalMarkdownOpened")).toBe(
      "プロジェクト外のファイルを開きました"
    );
    expect(t("en", "notification.externalMarkdownOpened")).toBe(
      "Opened a file from outside the project"
    );
  });

  it("defines the toast dismiss-button accessible name for ja and en", () => {
    expect(t("ja", "notification.dismiss")).toBe("通知を閉じる");
    expect(t("en", "notification.dismiss")).toBe("Dismiss notification");
  });

  it("defines the Settings label/description for the notification display time (#266) and the description explains the 0 = no auto-dismiss case", () => {
    for (const language of ["ja", "en"] as const) {
      for (const key of [
        "settings.workbench.notification.durationMs.label",
        "settings.workbench.notification.durationMs.description"
      ] as const) {
        expect(t(language, key).length).toBeGreaterThan(0);
      }
    }

    expect(t("ja", "settings.workbench.notification.durationMs.description")).toContain(
      "0"
    );
    expect(t("en", "settings.workbench.notification.durationMs.description")).toContain(
      "0"
    );
  });

  it("reuses the existing settings.unit.ms unit label for the notification display time control (#266: no new spelled-out unit key)", () => {
    expect(t("ja", "settings.unit.ms")).toBe("ms");
    expect(t("en", "settings.unit.ms")).toBe("ms");
    expect(Object.keys(jaTranslations)).not.toContain("settings.unit.milliseconds");
    expect(Object.keys(enTranslations)).not.toContain("settings.unit.milliseconds");
  });
});
