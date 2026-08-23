import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  defaultApplicationSettings,
  type ApplicationSettings
} from "../../src/shared/settings";
import { t, type Language, type Translate } from "../../src/shared/i18n";
import { SettingsPanel } from "../../src/renderer/SettingsPanel";

type ElementProps = Record<string, unknown> & {
  children?: React.ReactNode;
};

function translateFor(language: Language): Translate {
  return (key, values) => t(language, key, values);
}

function settingsPanelElement(
  currentUiLanguage: Language,
  settings: ApplicationSettings = defaultApplicationSettings,
  onConfirmEnableAdvancedSettings: () => Promise<boolean> = () =>
    Promise.resolve(true),
  onChangeSettings: Parameters<typeof SettingsPanel>[0]["onChangeSettings"] =
    () => undefined
): JSX.Element {
  return SettingsPanel({
    settings,
    isLoading: false,
    error: null,
    translate: translateFor(currentUiLanguage),
    onConfirmEnableAdvancedSettings,
    onChangeSettings
  });
}

function renderSettingsPanel(currentUiLanguage: Language): string {
  return renderToStaticMarkup(settingsPanelElement(currentUiLanguage));
}

function extractLanguageOptions(markup: string): Array<[string, string]> {
  const languageSelect =
    markup.match(
      /<select\b[^>]*id="applicationSettingsLanguage"[^>]*>[\s\S]*?<\/select>/
    )?.[0] ?? "";

  return Array.from(
    languageSelect.matchAll(
      /<option\b[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g
    ),
    (match) => [match[1] ?? "", match[2] ?? ""]
  );
}

function collectElements(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<ElementProps>) => boolean
): React.ReactElement<ElementProps>[] {
  const elements: React.ReactElement<ElementProps>[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<ElementProps>(child)) {
      return;
    }

    if (predicate(child)) {
      elements.push(child);
    }

    elements.push(...collectElements(child.props.children, predicate));
  });

  return elements;
}

