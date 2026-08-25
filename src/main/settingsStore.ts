import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  createDefaultApplicationSettings,
  type ApplicationSettings,
  type RecordRecentProjectInput,
  type RecentProject,
  type SaveApplicationSettingsRequest
} from "../shared/settings";
import {
  resolveCatalogValue,
  validateCatalogValue
} from "../shared/settingsCatalog";

const settingsFileName = "settings.json";
const maxRecentProjects = 10;

function settingsFilePath(): string {
  return path.join(app.getPath("userData"), settingsFileName);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeErrorCode(error: unknown): string | undefined {
  if (isObject(error) && "code" in error) {
    return String(error.code);
  }

  return undefined;
}

function isRecentProject(value: unknown): value is RecentProject {
  return (
    isObject(value) &&
    typeof value.projectId === "string" &&
    typeof value.projectName === "string" &&
    typeof value.projectFilePath === "string" &&
    typeof value.projectRootPath === "string" &&
    typeof value.schemaVersion === "number" &&
    typeof value.lastOpenedAt === "string"
  );
}

function normalizeRecentProjects(
  recentProjects: RecentProject[]
): RecentProject[] {
  const normalizedProjects: RecentProject[] = [];
  const seenProjectIds = new Set<string>();

  for (const recentProject of recentProjects) {
    if (seenProjectIds.has(recentProject.projectId)) {
      continue;
    }

    seenProjectIds.add(recentProject.projectId);
    normalizedProjects.push({
      projectId: recentProject.projectId,
      projectName: recentProject.projectName,
      projectFilePath: recentProject.projectFilePath,
      projectRootPath: recentProject.projectRootPath,
      schemaVersion: recentProject.schemaVersion,
      lastOpenedAt: recentProject.lastOpenedAt
    });

    if (normalizedProjects.length === maxRecentProjects) {
      break;
    }
  }

  return normalizedProjects;
}

function readRecentProjects(value: unknown): RecentProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return normalizeRecentProjects(value.filter(isRecentProject));
}

// Default and validation both come from the catalog: missing or invalid
// input falls back to the catalog default, a valid value passes through.
// This is a single-source resolution over this file's own raw JSON — not
// the Project > Application > Default effective-resolution chain.
function readPreviewSettings(value: unknown): ApplicationSettings["preview"] {
  if (!isObject(value)) {
    return {
      renderer: resolveCatalogValue("preview.renderer", undefined).value,
      updateDelayMs: resolveCatalogValue("preview.updateDelayMs", undefined)
        .value
    };
  }

  return {
    renderer: resolveCatalogValue("preview.renderer", value.renderer).value,
    updateDelayMs: resolveCatalogValue(
      "preview.updateDelayMs",
      value.updateDelayMs
    ).value
  };
}

// Like readPreviewSettings above: default and validation both come from the
// catalog, so a missing or invalid on-disk workbench.statusBar.visible
// falls back to the catalog default rather than failing startup.
function readWorkbenchStatusBarSettings(
  value: unknown
): ApplicationSettings["workbench"]["statusBar"] {
  const visible = isObject(value) ? value.visible : undefined;

  return {
    visible: resolveCatalogValue("workbench.statusBar.visible", visible).value
  };
}

function readWorkbenchSoundToggleSettings(
  key:
    | "workbench.sound.dialog.enabled"
    | "workbench.sound.newline.enabled"
    | "workbench.sound.keypress.enabled",
  value: unknown
): { enabled: boolean } {
  const enabled = isObject(value) ? value.enabled : undefined;

  return {
    enabled: resolveCatalogValue(key, enabled).value
  };
}

function readWorkbenchSoundSettings(
  value: unknown
): ApplicationSettings["workbench"]["sound"] {
  const soundValue = isObject(value) ? value : undefined;

  return {
    enabled: resolveCatalogValue(
      "workbench.sound.enabled",
      soundValue?.enabled
    ).value,
    dialog: readWorkbenchSoundToggleSettings(
      "workbench.sound.dialog.enabled",
      soundValue?.dialog
    ),
    newline: readWorkbenchSoundToggleSettings(
      "workbench.sound.newline.enabled",
      soundValue?.newline
    ),
    keypress: readWorkbenchSoundToggleSettings(
      "workbench.sound.keypress.enabled",
      soundValue?.keypress
    )
  };
}

