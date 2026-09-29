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
  recordRecentProject,
  saveApplicationSettings
} from "../../src/main/settingsStore";
import { defaultApplicationSettings } from "../../src/shared/settings";

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

function saveRequest(japaneseLint?: unknown): Record<string, unknown> {
  const request: Record<string, unknown> = { ...defaultApplicationSettings };

  delete request.recentProjects;

  return japaneseLint === undefined ? request : { ...request, japaneseLint };
}

function lastWritten(): Record<string, unknown> {
  const calls = fsMock.writeFile.mock.calls;
  const [, content] = calls[calls.length - 1] as [string, string];

  return JSON.parse(content) as Record<string, unknown>;
}

describe("settingsStore japaneseLint (#625)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("leaves japaneseLint absent when settings.json has no such section", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    expect((await loadSettings()).japaneseLint).toBeUndefined();
  });

  it("reads a stored section, fully resolved", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        japaneseLint: {
          rules: { "sentence-length": { enabled: true, options: { max: 60 } } }
        }
      })
    );

    const { japaneseLint } = await loadSettings();

    expect(japaneseLint?.rules["sentence-length"]).toEqual({
      enabled: true,
      options: { max: 60 }
    });
    expect(japaneseLint?.rules["max-ten"]).toEqual({
      enabled: true,
      options: { max: 5 }
    });
  });

  it("reads a corrupt section tolerantly (defaults, clamps) instead of failing", async () => {
    const cases: readonly (readonly [unknown, number])[] = [
      ["garbage", 5],
      [42, 5],
      [{ rules: "x" }, 5],
      [
        {
          rules: {
            "no-such-rule": { enabled: true },
            "max-ten": { enabled: "yes", options: { max: 9999 } }
          }
        },
        50
      ]
    ];

    for (const [corrupt, expectedMax] of cases) {
      fsMock.readFile.mockResolvedValue(onDiskSettings({ japaneseLint: corrupt }));

      const { japaneseLint } = await loadSettings();

      expect(japaneseLint?.rules["max-ten"]).toEqual({
        enabled: true,
        options: { max: expectedMax }
      });
    }
  });

  it("persists a saved rule change and restores it on the next load", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await saveApplicationSettings(
      saveRequest({
        rules: { "sentence-length": { enabled: true, options: { max: 80 } } }
      }) as never
    );

    const written = lastWritten();

    expect(
      (written.japaneseLint as { rules: Record<string, unknown> }).rules[
        "sentence-length"
      ]
    ).toEqual({ enabled: true, options: { max: 80 } });

    // Restart: read back exactly what was written.
    fsMock.readFile.mockResolvedValue(JSON.stringify(written));

    expect(
      (await loadSettings()).japaneseLint?.rules["sentence-length"]
    ).toEqual({ enabled: true, options: { max: 80 } });
  });

  it("keeps the stored section when a later save request omits it", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        japaneseLint: { rules: { "no-nfd": { enabled: false } } }
      })
    );

    await saveApplicationSettings(saveRequest() as never);

    expect(
      (lastWritten().japaneseLint as { rules: Record<string, { enabled: boolean }> })
        .rules["no-nfd"].enabled
    ).toBe(false);
  });

  it("does not write the section for an install that never touched it", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    await recordRecentProject(recentProjectInput);

    expect(Object.keys(lastWritten())).not.toContain("japaneseLint");
  });

  it("keeps a stored section across an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({
        japaneseLint: { rules: { "no-nfd": { enabled: false } } }
      })
    );

    await recordRecentProject(recentProjectInput);

    expect(Object.keys(lastWritten())).toContain("japaneseLint");
  });

  it("accepts a valid japaneseLint in a save request and normalizes it", () => {
    const parsed = parseSaveApplicationSettingsRequest(
      saveRequest({ rules: { "max-ten": { options: { max: 7 } } } })
    );

    expect(parsed.japaneseLint?.rules["max-ten"]).toEqual({
      enabled: true,
      options: { max: 7 }
    });
    expect(Object.keys(parsed.japaneseLint?.rules ?? {})).toHaveLength(12);
  });

  it("rejects a save request whose japaneseLint is invalid", () => {
    for (const bad of [
      { rules: { "no-such-rule": { enabled: true } } },
      { rules: { "max-ten": { options: { max: 0 } } } },
      { rules: { "no-nfd": { enabled: "true" } } },
      "x"
    ]) {
      expect(() => parseSaveApplicationSettingsRequest(saveRequest(bad))).toThrow(
        "Invalid application settings."
      );
    }

    expect(fsMock.writeFile).not.toHaveBeenCalled();
  });

  it("still accepts a save request without japaneseLint", () => {
    expect(
      parseSaveApplicationSettingsRequest(saveRequest()).japaneseLint
    ).toBeUndefined();
  });
});
