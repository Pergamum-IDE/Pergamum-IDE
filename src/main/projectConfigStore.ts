import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  PergamumProjectConfig,
  UpdateProjectSettingsRequest
} from "../shared/api";
import {
  isPreviewRendererId,
  type ProjectDocumentMapSettings,
  type ProjectEditorSettings,
  type ProjectFilesSettings,
  type ProjectImageAttachmentSettings,
  type ProjectPreviewSettings,
  type ProjectSettings
} from "../shared/settings";
import type { DocumentMapDialogueDelimiterPair } from "../shared/documentMapSettings";
import {
  getCatalogEntry,
  isSettingKey,
  validateCatalogValue,
  type SettingKey
} from "../shared/settingsCatalog";
import { writeFileAtomic } from "./atomicFileWrite";

export const projectConfigFileName = "pergamum.json";

function isConfigObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }

  return undefined;
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function invalidProjectConfig(message: string): Error {
  return new Error(`Invalid ${projectConfigFileName}: ${message}`);
}

// ADR-0006 S-8 & S-23:
// Canonical on-disk format uses flat dotted keys under "settings" (e.g. "preview.renderer").
// A settings-subtree structural problem or a rejected known setting value must not fail project open.
// Only project identity/config outside the "settings" subtree and malformed JSON still throw.
//
// A rejected/absent entry is represented purely by omission from the parsed
// project settings result — there is no rejected-entry result type
// (ADR-0006 S-22 diagnostics are out of scope for this read path) and no
// direct substitution of the catalog default here (that belongs to
// resolveEffectiveSettings's existing Project > Application > Default
// fallthrough, not to this parse step). Returning `undefined` rather than
// `{}` for "nothing accepted" keeps the parsed result limited to accepted
// entries only, per #170.
function parseProjectSettings(value: unknown): ProjectSettings | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isConfigObject(value)) {
    return undefined;
  }

  let preview: ProjectPreviewSettings | undefined;
  let editor: ProjectEditorSettings | undefined;
  let files: ProjectFilesSettings | undefined;
  let documentMap: ProjectDocumentMapSettings | undefined;
  let imageAttachment: ProjectImageAttachmentSettings | undefined;

  const rawRenderer = value["preview.renderer"];
  if (rawRenderer !== undefined && isPreviewRendererId(rawRenderer)) {
    preview = { renderer: rawRenderer };
  }

  const rawFontFamily = value["editor.fontFamily"];
  if (rawFontFamily !== undefined) {
    const validation = validateCatalogValue("editor.fontFamily", rawFontFamily);
    if (validation.ok && typeof rawFontFamily === "string") {
      editor = { ...(editor ?? {}), fontFamily: rawFontFamily };
    }
  }

  const rawParagraphIndent =
    value["editor.paragraphIndent.excludeLeadingCharacters"];
  if (rawParagraphIndent !== undefined) {
    const validation = validateCatalogValue(
      "editor.paragraphIndent.excludeLeadingCharacters",
      rawParagraphIndent
    );
    if (validation.ok && typeof rawParagraphIndent === "string") {
      editor = {
        ...(editor ?? {}),
        paragraphIndent: { excludeLeadingCharacters: rawParagraphIndent }
      };
    }
  }

  const rawExpectedLineEnding = value["editor.lineEnding.expected"];
  if (rawExpectedLineEnding !== undefined) {
    const validation = validateCatalogValue(
      "editor.lineEnding.expected",
      rawExpectedLineEnding
    );
    if (validation.ok && typeof rawExpectedLineEnding === "string") {
      editor = {
        ...(editor ?? {}),
        lineEnding: { expected: rawExpectedLineEnding as any }
      };
    }
  }

  const charCountKeys = [
    ["whitespace", "editor.characterCount.exclude.whitespace"],
    ["lineBreaks", "editor.characterCount.exclude.lineBreaks"],
    ["headings", "editor.characterCount.exclude.headings"],
    ["markdownSyntax", "editor.characterCount.exclude.markdownSyntax"],
    ["markdownComments", "editor.characterCount.exclude.markdownComments"]
  ] as const;

  let characterCountExclude: Record<string, boolean> | undefined;
  for (const [subKey, fullKey] of charCountKeys) {
    const rawVal = value[fullKey];
    if (rawVal !== undefined) {
      const validation = validateCatalogValue(fullKey, rawVal);
      if (validation.ok && typeof rawVal === "boolean") {
        characterCountExclude = {
          ...(characterCountExclude ?? {}),
          [subKey]: rawVal
        };
      }
    }
  }
  if (characterCountExclude !== undefined) {
    editor = {
      ...(editor ?? {}),
      characterCount: { exclude: characterCountExclude }
    };
  }

  const rawNewFileLineEnding = value["files.newFile.lineEnding"];
  if (rawNewFileLineEnding !== undefined) {
    const validation = validateCatalogValue(
      "files.newFile.lineEnding",
      rawNewFileLineEnding
    );
    if (validation.ok && typeof rawNewFileLineEnding === "string") {
      files = { newFile: { lineEnding: rawNewFileLineEnding as any } };
    }
  }

  const rawDialogueDelimiterPairs = value["documentMap.dialogueDelimiterPairs"];
  if (rawDialogueDelimiterPairs !== undefined) {
    const validation = validateCatalogValue(
      "documentMap.dialogueDelimiterPairs",
      rawDialogueDelimiterPairs
    );
    if (validation.ok && validation.value !== undefined) {
      documentMap = {
        dialogueDelimiterPairs: validation.value as DocumentMapDialogueDelimiterPair[]
      };
    }
  }

  // #407: sparse image-attachment overrides — each key is accepted
  // independently; a rejected value is simply omitted so
  // resolveEffectiveSettings falls through to Application/Built-in.
  const rawSaveDirectory = value["imageAttachment.saveDirectory"];
  if (rawSaveDirectory !== undefined) {
    const validation = validateCatalogValue(
      "imageAttachment.saveDirectory",
      rawSaveDirectory
    );
    if (validation.ok && typeof rawSaveDirectory === "string") {
      imageAttachment = {
        ...(imageAttachment ?? {}),
        saveDirectory: rawSaveDirectory
      };
    }
  }

  const rawInsertMarkdownLink = value["imageAttachment.insertMarkdownLink"];
  if (rawInsertMarkdownLink !== undefined) {
    const validation = validateCatalogValue(
      "imageAttachment.insertMarkdownLink",
      rawInsertMarkdownLink
    );
    if (validation.ok && typeof rawInsertMarkdownLink === "boolean") {
      imageAttachment = {
        ...(imageAttachment ?? {}),
        insertMarkdownLink: rawInsertMarkdownLink
      };
    }
  }

  if (preview || editor || files || documentMap || imageAttachment) {
    return {
      ...(preview ? { preview } : {}),
      ...(editor ? { editor } : {}),
      ...(files ? { files } : {}),
      ...(documentMap ? { documentMap } : {}),
      ...(imageAttachment ? { imageAttachment } : {})
    };
  }

  return undefined;
}

