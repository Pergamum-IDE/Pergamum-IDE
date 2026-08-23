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

  it("SettingsPanel renders language options from the i18n-owned supportedLanguages list (#186)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain("supportedLanguages.map");
    expect(settingsPanelSource).toContain(
      "languageDefinitions[language].nativeName"
    );
    expect(settingsPanelSource).not.toContain('["ja", "en"]');
    expect(settingsPanelSource).not.toContain("languageLabelKey");
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

  it("SettingsPanel keeps advanced files controls behind the workbench.advancedSettings.enabled guard", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain(
      "settings.workbench.advancedSettings.enabled"
    );
    expect(settingsPanelSource).toContain("advancedControlsDisabled");
    expect(settingsPanelSource).toContain(
      "onConfirmEnableAdvancedSettings"
    );
  });

  it("SettingsPanel exposes Command Palette description controls as advanced settings", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain(
      "settings.application.section.commandPalette"
    );
    expect(settingsPanelSource).toContain(
      "applicationSettingsCommandPaletteDescriptionEnabled"
    );
    expect(settingsPanelSource).toContain(
      "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
    );
    expect(settingsPanelSource).toContain(
      "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
    );
    expect(settingsPanelSource).toContain("advancedControlsDisabled");
    expect(settingsPanelSource).toContain("settings.unit.ms");
    expect(settingsPanelSource).toContain("settings.unit.pxPerSecond");
  });

  it("SettingsPanel exposes the #200 sound feedback controls and disables child controls through the parent sound guard", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain("settings.workbench.sound");
    expect(settingsPanelSource).toContain("soundControlsDisabled");
    expect(settingsPanelSource).toContain("applicationSettingsSoundEnabled");
    expect(settingsPanelSource).toContain("applicationSettingsDialogSound");
    expect(settingsPanelSource).toContain("applicationSettingsNewlineSound");
    expect(settingsPanelSource).toContain("applicationSettingsKeypressSound");
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
