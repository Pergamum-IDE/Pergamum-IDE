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
  recordRecentProject
} from "../../src/main/settingsStore";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";

const catalogDefault = getCatalogDefaultValue("workbench.normalizeUnicodeToNfc");
const defaultSoundSettings = {
  enabled: true,
  dialog: { enabled: true },
  newline: { enabled: false },
  keypress: { enabled: false }
};
const defaultStatusBarSettings = {
  visible: getCatalogDefaultValue("workbench.statusBar.visible"),
  characterCount: {
    visible: getCatalogDefaultValue(
      "workbench.statusBar.characterCount.visible"
    )
  }
};
const defaultLineEndingSettings = {
  expected: getCatalogDefaultValue("editor.lineEnding.expected"),
  markerGlyph: getCatalogDefaultValue("editor.lineEnding.markerGlyph")
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
const recentProjectInput = {
  projectId: "018f4b8c-7a2b-7c3d-8e4f-123456789abc",
  projectName: "proj",
  projectFilePath: "C:\\proj\\proj.pergamum",
  projectRootPath: "C:\\proj",
  schemaVersion: 1
};

function onDiskSettings(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    preview: { renderer: "markdown" },
    recentProjects: [],
    ...overrides
  });
}

describe("settingsStore workbench.normalizeUnicodeToNfc read path (#446)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("leaves workbench.normalizeUnicodeToNfc unset when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.normalizeUnicodeToNfc).toBeUndefined();
  });

  it("leaves workbench.normalizeUnicodeToNfc unset when the workbench key is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    const settings = await loadSettings();

    expect(settings.workbench.normalizeUnicodeToNfc).toBeUndefined();
  });

  it("passes through an explicit false value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { normalizeUnicodeToNfc: false } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.normalizeUnicodeToNfc).toBe(false);
  });

  it("rejects a non-boolean workbench.normalizeUnicodeToNfc value and omits it from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { normalizeUnicodeToNfc: "true" } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.normalizeUnicodeToNfc).toBeUndefined();
  });

  it("rejects a non-object workbench section and omits normalizeUnicodeToNfc from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: "not-an-object" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.normalizeUnicodeToNfc).toBeUndefined();
  });
});

describe("settingsStore workbench.normalizeUnicodeToNfc write path (#446)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("re-persists an explicit false value as a user override on an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { normalizeUnicodeToNfc: false } })
    );

    await recordRecentProject(recentProjectInput);

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench).toEqual({
      language: "ja",
      statusBar: defaultStatusBarSettings,
      sound: defaultSoundSettings,
      normalizeUnicodeToNfc: false
    });
  });

  it("does not write back the catalog default when workbench.normalizeUnicodeToNfc was never set on disk (no default write-back, like #173 D-7)", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await recordRecentProject(recentProjectInput);

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench).toEqual({
      language: "ja",
      statusBar: defaultStatusBarSettings,
      sound: defaultSoundSettings
    });
    expect(Object.keys(written.workbench)).not.toContain(
      "normalizeUnicodeToNfc"
    );
  });

  it("an invalid on-disk workbench.normalizeUnicodeToNfc is read-time rejected, so a subsequent save never re-persists the invalid value", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { normalizeUnicodeToNfc: "true" } })
    );

    await recordRecentProject(recentProjectInput);

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(Object.keys(written.workbench)).not.toContain(
      "normalizeUnicodeToNfc"
    );
  });

  it("rejects a save request carrying an invalid workbench.normalizeUnicodeToNfc with 'Invalid application settings.' and never writes settings.json", () => {
    const invalidSaveRequest = {
      workbench: {
        language: "ja",
        statusBar: defaultStatusBarSettings,
        sound: defaultSoundSettings,
        normalizeUnicodeToNfc: "true"
      },
      commandPalette: {
        footerDetail: {
          enable: true,
          marquee: { delay: 2000, speed: 40 }
        }
      },
      editor: {
        lineEnding: defaultLineEndingSettings,
        characterCount: defaultCharacterCountSettings
      },
      files: {
        newFile: { lineEnding: "lf", encoding: "utf8" }
      }
    };

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("catalogDefault sanity check: the built-in default is true", () => {
    expect(catalogDefault).toBe(true);
  });
});
