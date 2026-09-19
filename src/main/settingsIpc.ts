import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type SaveDialogOptions
} from "electron";
import path from "node:path";
import {
  SETTINGS_CHANNELS,
  type ApplicationSettings,
  type ExportSettingsJsonRequest,
  type ExportSettingsJsonResult
} from "../shared/api";
import {
  loadSettings,
  parseSaveApplicationSettingsRequest,
  saveApplicationSettings
} from "./settingsStore";
import { writeFileAtomic } from "./atomicFileWrite";
import { sanitizedFileIoError } from "./markdownFileIo";

const jsonFilters = [
  {
    name: "JSON files",
    extensions: ["json"]
  },
  {
    name: "All files",
    extensions: ["*"]
  }
];

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function ensureJsonExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".json"
    ? filePath
    : `${filePath}.json`;
}

function parseExportSettingsJsonRequest(
  value: unknown
): ExportSettingsJsonRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Invalid settings JSON export request.");
  }

  const request = value as Record<string, unknown>;
  const defaultFileName = request.defaultFileName;
  const json = request.json;

  if (
    typeof defaultFileName !== "string" ||
    defaultFileName.trim().length === 0 ||
    /[\\/]/.test(defaultFileName) ||
    path.extname(defaultFileName).toLowerCase() !== ".json" ||
    typeof json !== "string"
  ) {
    throw new Error("Invalid settings JSON export request.");
  }

  JSON.parse(json);

  return { defaultFileName, json };
}

async function exportSettingsJson(
  event: IpcMainInvokeEvent,
  request: ExportSettingsJsonRequest
): Promise<ExportSettingsJsonResult> {
  const owner = parentWindow(event);
  const options: SaveDialogOptions = {
    title: "Export Settings",
    defaultPath: request.defaultFileName,
    filters: jsonFilters
  };
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { ok: false, reason: "canceled" };
  }

  await writeFileAtomic(ensureJsonExtension(result.filePath), request.json);

  return { ok: true };
}

export function registerSettingsIpc(): void {
  ipcMain.handle(SETTINGS_CHANNELS.getSettings, async () => loadSettings());

  ipcMain.handle(
    SETTINGS_CHANNELS.saveSettings,
    async (_event, rawSettings: unknown): Promise<ApplicationSettings> => {
      const settingsRequest = parseSaveApplicationSettingsRequest(rawSettings);
      return saveApplicationSettings(settingsRequest);
    }
  );

  ipcMain.handle(
    SETTINGS_CHANNELS.exportJson,
    async (
      event,
      rawRequest: unknown
    ): Promise<ExportSettingsJsonResult> => {
      try {
        return await exportSettingsJson(
          event,
          parseExportSettingsJsonRequest(rawRequest)
        );
      } catch (error) {
        throw sanitizedFileIoError(error);
      }
    }
  );
}
