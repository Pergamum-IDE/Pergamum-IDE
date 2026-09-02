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

const catalogDefault = getCatalogDefaultValue("workbench.fontFamily");
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

describe("settingsStore workbench.fontFamily read path (#173)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("leaves workbench.fontFamily unset when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it("leaves workbench.fontFamily unset when the workbench key is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it("passes through a valid non-default workbench.fontFamily value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: "Fira Code" } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBe("Fira Code");
    expect(settings.workbench.fontFamily).not.toBe(catalogDefault);
  });

  it("rejects a control-character workbench.fontFamily value without failing project/app startup, and omits it from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: "Fira\u0000Code" } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it("rejects an overlong (>128 char) workbench.fontFamily value and omits it from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: "A".repeat(129) } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it('rejects a workbench.fontFamily value containing a quote character and omits it from ApplicationSettings', async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: 'Fira Code"; color: red' } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it("rejects a non-string workbench.fontFamily value and omits it from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: 1 } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });

  it("rejects a non-object workbench section and omits fontFamily from ApplicationSettings", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: "Fira Code" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.fontFamily).toBeUndefined();
  });
});

describe("settingsStore workbench.fontFamily write path (#173)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("re-persists a valid workbench.fontFamily as a user override on an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: "Fira Code" } })
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
      fontFamily: "Fira Code"
    });
  });

  it("does not write back the catalog default when workbench.fontFamily was never set on disk (no default write-back, #173 D-7)", async () => {
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
    expect(JSON.stringify(written)).not.toContain(catalogDefault);
  });

  it("an invalid on-disk workbench.fontFamily is read-time rejected, so a subsequent save never re-persists the invalid value", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { fontFamily: 'Fira Code"; color: red' } })
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
      sound: defaultSoundSettings
    });
    expect(JSON.stringify(written)).not.toContain("color: red");
  });

  it("rejects a save request carrying an invalid workbench.fontFamily with 'Invalid application settings.' and never writes settings.json", () => {
    const invalidSaveRequest = {
      workbench: {
        language: "ja",
        statusBar: defaultStatusBarSettings,
        sound: defaultSoundSettings,
        fontFamily: 'Fira Code"; color: red'
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
});
