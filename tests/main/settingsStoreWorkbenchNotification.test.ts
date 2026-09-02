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

const durationDefault = getCatalogDefaultValue(
  "workbench.notification.durationMs"
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
  workbench: Record<string, unknown>
): SaveApplicationSettingsRequest {
  return {
    preview: { renderer: "markdown", updateDelayMs: 10000 },
    workbench: {
      language: "ja",
      statusBar: defaultStatusBarSettings,
      sound: defaultSoundSettings,
      ...workbench
    },
    commandPalette: {
      footerDetail: { enable: true, marquee: { delay: 2000, speed: 40 } }
    },
    editor: {
      lineEnding: defaultLineEndingSettings,
      whitespace: defaultWhitespaceSettings,
      paragraphIndent: defaultParagraphIndentSettings,
      characterCount: defaultCharacterCountSettings
    },
    files: { newFile: { lineEnding: "lf", encoding: "utf8" } }
  } as SaveApplicationSettingsRequest;
}

describe("settingsStore workbench.notification.durationMs read path (#266)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("the catalog default is 10000 ms", () => {
    expect(durationDefault).toBe(10000);
  });

  it("leaves workbench.notification unset when the key is missing (sparse, like fontFamily)", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    const settings = await loadSettings();

    expect(settings.workbench.notification).toBeUndefined();
  });

  it("reads a valid custom millisecond duration from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        workbench: { notification: { durationMs: 30000 } }
      })
    );

    const settings = await loadSettings();

    expect(settings.workbench.notification).toEqual({ durationMs: 30000 });
  });

  it("accepts the persisted bounds 0 and 600000", async () => {
    for (const value of [0, 600000]) {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({
          workbench: { notification: { durationMs: value } }
        })
      );

      const settings = await loadSettings();

      expect(settings.workbench.notification).toEqual({ durationMs: value });
    }
  });

  it("rejects an out-of-range durationMs at read time without failing startup", async () => {
    for (const value of [-1, 600001, 1_000_000]) {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({
          workbench: { notification: { durationMs: value } }
        })
      );

      const settings = await loadSettings();

      expect(settings.workbench.notification).toBeUndefined();
    }
  });

  it("rejects a non-integer / non-number durationMs at read time without failing startup", async () => {
    for (const bad of [10000.5, "10000", true, null, Number.NaN]) {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({
          workbench: { notification: { durationMs: bad } }
        })
      );

      const settings = await loadSettings();

      expect(settings.workbench.notification).toBeUndefined();
    }
  });
});

describe("settingsStore workbench.notification.durationMs write path (#266)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("persists a valid custom millisecond duration under workbench.notification", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    await saveApplicationSettings(
      saveRequest({ notification: { durationMs: 25000 } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.notification).toEqual({ durationMs: 25000 });
  });

  it("persists the explicit 0 base duration value", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    await saveApplicationSettings(
      saveRequest({ notification: { durationMs: 0 } })
    );

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.notification).toEqual({ durationMs: 0 });
  });

  it("a save request omitting workbench.notification leaves it absent, not written as the default", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({ workbench: {} }));

    await saveApplicationSettings(saveRequest({}));

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];
    const written = JSON.parse(writtenContent);

    expect(written.workbench.notification).toBeUndefined();
  });

  it("rejects a save request with an out-of-range durationMs and never writes settings.json", () => {
    for (const value of [-1, 600001]) {
      expect(() =>
        parseSaveApplicationSettingsRequest(
          saveRequest({ notification: { durationMs: value } })
        )
      ).toThrow("Invalid application settings.");
    }
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a save request with a non-integer durationMs and never writes settings.json", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(
        saveRequest({ notification: { durationMs: 12500.5 } })
      )
    ).toThrow("Invalid application settings.");
    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("rejects a save request whose workbench.notification carries an unknown key", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(
        saveRequest({
          notification: { durationMs: 10000, somethingElse: true }
        })
      )
    ).toThrow("Invalid application settings.");
  });

  it("still accepts the default catalog value (10000) as an explicit custom value", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(
        saveRequest({ notification: { durationMs: durationDefault } })
      )
    ).not.toThrow();
  });
});
