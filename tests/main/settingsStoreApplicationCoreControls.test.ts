import { beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  getPath: vi.fn(() => "C:\\fake-userData")
}));

const fsMock = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn()
}));

vi.mock("electron", () => ({
  app: {
    getPath: electronMock.getPath
  }
}));

vi.mock("node:fs", () => ({
  promises: fsMock
}));

import {
  loadSettings,
  parseSaveApplicationSettingsRequest,
  saveApplicationSettings
} from "../../src/main/settingsStore";
import type { SaveApplicationSettingsRequest } from "../../src/shared/settings";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

// #252/#257: editor.lineEnding.* and editor.paragraphIndent.* are
// always-resolved (non-sparse), unlike fontFamily — every save request's
// `editor` must carry them.
const defaultLineEndingSettings = {
  expected: getCatalogDefaultValue("editor.lineEnding.expected"),
  markerGlyph: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
};

const defaultWhitespaceSettings = {
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

const defaultParagraphIndentSettings = {
  excludeLeadingCharacters: getCatalogDefaultValue(
    "editor.paragraphIndent.excludeLeadingCharacters"
  )
};

const defaultCharacterCountSettings = {
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

const defaultStatusBarSettings = {
  visible: getCatalogDefaultValue("workbench.statusBar.visible"),
  characterCount: {
    visible: getCatalogDefaultValue(
      "workbench.statusBar.characterCount.visible"
    )
  }
};

const defaultSoundSettings = {
  enabled: true,
  dialog: { enabled: true },
  newline: { enabled: false },
  keypress: { enabled: false }
};
const recentProject = {
  projectId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  projectName: "proj",
  projectFilePath: "C:\\proj\\proj.pergamum",
  projectRootPath: "C:\\proj",
  schemaVersion: 1,
  lastOpenedAt: "2026-08-23T00:00:00.000Z"
};

function onDiskSettings(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    preview: { renderer: "markdown", updateDelayMs: 10000 },
    workbench: {
      language: "ja",
      statusBar: { visible: true },
      sound: defaultSoundSettings
    },
    commandPalette: {
      description: {
        enable: true,
        marquee: { delay: 2000, speed: 40 }
      }
    },
    editor: {},
    files: {
      newFile: {
        lineEnding: "lf",
        encoding: "utf8"
      }
    },
    recentProjects: [],
    ...overrides
  });
}

function validSaveRequest(
  overrides: Partial<SaveApplicationSettingsRequest> = {}
): SaveApplicationSettingsRequest {
  return {
    preview: { renderer: "markdown", updateDelayMs: 10000 },
    workbench: {
      language: "ja",
      statusBar: defaultStatusBarSettings,
      sound: defaultSoundSettings
    },
    commandPalette: {
      description: {
        enable: true,
        marquee: { delay: 2000, speed: 40 }
      }
    },
    editor: {
      lineEnding: defaultLineEndingSettings,
      whitespace: defaultWhitespaceSettings,
      paragraphIndent: defaultParagraphIndentSettings,
      characterCount: defaultCharacterCountSettings
    },
    files: {
      newFile: {
        lineEnding: "lf",
        encoding: "utf8"
      }
    },
    ...overrides
  };
}