function parseProjectConfig(value: unknown): PergamumProjectConfig {
  if (!isConfigObject(value)) {
    throw invalidProjectConfig("expected a JSON object.");
  }

  // #422: Project Name source of truth is SQLite metadata.project_name.
  // Any top-level "name" in pergamum.json is legacy ignored and not exposed
  // on PergamumProjectConfig, nor does a non-string "name" fail project open.
  const settings = parseProjectSettings(value.settings);

  return {
    ...(settings === undefined ? {} : { settings })
  };
}

export interface ProjectConfigLoadResult {
  config: PergamumProjectConfig;
  rawSnapshot: Record<string, unknown>;
}

export async function loadProjectConfig(
  rootPath: string
): Promise<ProjectConfigLoadResult | null> {
  const configPath = path.join(rootPath, projectConfigFileName);
  let rawConfig: string;

  try {
    rawConfig = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return null;
    }

    throw new Error(
      `Could not read ${projectConfigFileName}: ${errorDetail(error)}`
    );
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(rawConfig);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid ${projectConfigFileName}: ${errorDetail(error)}`
      );
    }

    throw error;
  }

  if (!isConfigObject(parsedRaw)) {
    throw invalidProjectConfig("expected a JSON object.");
  }

  const config = parseProjectConfig(parsedRaw);
  return {
    config,
    rawSnapshot: parsedRaw
  };
}

export async function readProjectConfig(
  rootPath: string
): Promise<PergamumProjectConfig | null> {
  const result = await loadProjectConfig(rootPath);
  return result ? result.config : null;
}

export interface SaveProjectSettingsParams {
  rootPath: string;
  rawSnapshot: Record<string, unknown> | null;
  request: UpdateProjectSettingsRequest;
}

export interface SaveProjectSettingsResult {
  config: PergamumProjectConfig;
  rawSnapshot: Record<string, unknown>;
  updatedSettings: ProjectSettings | undefined;
}

function validateProjectSettingKey(key: string): { primaryKey: SettingKey } {
  if (!isSettingKey(key)) {
    throw new Error(`Unknown setting key: "${key}".`);
  }

  const entry = getCatalogEntry(key);
  if (entry.scope === "applicationOnly") {
    throw new Error(`Setting "${key}" cannot be overridden at project scope.`);
  }

  return { primaryKey: key };
}

export async function saveProjectSettings(
  params: SaveProjectSettingsParams
): Promise<SaveProjectSettingsResult> {
  const { rootPath, rawSnapshot, request } = params;

  if (!isConfigObject(request)) {
    throw new Error("Invalid update settings request.");
  }

  // Validate request.set entries
  const validatedSet: Record<string, unknown> = {};
  if (request.set !== undefined) {
    if (!isConfigObject(request.set)) {
      throw new Error('Expected "set" to be an object.');
    }
    for (const [key, value] of Object.entries(request.set)) {
      const { primaryKey } = validateProjectSettingKey(key);
      const validation = validateCatalogValue(primaryKey, value);
      if (!validation.ok) {
        throw new Error(
          `Invalid value for setting "${key}": ${validation.failure}.`
        );
      }
      validatedSet[key] =
        validation.value !== undefined ? validation.value : value;
    }
  }

  // Validate request.remove entries
  if (request.remove !== undefined) {
    if (!Array.isArray(request.remove)) {
      throw new Error('Expected "remove" to be an array.');
    }
    for (const key of request.remove) {
      if (typeof key !== "string") {
        throw new Error('Expected "remove" items to be strings.');
      }
      validateProjectSettingKey(key);
    }
  }

  // Reject ambiguous request where the same key appears in both set and remove
  if (request.set !== undefined && request.remove !== undefined) {
    const setKeys = new Set(Object.keys(request.set));
    for (const key of request.remove) {
      if (setKeys.has(key)) {
        throw new Error(
          `Ambiguous update settings request: key "${key}" cannot appear in both "set" and "remove".`
        );
      }
    }
  }

  // Build next rawSnapshot without re-reading pergamum.json from disk
  const nextRaw: Record<string, unknown> = rawSnapshot
    ? { ...rawSnapshot }
    : {};
  const currentSettings: Record<string, unknown> = isConfigObject(
    nextRaw.settings
  )
    ? { ...nextRaw.settings }
    : {};

  if (request.remove !== undefined) {
    for (const key of request.remove) {
      delete currentSettings[key];
    }
  }

  if (request.set !== undefined) {
    for (const [key, value] of Object.entries(validatedSet)) {
      currentSettings[key] = value;
    }
  }

  if (Object.keys(currentSettings).length > 0) {
    nextRaw.settings = currentSettings;
  } else {
    delete nextRaw.settings;
  }

  const serialized = JSON.stringify(nextRaw, null, 2) + "\n";
  const configPath = path.join(rootPath, projectConfigFileName);
  await writeFileAtomic(configPath, serialized);

  const nextConfig = parseProjectConfig(nextRaw);
  return {
    config: nextConfig,
    rawSnapshot: nextRaw,
    updatedSettings: nextConfig.settings
  };
}
