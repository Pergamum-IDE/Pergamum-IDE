import { app, ipcMain, shell } from "electron";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  APP_INFO_CHANNELS,
  APP_INFO_EXTERNAL_LINKS,
  type PergamumAppInfo
} from "../shared/api";

export const pergamumRepositoryUrl = APP_INFO_EXTERNAL_LINKS.repository;
export const typewriterSoundsCreditUrl =
  APP_INFO_EXTERNAL_LINKS.typewriterSoundsCredit;
export const pergamumCopyright = "Copyright (c) 2026 Pergamum IDE";

export interface AppInfoMetadataProvider {
  getName(): string;
  getVersion(): string;
  getAppPath(): string;
}

export interface RuntimeMetadataProvider {
  getElectronVersion(): string;
  getChromiumVersion(): string;
  getNodeVersion(): string;
  getV8Version(): string;
  getOsType(): string;
  getOsRelease(): string;
  getPlatform(): string;
  getArch(): string;
}

export interface ExternalLinkOpener {
  openExternal(url: string): Promise<void>;
}

function nonEmptyMetadata(value: string | undefined): string {
  const normalized = value?.trim() ?? "";

  return normalized.length > 0 ? normalized : "Unknown";
}

const processRuntimeMetadataProvider: RuntimeMetadataProvider = {
  getElectronVersion: () => nonEmptyMetadata(process.versions.electron),
  getChromiumVersion: () => nonEmptyMetadata(process.versions.chrome),
  getNodeVersion: () => nonEmptyMetadata(process.versions.node),
  getV8Version: () => nonEmptyMetadata(process.versions.v8),
  getOsType: () => nonEmptyMetadata(os.type()),
  getOsRelease: () => nonEmptyMetadata(os.release()),
  getPlatform: () => nonEmptyMetadata(process.platform),
  getArch: () => nonEmptyMetadata(process.arch)
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readPackageLicense(appPath: string): string | null {
  try {
    const packageJson = JSON.parse(
      readFileSync(path.join(appPath, "package.json"), "utf8")
    );

    if (!isRecord(packageJson) || typeof packageJson.license !== "string") {
      return null;
    }

    const license = packageJson.license.trim();

    return license.length > 0 ? license : null;
  } catch {
    return null;
  }
}

export function createPergamumAppInfo(
  metadataProvider: AppInfoMetadataProvider,
  runtimeMetadataProvider: RuntimeMetadataProvider =
    processRuntimeMetadataProvider
): PergamumAppInfo {
  return {
    name: metadataProvider.getName(),
    version: metadataProvider.getVersion(),
    license: readPackageLicense(metadataProvider.getAppPath()) ?? "Unknown",
    copyright: pergamumCopyright,
    runtime: {
      electron: runtimeMetadataProvider.getElectronVersion(),
      chromium: runtimeMetadataProvider.getChromiumVersion(),
      node: runtimeMetadataProvider.getNodeVersion(),
      v8: runtimeMetadataProvider.getV8Version(),
      osType: runtimeMetadataProvider.getOsType(),
      osRelease: runtimeMetadataProvider.getOsRelease(),
      platform: runtimeMetadataProvider.getPlatform(),
      arch: runtimeMetadataProvider.getArch()
    }
  };
}

function openFixedExternalLink(
  opener: ExternalLinkOpener,
  url: string
): Promise<void> {
  return opener.openExternal(url);
}

export function registerAppInfoIpc(options: {
  metadataProvider?: AppInfoMetadataProvider;
  runtimeMetadataProvider?: RuntimeMetadataProvider;
  externalLinkOpener?: ExternalLinkOpener;
} = {}): void {
  const metadataProvider = options.metadataProvider ?? app;
  const runtimeMetadataProvider =
    options.runtimeMetadataProvider ?? processRuntimeMetadataProvider;
  const externalLinkOpener = options.externalLinkOpener ?? shell;

  ipcMain.handle(APP_INFO_CHANNELS.getAppInfo, () =>
    createPergamumAppInfo(metadataProvider, runtimeMetadataProvider)
  );
  ipcMain.handle(APP_INFO_CHANNELS.openRepository, () =>
    openFixedExternalLink(externalLinkOpener, pergamumRepositoryUrl)
  );
  ipcMain.handle(APP_INFO_CHANNELS.openTypewriterSoundsCredit, () =>
    openFixedExternalLink(externalLinkOpener, typewriterSoundsCreditUrl)
  );
}