// #174: reads the legacy top-level `language` / `showStatusBar` keys are
// intentionally never consulted here — only the nested workbench.language /
// workbench.statusBar.visible keys are read, matching the write path below.
//
// language/statusBar.visible resolve through the catalog like
// readPreviewSettings (missing/invalid -> catalog default). fontFamily
// keeps the validate-and-omit behavior from #173 D-7 below it: a missing or
// rejected fontFamily stays absent from ApplicationSettings so the write
// path can preserve sparse settings.json storage instead of writing
// "system-ui" back. The catalog default for fontFamily is applied later, in
// resolveEffectiveSettings — not baked in here.
function readWorkbenchSettings(value: unknown): ApplicationSettings["workbench"] {
  const workbenchValue = isObject(value) ? value : undefined;

  const language = resolveCatalogValue(
    "workbench.language",
    workbenchValue?.language
  ).value;
  const statusBar = readWorkbenchStatusBarSettings(workbenchValue?.statusBar);
  const sound = readWorkbenchSoundSettings(workbenchValue?.sound);

  if (
    workbenchValue === undefined ||
    typeof workbenchValue.fontFamily !== "string" ||
    !validateCatalogValue("workbench.fontFamily", workbenchValue.fontFamily).ok
  ) {
    return { language, statusBar, sound };
  }

  return {
    language,
    statusBar,
    sound,
    fontFamily: workbenchValue.fontFamily
  };
}

function readCommandPaletteDescriptionSettings(
  value: unknown
): ApplicationSettings["commandPalette"]["description"] {
  const descriptionValue = isObject(value) ? value : undefined;
  const marqueeValue = isObject(descriptionValue?.marquee)
    ? descriptionValue.marquee
    : undefined;

  return {
    enable: resolveCatalogValue(
      "commandPalette.description.enable",
      descriptionValue?.enable
    ).value,
    marquee: {
      delay: resolveCatalogValue(
        "commandPalette.description.marquee.delay",
        marqueeValue?.delay
      ).value,
      speed: resolveCatalogValue(
        "commandPalette.description.marquee.speed",
        marqueeValue?.speed
      ).value
    }
  };
}

function readCommandPaletteSettings(
  value: unknown
): ApplicationSettings["commandPalette"] {
  const commandPaletteValue = isObject(value) ? value : undefined;

  return {
    description: readCommandPaletteDescriptionSettings(
      commandPaletteValue?.description
    )
  };
}

function readEditorSettings(value: unknown): ApplicationSettings["editor"] {
  const editorValue = isObject(value) ? value : undefined;

  if (
    editorValue === undefined ||
    typeof editorValue.fontFamily !== "string" ||
    !validateCatalogValue("editor.fontFamily", editorValue.fontFamily).ok
  ) {
    return {};
  }

  return { fontFamily: editorValue.fontFamily };
}

function readNewFileSettings(
  value: unknown
): ApplicationSettings["files"]["newFile"] {
  const newFileValue = isObject(value) ? value : undefined;

  return {
    lineEnding: resolveCatalogValue(
      "files.newFile.lineEnding",
      newFileValue?.lineEnding
    ).value,
    encoding: resolveCatalogValue(
      "files.newFile.encoding",
      newFileValue?.encoding
    ).value
  };
}

function readFilesSettings(value: unknown): ApplicationSettings["files"] {
  const filesValue = isObject(value) ? value : undefined;

  return {
    newFile: readNewFileSettings(filesValue?.newFile)
  };
}

function readSettingsValue(value: unknown): ApplicationSettings {
  if (!isObject(value)) {
    return createDefaultApplicationSettings();
  }

  return {
    preview: readPreviewSettings(value.preview),
    workbench: readWorkbenchSettings(value.workbench),
    commandPalette: readCommandPaletteSettings(value.commandPalette),
    editor: readEditorSettings(value.editor),
    files: readFilesSettings(value.files),
    recentProjects: readRecentProjects(value.recentProjects)
  };
}

