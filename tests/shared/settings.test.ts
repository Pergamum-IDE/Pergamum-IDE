import { describe, expect, it } from "vitest";
import {
  builtInDefaultSettings,
  createDefaultApplicationSettings,
  defaultApplicationSettings,
  defaultNotificationDurationMs,
  defaultNotificationOutputEnabled,
  defaultPreviewRenderer,
  isPreviewRendererId,
  resolveEffectiveSettings,
  type ApplicationSettings
} from "../../src/shared/settings";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

describe("existing implementation alignment: preview.renderer (#150)", () => {
  it("defaultPreviewRenderer equals the catalog default, not a separately hardcoded literal", () => {
    expect(defaultPreviewRenderer).toBe(
      getCatalogDefaultValue("preview.renderer")
    );
  });

  it("isPreviewRendererId agrees with the catalog's own validation for both valid and invalid values", () => {
    expect(isPreviewRendererId("markdown")).toBe(true);
    expect(isPreviewRendererId("html")).toBe(false);
    expect(isPreviewRendererId(1)).toBe(false);
    expect(isPreviewRendererId(undefined)).toBe(false);
  });

  it("builtInDefaultSettings / defaultApplicationSettings / createDefaultApplicationSettings all derive from the same catalog-backed default", () => {
    const catalogDefault = getCatalogDefaultValue("preview.renderer");

    expect(builtInDefaultSettings.preview.renderer).toBe(catalogDefault);
    expect(defaultApplicationSettings.preview.renderer).toBe(catalogDefault);
    expect(createDefaultApplicationSettings().preview.renderer).toBe(
      catalogDefault
    );
  });

  it("resolveEffectiveSettings's preview.renderer falls back through application settings and ultimately the catalog default — its merge order (Project > Application > Default) is unchanged by #150", () => {
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).preview
        .renderer
    ).toBe("markdown");
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, null).preview
        .renderer
    ).toBe("markdown");
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, {}).preview
        .renderer
    ).toBe("markdown");
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, {
        preview: { renderer: "markdown" }
      }).preview.renderer
    ).toBe("markdown");
  });
});

describe("preview.updateDelayMs wiring (#250 follow-up)", () => {
  it("builtInDefaultSettings / defaultApplicationSettings / createDefaultApplicationSettings all derive from the same catalog-backed default", () => {
    const catalogDefault = getCatalogDefaultValue("preview.updateDelayMs");

    expect(catalogDefault).toBe(10000);
    expect(builtInDefaultSettings.preview.updateDelayMs).toBe(catalogDefault);
    expect(defaultApplicationSettings.preview.updateDelayMs).toBe(
      catalogDefault
    );
    expect(createDefaultApplicationSettings().preview.updateDelayMs).toBe(
      catalogDefault
    );
  });

  it("resolveEffectiveSettings passes updateDelayMs straight through from application settings — applicationOnly scope, no project override", () => {
    expect(
      resolveEffectiveSettings(
        { ...defaultApplicationSettings, preview: { renderer: "markdown", updateDelayMs: 800 } },
        undefined
      ).preview.updateDelayMs
    ).toBe(800);

    // A ProjectSettings.preview shape has no updateDelayMs field at all
    // (unlike renderer) — passing one through anyway must not change the
    // resolved value, since this setting has no project scope in the chain.
    expect(
      resolveEffectiveSettings(
        { ...defaultApplicationSettings, preview: { renderer: "markdown", updateDelayMs: 800 } },
        { preview: { renderer: "markdown" } }
      ).preview.updateDelayMs
    ).toBe(800);
  });

  it("0 is a valid effective value — no fallback kicks in for the explicit 'don't wait' choice", () => {
    expect(
      resolveEffectiveSettings(
        { ...defaultApplicationSettings, preview: { renderer: "markdown", updateDelayMs: 0 } },
        undefined
      ).preview.updateDelayMs
    ).toBe(0);
  });
});

