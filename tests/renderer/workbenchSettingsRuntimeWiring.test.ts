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

  it("notification.output.enabled is only passed to NotificationHost and does not gate the status bar", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const statusBarStart = appSource.indexOf(
      "{effectiveSettings.workbench.statusBar.visible ? ("
    );
    const statusBarEnd = appSource.indexOf("<NotificationHost", statusBarStart);
    const statusBarBlock = appSource.slice(statusBarStart, statusBarEnd);

    expect(statusBarStart).toBeGreaterThan(-1);
    expect(statusBarEnd).toBeGreaterThan(statusBarStart);
    expect(statusBarBlock).toContain(
      "effectiveSettings.workbench.statusBar.visible"
    );
    expect(statusBarBlock).not.toContain("notificationOutputEnabled");
    expect(statusBarBlock).not.toContain(
      "effectiveSettings.notification.output.enabled"
    );
  });

  it("notification.output.enabled does not gate Error dialogs or the Recovery modal", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const dialogsStart = appSource.indexOf("{recoveryCandidateDialogData");
    const dialogsEnd = appSource.indexOf("<NotificationHost", dialogsStart);
    const modalBlock = appSource.slice(dialogsStart, dialogsEnd);

    expect(dialogsStart).toBeGreaterThan(-1);
    expect(dialogsEnd).toBeGreaterThan(dialogsStart);
    expect(modalBlock).toContain("<RecoveryCandidateDialog");
    expect(modalBlock).toContain("<ConfirmDialog");
    expect(modalBlock).toContain("<ChoiceDialog");
    expect(modalBlock).not.toContain("notificationOutputEnabled");
    expect(modalBlock).not.toContain(
      "effectiveSettings.notification.output.enabled"
    );
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

  it("App.tsx applies #497 font-family list slots from effective settings", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    expect(appSource).toContain("applyWorkbenchUiFontFamilyList");
    expect(appSource).toContain("effectiveSettings.workbench.uiFontFamilyList");
    expect(appSource).toContain("applyEditorFontFamilyList");
    expect(appSource).toContain("effectiveSettings.editor.fontFamilyList");
    expect(appSource).toContain("applyPreviewFontFamilyList");
    expect(appSource).toContain("effectiveSettings.preview.fontFamilyList");
  });

  it("styles.css consumes #497 slot font variables on the intended surfaces", () => {
    const stylesSource = readFileSync("src/renderer/styles.css", "utf8");
    const editorStart = stylesSource.indexOf(".editorHost .cm-scroller");
    const editorEnd = stylesSource.indexOf("}", editorStart);
    const editorBlock = stylesSource.slice(editorStart, editorEnd);
    const previewStart = stylesSource.indexOf(".preview {");
    const previewEnd = stylesSource.indexOf("}", previewStart);
    const previewBlock = stylesSource.slice(previewStart, previewEnd);

    expect(stylesSource).toContain("--pergamum-workbench-ui-font-family-list");
    expect(stylesSource).toContain("--pergamum-editor-font-family-list");
    expect(stylesSource).toContain("--pergamum-preview-font-family-list");
    expect(editorBlock).toContain("--pergamum-editor-font-family-list");
    expect(editorBlock).not.toContain("--pergamum-workbench-ui-font-family-list");
    expect(editorBlock).not.toContain("--pergamum-preview-font-family-list");
    expect(previewBlock).toContain("--pergamum-preview-font-family-list");
    expect(previewBlock).not.toContain("--pergamum-editor-font-family-list");
  });

  it("SettingsPanel no longer gates markdownFiles.* behind the legacy Advanced Settings toggle (#232)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).not.toContain("advancedGatedKeys");
    expect(settingsPanelSource).not.toContain(
      "workbench.advancedSettings.enabled"
    );
    expect(settingsPanelSource).not.toContain("onConfirmEnableAdvancedSettings");
    expect(settingsPanelSource).toContain('"markdownFiles.lineEnding"');
    expect(settingsPanelSource).toContain('"markdownFiles.encoding"');
    expect(settingsPanelSource).toContain('"textFiles.encoding"');
  });

  it("SettingsPanel keeps Command Palette footer detail controls directly editable, with unit suffixes for the marquee number controls, and no advanced gate (#232: catalog-driven)", () => {
    const settingsPanelSource = readFileSync(
      "src/renderer/SettingsPanel.tsx",
      "utf8"
    );

    expect(settingsPanelSource).toContain(
      '"commandPalette.footerDetail.enable"'
    );
    expect(settingsPanelSource).toContain(
      '"commandPalette.footerDetail.marquee.delay"'
    );
    expect(settingsPanelSource).toContain(
      '"commandPalette.footerDetail.marquee.speed"'
    );
    expect(settingsPanelSource).not.toContain("advancedGatedKeys");
    expect(settingsPanelSource).toContain("footerDetailMarqueeKeys");
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

  it("#453 Slice 3: App.tsx wires workbench.normalizeUnicodeToNfc into active Find and project Search matching", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const editorSurfaceIndex = appSource.indexOf("<EditorSurface");
    const editorSurfaceBlock = appSource.slice(
      editorSurfaceIndex,
      appSource.indexOf("/>", editorSurfaceIndex) + 2
    );
    const runProjectSearchIndex = appSource.indexOf(
      "async function runProjectSearch("
    );
    const runProjectSearchBlock = appSource.slice(
      runProjectSearchIndex,
      runProjectSearchIndex + 900
    );

    expect(editorSurfaceIndex).toBeGreaterThan(-1);
    expect(editorSurfaceBlock).toContain("normalizeUnicodeToNfcMatching={");
    expect(editorSurfaceBlock).toContain(
      "effectiveSettings.workbench.normalizeUnicodeToNfc"
    );
    expect(runProjectSearchBlock).toContain("runProjectTextSearch({");
    expect(runProjectSearchBlock).toContain(
      "normalizeUnicodeToNfc:\n        effectiveSettings.workbench.normalizeUnicodeToNfc"
    );
  });

  it("#453 Slice 5: App.tsx wires workbench.normalizeUnicodeToNfc into replace candidate generation", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");
    const openDocsReplaceIndex = appSource.indexOf(
      "async function generateReplacePreviewCandidates("
    );
    const openDocsReplaceBlock = appSource.slice(
      openDocsReplaceIndex,
      openDocsReplaceIndex + 1200
    );
    const projectReplaceIndex = appSource.indexOf(
      "async function generateProjectReplacePreviewCandidates("
    );
    const projectReplaceBlock = appSource.slice(
      projectReplaceIndex,
      projectReplaceIndex + 2800
    );

    expect(openDocsReplaceIndex).toBeGreaterThan(-1);
    expect(openDocsReplaceBlock).toContain(
      "normalizeUnicodeToNfc:\n          effectiveSettings.workbench.normalizeUnicodeToNfc"
    );
    expect(projectReplaceIndex).toBeGreaterThan(-1);
    expect(projectReplaceBlock).toContain(
      "normalizeUnicodeToNfc:\n          effectiveSettings.workbench.normalizeUnicodeToNfc"
    );
  });
});