describe("settingsStore Application Settings core controls read path (#195)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("loads catalog-backed defaults when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.workbench).not.toHaveProperty("advancedSettings");
    expect(settings.workbench.statusBar).toEqual(defaultStatusBarSettings);
    expect(settings.editor.whitespace).toEqual(defaultWhitespaceSettings);
    expect(settings.editor.characterCount).toEqual(
      defaultCharacterCountSettings
    );
    expect(settings.editor.fontFamily).toBeUndefined();
    expect(settings.files.newFile).toEqual({
      lineEnding: getCatalogDefaultValue("files.newFile.lineEnding"),
      encoding: getCatalogDefaultValue("files.newFile.encoding")
    });
    expect(settings.commandPalette.description).toEqual({
      enable: getCatalogDefaultValue("commandPalette.description.enable"),
      marquee: {
        delay: getCatalogDefaultValue(
          "commandPalette.description.marquee.delay"
        ),
        speed: getCatalogDefaultValue(
          "commandPalette.description.marquee.speed"
        )
      }
    });
    expect(settings.preview).toEqual({
      renderer: getCatalogDefaultValue("preview.renderer"),
      updateDelayMs: getCatalogDefaultValue("preview.updateDelayMs")
    });
  });

  it("reads valid editor font, line ending, and encoding values", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          sound: {
            enabled: false,
            dialog: { enabled: true },
            newline: { enabled: true },
            keypress: { enabled: false }
          }
        },
        editor: {
          fontFamily: "Fira Code",
          whitespace: {
            renderIdeographicSpace: false,
            renderAsciiSpace: true,
            renderTab: true,
            renderOtherUnicodeSpace: false
          },
          paragraphIndent: { excludeLeadingCharacters: "「『（" }
        },
        files: {
          newFile: {
            lineEnding: "crlf",
            encoding: "utf8"
          }
        },
        commandPalette: {
          description: {
            enable: false,
            marquee: { delay: 3000, speed: 80 }
          }
        }
      })
    );

    const settings = await loadSettings();

    expect(settings.workbench).not.toHaveProperty("advancedSettings");
    expect(settings.workbench.sound).toEqual({
      enabled: false,
      dialog: { enabled: true },
      newline: { enabled: true },
      keypress: { enabled: false }
    });
    expect(settings.editor.fontFamily).toBe("Fira Code");
    expect(settings.editor.whitespace).toEqual({
      renderIdeographicSpace: false,
      renderAsciiSpace: true,
      renderTab: true,
      renderOtherUnicodeSpace: false
    });
    expect(settings.editor.paragraphIndent).toEqual({
      excludeLeadingCharacters: "「『（"
    });
    expect(settings.files.newFile).toEqual({
      lineEnding: "crlf",
      encoding: "utf8"
    });
    expect(settings.commandPalette.description).toEqual({
      enable: false,
      marquee: { delay: 3000, speed: 80 }
    });
  });

  it("falls back or omits invalid values without failing startup", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          sound: {
            enabled: "yes",
            dialog: { enabled: "yes" },
            newline: { enabled: "yes" },
            keypress: { enabled: "yes" }
          }
        },
        editor: {
          fontFamily: 'Fira Code"; color: red',
          whitespace: {
            renderIdeographicSpace: "yes",
            renderAsciiSpace: "yes",
            renderTab: "yes",
            renderOtherUnicodeSpace: "yes"
          },
          paragraphIndent: { excludeLeadingCharacters: 42 }
        },
        files: {
          newFile: {
            lineEnding: "cr",
            encoding: "shift_jis"
          }
        },
        commandPalette: {
          description: {
            enable: "yes",
            marquee: { delay: -1, speed: 0 }
          }
        }
      })
    );

    const settings = await loadSettings();

    expect(settings.workbench).not.toHaveProperty("advancedSettings");
    expect(settings.workbench.sound).toEqual(defaultSoundSettings);
    expect(settings.editor.fontFamily).toBeUndefined();
    expect(settings.editor.whitespace).toEqual(defaultWhitespaceSettings);
    expect(settings.editor.paragraphIndent).toEqual(
      defaultParagraphIndentSettings
    );
    expect(settings.files.newFile).toEqual({
      lineEnding: "lf",
      encoding: "utf8"
    });
    expect(settings.commandPalette.description).toEqual({
      enable: true,
      marquee: { delay: 2000, speed: 40 }
    });
  });

  it("falls back Command Palette marquee values that violate range or integer validation", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: 1.5, speed: 1000.1 }
          }
        }
      })
    );

    const settings = await loadSettings();

    expect(settings.commandPalette.description).toEqual({
      enable: true,
      marquee: { delay: 2000, speed: 40 }
    });
  });

  it("tolerates an obsolete workbench.advancedSettings field left over from an older build without failing to load (#232)", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          advancedSettings: { enabled: true },
          sound: defaultSoundSettings
        }
      })
    );

    const settings = await loadSettings();

    expect(settings.workbench.language).toBe("ja");
    expect(settings.workbench.statusBar).toEqual(defaultStatusBarSettings);
    expect(settings.workbench.sound).toEqual(defaultSoundSettings);
    expect(settings.workbench).not.toHaveProperty("advancedSettings");
  });
});

