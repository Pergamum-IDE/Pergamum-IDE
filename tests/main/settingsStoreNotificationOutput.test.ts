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
  app: { getPath: electronMock.getPath }
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
    headings: getCatalogDefaultValue("editor.characterCount.exclude.headings"),
    markdownSyntax: getCatalogDefaultValue(
      "editor.characterCount.exclude.markdownSyntax"
    ),
    markdownComments: getCatalogDefaultValue(
      "editor.characterCount.exclude.markdownComments"
    )
  }
};

function onDiskSettings(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    preview: { renderer: "markdown" },
    recentProjects: [],
    ...overrides
  });
}

function saveRequest(
  overrides: Partial<SaveApplicationSettingsRequest>
): SaveApplicationSettingsRequest {
  return {
    preview: { renderer: "markdown", updateDelayMs: 10000 },
    workbench: {
      language: "ja",
      statusBar: defaultStatusBarSettings,
      sound: defaultSoundSettings
    },
    commandPalette: {
      description: { enable: true, marquee: { delay: 2000, speed: 40 } }
    },
    editor: {
      lineEnding: defaultLineEndingSettings,
      whitespace: defaultWhitespaceSettings,
      paragraphIndent: defaultParagraphIndentSettings,
      characterCount: defaultCharacterCountSettings
    },
    files: { newFile: { lineEnding: "lf", encoding: "utf8" } },
    ...overrides
  } as SaveApplicationSettingsRequest;
}

describe("settingsStore notification.output.enabled read path (#298)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("leaves notification unset when the key is missing", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    const settings = await loadSettings();

    expect(settings.notification).toBeUndefined();
  });

  it("reads valid true and false values from settings.json", async () => {
    for (const enabled of [true, false]) {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({ notification: { output: { enabled } } })
      );

      const settings = await loadSettings();

      expect(settings.notification).toEqual({ output: { enabled } });
    }
  });

  it("rejects malformed output settings at read time without failing startup", async () => {
    for (const notification of [
      { output: { enabled: "false" } },
      { output: { enabled: 0 } },
      { output: { enabled: false, extra: true } },
      { output: null },
      true
    ]) {
      fsMock.readFile.mockResolvedValue(onDiskSettings({ notification }));

      const settings = await loadSettings();

      expect(settings.notification).toBeUndefined();
    }
  });
});

describe("settingsStore notification.output.enabled write path (#298)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("persists a valid notification output setting", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await saveApplicationSettings(
      saveRequest({ notification: { output: { enabled: false } } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.notification).toEqual({ output: { enabled: false } });
  });

  it("a save request omitting notification leaves it absent, not written as the default", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await saveApplicationSettings(saveRequest({}));

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.notification).toBeUndefined();
  });

  it("rejects a non-boolean enabled value and never writes settings.json", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(
        saveRequest({
          notification: {
            output: { enabled: "false" as unknown as boolean }
          }
        })
      )
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects unknown keys inside notification.output", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(
        saveRequest({
          notification: {
            output: { enabled: true, extra: true } as unknown as {
              enabled: boolean;
            }
          }
        })
      )
    ).toThrow("Invalid application settings.");
  });
});
