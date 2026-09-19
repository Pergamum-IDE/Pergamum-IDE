import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({
  handle: vi.fn(),
  fromWebContents: vi.fn(() => undefined),
  showSaveDialog: vi.fn()
}));

const settingsStoreMock = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  parseSaveApplicationSettingsRequest: vi.fn((settings: unknown) => settings),
  saveApplicationSettings: vi.fn()
}));

const atomicWriteMock = vi.hoisted(() => ({
  writeFileAtomic: vi.fn<(target: string, data: string) => Promise<void>>()
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromWebContents: electronMock.fromWebContents
  },
  dialog: {
    showSaveDialog: electronMock.showSaveDialog
  },
  ipcMain: {
    handle: electronMock.handle
  }
}));

vi.mock("../../src/main/settingsStore", () => ({
  loadSettings: settingsStoreMock.loadSettings,
  parseSaveApplicationSettingsRequest:
    settingsStoreMock.parseSaveApplicationSettingsRequest,
  saveApplicationSettings: settingsStoreMock.saveApplicationSettings
}));

vi.mock("../../src/main/atomicFileWrite", () => ({
  writeFileAtomic: atomicWriteMock.writeFileAtomic
}));

import { registerSettingsIpc } from "../../src/main/settingsIpc";

function registeredHandler(channel: string): (...args: unknown[]) => unknown {
  registerSettingsIpc();

  const registration = electronMock.handle.mock.calls.find(
    ([registeredChannel]) => registeredChannel === channel
  );

  if (!registration) {
    throw new Error(`Handler was not registered for ${channel}.`);
  }

  return registration[1] as (...args: unknown[]) => unknown;
}

describe("settings IPC JSON export (#521)", () => {
  beforeEach(() => {
    electronMock.handle.mockClear();
    electronMock.fromWebContents.mockClear();
    electronMock.showSaveDialog.mockReset();
    settingsStoreMock.loadSettings.mockReset();
    settingsStoreMock.parseSaveApplicationSettingsRequest.mockClear();
    settingsStoreMock.saveApplicationSettings.mockReset();
    atomicWriteMock.writeFileAtomic.mockReset();
    atomicWriteMock.writeFileAtomic.mockResolvedValue(undefined);
  });

  it("opens a JSON save dialog and writes the selected file as UTF-8 JSON", async () => {
    const json = '{\n  "scope": "application"\n}\n';
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "D:\\Exports\\pergamum"
    });

    const exportJson = registeredHandler(SETTINGS_CHANNELS.exportJson);

    await expect(
      exportJson(
        { sender: {} },
        {
          defaultFileName: "pergamum.json",
          json
        }
      )
    ).resolves.toEqual({ ok: true });

    expect(electronMock.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: "pergamum.json",
        filters: [
          { name: "JSON files", extensions: ["json"] },
          { name: "All files", extensions: ["*"] }
        ]
      })
    );
    expect(atomicWriteMock.writeFileAtomic).toHaveBeenCalledWith(
      "D:\\Exports\\pergamum.json",
      json
    );
  });

  it("does nothing when the save dialog is canceled", async () => {
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: true
    });

    const exportJson = registeredHandler(SETTINGS_CHANNELS.exportJson);

    await expect(
      exportJson(
        { sender: {} },
        {
          defaultFileName: "pergamum.json",
          json: '{\n  "scope": "application"\n}\n'
        }
      )
    ).resolves.toEqual({ ok: false, reason: "canceled" });

    expect(atomicWriteMock.writeFileAtomic).not.toHaveBeenCalled();
  });

  it("preserves an explicit .json selected path", async () => {
    const json = '{\n  "scope": "project"\n}\n';
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: "D:\\Exports\\迷子たちと千年領主.json"
    });

    const exportJson = registeredHandler(SETTINGS_CHANNELS.exportJson);

    await exportJson(
      { sender: {} },
      {
        defaultFileName: "迷子たちと千年領主.json",
        json
      }
    );

    expect(atomicWriteMock.writeFileAtomic).toHaveBeenCalledWith(
      "D:\\Exports\\迷子たちと千年領主.json",
      json
    );
  });

  it("rejects write failures with a sanitized error surface", async () => {
    const rawPath = "D:\\Exports\\secret-settings.json";
    const secretJson = '{\n  "settings": "SECRET_SETTINGS_MARKER"\n}\n';
    const writeError = Object.assign(
      new Error(`EACCES: permission denied, open '${rawPath}'`),
      { code: "EACCES", path: rawPath }
    );
    atomicWriteMock.writeFileAtomic.mockRejectedValue(writeError);
    electronMock.showSaveDialog.mockResolvedValue({
      canceled: false,
      filePath: rawPath
    });

    const exportJson = registeredHandler(SETTINGS_CHANNELS.exportJson);
    const rejection = await (
      exportJson(
        { sender: {} },
        {
          defaultFileName: "pergamum.json",
          json: secretJson
        }
      ) as Promise<unknown>
    ).then(
      () => {
        throw new Error("Expected export to reject.");
      },
      (error: unknown) => error
    );

    expect(rejection).toMatchObject({
      name: "PergamumFileIoError",
      message: "File I/O failed: permissionDenied",
      code: "PERGAMUM_FILE_IO_FAILED",
      reason: "permissionDenied"
    });
    const safeSurface = `${String(rejection)}\n${JSON.stringify(rejection)}`;
    expect(safeSurface).not.toContain(rawPath);
    expect(safeSurface).not.toContain("SECRET_SETTINGS_MARKER");
  });

  it("rejects invalid default filenames before opening the dialog", async () => {
    const exportJson = registeredHandler(SETTINGS_CHANNELS.exportJson);

    await expect(
      exportJson(
        { sender: {} },
        {
          defaultFileName: "nested/pergamum.json",
          json: '{\n  "scope": "application"\n}\n'
        }
      ) as Promise<unknown>
    ).rejects.toMatchObject({
      name: "PergamumFileIoError",
      code: "PERGAMUM_FILE_IO_FAILED"
    });
    expect(electronMock.showSaveDialog).not.toHaveBeenCalled();
  });
});