function parseRecentProjectForSave(value: unknown): RecentProject {
  if (!isObject(value)) {
    throw new Error("Invalid recent project.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 6 ||
    !keys.includes("projectId") ||
    !keys.includes("projectName") ||
    !keys.includes("projectFilePath") ||
    !keys.includes("projectRootPath") ||
    !keys.includes("schemaVersion") ||
    !keys.includes("lastOpenedAt") ||
    typeof value.projectId !== "string" ||
    typeof value.projectName !== "string" ||
    typeof value.projectFilePath !== "string" ||
    typeof value.projectRootPath !== "string" ||
    typeof value.schemaVersion !== "number" ||
    typeof value.lastOpenedAt !== "string"
  ) {
    throw new Error("Invalid recent project.");
  }

  return {
    projectId: value.projectId,
    projectName: value.projectName,
    projectFilePath: value.projectFilePath,
    projectRootPath: value.projectRootPath,
    schemaVersion: value.schemaVersion,
    lastOpenedAt: value.lastOpenedAt
  };
}

function parseRecentProjectsForSave(value: unknown): RecentProject[] {
  if (!Array.isArray(value) || value.length > maxRecentProjects) {
    throw new Error("Invalid application settings.");
  }

  const recentProjects = value.map(parseRecentProjectForSave);
  const projectIds = new Set<string>();

  for (const recentProject of recentProjects) {
    if (projectIds.has(recentProject.projectId)) {
      throw new Error("Invalid application settings.");
    }

    projectIds.add(recentProject.projectId);
  }

  return recentProjects;
}

export function parseSaveApplicationSettingsRequest(
  value: unknown
): SaveApplicationSettingsRequest {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 5 ||
    !keys.includes("preview") ||
    !keys.includes("workbench") ||
    !keys.includes("commandPalette") ||
    !keys.includes("editor") ||
    !keys.includes("files")
  ) {
    throw new Error("Invalid application settings.");
  }

  return {
    preview: parsePreviewSettingsForWrite(value.preview),
    workbench: parseWorkbenchSettingsForWrite(value.workbench),
    commandPalette: parseCommandPaletteSettingsForWrite(value.commandPalette),
    editor: parseEditorSettingsForWrite(value.editor),
    files: parseFilesSettingsForWrite(value.files)
  };
}

function parsePreviewSettingsForWrite(
  value: unknown
): ApplicationSettings["preview"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 2 ||
    !keys.includes("renderer") ||
    !keys.includes("updateDelayMs") ||
    value.renderer === undefined ||
    value.updateDelayMs === undefined
  ) {
    throw new Error("Invalid application settings.");
  }

  const rendererResolution = resolveCatalogValue("preview.renderer", value.renderer);
  const updateDelayMsResolution = resolveCatalogValue(
    "preview.updateDelayMs",
    value.updateDelayMs
  );

  if (!rendererResolution.ok || !updateDelayMsResolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return {
    renderer: rendererResolution.value,
    updateDelayMs: updateDelayMsResolution.value
  };
}

// Same validate-and-reject-the-whole-write style as parsePreviewSettingsForWrite:
// an invalid language/statusBar.visible/sound/fontFamily rejects the save
// request rather than silently dropping just that field (#173 D-9). An
// absent fontFamily key is valid and preserves sparse storage (#173 D-7);
// language, statusBar, and sound are required concrete values.
function parseWorkbenchStatusBarSettingsForWrite(
  value: unknown
): ApplicationSettings["workbench"]["statusBar"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !keys.includes("visible")) {
    throw new Error("Invalid application settings.");
  }

  const resolution = resolveCatalogValue(
    "workbench.statusBar.visible",
    value.visible
  );

  if (!resolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return { visible: resolution.value };
}

function parseWorkbenchSoundToggleSettingsForWrite(
  key:
    | "workbench.sound.dialog.enabled"
    | "workbench.sound.newline.enabled"
    | "workbench.sound.keypress.enabled",
  value: unknown
): { enabled: boolean } {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !keys.includes("enabled")) {
    throw new Error("Invalid application settings.");
  }

  const resolution = resolveCatalogValue(key, value.enabled);

  if (!resolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return { enabled: resolution.value };
}

