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

const languageDefault = getCatalogDefaultValue("workbench.language");
const statusBarVisibleDefault = getCatalogDefaultValue(
  "workbench.statusBar.visible"
);
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
    recentProjects: [],
    ...overrides
  });
}

function saveRequest(
  workbench: Record<string, unknown>
): SaveApplicationSettingsRequest {
  return {
    workbench: {
      advancedSettings: { enabled: false },
      sound: defaultSoundSettings,
      ...workbench
    },
    commandPalette: {
      description: {
        enable: true,
        marquee: { delay: 2000, speed: 40 }
      }
    },
    editor: {},
    files: {
      newFile: { lineEnding: "lf", encoding: "utf8" }
    }
  } as SaveApplicationSettingsRequest;
}

describe("settingsStore workbench.language / workbench.statusBar.visible read path (#174)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("reads a valid nested workbench.language from settings.json", async () => {
    const settings = await (async () => {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({ workbench: { language: "en", statusBar: { visible: true } } })
      );
      return loadSettings();
    })();

    expect(settings.workbench.language).toBe("en");
  });

  it("reads a valid nested workbench.statusBar.visible from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: { language: "ja", statusBar: { visible: false } }
      })
    );

    const settings = await loadSettings();

    expect(settings.workbench.statusBar.visible).toBe(false);
  });

  it("ignores a legacy top-level language key — reads the catalog default instead", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ language: "en" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.language).toBe(languageDefault);
  });

  it("ignores a legacy top-level showStatusBar key — reads the catalog default instead", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ showStatusBar: false })
    );

    const settings = await loadSettings();

    expect(settings.workbench.statusBar.visible).toBe(statusBarVisibleDefault);
  });

  it("falls back to the catalog default when workbench.language is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    const settings = await loadSettings();

    expect(settings.workbench.language).toBe(languageDefault);
  });

  it("falls back to the catalog default when workbench.statusBar.visible is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    const settings = await loadSettings();

    expect(settings.workbench.statusBar.visible).toBe(statusBarVisibleDefault);
  });

  it("falls back to the catalog default (without failing startup) when workbench.language is invalid", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "fr" } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.language).toBe(languageDefault);
  });

  it("falls back to the catalog default (without failing startup) when workbench.statusBar.visible is invalid", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { statusBar: { visible: "yes" } } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.statusBar.visible).toBe(statusBarVisibleDefault);
  });
});

describe("settingsStore workbench.language / workbench.statusBar.visible write path (#174)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("writes a nested workbench.language on save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "ja", statusBar: { visible: true } } })
    );

    await saveApplicationSettings(
      saveRequest({ language: "en", statusBar: { visible: true } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.language).toBe("en");
    expect(written.language).toBeUndefined();
  });

  it("writes a nested workbench.statusBar.visible on save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "ja", statusBar: { visible: true } } })
    );

    await saveApplicationSettings(
      saveRequest({ language: "ja", statusBar: { visible: false } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.statusBar.visible).toBe(false);
    expect(written.showStatusBar).toBeUndefined();
  });

  it("does not write a legacy top-level language key", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "ja", statusBar: { visible: true } } })
    );

    await saveApplicationSettings(
      saveRequest({ language: "en", statusBar: { visible: true } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(Object.keys(written)).not.toContain("language");
  });

  it("does not write a legacy top-level showStatusBar key", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "ja", statusBar: { visible: true } } })
    );

    await saveApplicationSettings(
      saveRequest({ language: "ja", statusBar: { visible: false } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(Object.keys(written)).not.toContain("showStatusBar");
  });

  it("rejects a save request with an invalid workbench.language and never writes settings.json", () => {
    const invalidSaveRequest = saveRequest({
      language: "fr",
      statusBar: { visible: true }
    });

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a save request with an invalid workbench.statusBar.visible and never writes settings.json", () => {
    const invalidSaveRequest = saveRequest({
      language: "ja",
      statusBar: { visible: "yes" }
    });

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("given settings.json with a recentProjects entry, preview.renderer, and a valid workbench.fontFamily, saving a change to only workbench.statusBar.visible preserves all three unchanged", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: { visible: true },
          fontFamily: "Fira Code"
        },
        preview: { renderer: "markdown" },
        recentProjects: [recentProject]
      })
    );

    await saveApplicationSettings(
      saveRequest({
        language: "ja",
        statusBar: { visible: false },
        fontFamily: "Fira Code"
      })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.recentProjects).toEqual([recentProject]);
    expect(written.preview).toEqual({ renderer: "markdown" });
    expect(written.workbench.fontFamily).toBe("Fira Code");
    expect(written.workbench.sound).toEqual(defaultSoundSettings);
    expect(written.workbench.statusBar.visible).toBe(false);
  });

  it("does not introduce unknown-key preservation: an unrecognized top-level key in the save request is rejected, same as before #174 (unknown-key preservation did not exist pre-#174 — see implementation report)", () => {
    const invalidSaveRequest = {
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
        newFile: { lineEnding: "lf", encoding: "utf8" }
      },
      somethingUnknown: true
    };

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("does not introduce unknown-key preservation: an unrecognized key inside workbench is rejected", () => {
    const invalidSaveRequest = {
      workbench: {
        language: "ja",
        statusBar: { visible: true },
        advancedSettings: { enabled: false },
        sound: defaultSoundSettings,
        somethingUnknown: true
      },
      commandPalette: {
        description: {
          enable: true,
          marquee: { delay: 2000, speed: 40 }
        }
      },
      editor: {},
      files: {
        newFile: { lineEnding: "lf", encoding: "utf8" }
      }
    };

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("a save request omitting workbench.fontFamily leaves it missing rather than writing back the catalog default (#173 D-7 preserved by #174)", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { language: "ja", statusBar: { visible: true } } })
    );

    await saveApplicationSettings(
      saveRequest({ language: "ja", statusBar: { visible: false } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.fontFamily).toBeUndefined();
    expect(
      JSON.stringify(written).includes(
        getCatalogDefaultValue("workbench.fontFamily")
      )
    ).toBe(false);
  });
});