describe("settingsStore Application Settings core controls write path (#195)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("writes preview/workbench/commandPalette/editor/files settings from the request, while preserving only recent projects from disk (#250 follow-up: preview is now write-through, not preserved)", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        recentProjects: [recentProject],
        commandPalette: {
          description: {
            enable: false,
            marquee: { delay: 3000, speed: 80 }
          }
        }
      })
    );

    await saveApplicationSettings(
      validSaveRequest({
        workbench: {
          language: "en",
          statusBar: {
            ...defaultStatusBarSettings,
            visible: false
          },
          sound: {
            enabled: false,
            dialog: { enabled: false },
            newline: { enabled: true },
            keypress: { enabled: true }
          },
          fontFamily: "Inter"
        },
        editor: {
          fontFamily: "Fira Code",
          lineEnding: defaultLineEndingSettings,
          whitespace: {
            renderIdeographicSpace: false,
            renderAsciiSpace: true,
            renderTab: true,
            renderOtherUnicodeSpace: false
          },
          paragraphIndent: { excludeLeadingCharacters: "「『" },
          characterCount: {
            exclude: {
              ...defaultCharacterCountSettings.exclude,
              headings: true
            }
          }
        },
        commandPalette: {
          description: {
            enable: false,
            marquee: { delay: 3000, speed: 80 }
          }
        },
        files: {
          newFile: {
            lineEnding: "crlf",
            encoding: "utf8"
          }
        }
      })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.preview).toEqual({
      renderer: "markdown",
      updateDelayMs: 10000
    });
    expect(written.recentProjects).toEqual([recentProject]);
    expect(written.commandPalette).toEqual({
      description: {
        enable: false,
        marquee: { delay: 3000, speed: 80 }
      }
    });
    expect(written.workbench).toEqual({
      language: "en",
      statusBar: {
        ...defaultStatusBarSettings,
        visible: false
      },
      sound: {
        enabled: false,
        dialog: { enabled: false },
        newline: { enabled: true },
        keypress: { enabled: true }
      },
      fontFamily: "Inter"
    });
    expect(written.editor).toEqual({
      fontFamily: "Fira Code",
      lineEnding: defaultLineEndingSettings,
      whitespace: {
        renderIdeographicSpace: false,
        renderAsciiSpace: true,
        renderTab: true,
        renderOtherUnicodeSpace: false
      },
      paragraphIndent: { excludeLeadingCharacters: "「『" },
      characterCount: {
        exclude: {
          ...defaultCharacterCountSettings.exclude,
          headings: true
        }
      }
    });
    expect(written.files).toEqual({
      newFile: {
        lineEnding: "crlf",
        encoding: "utf8"
      }
    });
  });

  it("writes a changed preview.updateDelayMs to settings.json (#250 follow-up: the user setting is genuinely persisted, not silently dropped)", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ preview: { renderer: "markdown", updateDelayMs: 10000 } })
    );

    await saveApplicationSettings(
      validSaveRequest({
        preview: { renderer: "markdown", updateDelayMs: 10000 }
      })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.preview).toEqual({
      renderer: "markdown",
      updateDelayMs: 10000
    });
  });

  it("writes preview.updateDelayMs of 0 (explicit 'don't wait') to settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ preview: { renderer: "markdown", updateDelayMs: 10000 } })
    );

    await saveApplicationSettings(
      validSaveRequest({
        preview: { renderer: "markdown", updateDelayMs: 0 }
      })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.preview).toEqual({ renderer: "markdown", updateDelayMs: 0 });
  });

  it("rejects a save request still carrying the obsolete workbench.advancedSettings key, and invalid editor font/sound/line ending/encoding save values (#232)", () => {
    for (const invalidRequest of [
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          // Obsolete field (#232) — a save request must not carry it.
          advancedSettings: { enabled: false },
          sound: defaultSoundSettings
        } as unknown as SaveApplicationSettingsRequest["workbench"]
      }),
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          sound: {
            enabled: "yes" as unknown as boolean,
            dialog: { enabled: true },
            newline: { enabled: false },
            keypress: { enabled: false }
          }
        }
      }),
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          sound: {
            enabled: true,
            dialog: { enabled: "yes" as unknown as boolean },
            newline: { enabled: false },
            keypress: { enabled: false }
          }
        }
      }),
      validSaveRequest({
        editor: {
          fontFamily: 'Fira Code"; color: red',
          lineEnding: defaultLineEndingSettings,
          whitespace: defaultWhitespaceSettings,
          paragraphIndent: defaultParagraphIndentSettings,
          characterCount: defaultCharacterCountSettings
        }
      }),
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: {
            visible: true,
            characterCount: { visible: "yes" as unknown as boolean }
          },
          sound: defaultSoundSettings
        }
      }),
      validSaveRequest({
        editor: {
          lineEnding: defaultLineEndingSettings,
          whitespace: defaultWhitespaceSettings,
          paragraphIndent: {
            excludeLeadingCharacters: 42 as unknown as string
          },
          characterCount: defaultCharacterCountSettings
        }
      }),
      validSaveRequest({
        editor: {
          lineEnding: defaultLineEndingSettings,
          whitespace: defaultWhitespaceSettings,
          paragraphIndent: defaultParagraphIndentSettings,
          characterCount: {
            exclude: {
              ...defaultCharacterCountSettings.exclude,
              markdownSyntax: "yes" as unknown as boolean
            }
          }
        }
      }),
      validSaveRequest({
        editor: {
          lineEnding: defaultLineEndingSettings,
          whitespace: {
            ...defaultWhitespaceSettings,
            renderAsciiSpace: "yes" as unknown as boolean
          },
          paragraphIndent: defaultParagraphIndentSettings,
          characterCount: defaultCharacterCountSettings
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: "yes" as unknown as boolean,
            marquee: { delay: 2000, speed: 40 }
          }
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: -1, speed: 40 }
          }
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: 10001, speed: 40 }
          }
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: 1.5, speed: 40 }
          }
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: 2000, speed: 0 }
          }
        }
      }),
      validSaveRequest({
        commandPalette: {
          description: {
            enable: true,
            marquee: { delay: 2000, speed: 1001 }
          }
        }
      }),
      validSaveRequest({
        files: { newFile: { lineEnding: "cr" as "lf", encoding: "utf8" } }
      }),
      validSaveRequest({
        files: {
          newFile: { lineEnding: "lf", encoding: "shift_jis" as "utf8" }
        }
      }),
      validSaveRequest({
        preview: { renderer: "markdown", updateDelayMs: -1 }
      }),
      validSaveRequest({
        preview: { renderer: "markdown", updateDelayMs: 600001 }
      }),
      validSaveRequest({
        preview: { renderer: "markdown", updateDelayMs: 150.5 }
      }),
      validSaveRequest({
        preview: { renderer: "html" as "markdown", updateDelayMs: 10000 }
      })
    ]) {
      expect(() =>
        parseSaveApplicationSettingsRequest(invalidRequest)
      ).toThrow("Invalid application settings.");
    }

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});