function parseWorkbenchSoundSettingsForWrite(
  value: unknown
): ApplicationSettings["workbench"]["sound"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 4 ||
    !keys.includes("enabled") ||
    !keys.includes("dialog") ||
    !keys.includes("newline") ||
    !keys.includes("keypress")
  ) {
    throw new Error("Invalid application settings.");
  }

  const enabledResolution = resolveCatalogValue(
    "workbench.sound.enabled",
    value.enabled
  );

  if (!enabledResolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return {
    enabled: enabledResolution.value,
    dialog: parseWorkbenchSoundToggleSettingsForWrite(
      "workbench.sound.dialog.enabled",
      value.dialog
    ),
    newline: parseWorkbenchSoundToggleSettingsForWrite(
      "workbench.sound.newline.enabled",
      value.newline
    ),
    keypress: parseWorkbenchSoundToggleSettingsForWrite(
      "workbench.sound.keypress.enabled",
      value.keypress
    )
  };
}

function parseWorkbenchSettingsForWrite(
  value: unknown
): ApplicationSettings["workbench"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);
  const hasFontFamily = keys.includes("fontFamily");
  const expectedKeyCount = hasFontFamily ? 4 : 3;

  if (
    keys.length !== expectedKeyCount ||
    !keys.includes("language") ||
    !keys.includes("statusBar") ||
    !keys.includes("sound")
  ) {
    throw new Error("Invalid application settings.");
  }

  const languageResolution = resolveCatalogValue(
    "workbench.language",
    value.language
  );

  if (!languageResolution.ok) {
    throw new Error("Invalid application settings.");
  }

  const statusBar = parseWorkbenchStatusBarSettingsForWrite(value.statusBar);
  const sound = parseWorkbenchSoundSettingsForWrite(value.sound);

  if (!hasFontFamily) {
    return {
      language: languageResolution.value,
      statusBar,
      sound
    };
  }

  if (
    typeof value.fontFamily !== "string" ||
    !validateCatalogValue("workbench.fontFamily", value.fontFamily).ok
  ) {
    throw new Error("Invalid application settings.");
  }

  return {
    language: languageResolution.value,
    statusBar,
    sound,
    fontFamily: value.fontFamily
  };
}

function parseCommandPaletteDescriptionSettingsForWrite(
  value: unknown
): ApplicationSettings["commandPalette"]["description"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 2 ||
    !keys.includes("enable") ||
    !keys.includes("marquee") ||
    !isObject(value.marquee)
  ) {
    throw new Error("Invalid application settings.");
  }

  const marqueeKeys = Object.keys(value.marquee);

  if (
    marqueeKeys.length !== 2 ||
    !marqueeKeys.includes("delay") ||
    !marqueeKeys.includes("speed")
  ) {
    throw new Error("Invalid application settings.");
  }

  const enableResolution = resolveCatalogValue(
    "commandPalette.description.enable",
    value.enable
  );
  const delayResolution = resolveCatalogValue(
    "commandPalette.description.marquee.delay",
    value.marquee.delay
  );
  const speedResolution = resolveCatalogValue(
    "commandPalette.description.marquee.speed",
    value.marquee.speed
  );

  if (!enableResolution.ok || !delayResolution.ok || !speedResolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return {
    enable: enableResolution.value,
    marquee: {
      delay: delayResolution.value,
      speed: speedResolution.value
    }
  };
}

function parseCommandPaletteSettingsForWrite(
  value: unknown
): ApplicationSettings["commandPalette"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !keys.includes("description")) {
    throw new Error("Invalid application settings.");
  }

  return {
    description: parseCommandPaletteDescriptionSettingsForWrite(
      value.description
    )
  };
}

function parseEditorSettingsForWrite(
  value: unknown
): ApplicationSettings["editor"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);
  const hasFontFamily = keys.includes("fontFamily");

  if (keys.length !== (hasFontFamily ? 1 : 0)) {
    throw new Error("Invalid application settings.");
  }

  if (!hasFontFamily) {
    return {};
  }

  if (
    typeof value.fontFamily !== "string" ||
    !validateCatalogValue("editor.fontFamily", value.fontFamily).ok
  ) {
    throw new Error("Invalid application settings.");
  }

  return {
    fontFamily: value.fontFamily
  };
}