describe("workbench.fontFamily wiring (#173)", () => {
  it("builtInDefaultSettings.workbench.fontFamily derives from the catalog default", () => {
    expect(builtInDefaultSettings.workbench.fontFamily).toBe(
      getCatalogDefaultValue("workbench.fontFamily")
    );
  });

  it("defaultApplicationSettings / createDefaultApplicationSettings leave workbench.fontFamily unset (sparse baseline, #173 D-7)", () => {
    expect(defaultApplicationSettings.workbench.fontFamily).toBeUndefined();
    expect(
      createDefaultApplicationSettings().workbench.fontFamily
    ).toBeUndefined();
  });

  it("resolveEffectiveSettings falls through to the catalog default when applicationSettings.workbench.fontFamily is absent", () => {
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).workbench
        .fontFamily
    ).toBe(getCatalogDefaultValue("workbench.fontFamily"));
  });

  it("resolveEffectiveSettings passes through a valid non-default applicationSettings.workbench.fontFamily override", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: { ...defaultApplicationSettings.workbench, fontFamily: "Fira Code" }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).workbench
        .fontFamily
    ).toBe("Fira Code");
    expect(applicationSettings.workbench.fontFamily).not.toBe(
      getCatalogDefaultValue("workbench.fontFamily")
    );
  });

  it("workbench.fontFamily has no project-scope fallthrough — projectSettings does not carry a workbench key at all", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: { ...defaultApplicationSettings.workbench, fontFamily: "Fira Code" }
    };

    // ProjectSettings is typed without a `workbench` field (#173 does not
    // enable a project override), so the effective value can only ever come
    // from application scope or the catalog default here.
    expect(
      resolveEffectiveSettings(applicationSettings, {}).workbench.fontFamily
    ).toBe("Fira Code");
  });
});

describe("Application Settings core defaults and effective settings (#195)", () => {
  it("no longer has a workbench.advancedSettings field on any settings shape (#232: legacy Advanced Settings gate removed)", () => {
    expect(builtInDefaultSettings.workbench).not.toHaveProperty(
      "advancedSettings"
    );
    expect(defaultApplicationSettings.workbench).not.toHaveProperty(
      "advancedSettings"
    );
    expect(
      createDefaultApplicationSettings().workbench
    ).not.toHaveProperty("advancedSettings");
  });

  it("editor.fontFamily falls through to the catalog default when application settings omit it", () => {
    expect(defaultApplicationSettings.editor.fontFamily).toBeUndefined();
    expect(createDefaultApplicationSettings().editor.fontFamily).toBeUndefined();
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).editor
        .fontFamily
    ).toBe(getCatalogDefaultValue("editor.fontFamily"));
  });

  it("commandPalette.footerDetail defaults derive from the catalog and are concrete application settings", () => {
    const expected = {
      enable: getCatalogDefaultValue("commandPalette.footerDetail.enable"),
      marquee: {
        delay: getCatalogDefaultValue(
          "commandPalette.footerDetail.marquee.delay"
        ),
        speed: getCatalogDefaultValue(
          "commandPalette.footerDetail.marquee.speed"
        )
      }
    };

    expect(builtInDefaultSettings.commandPalette.footerDetail).toEqual(expected);
    expect(defaultApplicationSettings.commandPalette.footerDetail).toEqual(
      expected
    );
    expect(createDefaultApplicationSettings().commandPalette.footerDetail).toEqual(
      expected
    );
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined)
        .commandPalette.footerDetail
    ).toEqual(expected);
    expect(builtInDefaultSettings.commandPalette).not.toHaveProperty(
      "description"
    );
    expect(defaultApplicationSettings.commandPalette).not.toHaveProperty(
      "description"
    );
  });

  it("resolveEffectiveSettings passes through a valid editor.fontFamily application override", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: { ...defaultApplicationSettings.editor, fontFamily: "Fira Code" }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).editor.fontFamily
    ).toBe("Fira Code");
  });

  it("files.newFile defaults derive from the catalog and are concrete application settings", () => {
    const defaults = createDefaultApplicationSettings();

    expect(defaults.files.newFile.lineEnding).toBe(
      getCatalogDefaultValue("files.newFile.lineEnding")
    );
    expect(defaults.files.newFile.encoding).toBe(
      getCatalogDefaultValue("files.newFile.encoding")
    );
    expect(
      resolveEffectiveSettings(defaults, undefined).files.newFile
    ).toEqual(defaults.files.newFile);
  });

  it("paragraph indent defaults derive from the catalog and are concrete application settings", () => {
    const expected = {
      excludeLeadingCharacters: getCatalogDefaultValue(
        "editor.paragraphIndent.excludeLeadingCharacters"
      )
    };

    expect(builtInDefaultSettings.editor.paragraphIndent).toEqual(expected);
    expect(defaultApplicationSettings.editor.paragraphIndent).toEqual(expected);
    expect(createDefaultApplicationSettings().editor.paragraphIndent).toEqual(
      expected
    );
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).editor
        .paragraphIndent
    ).toEqual(expected);
  });

  it("editor.whitespace defaults derive from the catalog and pass through effective settings (#256 plumbing)", () => {
    const expected = {
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
    };

    expect(builtInDefaultSettings.editor.whitespace).toEqual(expected);
    expect(defaultApplicationSettings.editor.whitespace).toEqual(expected);
    expect(createDefaultApplicationSettings().editor.whitespace).toEqual(
      expected
    );
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).editor
        .whitespace
    ).toEqual(expected);
  });

  it("resolveEffectiveSettings passes through editor.whitespace runtime changes without a project override (#256 plumbing)", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: {
        ...defaultApplicationSettings.editor,
        whitespace: {
          renderIdeographicSpace: false,
          renderAsciiSpace: true,
          renderTab: true,
          renderOtherUnicodeSpace: false
        }
      }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, {}).editor.whitespace
    ).toEqual(applicationSettings.editor.whitespace);
  });

  it("does not add Project Settings shape for #195 Application Settings controls", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      editor: { ...defaultApplicationSettings.editor, fontFamily: "Fira Code" },
      files: { newFile: { lineEnding: "crlf", encoding: "utf8" } }
    };
    const effective = resolveEffectiveSettings(applicationSettings, {});

    expect(effective.editor.fontFamily).toBe("Fira Code");
    expect(effective.files.newFile).toEqual({
      lineEnding: "crlf",
      encoding: "utf8"
    });
  });

  it("editor.characterCount defaults derive from the catalog and pass through effective settings (#259)", () => {
    const expected = {
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
    };

    expect(builtInDefaultSettings.editor.characterCount).toEqual(expected);
    expect(defaultApplicationSettings.editor.characterCount).toEqual(expected);
    expect(createDefaultApplicationSettings().editor.characterCount).toEqual(
      expected
    );
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).editor
        .characterCount
    ).toEqual(expected);
  });
});

