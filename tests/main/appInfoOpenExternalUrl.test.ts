import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_INFO_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  openExternal: vi.fn(() => Promise.resolve())
}));

vi.mock("electron", () => ({
  app: {
    getName: () => "Pergamum",
    getVersion: () => "0.0.0-test",
    getAppPath: () => process.cwd()
  },
  ipcMain: { handle: electronMock.ipcHandle },
  shell: { openExternal: electronMock.openExternal }
}));

import { registerAppInfoIpc } from "../../src/main/appInfoIpc";

// The renderer classifies links too, but main re-validates independently.
describe("appInfo:openExternalUrl (main-side validation)", () => {
  const openExternal = vi.fn(() => Promise.resolve());
  let handler: (event: unknown, url: unknown) => Promise<void>;

  beforeEach(() => {
    openExternal.mockClear();
    electronMock.ipcHandle.mockClear();
    registerAppInfoIpc({ externalLinkOpener: { openExternal } });
    const call = electronMock.ipcHandle.mock.calls.find(
      ([channel]) => channel === APP_INFO_CHANNELS.openExternalUrl
    ) as unknown as [string, typeof handler];
    handler = call[1];
  });

  it("opens http and https in their canonical form", async () => {
    await handler({}, "https://example.com");
    await handler({}, "http://example.com/a");

    expect(openExternal).toHaveBeenNthCalledWith(1, "https://example.com/");
    expect(openExternal).toHaveBeenNthCalledWith(2, "http://example.com/a");
  });

  it.each([
    "file:///C:/Windows/System32/notepad.exe",
    "mailto:test@example.com",
    "ftp://example.com/",
    "javascript:alert(1)",
    "data:text/html,x",
    "not a url",
    "./relative.md",
    "",
    42,
    null,
    undefined
  ])("rejects %s without opening anything", async (value) => {
    await expect(Promise.resolve().then(() => handler({}, value))).rejects.toThrow(
      "Only http and https URLs are allowed."
    );
    expect(openExternal).not.toHaveBeenCalled();
  });
});
