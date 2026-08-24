import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workbench.statusBar.visible / workbench.language runtime wiring (#174)", () => {
  it("App.tsx reads status bar visibility from effectiveSettings.workbench.statusBar.visible", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    expect(appSource).toContain(
      "effectiveSettings.workbench.statusBar.visible"
    );
    expect(appSource).not.toContain("effectiveSettings.showStatusBar");
    expect(appSource).not.toContain("showStatusBar");
  });

  it("useApplicationSettings.ts sources displayLanguage from loadedSettings.workbench.language, not a legacy top-level field", () => {
    const hookSource = readFileSync(
      "src/renderer/useApplicationSettings.ts",
      "utf8"
    );

    expect(hookSource).toContain(
      "setDisplayLanguage(loadedSettings.workbench.language)"
    );
  });

  it("displayLanguage (the actual language-behavior source #9 refers to) is loaded once at startup, not recomputed from resolveEffectiveSettings — this is intentional (#174 mismatch note): resolveEffectiveSettings has no memoization boundary independent of live ApplicationSettings, so wiring translate() through effectiveSettings.workbench.language would make language changes apply immediately on save instead of after restart, which is exactly the runtime language switching #174 must not add. The 'settings.languageRestartRequired' UI copy documents this pre-existing (pre-#174) timing contract.", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain("settings.languageRestartRequired");
  });

  it("workbench.language's select options are owned by i18n's supportedLanguages list, not hardcoded in SettingsPanel.tsx (#186, #228, #230: moved into the UI catalog)", () => {
    const catalogSource = readFileSync(
      "src/shared/settingsUiCatalog.ts",
      "utf8"
    );
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(catalogSource).toContain("supportedLanguages.map");
    expect(settingsPanelSource).not.toContain("languageDefinitions");
    expect(settingsPanelSource).not.toContain("supportedLanguages");
    expect(settingsPanelSource).not.toContain('["ja", "en"]');
    expect(settingsPanelSource).not.toContain("languageLabelKey");
    // SettingsPanel.tsx renders every select control's options generically
    // from item.control (catalog-driven), not per-setting.
    expect(settingsPanelSource).toContain("control.options.map");
  });
});

describe("Application Settings core controls runtime wiring (#195)", () => {
  it("App.tsx applies editor.fontFamily from effective settings through the renderer-side safe applier", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    expect(appSource).toContain("applyEditorFontFamily");
    expect(appSource).toContain("effectiveSettings.editor.fontFamily");
  });

  it("styles.css consumes --pergamum-editor-font-family only for the CodeMirror editor body", () => {
    const stylesSource = readFileSync("src/renderer/styles.css", "utf8");

    expect(stylesSource).toContain("--pergamum-editor-font-family");
    expect(stylesSource).toContain(".editorHost .cm-scroller");
  });

  it("SettingsPanel no longer gates files.newFile.* behind the legacy Advanced Settings toggle (#232)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).not.toContain("advancedGatedKeys");
    expect(settingsPanelSource).not.toContain(
      "workbench.advancedSettings.enabled"
    );
    expect(settingsPanelSource).not.toContain("onConfirmEnableAdvancedSettings");
    expect(settingsPanelSource).toContain('"files.newFile.lineEnding"');
    expect(settingsPanelSource).toContain('"files.newFile.encoding"');
  });

  it("SettingsPanel keeps Command Palette description controls directly editable, with unit suffixes for the marquee number controls, and no advanced gate (#232: catalog-driven)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain(
      '"commandPalette.description.enable"'
    );
    expect(settingsPanelSource).toContain(
      '"commandPalette.description.marquee.delay"'
    );
    expect(settingsPanelSource).toContain(
      '"commandPalette.description.marquee.speed"'
    );
    expect(settingsPanelSource).not.toContain("advancedGatedKeys");
    expect(settingsPanelSource).toContain("marqueeKeys");
    expect(settingsPanelSource).toContain("settings.unit.ms");
    expect(settingsPanelSource).toContain("settings.unit.pxPerSecond");
  });

  it("SettingsPanel exposes the #200 sound feedback controls and disables child controls through the parent sound guard (#230: catalog-driven)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain("settings.workbench.sound.enabled");
    expect(settingsPanelSource).toContain("soundChildKeys");
    expect(settingsPanelSource).toContain('"workbench.sound.dialog.enabled"');
    expect(settingsPanelSource).toContain('"workbench.sound.newline.enabled"');
    expect(settingsPanelSource).toContain(
      '"workbench.sound.keypress.enabled"'
    );
  });

  it("App.tsx wires the renderer sound feedback player to dialogs and the Markdown editor surface", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    expect(appSource).toContain("createBrowserSoundFeedbackPlayer");
    expect(appSource).toContain("onPlaybackFailure");
    expect(appSource).toContain("soundPlaybackWarningReportedRef");
    expect(appSource).toContain("status.soundPlaybackFailed");
    expect(appSource).toContain("playDialogShownSound");
    expect(appSource).toContain("soundSettings={effectiveSettings.workbench.sound}");
    expect(appSource).toContain("soundFeedback={soundFeedback}");
  });
});
