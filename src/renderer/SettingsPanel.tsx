import type {
  ApplicationSettings,
  NewFileEncoding,
  NewFileLineEnding,
  SaveApplicationSettingsRequest
} from "../shared/api";
import {
  languageDefinitions,
  supportedLanguages,
  type Language,
  type Translate
} from "../shared/i18n";
import { getCatalogEntry } from "../shared/settingsCatalog";

interface SettingsPanelProps {
  settings: ApplicationSettings;
  isLoading: boolean;
  error: string | null;
  translate: Translate;
  onConfirmEnableAdvancedSettings: () => Promise<boolean>;
  onChangeSettings: (settings: SaveApplicationSettingsRequest) => void;
}

const lineEndingOptions = getCatalogEntry("files.newFile.lineEnding").enumValues;
const encodingOptions = getCatalogEntry("files.newFile.encoding").enumValues;
const commandPaletteDescriptionDelayEntry = getCatalogEntry(
  "commandPalette.description.marquee.delay"
);
const commandPaletteDescriptionSpeedEntry = getCatalogEntry(
  "commandPalette.description.marquee.speed"
);

function fontFamilyValue(value: string): string | undefined {
  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function withFontFamily<T extends { fontFamily?: string }>(
  settings: T,
  fontFamily: string | undefined
): T {
  const nextSettings = { ...settings };

  if (fontFamily === undefined) {
    delete nextSettings.fontFamily;
  } else {
    nextSettings.fontFamily = fontFamily;
  }

  return nextSettings;
}

function saveRequest(
  settings: ApplicationSettings,
  overrides: Partial<SaveApplicationSettingsRequest>
): SaveApplicationSettingsRequest {
  return {
    workbench: overrides.workbench ?? settings.workbench,
    commandPalette: overrides.commandPalette ?? settings.commandPalette,
    editor: overrides.editor ?? settings.editor,
    files: overrides.files ?? settings.files
  };
}

function lineEndingLabel(lineEnding: NewFileLineEnding): string {
  return lineEnding.toUpperCase();
}

function encodingLabel(encoding: NewFileEncoding): string {
  if (encoding === "utf8") {
    return "UTF-8";
  }

  return encoding;
}

export function SettingsPanel({
  settings,
  isLoading,
  error,
  translate,
  onConfirmEnableAdvancedSettings,
  onChangeSettings
}: SettingsPanelProps): JSX.Element {
  const advancedSettingsEnabled = settings.workbench.advancedSettings.enabled;
  const advancedControlsDisabled = isLoading || !advancedSettingsEnabled;
  const soundSettings = settings.workbench.sound;
  const soundControlsDisabled = isLoading || !soundSettings.enabled;
  const commandPaletteDescriptionSettings =
    settings.commandPalette.description;

  async function changeAdvancedSettingsEnabled(enabled: boolean): Promise<void> {
    if (enabled && !advancedSettingsEnabled) {
      const confirmed = await onConfirmEnableAdvancedSettings();

      if (!confirmed) {
        return;
      }
    }

    onChangeSettings(
      saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          advancedSettings: { enabled }
        }
      })
    );
  }

  function changeSoundEnabled(enabled: boolean): void {
    onChangeSettings(
      saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: {
            ...soundSettings,
            enabled
          }
        }
      })
    );
  }

  function changeSoundChildEnabled(
    child: "dialog" | "newline" | "keypress",
    enabled: boolean
  ): void {
    onChangeSettings(
      saveRequest(settings, {
        workbench: {
          ...settings.workbench,
          sound: {
            ...soundSettings,
            [child]: { enabled }
          }
        }
      })
    );
  }

  function changeCommandPaletteDescriptionEnabled(enabled: boolean): void {
    onChangeSettings(
      saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          description: {
            ...commandPaletteDescriptionSettings,
            enable: enabled
          }
        }
      })
    );
  }

  function changeCommandPaletteDescriptionMarqueeValue(
    field: "delay" | "speed",
    value: number
  ): void {
    if (!Number.isFinite(value)) {
      return;
    }

    onChangeSettings(
      saveRequest(settings, {
        commandPalette: {
          ...settings.commandPalette,
          description: {
            ...commandPaletteDescriptionSettings,
            marquee: {
              ...commandPaletteDescriptionSettings.marquee,
              [field]: value
            }
          }
        }
      })
    );
  }

  return (
    <section
      className="settingsPanel"
      aria-labelledby="applicationSettingsTitle"
    >
      <header className="settingsPanelHeader">
        <h1 id="applicationSettingsTitle">
          {translate("settings.application.title")}
        </h1>
        <p>{translate("settings.application.description")}</p>
      </header>

      <label className="settingsAdvancedToggle">
        <input
          type="checkbox"
          checked={advancedSettingsEnabled}
          disabled={isLoading}
          onChange={(event) => {
            void changeAdvancedSettingsEnabled(event.target.checked);
          }}
        />
        <span>{translate("settings.application.advanced.enabled.label")}</span>
      </label>
      <p className="settingsAdvancedDescription">
        {translate("settings.application.advanced.enabled.description")}
      </p>

      {error ? <div className="settingsError">{error}</div> : null}

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsGeneral"
      >
        <h2 id="applicationSettingsGeneral">
          {translate("settings.application.section.general")}
        </h2>
        <div className="settingsRow">
          <label className="settingsLabel" htmlFor="applicationSettingsLanguage">
            {translate("settings.workbench.language.label")}
          </label>
          <div className="settingsControl">
            <select
              id="applicationSettingsLanguage"
              className="settingsSelect"
              value={settings.workbench.language}
              disabled={isLoading}
              onChange={(event) =>
                onChangeSettings(
                  saveRequest(settings, {
                    workbench: {
                      ...settings.workbench,
                      language: event.target.value as Language
                    }
                  })
                )
              }
            >
              {supportedLanguages.map((language) => (
                <option key={language} value={language}>
                  {languageDefinitions[language].nativeName}
                </option>
              ))}
            </select>
            <p className="settingsDescription">
              {translate("settings.languageRestartRequired")}
            </p>
          </div>
        </div>
        <div className="settingsRow">
          <label className="settingsLabel" htmlFor="applicationSettingsStatusBar">
            {translate("settings.workbench.statusBar.visible.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsStatusBar"
                type="checkbox"
                checked={settings.workbench.statusBar.visible}
                disabled={isLoading}
                onChange={(event) =>
                  onChangeSettings(
                    saveRequest(settings, {
                      workbench: {
                        ...settings.workbench,
                        statusBar: { visible: event.target.checked }
                      }
                    })
                  )
                }
              />
              <span>{translate("settings.showStatusBar")}</span>
            </label>
            <p className="settingsDescription">
              {translate("settings.workbench.statusBar.visible.description")}
            </p>
          </div>
        </div>
      </section>

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsAppearance"
      >
        <h2 id="applicationSettingsAppearance">
          {translate("settings.application.section.appearance")}
        </h2>
        <div className="settingsRow">
          <label className="settingsLabel" htmlFor="applicationSettingsUiFont">
            {translate("settings.workbench.fontFamily.label")}
          </label>
          <div className="settingsControl">
            <input
              id="applicationSettingsUiFont"
              className="settingsTextInput"
              type="text"
              value={settings.workbench.fontFamily ?? ""}
              disabled={isLoading}
              onChange={(event) =>
                onChangeSettings(
                  saveRequest(settings, {
                    workbench: withFontFamily(
                      settings.workbench,
                      fontFamilyValue(event.target.value)
                    )
                  })
                )
              }
            />
            <p className="settingsDescription">
              {translate("settings.workbench.fontFamily.description")}
            </p>
          </div>
        </div>
      </section>

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsEditor"
      >
        <h2 id="applicationSettingsEditor">
          {translate("settings.application.section.editor")}
        </h2>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsEditorFont"
          >
            {translate("settings.editor.fontFamily.label")}
          </label>
          <div className="settingsControl">
            <input
              id="applicationSettingsEditorFont"
              className="settingsTextInput"
              type="text"
              value={settings.editor.fontFamily ?? ""}
              disabled={isLoading}
              onChange={(event) =>
                onChangeSettings(
                  saveRequest(settings, {
                    editor: withFontFamily(
                      settings.editor,
                      fontFamilyValue(event.target.value)
                    )
                  })
                )
              }
            />
            <p className="settingsDescription">
              {translate("settings.editor.fontFamily.description")}
            </p>
          </div>
        </div>
      </section>

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsFiles"
      >
        <h2 id="applicationSettingsFiles">
          {translate("settings.application.section.files")}
        </h2>
        <div className="settingsRow">
          <label className="settingsLabel" htmlFor="applicationSettingsLineEnding">
            {translate("settings.files.newFile.lineEnding.label")}
          </label>
          <div className="settingsControl">
            <select
              id="applicationSettingsLineEnding"
              className="settingsSelect"
              value={settings.files.newFile.lineEnding}
              disabled={advancedControlsDisabled}
              onChange={(event) =>
                onChangeSettings(
                  saveRequest(settings, {
                    files: {
                      ...settings.files,
                      newFile: {
                        ...settings.files.newFile,
                        lineEnding: event.target.value as NewFileLineEnding
                      }
                    }
                  })
                )
              }
            >
              {lineEndingOptions.map((lineEnding) => (
                <option key={lineEnding} value={lineEnding}>
                  {lineEndingLabel(lineEnding)}
                </option>
              ))}
            </select>
            <p className="settingsDescription">
              {translate("settings.files.newFile.lineEnding.description")}
            </p>
            {!advancedSettingsEnabled ? (
              <p className="settingsAdvancedDisabled">
                {translate("settings.application.advanced.disabledDescription")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="settingsRow">
          <label className="settingsLabel" htmlFor="applicationSettingsEncoding">
            {translate("settings.files.newFile.encoding.label")}
          </label>
          <div className="settingsControl">
            <select
              id="applicationSettingsEncoding"
              className="settingsSelect"
              value={settings.files.newFile.encoding}
              disabled={advancedControlsDisabled}
              onChange={(event) =>
                onChangeSettings(
                  saveRequest(settings, {
                    files: {
                      ...settings.files,
                      newFile: {
                        ...settings.files.newFile,
                        encoding: event.target.value as NewFileEncoding
                      }
                    }
                  })
                )
              }
            >
              {encodingOptions.map((encoding) => (
                <option key={encoding} value={encoding}>
                  {encodingLabel(encoding)}
                </option>
              ))}
            </select>
            <p className="settingsDescription">
              {translate("settings.files.newFile.encoding.description")}
            </p>
            {!advancedSettingsEnabled ? (
              <p className="settingsAdvancedDisabled">
                {translate("settings.application.advanced.disabledDescription")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsCommandPalette"
      >
        <h2 id="applicationSettingsCommandPalette">
          {translate("settings.application.section.commandPalette")}
        </h2>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsCommandPaletteDescriptionEnabled"
          >
            {translate("settings.commandPalette.description.enable.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsCommandPaletteDescriptionEnabled"
                type="checkbox"
                checked={commandPaletteDescriptionSettings.enable}
                disabled={advancedControlsDisabled}
                onChange={(event) =>
                  changeCommandPaletteDescriptionEnabled(event.target.checked)
                }
              />
              <span>
                {translate("settings.commandPalette.description.enable.label")}
              </span>
            </label>
            <p className="settingsDescription">
              {translate(
                "settings.commandPalette.description.enable.description"
              )}
            </p>
            {!advancedSettingsEnabled ? (
              <p className="settingsAdvancedDisabled">
                {translate("settings.application.advanced.disabledDescription")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsCommandPaletteDescriptionMarqueeDelay"
          >
            {translate(
              "settings.commandPalette.description.marquee.delay.label"
            )}
          </label>
          <div className="settingsControl">
            <div className="settingsNumberInputGroup">
              <input
                id="applicationSettingsCommandPaletteDescriptionMarqueeDelay"
                className="settingsNumberInput"
                type="number"
                min={commandPaletteDescriptionDelayEntry.numericRange.min}
                max={commandPaletteDescriptionDelayEntry.numericRange.max}
                step={1}
                value={commandPaletteDescriptionSettings.marquee.delay}
                disabled={advancedControlsDisabled}
                onChange={(event) =>
                  changeCommandPaletteDescriptionMarqueeValue(
                    "delay",
                    event.target.valueAsNumber
                  )
                }
              />
              <span className="settingsUnit">
                {translate("settings.unit.ms")}
              </span>
            </div>
            <p className="settingsDescription">
              {translate(
                "settings.commandPalette.description.marquee.delay.description"
              )}
            </p>
            {!advancedSettingsEnabled ? (
              <p className="settingsAdvancedDisabled">
                {translate("settings.application.advanced.disabledDescription")}
              </p>
            ) : null}
          </div>
        </div>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
          >
            {translate(
              "settings.commandPalette.description.marquee.speed.label"
            )}
          </label>
          <div className="settingsControl">
            <div className="settingsNumberInputGroup">
              <input
                id="applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
                className="settingsNumberInput"
                type="number"
                min={commandPaletteDescriptionSpeedEntry.numericRange.min}
                max={commandPaletteDescriptionSpeedEntry.numericRange.max}
                step="any"
                value={commandPaletteDescriptionSettings.marquee.speed}
                disabled={advancedControlsDisabled}
                onChange={(event) =>
                  changeCommandPaletteDescriptionMarqueeValue(
                    "speed",
                    event.target.valueAsNumber
                  )
                }
              />
              <span className="settingsUnit">
                {translate("settings.unit.pxPerSecond")}
              </span>
            </div>
            <p className="settingsDescription">
              {translate(
                "settings.commandPalette.description.marquee.speed.description"
              )}
            </p>
            {!advancedSettingsEnabled ? (
              <p className="settingsAdvancedDisabled">
                {translate("settings.application.advanced.disabledDescription")}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section
        className="settingsSection"
        aria-labelledby="applicationSettingsSound"
      >
        <h2 id="applicationSettingsSound">
          {translate("settings.application.section.sound")}
        </h2>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsSoundEnabled"
          >
            {translate("settings.workbench.sound.enabled.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsSoundEnabled"
                type="checkbox"
                checked={soundSettings.enabled}
                disabled={isLoading}
                onChange={(event) =>
                  changeSoundEnabled(event.target.checked)
                }
              />
              <span>{translate("settings.workbench.sound.enabled.label")}</span>
            </label>
            <p className="settingsDescription">
              {translate("settings.workbench.sound.enabled.description")}
            </p>
          </div>
        </div>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsDialogSound"
          >
            {translate("settings.workbench.sound.dialog.enabled.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsDialogSound"
                type="checkbox"
                checked={soundSettings.dialog.enabled}
                disabled={soundControlsDisabled}
                onChange={(event) =>
                  changeSoundChildEnabled("dialog", event.target.checked)
                }
              />
              <span>
                {translate("settings.workbench.sound.dialog.enabled.label")}
              </span>
            </label>
            <p className="settingsDescription">
              {translate("settings.workbench.sound.dialog.enabled.description")}
            </p>
          </div>
        </div>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsNewlineSound"
          >
            {translate("settings.workbench.sound.newline.enabled.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsNewlineSound"
                type="checkbox"
                checked={soundSettings.newline.enabled}
                disabled={soundControlsDisabled}
                onChange={(event) =>
                  changeSoundChildEnabled("newline", event.target.checked)
                }
              />
              <span>
                {translate("settings.workbench.sound.newline.enabled.label")}
              </span>
            </label>
            <p className="settingsDescription">
              {translate("settings.workbench.sound.newline.enabled.description")}
            </p>
          </div>
        </div>
        <div className="settingsRow">
          <label
            className="settingsLabel"
            htmlFor="applicationSettingsKeypressSound"
          >
            {translate("settings.workbench.sound.keypress.enabled.label")}
          </label>
          <div className="settingsControl">
            <label className="settingsInlineCheckbox">
              <input
                id="applicationSettingsKeypressSound"
                type="checkbox"
                checked={soundSettings.keypress.enabled}
                disabled={soundControlsDisabled}
                onChange={(event) =>
                  changeSoundChildEnabled("keypress", event.target.checked)
                }
              />
              <span>
                {translate("settings.workbench.sound.keypress.enabled.label")}
              </span>
            </label>
            <p className="settingsDescription">
              {translate(
                "settings.workbench.sound.keypress.enabled.description"
              )}
            </p>
          </div>
        </div>
      </section>
    </section>
  );
}
