/**
 * settings.json <-> catalog key bridge (#226/#230, extracted for #394 Step 2).
 *
 * The catalog (src/shared/settingsCatalog.ts) is display/validation metadata
 * only — it does not know how a dotted key maps into the nested
 * ApplicationSettings/SaveApplicationSettingsRequest shape, and it must not:
 * persistence stays this module's job. `SettingsPanel.tsx` (Settings UI) and
 * `settingsRestartRequiredChange.ts` (Settings save/diff, #394 Step 2) both
 * read a setting's current value through this single function, so the two
 * concerns can never drift apart on what a given key actually reads.
 *
 * `settings` is typed as `SaveApplicationSettingsRequest` rather than
 * `ApplicationSettings`: every field this function reads exists with an
 * identical type on both (`ApplicationSettings` only adds `recentProjects`,
 * never read here), so an `ApplicationSettings` value is always accepted too
 * — callers on either side of a save (the settings state before, and the
 * save request being sent) can use the exact same function.
 */

import type { SaveApplicationSettingsRequest } from "../shared/settings";
import { getCatalogDefaultValue, type SettingKey } from "../shared/settingsCatalog";

export function readSettingValue(
  key: SettingKey,
  settings: SaveApplicationSettingsRequest
): unknown {
  switch (key) {
    case "workbench.colorTheme":
      return getCatalogDefaultValue("workbench.colorTheme");
    case "workbench.fontFamily":
      return (
        settings.workbench.fontFamily ??
        getCatalogDefaultValue("workbench.fontFamily")
      );
    case "workbench.language":
      return settings.workbench.language;
    case "workbench.statusBar.visible":
      return settings.workbench.statusBar.visible;
    case "workbench.statusBar.characterCount.visible":
      return settings.workbench.statusBar.characterCount.visible;
    case "notification.output.enabled":
      return (
        settings.notification?.output.enabled ??
        getCatalogDefaultValue("notification.output.enabled")
      );
    case "workbench.notification.durationMs":
      return (
        settings.workbench.notification?.durationMs ??
        getCatalogDefaultValue("workbench.notification.durationMs")
      );
    case "workbench.sound.enabled":
      return settings.workbench.sound.enabled;
    case "workbench.sound.dialog.enabled":
      return settings.workbench.sound.dialog.enabled;
    case "workbench.sound.newline.enabled":
      return settings.workbench.sound.newline.enabled;
    case "workbench.sound.keypress.enabled":
      return settings.workbench.sound.keypress.enabled;
    case "commandPalette.footerDetail.enable":
      return settings.commandPalette.footerDetail.enable;
    case "commandPalette.footerDetail.marquee.delay":
      return settings.commandPalette.footerDetail.marquee.delay;
    case "commandPalette.footerDetail.marquee.speed":
      return settings.commandPalette.footerDetail.marquee.speed;
    case "editor.fontFamily":
      return (
        settings.editor.fontFamily ?? getCatalogDefaultValue("editor.fontFamily")
      );
    case "editor.paragraphIndent.excludeLeadingCharacters":
      return settings.editor.paragraphIndent.excludeLeadingCharacters;
    case "editor.lineEnding.expected":
      return settings.editor.lineEnding.expected;
    case "editor.lineEnding.markerGlyph":
      return settings.editor.lineEnding.markerGlyph;
    case "editor.whitespace.renderIdeographicSpace":
      return settings.editor.whitespace.renderIdeographicSpace;
    case "editor.whitespace.renderAsciiSpace":
      return settings.editor.whitespace.renderAsciiSpace;
    case "editor.whitespace.renderTab":
      return settings.editor.whitespace.renderTab;
    case "editor.whitespace.renderOtherUnicodeSpace":
      return settings.editor.whitespace.renderOtherUnicodeSpace;
    case "editor.characterCount.exclude.whitespace":
      return settings.editor.characterCount.exclude.whitespace;
    case "editor.characterCount.exclude.lineBreaks":
      return settings.editor.characterCount.exclude.lineBreaks;
    case "editor.characterCount.exclude.headings":
      return settings.editor.characterCount.exclude.headings;
    case "editor.characterCount.exclude.markdownSyntax":
      return settings.editor.characterCount.exclude.markdownSyntax;
    case "editor.characterCount.exclude.markdownComments":
      return settings.editor.characterCount.exclude.markdownComments;
    case "editor.undoHistoryMinDepth":
      return settings.editor.undoHistoryMinDepth;
    case "files.newFile.lineEnding":
      return settings.files.newFile.lineEnding;
    case "files.newFile.encoding":
      return settings.files.newFile.encoding;
    case "preview.renderer":
      return settings.preview.renderer;
    case "preview.updateDelayMs":
      return settings.preview.updateDelayMs;
  }

  const exhaustiveCheck: never = key;
  throw new Error(`Unhandled setting key: ${String(exhaustiveCheck)}`);
}
