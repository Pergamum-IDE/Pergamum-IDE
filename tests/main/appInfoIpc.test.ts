import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_INFO_CHANNELS } from "../../src/shared/api";

const electronMock = vi.hoisted(() => ({
  appGetName: vi.fn(() => "Pergamum"),
  appGetVersion: vi.fn(() => "9.8.7-test"),
  appGetAppPath: vi.fn(() => process.cwd()),
  ipcHandle: vi.fn(),
  openExternal: vi.fn(() => Promise.resolve())
}));

vi.mock("electron", () => ({
  app: {
    getName: electronMock.appGetName,
    getVersion: electronMock.appGetVersion,
    getAppPath: electronMock.appGetAppPath
  },
  ipcMain: {
    handle: electronMock.ipcHandle
  },
  shell: {
    openExternal: electronMock.openExternal
  }
}));

import {
  createPergamumAppInfo,
  pergamumCopyright,
  pergamumRepositoryUrl,
  readPackageLicense,
  registerAppInfoIpc,
  type AppInfoMetadataProvider,
  type ExternalLinkOpener,
  type RuntimeMetadataProvider,
  typewriterSoundsCreditUrl
} from "../../src/main/appInfoIpc";

const runtimeMetadataProvider: RuntimeMetadataProvider = {
  getElectronVersion: () => "43.4.0-test",
  getChromiumVersion: () => "140.0.0-test",
  getNodeVersion: () => "24.0.0-test",
  getV8Version: () => "14.0-test",
  getOsType: () => "Windows_NT",
  getOsRelease: () => "10.0.26100-test",
  getPlatform: () => "win32",
  getArch: () => "x64"
};

const expectedRuntimeInfo = {
  electron: "43.4.0-test",
  chromium: "140.0.0-test",
  node: "24.0.0-test",
  v8: "14.0-test",
  osType: "Windows_NT",
  osRelease: "10.0.26100-test",
  platform: "win32",
  arch: "x64"
};

describe("app info IPC (#221)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates app info from Electron app version and package license metadata", () => {
    const appPath = withAppMetadata({
      packageJson: { license: "MIT" }
    });
    const metadataProvider: AppInfoMetadataProvider = {
      getName: () => "Pergamum",
      getVersion: () => "9.8.7-test",
      getAppPath: () => appPath
    };

    try {
      expect(
        createPergamumAppInfo(metadataProvider, runtimeMetadataProvider)
      ).toEqual({
        name: "Pergamum",
        version: "9.8.7-test",
        license: "MIT",
        copyright: pergamumCopyright,
        runtime: expectedRuntimeInfo
      });
    } finally {
      rmSync(appPath, { recursive: true, force: true });
    }
  });

  it("returns null when package license metadata is missing", () => {
    const appPath = withAppMetadata({ packageJson: { name: "pergamum" } });

    try {
      expect(readPackageLicense(appPath)).toBeNull();
    } finally {
      rmSync(appPath, { recursive: true, force: true });
    }
  });

  it("uses explicit app metadata for copyright without filesystem discovery", () => {
    const appPath = withAppMetadata({ packageJson: { license: "MIT" } });
    const metadataProvider: AppInfoMetadataProvider = {
      getName: () => "Pergamum",
      getVersion: () => "9.8.7-test",
      getAppPath: () => appPath
    };

    try {
      expect(
        createPergamumAppInfo(metadataProvider, runtimeMetadataProvider)
          .copyright
      ).toBe(pergamumCopyright);
      expect(
        createPergamumAppInfo(metadataProvider, runtimeMetadataProvider)
          .copyright
      ).not.toBe("Unknown");
    } finally {
      rmSync(appPath, { recursive: true, force: true });
    }
  });

  it("registers getAppInfo and fixed external-link actions", async () => {
    const appPath = withAppMetadata({
      packageJson: { license: "Test-License" }
    });
    const metadataProvider: AppInfoMetadataProvider = {
      getName: () => "Pergamum",
      getVersion: () => "9.8.7-test",
      getAppPath: () => appPath
    };
    const externalLinkOpener: ExternalLinkOpener = {
      openExternal: vi.fn(() => Promise.resolve())
    };

    try {
      registerAppInfoIpc({
        metadataProvider,
        runtimeMetadataProvider,
        externalLinkOpener
      });

      expect(await ipcHandler(APP_INFO_CHANNELS.getAppInfo)({})).toEqual({
        name: "Pergamum",
        version: "9.8.7-test",
        license: "Test-License",
        copyright: pergamumCopyright,
        runtime: expectedRuntimeInfo
      });
      await ipcHandler(APP_INFO_CHANNELS.openRepository)(
        {},
        "https://example.invalid/not-allowed"
      );
      await ipcHandler(APP_INFO_CHANNELS.openTypewriterSoundsCredit)(
        {},
        "https://example.invalid/not-allowed"
      );

      expect(externalLinkOpener.openExternal).toHaveBeenCalledWith(
        pergamumRepositoryUrl
      );
      expect(externalLinkOpener.openExternal).toHaveBeenCalledWith(
        typewriterSoundsCreditUrl
      );
      expect(externalLinkOpener.openExternal).not.toHaveBeenCalledWith(
        "https://example.invalid/not-allowed"
      );
      expect(APP_INFO_CHANNELS as Record<string, unknown>).not.toHaveProperty(
        "openThirdPartyNotices"
      );
      expect(electronMock.ipcHandle).not.toHaveBeenCalledWith(
        "appInfo:openThirdPartyNotices",
        expect.any(Function)
      );
    } finally {
      rmSync(appPath, { recursive: true, force: true });
    }
  });

  it("does not discover copyright from LICENSE files or runtime dates", () => {
    const source = readFileSync("src/main/appInfoIpc.ts", "utf8");

    expect(source).toContain(
      'export const pergamumCopyright = "Copyright (c) 2026 Pergamum IDE";'
    );
    expect(source).not.toContain("readAppCopyright");
    expect(source).not.toContain('"LICENSE"');
    expect(source).not.toContain("getFullYear");
    expect(source).not.toContain("new Date");
  });
});

function withAppMetadata({
  packageJson
}: {
  packageJson: Record<string, unknown>;
}): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "pergamum-app-info-"));

  writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify(packageJson),
    "utf8"
  );

  return directory;
}

function ipcHandler(channel: string): (...args: unknown[]) => unknown {
  const handler = electronMock.ipcHandle.mock.calls.find(
    (call) => call[0] === channel
  )?.[1];

  if (typeof handler !== "function") {
    throw new Error(`Missing IPC handler: ${channel}`);
  }

  return handler as (...args: unknown[]) => unknown;
}