function elementById(
  node: React.ReactNode,
  id: string
): React.ReactElement<ElementProps> {
  const element = collectElements(node, (child) => child.props.id === id)[0];

  if (!element) {
    throw new Error(`Element not found: ${id}`);
  }

  return element;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("SettingsPanel language selector (#186)", () => {
  it("renders native language names when the current UI language is Japanese", () => {
    expect(extractLanguageOptions(renderSettingsPanel("ja"))).toEqual([
      ["ja", "日本語"],
      ["en", "English"]
    ]);
  });

  it("renders the same native language names when the current UI language is English", () => {
    expect(extractLanguageOptions(renderSettingsPanel("en"))).toEqual([
      ["ja", "日本語"],
      ["en", "English"]
    ]);
  });
});

describe("SettingsPanel application settings core controls (#195)", () => {
  it("renders the Application Settings title, description, and section headings", () => {
    const markup = renderSettingsPanel("ja");

    expect(markup).toContain("アプリケーション設定");
    expect(markup).toContain("Pergamum のアプリケーション全体に適用される設定です。");
    expect(markup).toContain("一般");
    expect(markup).toContain("外観");
    expect(markup).toContain("エディタ");
    expect(markup).toContain("コマンドパレット");
    expect(markup).toContain("サウンド");
    expect(markup).toContain("ファイル");
  });

  it("renders core setting controls for language, status bar, UI font, editor font, sound, command palette, line ending, and encoding", () => {
    const element = settingsPanelElement("en");

    expect(elementById(element, "applicationSettingsLanguage").type).toBe(
      "select"
    );
    expect(elementById(element, "applicationSettingsStatusBar").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsUiFont").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsEditorFont").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsSoundEnabled").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsDialogSound").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsNewlineSound").type).toBe(
      "input"
    );
    expect(elementById(element, "applicationSettingsKeypressSound").type).toBe(
      "input"
    );
    expect(
      elementById(element, "applicationSettingsCommandPaletteDescriptionEnabled")
        .type
    ).toBe("input");
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
      ).type
    ).toBe("input");
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
      ).type
    ).toBe("input");
    expect(elementById(element, "applicationSettingsLineEnding").type).toBe(
      "select"
    );
    expect(elementById(element, "applicationSettingsEncoding").type).toBe(
      "select"
    );
  });

  it("renders Command Palette controls with catalog-backed defaults and units", () => {
    const element = settingsPanelElement("en");
    const markup = renderSettingsPanel("en");

    expect(
      elementById(element, "applicationSettingsCommandPaletteDescriptionEnabled")
        .props.checked
    ).toBe(true);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
      ).props.value
    ).toBe(2000);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
      ).props.value
    ).toBe(40);
    expect(markup).toContain("ms");
    expect(markup).toContain("px/sec");
  });

  it("disables the advanced files and Command Palette controls until advanced settings are enabled", () => {
    const element = settingsPanelElement("en");

    expect(elementById(element, "applicationSettingsLineEnding").props.disabled).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsEncoding").props.disabled).toBe(
      true
    );
    expect(
      elementById(element, "applicationSettingsCommandPaletteDescriptionEnabled")
        .props.disabled
    ).toBe(true);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
      ).props.disabled
    ).toBe(true);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
      ).props.disabled
    ).toBe(true);
  });

  it("enables the advanced files and Command Palette controls when advanced settings are enabled", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        advancedSettings: { enabled: true }
      }
    };
    const element = settingsPanelElement("en", settings);

    expect(elementById(element, "applicationSettingsLineEnding").props.disabled).toBe(
      false
    );
    expect(elementById(element, "applicationSettingsEncoding").props.disabled).toBe(
      false
    );
    expect(
      elementById(element, "applicationSettingsCommandPaletteDescriptionEnabled")
        .props.disabled
    ).toBe(false);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
      ).props.disabled
    ).toBe(false);
    expect(
      elementById(
        element,
        "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
      ).props.disabled
    ).toBe(false);
  });

  it("saves Command Palette description settings without discarding other application settings", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        advancedSettings: { enabled: true }
      }
    };
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      settings,
      () => Promise.resolve(true),
      onChangeSettings
    );
    const descriptionEnabled = elementById(
      element,
      "applicationSettingsCommandPaletteDescriptionEnabled"
    );
    const marqueeDelay = elementById(
      element,
      "applicationSettingsCommandPaletteDescriptionMarqueeDelay"
    );
    const marqueeSpeed = elementById(
      element,
      "applicationSettingsCommandPaletteDescriptionMarqueeSpeed"
    );

    (
      descriptionEnabled.props.onChange as (event: {
        target: { checked: boolean };
      }) => void
    )({ target: { checked: false } });
    (
      marqueeDelay.props.onChange as (event: {
        target: { valueAsNumber: number };
      }) => void
    )({ target: { valueAsNumber: 2500 } });
    (
      marqueeSpeed.props.onChange as (event: {
        target: { valueAsNumber: number };
      }) => void
    )({ target: { valueAsNumber: 64 } });

    expect(onChangeSettings).toHaveBeenNthCalledWith(1, {
      workbench: settings.workbench,
      commandPalette: {
        description: {
          ...settings.commandPalette.description,
          enable: false
        }
      },
      editor: settings.editor,
      files: settings.files
    });
    expect(onChangeSettings).toHaveBeenNthCalledWith(2, {
      workbench: settings.workbench,
      commandPalette: {
        description: {
          ...settings.commandPalette.description,
          marquee: {
            ...settings.commandPalette.description.marquee,
            delay: 2500
          }
        }
      },
      editor: settings.editor,
      files: settings.files
    });
    expect(onChangeSettings).toHaveBeenNthCalledWith(3, {
      workbench: settings.workbench,
      commandPalette: {
        description: {
          ...settings.commandPalette.description,
          marquee: {
            ...settings.commandPalette.description.marquee,
            speed: 64
          }
        }
      },
      editor: settings.editor,
      files: settings.files
    });
  });

  it("renders sound feedback controls with the catalog-backed default states", () => {
    const element = settingsPanelElement("en");

    expect(elementById(element, "applicationSettingsSoundEnabled").props.checked).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsDialogSound").props.checked).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsNewlineSound").props.checked).toBe(
      false
    );
    expect(elementById(element, "applicationSettingsKeypressSound").props.checked).toBe(
      false
    );
  });

  it("disables child sound controls when the global sound feedback setting is off while keeping their stored values visible", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        sound: {
          enabled: false,
          dialog: { enabled: true },
          newline: { enabled: true },
          keypress: { enabled: false }
        }
      }
    };
    const element = settingsPanelElement("en", settings);

    expect(elementById(element, "applicationSettingsDialogSound").props.disabled).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsNewlineSound").props.disabled).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsKeypressSound").props.disabled).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsDialogSound").props.checked).toBe(
      true
    );
    expect(elementById(element, "applicationSettingsNewlineSound").props.checked).toBe(
      true
    );
  });

  it("saves the parent sound toggle without discarding child sound settings", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        sound: {
          enabled: true,
          dialog: { enabled: false },
          newline: { enabled: true },
          keypress: { enabled: false }
        }
      }
    };
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      settings,
      () => Promise.resolve(true),
      onChangeSettings
    );
    const soundEnabled = elementById(element, "applicationSettingsSoundEnabled");
    const onChange = soundEnabled.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: false } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      workbench: {
        ...settings.workbench,
        sound: {
          enabled: false,
          dialog: { enabled: false },
          newline: { enabled: true },
          keypress: { enabled: false }
        }
      },
      commandPalette: settings.commandPalette,
      editor: settings.editor,
      files: settings.files
    });
  });

  it("saves each child sound toggle independently when sound feedback is enabled", () => {
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      defaultApplicationSettings,
      () => Promise.resolve(true),
      onChangeSettings
    );
    const keypressSound = elementById(
      element,
      "applicationSettingsKeypressSound"
    );
    const onChange = keypressSound.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: true } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      workbench: {
        ...defaultApplicationSettings.workbench,
        sound: {
          ...defaultApplicationSettings.workbench.sound,
          keypress: { enabled: true }
        }
      },
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: defaultApplicationSettings.editor,
      files: defaultApplicationSettings.files
    });
  });

  it("asks for binary confirmation before enabling advanced settings and only saves when confirmed", async () => {
    const onConfirmEnableAdvancedSettings = vi.fn().mockResolvedValue(false);
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      defaultApplicationSettings,
      onConfirmEnableAdvancedSettings,
      onChangeSettings
    );
    const checkbox = collectElements(
      element,
      (child) =>
        child.type === "input" &&
        child.props.type === "checkbox" &&
        child.props.checked === false
    )[0];

    expect(checkbox).toBeDefined();

    const onChange = checkbox.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: true } });
    await flushPromises();

    expect(onConfirmEnableAdvancedSettings).toHaveBeenCalledTimes(1);
    expect(onChangeSettings).not.toHaveBeenCalled();

    onConfirmEnableAdvancedSettings.mockResolvedValue(true);
    onChange({ target: { checked: true } });
    await flushPromises();

    expect(onChangeSettings).toHaveBeenCalledTimes(1);
    expect(onChangeSettings).toHaveBeenCalledWith({
      workbench: {
        ...defaultApplicationSettings.workbench,
        advancedSettings: { enabled: true }
      },
      commandPalette: defaultApplicationSettings.commandPalette,
      editor: defaultApplicationSettings.editor,
      files: defaultApplicationSettings.files
    });
  });

  it("does not enable advanced settings while the enable confirmation remains pending, matching backdrop-click no-op behavior", async () => {
    const onConfirmEnableAdvancedSettings = vi.fn(
      () => new Promise<boolean>(() => undefined)
    );
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      defaultApplicationSettings,
      onConfirmEnableAdvancedSettings,
      onChangeSettings
    );
    const checkbox = collectElements(
      element,
      (child) =>
        child.type === "input" &&
        child.props.type === "checkbox" &&
        child.props.checked === false
    )[0];

    expect(checkbox).toBeDefined();

    const onChange = checkbox.props.onChange as (event: {
      target: { checked: boolean };
    }) => void;

    onChange({ target: { checked: true } });
    await flushPromises();

    expect(onConfirmEnableAdvancedSettings).toHaveBeenCalledTimes(1);
    expect(onChangeSettings).not.toHaveBeenCalled();
    expect(checkbox.props.checked).toBe(false);
  });

  it("clears optional font settings by omitting fontFamily instead of sending undefined", () => {
    const settings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        fontFamily: "Inter"
      },
      editor: { fontFamily: "Fira Code" }
    };
    const onChangeSettings = vi.fn();
    const element = settingsPanelElement(
      "en",
      settings,
      () => Promise.resolve(true),
      onChangeSettings
    );

    const uiFont = elementById(element, "applicationSettingsUiFont");
    const onChange = uiFont.props.onChange as (event: {
      target: { value: string };
    }) => void;

    onChange({ target: { value: "   " } });

    expect(onChangeSettings).toHaveBeenCalledWith({
      workbench: {
        language: settings.workbench.language,
        statusBar: settings.workbench.statusBar,
        advancedSettings: settings.workbench.advancedSettings,
        sound: settings.workbench.sound
      },
      commandPalette: settings.commandPalette,
      editor: settings.editor,
      files: settings.files
    });
  });
});
