import { describe, expect, it, vi } from "vitest";

import {
  changedRestartRequiredSettingKeys,
  hasRestartRequiredSettingChange,
  promptRestartIfRequired
} from "../../src/renderer/settingsRestartRequiredChange";
import type {
  ApplicationSettings,
  SaveApplicationSettingsRequest
} from "../../src/shared/settings";
import { defaultDocumentMapSettings } from "../../src/shared/documentMapSettings";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

function baseApplicationSettings(
  overrides: Partial<ApplicationSettings> = {}
): ApplicationSettings {
  return {
    preview: {
      renderer: getCatalogDefaultValue("preview.renderer"),
      updateDelayMs: getCatalogDefaultValue("preview.updateDelayMs")
    },
    workbench: {
      language: getCatalogDefaultValue("workbench.language"),
      statusBar: {
        visible: getCatalogDefaultValue("workbench.statusBar.visible"),
        characterCount: {
          visible: getCatalogDefaultValue(
            "workbench.statusBar.characterCount.visible"
          )
        }
      },
      sound: {
        enabled: getCatalogDefaultValue("workbench.sound.enabled"),
        dialog: { enabled: getCatalogDefaultValue("workbench.sound.dialog.enabled") },
        newline: { enabled: getCatalogDefaultValue("workbench.sound.newline.enabled") },
        keypress: { enabled: getCatalogDefaultValue("workbench.sound.keypress.enabled") }
      }
    },
    commandPalette: {
      footerDetail: {
        enable: getCatalogDefaultValue("commandPalette.footerDetail.enable"),
        marquee: {
          delay: getCatalogDefaultValue(
            "commandPalette.footerDetail.marquee.delay"
          ),
          speed: getCatalogDefaultValue(
            "commandPalette.footerDetail.marquee.speed"
          )
        }
      }
    },
    editor: {
      lineEnding: {
        expected: getCatalogDefaultValue("editor.lineEnding.expected"),
        markerGlyph: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
      },
      whitespace: {
        renderIdeographicSpace: getCatalogDefaultValue(
          "editor.whitespace.renderIdeographicSpace"
        ),
        renderAsciiSpace: getCatalogDefaultValue(
          "editor.whitespace.renderAsciiSpace"
        ),
        renderTab: getCatalogDefaultValue("editor.whitespace.renderTab"),
        renderOtherUnicodeSpace: getCatalogDefaultValue(
          "editor.whitespace.renderOtherUnicodeSpace"
        )
      },
      paragraphIndent: {
        excludeLeadingCharacters: getCatalogDefaultValue(
          "editor.paragraphIndent.excludeLeadingCharacters"
        )
      },
      characterCount: {
        exclude: {
          whitespace: getCatalogDefaultValue(
            "editor.characterCount.exclude.whitespace"
          ),
          lineBreaks: getCatalogDefaultValue(
            "editor.characterCount.exclude.lineBreaks"
          ),
          headings: getCatalogDefaultValue(
            "editor.characterCount.exclude.headings"
          ),
          markdownSyntax: getCatalogDefaultValue(
            "editor.characterCount.exclude.markdownSyntax"
          ),
          markdownComments: getCatalogDefaultValue(
            "editor.characterCount.exclude.markdownComments"
          )
        }
      },
      undoHistoryMinDepth: getCatalogDefaultValue("editor.undoHistoryMinDepth")
    },
    files: {
      newFile: {
        lineEnding: getCatalogDefaultValue("files.newFile.lineEnding"),
        encoding: getCatalogDefaultValue("files.newFile.encoding")
      }
    },
    documentMap: defaultDocumentMapSettings(),
    recentProjects: [],
    ...overrides
  };
}

function toSaveRequest(
  settings: ApplicationSettings
): SaveApplicationSettingsRequest {
  const { recentProjects: _recentProjects, ...saveRequest } = settings;
  return saveRequest;
}