function parseNewFileSettingsForWrite(
  value: unknown
): ApplicationSettings["files"]["newFile"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 2 ||
    !keys.includes("lineEnding") ||
    !keys.includes("encoding")
  ) {
    throw new Error("Invalid application settings.");
  }

  const lineEndingResolution = resolveCatalogValue(
    "files.newFile.lineEnding",
    value.lineEnding
  );
  const encodingResolution = resolveCatalogValue(
    "files.newFile.encoding",
    value.encoding
  );

  if (!lineEndingResolution.ok || !encodingResolution.ok) {
    throw new Error("Invalid application settings.");
  }

  return {
    lineEnding: lineEndingResolution.value,
    encoding: encodingResolution.value
  };
}

function parseFilesSettingsForWrite(
  value: unknown
): ApplicationSettings["files"] {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (keys.length !== 1 || !keys.includes("newFile")) {
    throw new Error("Invalid application settings.");
  }

  return {
    newFile: parseNewFileSettingsForWrite(value.newFile)
  };
}

function parseApplicationSettingsForWrite(value: unknown): ApplicationSettings {
  if (!isObject(value)) {
    throw new Error("Invalid application settings.");
  }

  const keys = Object.keys(value);

  if (
    keys.length !== 6 ||
    !keys.includes("preview") ||
    !keys.includes("workbench") ||
    !keys.includes("commandPalette") ||
    !keys.includes("editor") ||
    !keys.includes("files") ||
    !keys.includes("recentProjects")
  ) {
    throw new Error("Invalid application settings.");
  }

  return {
    preview: parsePreviewSettingsForWrite(value.preview),
    workbench: parseWorkbenchSettingsForWrite(value.workbench),
    commandPalette: parseCommandPaletteSettingsForWrite(value.commandPalette),
    editor: parseEditorSettingsForWrite(value.editor),
    files: parseFilesSettingsForWrite(value.files),
    recentProjects: parseRecentProjectsForSave(value.recentProjects)
  };
}

export async function loadSettings(): Promise<ApplicationSettings> {
  let rawSettings: string;

  try {
    rawSettings = await fs.readFile(settingsFilePath(), "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return createDefaultApplicationSettings();
    }

    return createDefaultApplicationSettings();
  }

  try {
    return readSettingsValue(JSON.parse(rawSettings));
  } catch {
    return createDefaultApplicationSettings();
  }
}

async function saveSettings(
  settings: ApplicationSettings
): Promise<ApplicationSettings> {
  const validatedSettings = parseApplicationSettingsForWrite(settings);
  const filePath = settingsFilePath();

  await fs.mkdir(path.dirname(filePath), {
    recursive: true
  });
  await fs.writeFile(
    filePath,
    `${JSON.stringify(validatedSettings, null, 2)}\n`,
    "utf8"
  );

  return validatedSettings;
}

export async function saveApplicationSettings(
  settingsRequest: SaveApplicationSettingsRequest
): Promise<ApplicationSettings> {
  const settings = await loadSettings();

  return saveSettings({
    ...settings,
    preview: settingsRequest.preview,
    workbench: settingsRequest.workbench,
    commandPalette: settingsRequest.commandPalette,
    editor: settingsRequest.editor,
    files: settingsRequest.files
  });
}

export async function recordRecentProject(
  recentProject: RecordRecentProjectInput
): Promise<ApplicationSettings> {
  const settings = await loadSettings();
  const openedProject: RecentProject = {
    ...recentProject,
    lastOpenedAt: new Date().toISOString()
  };
  const recentProjects = normalizeRecentProjects([
    openedProject,
    ...settings.recentProjects.filter(
      (storedProject) => storedProject.projectId !== recentProject.projectId
    )
  ]);

  return saveSettings({
    ...settings,
    recentProjects
  });
}

export async function isRecentProjectFilePath(
  projectFilePath: string
): Promise<boolean> {
  return (await findRecentProjectByFilePath(projectFilePath)) !== null;
}

export async function findRecentProjectByFilePath(
  projectFilePath: string
): Promise<RecentProject | null> {
  const settings = await loadSettings();

  return (
    settings.recentProjects.find(
      (recentProject) => recentProject.projectFilePath === projectFilePath
    ) ?? null
  );
}
