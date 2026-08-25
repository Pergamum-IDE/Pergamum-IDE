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

import { loadSettings } from "../../src/main/settingsStore";

describe("settingsStore preview.renderer (#150 consumer replacement)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("defaults preview.renderer to the catalog default when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.preview.renderer).toBe("markdown");
  });

  it("defaults preview.renderer to the catalog default when settings.json is corrupt", async () => {
    fsMock.readFile.mockResolvedValue("{ not valid json");

    const settings = await loadSettings();

    expect(settings.preview.renderer).toBe("markdown");
  });

  it("passes through a valid preview.renderer value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        showStatusBar: true,
        language: "ja",
        preview: { renderer: "markdown" },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.renderer).toBe("markdown");
  });

  it("falls back to the catalog default (without throwing) when preview.renderer is an invalid value", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        showStatusBar: true,
        language: "ja",
        preview: { renderer: "html" },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.renderer).toBe("markdown");
  });

  it("falls back to the catalog default when the preview section itself is missing", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        showStatusBar: true,
        language: "ja",
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.renderer).toBe("markdown");
  });
});

describe("settingsStore preview.updateDelayMs (#250 follow-up)", () => {
  beforeEach(() => {
    fsMock.readFile.mockReset();
    fsMock.writeFile.mockReset();
    fsMock.mkdir.mockReset();
  });

  it("defaults preview.updateDelayMs to 10000 when settings.json is missing", async () => {
    fsMock.readFile.mockRejectedValue(
      Object.assign(new Error("not found"), { code: "ENOENT" })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });

  it("defaults preview.updateDelayMs to 10000 when settings.json is corrupt", async () => {
    fsMock.readFile.mockResolvedValue("{ not valid json");

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });

  it("passes through a valid non-default preview.updateDelayMs value from settings.json", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        preview: { renderer: "markdown", updateDelayMs: 800 },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(800);
  });

  it("accepts 0 as a valid, explicit preview.updateDelayMs value", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        preview: { renderer: "markdown", updateDelayMs: 0 },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(0);
  });

  it("falls back to the catalog default (without throwing) when preview.updateDelayMs is negative", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        preview: { renderer: "markdown", updateDelayMs: -1 },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });

  it("falls back to the catalog default (without throwing) when preview.updateDelayMs exceeds the max", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        preview: { renderer: "markdown", updateDelayMs: 600001 },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });

  it("falls back to the catalog default (without throwing) when preview.updateDelayMs is not an integer", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        preview: { renderer: "markdown", updateDelayMs: 150.5 },
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });

  it("falls back to the catalog default when the preview section itself is missing", async () => {
    fsMock.readFile.mockResolvedValue(
      JSON.stringify({
        recentProjects: []
      })
    );

    const settings = await loadSettings();

    expect(settings.preview.updateDelayMs).toBe(10000);
  });
});