describe("settingsRestartRequiredChange (#394 Step 2)", () => {
  describe("changedRestartRequiredSettingKeys / hasRestartRequiredSettingChange", () => {
    it("detects a changed requiresRestart setting (100 -> 1000)", () => {
      const previous = baseApplicationSettings();
      const next = toSaveRequest(
        baseApplicationSettings({
          editor: { ...previous.editor, undoHistoryMinDepth: 1000 }
        })
      );

      expect(changedRestartRequiredSettingKeys(previous, next)).toEqual([
        "editor.undoHistoryMinDepth"
      ]);
      expect(hasRestartRequiredSettingChange(previous, next)).toBe(true);
    });

    it("reports no change when the value is identical (100 -> 100)", () => {
      const previous = baseApplicationSettings();
      const next = toSaveRequest(baseApplicationSettings());

      expect(changedRestartRequiredSettingKeys(previous, next)).toEqual([]);
      expect(hasRestartRequiredSettingChange(previous, next)).toBe(false);
    });

    it("reports no change when a value was changed then reverted before saving", () => {
      const previous = baseApplicationSettings();
      // The final `next` value equals `previous` again — only the final value
      // is ever compared, so an intermediate detour through 1000 is invisible
      // here (this module never sees intermediate UI state).
      const next = toSaveRequest(
        baseApplicationSettings({
          editor: {
            ...previous.editor,
            undoHistoryMinDepth: previous.editor.undoHistoryMinDepth
          }
        })
      );

      expect(hasRestartRequiredSettingChange(previous, next)).toBe(false);
    });

    it("ignores a changed setting that does not require a restart", () => {
      const previous = baseApplicationSettings();
      const next = toSaveRequest(
        baseApplicationSettings({
          workbench: {
            ...previous.workbench,
            language: previous.workbench.language === "ja" ? "en" : "ja"
          }
        })
      );

      expect(changedRestartRequiredSettingKeys(previous, next)).toEqual([]);
      expect(hasRestartRequiredSettingChange(previous, next)).toBe(false);
    });

    it("still yields a single boolean signal when combined with a non-restart-required change", () => {
      const previous = baseApplicationSettings();
      const next = toSaveRequest(
        baseApplicationSettings({
          editor: { ...previous.editor, undoHistoryMinDepth: 250 },
          workbench: {
            ...previous.workbench,
            language: previous.workbench.language === "ja" ? "en" : "ja"
          }
        })
      );

      expect(changedRestartRequiredSettingKeys(previous, next)).toEqual([
        "editor.undoHistoryMinDepth"
      ]);
      expect(hasRestartRequiredSettingChange(previous, next)).toBe(true);
    });
  });

  describe("promptRestartIfRequired", () => {
    it("never confirms or requests a restart when nothing requiresRestart changed", async () => {
      const previousSettings = baseApplicationSettings();
      const nextSettings = toSaveRequest(baseApplicationSettings());
      const confirmRestart = vi.fn().mockResolvedValue("confirm");
      const onRestartRequested = vi.fn();

      await promptRestartIfRequired({
        previousSettings,
        nextSettings,
        confirmRestart,
        onRestartRequested
      });

      expect(confirmRestart).not.toHaveBeenCalled();
      expect(onRestartRequested).not.toHaveBeenCalled();
    });

    it('does not request a restart when the user picks "Later" (cancel)', async () => {
      const previousSettings = baseApplicationSettings();
      const nextSettings = toSaveRequest(
        baseApplicationSettings({
          editor: { ...previousSettings.editor, undoHistoryMinDepth: 1000 }
        })
      );
      const confirmRestart = vi.fn().mockResolvedValue("cancel");
      const onRestartRequested = vi.fn();

      await promptRestartIfRequired({
        previousSettings,
        nextSettings,
        confirmRestart,
        onRestartRequested
      });

      expect(confirmRestart).toHaveBeenCalledTimes(1);
      expect(onRestartRequested).not.toHaveBeenCalled();
    });

    it('requests a restart exactly once when the user picks "Restart Now" (confirm)', async () => {
      const previousSettings = baseApplicationSettings();
      const nextSettings = toSaveRequest(
        baseApplicationSettings({
          editor: { ...previousSettings.editor, undoHistoryMinDepth: 1000 }
        })
      );
      const confirmRestart = vi.fn().mockResolvedValue("confirm");
      const onRestartRequested = vi.fn();

      await promptRestartIfRequired({
        previousSettings,
        nextSettings,
        confirmRestart,
        onRestartRequested
      });

      expect(confirmRestart).toHaveBeenCalledTimes(1);
      expect(onRestartRequested).toHaveBeenCalledTimes(1);
    });
  });
});
