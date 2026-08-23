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
    preview: { renderer: "markdown" },
    workbench: {
      language: "ja",
      statusBar: { visible: true },
      advancedSettings: { enabled: false },
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
    workbench: {
      language: "ja",
      statusBar: { visible: true },
      advancedSettings: { enabled: false },
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

    expect(settings.workbench.advancedSettings.enabled).toBe(
      getCatalogDefaultValue("workbench.advancedSettings.enabled")
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
  });

  it("reads valid advanced flag, editor font, line ending, and encoding values", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          advancedSettings: { enabled: true },
          sound: {
            enabled: false,
            dialog: { enabled: true },
            newline: { enabled: true },
            keypress: { enabled: false }
          }
        },
        editor: { fontFamily: "Fira Code" },
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

    expect(settings.workbench.advancedSettings.enabled).toBe(true);
    expect(settings.workbench.sound).toEqual({
      enabled: false,
      dialog: { enabled: true },
      newline: { enabled: true },
      keypress: { enabled: false }
    });
    expect(settings.editor.fontFamily).toBe("Fira Code");
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
          advancedSettings: { enabled: "yes" },
          sound: {
            enabled: "yes",
            dialog: { enabled: "yes" },
            newline: { enabled: "yes" },
            keypress: { enabled: "yes" }
          }
        },
        editor: { fontFamily: 'Fira Code"; color: red' },
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

    expect(settings.workbench.advancedSettings.enabled).toBe(false);
    expect(settings.workbench.sound).toEqual(defaultSoundSettings);
    expect(settings.editor.fontFamily).toBeUndefined();
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
});

describe("settingsStore Application Settings core controls write path (#195)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("writes workbench/commandPalette/editor/files settings while preserving preview and recent projects", async () => {
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
          statusBar: { visible: false },
          advancedSettings: { enabled: true },
          sound: {
            enabled: false,
            dialog: { enabled: false },
            newline: { enabled: true },
            keypress: { enabled: true }
          },
          fontFamily: "Inter"
        },
        editor: { fontFamily: "Fira Code" },
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

    expect(written.preview).toEqual({ renderer: "markdown" });
    expect(written.recentProjects).toEqual([recentProject]);
    expect(written.commandPalette).toEqual({
      description: {
        enable: false,
        marquee: { delay: 3000, speed: 80 }
      }
    });
    expect(written.workbench).toEqual({
      language: "en",
      statusBar: { visible: false },
      advancedSettings: { enabled: true },
      sound: {
        enabled: false,
        dialog: { enabled: false },
        newline: { enabled: true },
        keypress: { enabled: true }
      },
      fontFamily: "Inter"
    });
    expect(written.editor).toEqual({ fontFamily: "Fira Code" });
    expect(written.files).toEqual({
      newFile: {
        lineEnding: "crlf",
        encoding: "utf8"
      }
    });
  });

  it("rejects invalid advanced settings, editor font, line ending, and encoding save values", () => {
    for (const invalidRequest of [
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          advancedSettings: { enabled: "yes" as unknown as boolean },
          sound: defaultSoundSettings
        }
      }),
      validSaveRequest({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          advancedSettings: { enabled: false },
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
          statusBar: { visible: true },
          advancedSettings: { enabled: false },
          sound: {
            enabled: true,
            dialog: { enabled: "yes" as unknown as boolean },
            newline: { enabled: false },
            keypress: { enabled: false }
          }
        }
      }),
      validSaveRequest({
        editor: { fontFamily: 'Fira Code"; color: red' }
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
      })
    ]) {
      expect(() =>
        parseSaveApplicationSettingsRequest(invalidRequest)
      ).toThrow("Invalid application settings.");
    }

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });
});
