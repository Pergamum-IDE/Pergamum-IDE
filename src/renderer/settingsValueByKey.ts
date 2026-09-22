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
    case "workbench.normalizeUnicodeToNfc":
      return (
        settings.workbench.normalizeUnicodeToNfc ??
        getCatalogDefaultValue("workbench.normalizeUnicodeToNfc")
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
    case "commandPalette.launchAnimation.durationMs":
      return settings.commandPalette.launchAnimation.durationMs;
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
    case "editor.selectionHighlightMode":
      return settings.editor.selectionHighlightMode;
    case "editor.findGutterMarkers":
      return settings.editor.findGutterMarkers;
    case "editor.captureTabInEditor":
      return settings.editor.captureTabInEditor;
    case "editor.fencedCodeIndentUnit":
      return settings.editor.fencedCodeIndentUnit;
    case "markdownFiles.encoding":
      return settings.markdownFiles.encoding;
    case "markdownFiles.lineEnding":
      return settings.markdownFiles.lineEnding;
    case "textFiles.enablePlainTextDocuments":
      return settings.textFiles.enablePlainTextDocuments;
    case "textFiles.encoding":
      return settings.textFiles.encoding;
    case "textFiles.lineEnding":
      return settings.textFiles.lineEnding;
    case "textFiles.indentUnit":
      return settings.textFiles.indentUnit;
    case "preview.renderer":
      return settings.preview.renderer;
    case "preview.updateDelayMs":
      return settings.preview.updateDelayMs;
    case "preview.syncScrollEditorToPreview":
      return settings.preview.syncScrollEditorToPreview;
    case "preview.syncScrollPreviewToEditor":
      return settings.preview.syncScrollPreviewToEditor;
    case "preview.doubleClickJumpToEditor":
      return settings.preview.doubleClickJumpToEditor;
    case "documentMap.dialogueDelimiterPairs":
      return settings.documentMap.dialogueDelimiterPairs;
    case "imageAttachment.saveDirectory":
      return settings.imageAttachment.saveDirectory;
    case "search.nearby.unit":
      return settings.search.nearby.unit;
    case "search.nearby.characterDistance":
      return settings.search.nearby.characterDistance;
    case "search.nearby.paragraphDistance":
      return settings.search.nearby.paragraphDistance;
    case "editor.emphasisMark.rule":
      return (
        settings.editor.emphasisMark?.rule ??
        getCatalogDefaultValue("editor.emphasisMark.rule")
      );
    case "editor.emphasisMark.aozoraMark":
      return (
        settings.editor.emphasisMark?.aozoraMark ??
        getCatalogDefaultValue("editor.emphasisMark.aozoraMark")
      );
    case "editor.emphasisMark.narouMarkText":
      return (
        settings.editor.emphasisMark?.narouMarkText ??
        getCatalogDefaultValue("editor.emphasisMark.narouMarkText")
      );
    case "editor.ruby.rule":
      return (
        settings.editor.ruby?.rule ??
        getCatalogDefaultValue("editor.ruby.rule")
      );
    case "workbench.uiFontFamilyList":
      return (
        settings.workbench.uiFontFamilyList ??
        getCatalogDefaultValue("workbench.uiFontFamilyList")
      );
    case "editor.fontFamilyList":
      return (
        settings.editor.fontFamilyList ??
        getCatalogDefaultValue("editor.fontFamilyList")
      );
    case "preview.fontFamilyList":
      return (
        settings.preview.fontFamilyList ??
        getCatalogDefaultValue("preview.fontFamilyList")
      );
  }

  const exhaustiveCheck: never = key;
  throw new Error(`Unhandled setting key: ${String(exhaustiveCheck)}`);
}
