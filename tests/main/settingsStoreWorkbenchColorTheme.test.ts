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
import {
  defaultApplicationSettings,
  resolveEffectiveSettings
} from "../../src/shared/settings";

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

function validSaveRequest(colorTheme: unknown): Record<string, unknown> {
  const request: Record<string, unknown> = { ...defaultApplicationSettings };
  delete request.recentProjects;

  return {
    ...request,
    workbench: { ...defaultApplicationSettings.workbench, colorTheme }
  };
}

describe("settingsStore workbench.colorTheme (#621)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
    fsMock.writeFile.mockResolvedValue(undefined);
    fsMock.mkdir.mockResolvedValue(undefined);
  });

  it("leaves colorTheme unset when nothing is on disk, and the effective theme is pergamum-light", async () => {
    fsMock.readFile.mockResolvedValue(onDiskSettings({}));

    const settings = await loadSettings();

    expect(settings.workbench.colorTheme).toBeUndefined();
    expect(
      resolveEffectiveSettings(settings, null).workbench.colorTheme
    ).toBe("pergamum-light");
  });

  it("reads a valid built-in theme id", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { colorTheme: "pergamum-light" } })
    );

    const settings = await loadSettings();

    expect(settings.workbench.colorTheme).toBe("pergamum-light");
  });

  it("drops an unknown theme id (no crash) and falls back to pergamum-light", async () => {
    for (const bad of ["night-dark", "Pergamum Light", 42, null, ""]) {
      fsMock.readFile.mockResolvedValue(
        onDiskSettings({ workbench: { colorTheme: bad } })
      );

      const settings = await loadSettings();

      expect(settings.workbench.colorTheme).toBeUndefined();
      expect(
        resolveEffectiveSettings(settings, null).workbench.colorTheme
      ).toBe("pergamum-light");
    }
  });

  it("an unknown on-disk theme id is never re-persisted by an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { colorTheme: "night-dark" } })
    );

    await recordRecentProject(recentProjectInput);

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];

    expect(Object.keys(JSON.parse(writtenContent).workbench)).not.toContain(
      "colorTheme"
    );
  });

  it("a valid stored theme survives an unrelated save", async () => {
    fsMock.readFile.mockResolvedValue(
      onDiskSettings({ workbench: { colorTheme: "pergamum-light" } })
    );

    await recordRecentProject(recentProjectInput);

    const [, writtenContent] = fsMock.writeFile.mock.calls[0] as [
      string,
      string
    ];

    expect(JSON.parse(writtenContent).workbench.colorTheme).toBe(
      "pergamum-light"
    );
  });

  it("accepts a save request carrying a built-in theme id", () => {
    const parsed = parseSaveApplicationSettingsRequest(
      validSaveRequest("pergamum-light")
    );

    expect(parsed.workbench.colorTheme).toBe("pergamum-light");
  });

  it("rejects a save request carrying an unknown theme id", () => {
    expect(() =>
      parseSaveApplicationSettingsRequest(validSaveRequest("night-dark"))
    ).toThrow("Invalid application settings.");
  });
});