describe("Application Settings sound feedback defaults and effective settings (#200)", () => {
  it("workbench.sound defaults derive from the catalog and are concrete, not sparse", () => {
    expect(builtInDefaultSettings.workbench.sound).toEqual({
      enabled: getCatalogDefaultValue("workbench.sound.enabled"),
      dialog: {
        enabled: getCatalogDefaultValue("workbench.sound.dialog.enabled")
      },
      newline: {
        enabled: getCatalogDefaultValue("workbench.sound.newline.enabled")
      },
      keypress: {
        enabled: getCatalogDefaultValue("workbench.sound.keypress.enabled")
      }
    });
    expect(defaultApplicationSettings.workbench.sound).toEqual(
      builtInDefaultSettings.workbench.sound
    );
    expect(createDefaultApplicationSettings().workbench.sound).toEqual(
      builtInDefaultSettings.workbench.sound
    );
  });

  it("resolveEffectiveSettings passes application workbench.sound through without adding a project override", () => {
    const applicationSettings: ApplicationSettings = {
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

    expect(
      resolveEffectiveSettings(applicationSettings, {}).workbench.sound
    ).toEqual(applicationSettings.workbench.sound);
  });
});

describe("workbench.language / workbench.statusBar.visible wiring (#174)", () => {
  it("builtInDefaultSettings.workbench.language derives from the catalog default", () => {
    expect(builtInDefaultSettings.workbench.language).toBe(
      getCatalogDefaultValue("workbench.language")
    );
  });

  it("builtInDefaultSettings.workbench.statusBar.visible derives from the catalog default", () => {
    expect(builtInDefaultSettings.workbench.statusBar.visible).toBe(
      getCatalogDefaultValue("workbench.statusBar.visible")
    );
    expect(
      builtInDefaultSettings.workbench.statusBar.characterCount.visible
    ).toBe(getCatalogDefaultValue("workbench.statusBar.characterCount.visible"));
  });

  it("defaultApplicationSettings / createDefaultApplicationSettings carry a concrete workbench.language and workbench.statusBar.visible (not sparse, unlike fontFamily)", () => {
    const languageDefault = getCatalogDefaultValue("workbench.language");
    const statusBarVisibleDefault = getCatalogDefaultValue(
      "workbench.statusBar.visible"
    );
    const characterCountVisibleDefault = getCatalogDefaultValue(
      "workbench.statusBar.characterCount.visible"
    );

    expect(defaultApplicationSettings.workbench.language).toBe(languageDefault);
    expect(defaultApplicationSettings.workbench.statusBar.visible).toBe(
      statusBarVisibleDefault
    );
    expect(
      defaultApplicationSettings.workbench.statusBar.characterCount.visible
    ).toBe(characterCountVisibleDefault);
    expect(createDefaultApplicationSettings().workbench.language).toBe(
      languageDefault
    );
    expect(
      createDefaultApplicationSettings().workbench.statusBar.visible
    ).toBe(statusBarVisibleDefault);
    expect(
      createDefaultApplicationSettings().workbench.statusBar.characterCount
        .visible
    ).toBe(characterCountVisibleDefault);
  });

  it("resolveEffectiveSettings passes applicationSettings.workbench.language straight through", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: { ...defaultApplicationSettings.workbench, language: "en" }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).workbench
        .language
    ).toBe("en");
  });

  it("resolveEffectiveSettings passes applicationSettings.workbench.statusBar.visible straight through", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        statusBar: {
          ...defaultApplicationSettings.workbench.statusBar,
          visible: false
        }
      }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).workbench
        .statusBar.visible
    ).toBe(false);
  });

  it("workbench.language / workbench.statusBar.visible have no project-scope fallthrough — projectSettings does not carry a workbench key at all", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        language: "en",
        statusBar: {
          ...defaultApplicationSettings.workbench.statusBar,
          visible: false
        }
      }
    };
    const effective = resolveEffectiveSettings(applicationSettings, {});

    expect(effective.workbench.language).toBe("en");
    expect(effective.workbench.statusBar.visible).toBe(false);
  });
});