describe("status bar character count runtime wiring (#259)", () => {
  it("App.tsx shows the status-bar character count only behind the status bar and character-count visibility settings", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    expect(appSource).toContain("countMarkdownDocumentCharacters");
    expect(appSource).toContain("CHARACTER_COUNT_UPDATE_DEBOUNCE_MS");
    // The Status Bar's own visibility gate (#259) — still required for the
    // Status Bar to render the count.
    expect(appSource).toContain("statusBarWantsCharacterCount");
    expect(appSource).toContain(
      "effectiveSettings.workbench.statusBar.visible"
    );
    expect(appSource).toContain(
      "effectiveSettings.workbench.statusBar.characterCount.visible"
    );
    expect(appSource).toContain("currentEditor?.kind === \"markdown\"");
    expect(appSource).toContain("!isEditorAreaSpecialTabActive");
  });

  it("App.tsx computes ONE Markdown character count shared by the Status Bar and Document Metrics (#360)", () => {
    const appSource = readFileSync("src/renderer/App.tsx", "utf8");

    // A single debounced computation, fired when either surface needs it.
    expect(appSource).toContain("shouldComputeMarkdownCharacterCount");
    expect(appSource).toContain(
      "statusBarWantsCharacterCount || documentMetricsWantsCharacterCount"
    );
    // Exactly one call site for the count helper.
    expect(
      appSource.match(/countMarkdownDocumentCharacters\(/g) ?? []
    ).toHaveLength(1);
    // The Document Metrics pane is handed that same resolved value.
    expect(appSource).toContain(
      "documentMetricsCharacterCount={"
    );
  });

  it("keeps the Markdown Preview renderer parser configuration unchanged", () => {
    const previewSource = readFileSync(
      "src/renderer/preview/markdownPreviewRenderer.ts",
      "utf8"
    );
    const editorSurfaceSource = readFileSync(
      "src/renderer/EditorSurface.tsx",
      "utf8"
    );

    expect(previewSource).toContain("html: false");
    expect(previewSource).not.toContain("characterCount");
    expect(editorSurfaceSource).not.toContain("countMarkdownDocumentCharacters");
  });
});
