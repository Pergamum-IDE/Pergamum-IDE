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
  parseSaveApplicationSettingsRequest
} from "../../src/main/settingsStore";
import { getCatalogDefaultValue } from "../../src/shared/settingsCatalog";
import {
  defaultApplicationSettings,
  resolveEffectiveSettings
} from "../../src/shared/settings";

const catalogDefault = getCatalogDefaultValue(
  "workbench.usageTourAutoShowDisabled"
);

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

function onDiskSettings(overrides: Record<string, unknown>): string {
  return JSON.stringify({
    preview: { renderer: "markdown" },
    recentProjects: [],
    ...overrides
  });
}

describe("settingsStore workbench.usageTourAutoShowDisabled (#714)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("defaults to false in catalog", () => {
    expect(catalogDefault).toBe(false);
  });

  it("leaves workbench.usageTourAutoShowDisabled unset when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.workbench.usageTourAutoShowDisabled).toBeUndefined();
    const effective = resolveEffectiveSettings(settings, undefined);
    expect(effective.workbench.usageTourAutoShowDisabled).toBe(false);
  });

  it("reads explicit boolean false from disk", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          sound: defaultSoundSettings,
          usageTourAutoShowDisabled: false
        }
      })
    );

    const settings = await loadSettings();
    expect(settings.workbench.usageTourAutoShowDisabled).toBe(false);
  });

  it("reads explicit boolean true from disk", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          sound: defaultSoundSettings,
          usageTourAutoShowDisabled: true
        }
      })
    );

    const settings = await loadSettings();
    expect(settings.workbench.usageTourAutoShowDisabled).toBe(true);
    const effective = resolveEffectiveSettings(settings, undefined);
    expect(effective.workbench.usageTourAutoShowDisabled).toBe(true);
  });

  it("drops non-boolean value from disk", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: {
          language: "ja",
          statusBar: defaultStatusBarSettings,
          sound: defaultSoundSettings,
          usageTourAutoShowDisabled: "true" // invalid string
        }
      })
    );

    const settings = await loadSettings();
    expect(settings.workbench.usageTourAutoShowDisabled).toBeUndefined();
  });

  it("parses valid save request with usageTourAutoShowDisabled: true", () => {
    const request: Record<string, unknown> = { ...defaultApplicationSettings };
    delete request.recentProjects;

    const parsed = parseSaveApplicationSettingsRequest({
      ...request,
      workbench: {
        ...defaultApplicationSettings.workbench,
        usageTourAutoShowDisabled: true
      }
    });

    expect(parsed.workbench.usageTourAutoShowDisabled).toBe(true);
  });
});
