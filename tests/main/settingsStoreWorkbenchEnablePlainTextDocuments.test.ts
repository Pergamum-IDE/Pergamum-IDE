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

const catalogDefault = getCatalogDefaultValue("textFiles.enablePlainTextDocuments");
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

describe("settingsStore textFiles.enablePlainTextDocuments read path (#501)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("uses the catalog default for textFiles.enablePlainTextDocuments when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.textFiles.enablePlainTextDocuments).toBe(false);
  });

  it("leaves textFiles.enablePlainTextDocuments unset when the textFiles key is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    const settings = await loadSettings();

    expect(settings.textFiles.enablePlainTextDocuments).toBeUndefined();
  });

  it("passes through an explicit true value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ textFiles: { enablePlainTextDocuments: true } })
    );

    const settings = await loadSettings();

    expect(settings.textFiles.enablePlainTextDocuments).toBe(true);
  });

  it("passes through an explicit false value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ textFiles: { enablePlainTextDocuments: false } })
    );

    const settings = await loadSettings();

    expect(settings.textFiles.enablePlainTextDocuments).toBe(false);
  });

  it("falls back to the catalog default for a non-boolean textFiles.enablePlainTextDocuments value", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ textFiles: { enablePlainTextDocuments: "true" } })
    );

    const settings = await loadSettings();

    expect(settings.textFiles.enablePlainTextDocuments).toBe(false);
  });
});

describe("settingsStore textFiles.enablePlainTextDocuments write path (#501)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("re-persists an explicit true value as a user override on an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ textFiles: { enablePlainTextDocuments: true } })
    );

    await recordRecentProject(recentProjectInput);

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.textFiles.enablePlainTextDocuments).toBe(true);
  });

  it("does not write back the catalog default when textFiles.enablePlainTextDocuments was never set on disk", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await recordRecentProject(recentProjectInput);

    expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.textFiles?.enablePlainTextDocuments).toBeUndefined();
  });

  it("rejects a save request carrying an invalid textFiles.enablePlainTextDocuments with 'Invalid application settings.'", () => {
    const invalidSaveRequest = {
      workbench: {
        language: "ja",
        statusBar: defaultStatusBarSettings,
        sound: defaultSoundSettings
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
      markdownFiles: {
        lineEnding: "lf",
        encoding: "utf8"
      },
      textFiles: {
        enablePlainTextDocuments: "true",
        lineEnding: "lf",
        encoding: "utf8"
      }
    };

    expect(() =>
      parseSaveApplicationSettingsRequest(invalidSaveRequest)
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("catalogDefault sanity check: the built-in default is false", () => {
    expect(catalogDefault).toBe(false);
  });
});