describe("workbench.notification.durationMs wiring (#266)", () => {
  it("defaultNotificationDurationMs is the catalog default (10000 ms)", () => {
    expect(defaultNotificationDurationMs).toBe(
      getCatalogDefaultValue("workbench.notification.durationMs")
    );
    expect(defaultNotificationDurationMs).toBe(10000);
  });

  it("builtInDefaultSettings.workbench.notification.durationMs derives from the catalog default", () => {
    expect(
      builtInDefaultSettings.workbench.notification.durationMs
    ).toBe(
      getCatalogDefaultValue("workbench.notification.durationMs")
    );
  });

  it("defaultApplicationSettings / createDefaultApplicationSettings leave workbench.notification unset (sparse, like fontFamily)", () => {
    expect(defaultApplicationSettings.workbench.notification).toBeUndefined();
    expect(
      createDefaultApplicationSettings().workbench.notification
    ).toBeUndefined();
  });

  it("resolveEffectiveSettings falls through to the catalog default (10000 ms) when workbench.notification is absent", () => {
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined).workbench
        .notification.durationMs
    ).toBe(10000);
  });

  it("resolveEffectiveSettings passes through a valid custom millisecond duration", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        notification: { durationMs: 30000 }
      }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).workbench
        .notification.durationMs
    ).toBe(30000);
  });

  it("workbench.notification has no project-scope fallthrough — applicationOnly", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        notification: { durationMs: 30000 }
      }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, {}).workbench.notification
        .durationMs
    ).toBe(30000);
  });

  it("0 remains a valid effective base value — no fallback to the default", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      workbench: {
        ...defaultApplicationSettings.workbench,
        notification: { durationMs: 0 }
      }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, undefined).workbench
        .notification.durationMs
    ).toBe(0);
  });
});

describe("notification.output.enabled wiring (#298)", () => {
  it("defaultNotificationOutputEnabled is the catalog default (true)", () => {
    expect(defaultNotificationOutputEnabled).toBe(
      getCatalogDefaultValue("notification.output.enabled")
    );
    expect(defaultNotificationOutputEnabled).toBe(true);
  });

  it("builtInDefaultSettings.notification.output.enabled derives from the catalog default", () => {
    expect(builtInDefaultSettings.notification.output.enabled).toBe(
      getCatalogDefaultValue("notification.output.enabled")
    );
  });

  it("defaultApplicationSettings / createDefaultApplicationSettings leave notification unset (sparse, like workbench.notification)", () => {
    expect(defaultApplicationSettings.notification).toBeUndefined();
    expect(createDefaultApplicationSettings().notification).toBeUndefined();
  });

  it("resolveEffectiveSettings falls through to the catalog default when notification.output.enabled is absent", () => {
    expect(
      resolveEffectiveSettings(defaultApplicationSettings, undefined)
        .notification.output.enabled
    ).toBe(true);
  });

  it("resolveEffectiveSettings passes through false without affecting status bar settings", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      notification: { output: { enabled: false } }
    };
    const effective = resolveEffectiveSettings(applicationSettings, undefined);

    expect(effective.notification.output.enabled).toBe(false);
    expect(effective.workbench.statusBar.visible).toBe(
      defaultApplicationSettings.workbench.statusBar.visible
    );
  });

  it("notification.output has no project-scope fallthrough — applicationOnly", () => {
    const applicationSettings: ApplicationSettings = {
      ...defaultApplicationSettings,
      notification: { output: { enabled: false } }
    };

    expect(
      resolveEffectiveSettings(applicationSettings, {}).notification.output
        .enabled
    ).toBe(false);
  });
});
