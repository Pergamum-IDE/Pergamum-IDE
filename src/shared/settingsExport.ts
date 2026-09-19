import type {
  ApplicationSettings,
  ProjectSettings,
  SaveApplicationSettingsRequest
} from "./settings";

export const SETTINGS_EXPORT_SCHEMA_VERSION = 1;
export const APPLICATION_SETTINGS_EXPORT_DEFAULT_FILE_NAME = "pergamum.json";
export const SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH = 120;

export interface ApplicationSettingsExportPayload {
  readonly schemaVersion: typeof SETTINGS_EXPORT_SCHEMA_VERSION;
  readonly scope: "application";
  readonly exportedAt: string;
  readonly settings: SaveApplicationSettingsRequest;
}

export interface ProjectSettingsExportPayload {
  readonly schemaVersion: typeof SETTINGS_EXPORT_SCHEMA_VERSION;
  readonly scope: "project";
  readonly project: {
    readonly name: string;
  };
  readonly exportedAt: string;
  readonly settings: ProjectSettings;
}

const windowsReservedFileNameStems = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9"
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }

  if (!isPlainRecord(value)) {
    return value;
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortJsonValue(child);
    }
  }
  return sorted;
}

export function exportableApplicationSettings(
  settings: ApplicationSettings
): SaveApplicationSettingsRequest {
  const request: SaveApplicationSettingsRequest = {
    commandPalette: settings.commandPalette,
    documentMap: settings.documentMap,
    editor: settings.editor,
    imageAttachment: settings.imageAttachment,
    markdownFiles: settings.markdownFiles,
    preview: settings.preview,
    search: settings.search,
    textFiles: settings.textFiles,
    workbench: settings.workbench
  };

  if (settings.notification !== undefined) {
    request.notification = settings.notification;
  }

  return sortJsonValue(request) as SaveApplicationSettingsRequest;
}

export function projectSettingsExportDefaultFileName(projectName: string): string {
  return `${sanitizeJsonFileNameStem(projectName, "project-settings")}.json`;
}

function trimInvalidFileNameStemSuffix(value: string): string {
  return value.replace(/[. ]+$/g, "");
}

function truncateFileNameStem(value: string): string {
  if (value.length <= SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH) {
    return value;
  }

  return trimInvalidFileNameStemSuffix(
    value.slice(0, SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH)
  );
}

function isWindowsReservedFileNameStem(value: string): boolean {
  const deviceNameStem = value.split(".")[0].toUpperCase();
  return windowsReservedFileNameStems.has(deviceNameStem);
}

export function sanitizeJsonFileNameStem(
  value: string,
  fallback: string
): string {
  const fallbackStem =
    truncateFileNameStem(
      trimInvalidFileNameStemSuffix(
        fallback.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").trim()
      )
    ) || "settings";

  let stem = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
    .replace(/[. ]+$/g, "");

  stem = truncateFileNameStem(stem.length > 0 ? stem : fallbackStem);

  if (stem.length === 0) {
    stem = fallbackStem;
  }

  if (isWindowsReservedFileNameStem(stem)) {
    const reservedSafeStem = truncateFileNameStem(
      stem.slice(0, SETTINGS_EXPORT_FILE_NAME_STEM_MAX_LENGTH - 1)
    );
    stem = `${reservedSafeStem.length > 0 ? reservedSafeStem : fallbackStem}_`;
  }

  return stem;
}

export function createApplicationSettingsExportPayload(
  settings: ApplicationSettings,
  exportedAt: Date = new Date()
): ApplicationSettingsExportPayload {
  return {
    schemaVersion: SETTINGS_EXPORT_SCHEMA_VERSION,
    scope: "application",
    exportedAt: exportedAt.toISOString(),
    settings: exportableApplicationSettings(settings)
  };
}

export function createProjectSettingsExportPayload(
  projectName: string,
  settings: ProjectSettings | undefined,
  exportedAt: Date = new Date()
): ProjectSettingsExportPayload {
  return {
    schemaVersion: SETTINGS_EXPORT_SCHEMA_VERSION,
    scope: "project",
    project: {
      name: projectName
    },
    exportedAt: exportedAt.toISOString(),
    settings: sortJsonValue(settings ?? {}) as ProjectSettings
  };
}

export function settingsExportPayloadToJson(
  payload: ApplicationSettingsExportPayload | ProjectSettingsExportPayload
): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function createApplicationSettingsExportJson(
  settings: ApplicationSettings,
  exportedAt?: Date
): string {
  return settingsExportPayloadToJson(
    createApplicationSettingsExportPayload(settings, exportedAt)
  );
}

export function createProjectSettingsExportJson(
  projectName: string,
  settings: ProjectSettings | undefined,
  exportedAt?: Date
): string {
  return settingsExportPayloadToJson(
    createProjectSettingsExportPayload(projectName, settings, exportedAt)
  );
}
