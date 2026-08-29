import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  FILE_CHANNELS,
  type MarkdownFile,
  type SaveMarkdownRequest,
  type SaveMarkdownResult,
  type SelectMarkdownSavePathRequest,
  type SelectMarkdownSavePathResult,
  type WriteMarkdownRequest,
  type WriteMarkdownResult
} from "../shared/api";
import type { AppPlatform } from "../shared/platform";
import {
  isPathEqualOrInsideDirectory,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";
import { writeFileAtomic } from "./atomicFileWrite";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import {
  debugLogExtensionForPath,
  debugLogLineCount,
  debugLogLineEndingKind,
  debugLogPathDepth,
  debugLogSizeBucket
} from "./debugLogSanitizer";
import {
  decodeMarkdownBytes,
  markdownWriteMetadata,
  sanitizedFileIoError
} from "./markdownFileIo";
import {
  currentActiveProjectFilePath,
  currentProjectRootPath,
  projectWriteLockDirectoryPath
} from "./projectIpc";

const markdownFilters = [
  {
    name: "Markdown",
    extensions: ["md", "markdown", "mdown", "mkd"]
  }
];

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function documentOpenIdFromRequest(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const candidate = (value as Record<string, unknown>).documentOpenId;

  return typeof candidate === "string" ? candidate : undefined;
}

function durationSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function parseSaveRequest(value: unknown): SaveMarkdownRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    !("content" in value) ||
    typeof value.content !== "string"
  ) {
    throw new Error("Invalid save request.");
  }

  const maybePath = "path" in value ? value.path : null;
  if (maybePath !== null && typeof maybePath !== "string") {
    throw new Error("Invalid save path.");
  }

  return {
    path: maybePath,
    content: value.content
  };
}

function parseSelectMarkdownSavePathRequest(
  value: unknown
): SelectMarkdownSavePathRequest {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid save path selection request.");
  }

  const maybeDefaultPath = "defaultPath" in value ? value.defaultPath : null;
  if (maybeDefaultPath !== null && typeof maybeDefaultPath !== "string") {
    throw new Error("Invalid default save path.");
  }

  return {
    defaultPath: maybeDefaultPath
  };
}

function parseReadMarkdownFileRequest(value: unknown): { path: string } {
  if (
    typeof value !== "object" ||
    value === null ||
    !("path" in value) ||
    typeof (value as { path?: unknown }).path !== "string" ||
    (value as { path: string }).path.length === 0
  ) {
    throw new Error("Invalid markdown read request.");
  }

  return { path: (value as { path: string }).path };
}

function parseWriteMarkdownRequest(value: unknown): WriteMarkdownRequest {
  if (
    typeof value !== "object" ||
    value === null ||
    !("path" in value) ||
    typeof value.path !== "string" ||
    !("content" in value) ||
    typeof value.content !== "string"
  ) {
    throw new Error("Invalid markdown write request.");
  }

  return {
    path: value.path,
    content: value.content
  };
}

function ensureMarkdownExtension(filePath: string): string {
  if (path.extname(filePath)) {
    return filePath;
  }

  return `${filePath}.md`;
}

function nodePlatformToAppPlatform(platform: NodeJS.Platform): AppPlatform {
  switch (platform) {
    case "win32":
      return "windows";
    case "darwin":
      return "macos";
    case "linux":
      return "linux";
    default:
      return "other";
  }
}

function nodeErrorCode(error: unknown): string | null {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
}

async function realpathIfExists(filePath: string): Promise<string | null> {
  try {
    return await fs.realpath(filePath);
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function realpathForSaveTarget(filePath: string): Promise<string | null> {
  const absolutePath = path.resolve(filePath);
  let existingTargetRealpath: string | null;

  try {
    existingTargetRealpath = await realpathIfExists(absolutePath);
  } catch {
    return null;
  }

  if (existingTargetRealpath) {
    return existingTargetRealpath;
  }

  try {
    const parentRealpath = await fs.realpath(path.dirname(absolutePath));

    return path.join(parentRealpath, path.basename(absolutePath));
  } catch {
    return null;
  }
}

async function protectedTargetRejectionReason(
  filePath: string
): Promise<"protected" | "unverifiable" | null> {
  if (isProtectedPergamumDataFilePath(filePath)) {
    return "protected";
  }

  const projectFilePath = currentActiveProjectFilePath();

  if (!projectFilePath) {
    return null;
  }

  const platform = nodePlatformToAppPlatform(process.platform);
  const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
  const resolvedLockDirectoryPath = path.resolve(lockDirectoryPath);

  try {
    if (
      isPathEqualOrInsideDirectory(
        path.resolve(filePath),
        resolvedLockDirectoryPath,
        platform
      )
    ) {
      return "protected";
    }
  } catch {
    return "unverifiable";
  }

  const targetRealpath = await realpathForSaveTarget(filePath);

  if (!targetRealpath) {
    return "unverifiable";
  }

  const lockDirectoryCandidates = [resolvedLockDirectoryPath];
  let lockDirectoryRealpath: string | null;

  try {
    lockDirectoryRealpath = await realpathIfExists(lockDirectoryPath);
  } catch {
    return "unverifiable";
  }

  if (lockDirectoryRealpath) {
    lockDirectoryCandidates.push(lockDirectoryRealpath);
  }

  return lockDirectoryCandidates.some((candidate) =>
    isPathEqualOrInsideDirectory(targetRealpath, candidate, platform)
  )
    ? "protected"
    : null;
}

async function classifyStandaloneSaveTarget(
  filePath: string
): Promise<
  | { kind: "allowed" }
  | { kind: "rejected"; reason: "protected" | "unverifiable" }
> {
  const reason = await protectedTargetRejectionReason(filePath);

  return reason ? { kind: "rejected", reason } : { kind: "allowed" };
}

async function selectMarkdownSavePath(
  event: IpcMainInvokeEvent,
  request: SelectMarkdownSavePathRequest
): Promise<SelectMarkdownSavePathResult | null> {
  const owner = parentWindow(event);
  const options: SaveDialogOptions = {
    title: "Save Markdown File",
    defaultPath: request.defaultPath ?? "Untitled.md",
    filters: markdownFilters
  };
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return null;
  }

  const filePath = ensureMarkdownExtension(result.filePath);

  return {
    path: filePath
  };
}

async function writeStandaloneMarkdown(
  filePath: string,
  content: string,
  logger: DebugLogger,
  startedAt: number
): Promise<WriteMarkdownResult> {
  const normalizedPath = ensureMarkdownExtension(filePath);
  const targetClassification =
    await classifyStandaloneSaveTarget(normalizedPath);

  if (targetClassification.kind === "rejected") {
    return targetClassification;
  }

  const metadata = markdownWriteMetadata(content);

  // Crash-safe manuscript write: a temp sibling file is written + fsync'd,
  // then atomically renamed over the target. An interrupted save can never
  // leave the previous good file truncated / half-overwritten. Save success
  // therefore means "the atomic replace completed"; any failure throws here
  // and is surfaced as a non-cleaning file I/O error below.
  await writeFileAtomic(normalizedPath, content);

  logger.log({
    level: "debug",
    event: "save.succeeded",
    details: {
      documentRef: logger.documentRefForKey(normalizedPath),
      editorIdKind: "file",
      saveTargetKind: "standaloneMarkdown",
      pathKind: "unknown",
      extension: debugLogExtensionForPath(normalizedPath),
      pathDepth: debugLogPathDepth(normalizedPath),
      lineCount: debugLogLineCount(content),
      lineEndingKind: metadata.lineEnding,
      sizeBucket: debugLogSizeBucket(metadata.byteLength),
      byteLength: metadata.byteLength,
      characterLength: metadata.characterLength,
      encodingAssumption: metadata.encoding,
      operation: "write",
      result: "succeeded",
      durationMs: durationSince(startedAt)
    }
  });

  return {
    kind: "saved",
    path: normalizedPath,
    encoding: metadata.encoding,
    lineEnding: metadata.lineEnding,
    byteLength: metadata.byteLength,
    characterLength: metadata.characterLength
  };
}

export function registerFileIpc(logger: DebugLogger = getDebugLogger()): void {
  ipcMain.handle(
    FILE_CHANNELS.openMarkdown,
    async (event, rawRequest: unknown): Promise<MarkdownFile | null> => {
      const startedAt = Date.now();
      const documentOpenId = documentOpenIdFromRequest(rawRequest);
      let filePath: string | null = null;

      try {
        const owner = parentWindow(event);
        const projectRootPath = currentProjectRootPath();
        const options: OpenDialogOptions = {
          title: "Open Markdown File",
          properties: ["openFile"],
          filters: markdownFilters,
          // Starts the chooser in the active project (when one is open)
          // instead of wherever it last was, so explicit Markdown open
          // doesn't force the user to navigate away from their project.
          // Falls back to Electron's own default (last-used directory) when
          // no project is open, matching prior behavior.
          ...(projectRootPath ? { defaultPath: projectRootPath } : {})
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, options)
          : await dialog.showOpenDialog(options);

        if (result.canceled || result.filePaths.length === 0) {
          return null;
        }

        filePath = result.filePaths[0];

        const readStartedAt = Date.now();
        const bytes = await fs.readFile(filePath);
        const decoded = decodeMarkdownBytes(bytes);
        const readDurationMs = durationSince(readStartedAt);

        // Isolates pure file-read + UTF-8 decode cost (#152), excluding the
        // open-dialog interaction time that `startedAt` above still covers.
        logger.log({
          level: "debug",
          event: "document.open.fileRead.completed",
          details: {
            ...(documentOpenId ? { documentOpenId } : {}),
            documentRef: logger.documentRefForKey(filePath),
            extension: debugLogExtensionForPath(filePath),
            pathDepth: debugLogPathDepth(filePath),
            lineCount: debugLogLineCount(decoded.content),
            lineEndingKind: decoded.lineEnding,
            sizeBucket: debugLogSizeBucket(decoded.byteLength),
            fileSizeBytes: decoded.byteLength,
            byteLength: decoded.byteLength,
            characterLength: decoded.characterLength,
            hadBom: decoded.hadBom,
            encodingAssumption: decoded.encoding,
            operation: "read",
            result: "succeeded",
            durationMs: readDurationMs
          }
        });

        return {
          path: filePath,
          content: decoded.content,
          metadata: {
            encoding: decoded.encoding,
            lineEnding: decoded.lineEnding,
            byteLength: decoded.byteLength,
            characterLength: decoded.characterLength,
            hadBom: decoded.hadBom
          }
        };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        const documentRef = filePath
          ? logger.documentRefForKey(filePath)
          : undefined;

        logger.log({
          level: "error",
          event: "document.open.failed",
          details: {
            ...(documentOpenId ? { documentOpenId } : {}),
            ...(documentRef ? { documentRef } : {}),
            editorIdKind: "file",
            saveTargetKind: "standaloneMarkdown",
            pathKind: "unknown",
            extension: filePath ? debugLogExtensionForPath(filePath) : "unknown",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
            operation: "read",
            result: "failed",
            reason: safeError.reason,
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      }
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.readMarkdownFile,
    async (_event, rawRequest: unknown): Promise<MarkdownFile> => {
      const startedAt = Date.now();
      let filePath: string | null = null;

      try {
        filePath = parseReadMarkdownFileRequest(rawRequest).path;

        const bytes = await fs.readFile(filePath);
        const decoded = decodeMarkdownBytes(bytes);

        logger.log({
          level: "debug",
          event: "document.open.fileRead.completed",
          details: {
            documentRef: logger.documentRefForKey(filePath),
            extension: debugLogExtensionForPath(filePath),
            pathDepth: debugLogPathDepth(filePath),
            lineCount: debugLogLineCount(decoded.content),
            lineEndingKind: decoded.lineEnding,
            sizeBucket: debugLogSizeBucket(decoded.byteLength),
            fileSizeBytes: decoded.byteLength,
            byteLength: decoded.byteLength,
            characterLength: decoded.characterLength,
            hadBom: decoded.hadBom,
            encodingAssumption: decoded.encoding,
            operation: "read",
            result: "succeeded",
            durationMs: durationSince(startedAt)
          }
        });

        return {
          path: filePath,
          content: decoded.content,
          metadata: {
            encoding: decoded.encoding,
            lineEnding: decoded.lineEnding,
            byteLength: decoded.byteLength,
            characterLength: decoded.characterLength,
            hadBom: decoded.hadBom
          }
        };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);

        logger.log({
          level: "error",
          event: "document.open.failed",
          details: {
            ...(filePath
              ? { documentRef: logger.documentRefForKey(filePath) }
              : {}),
            editorIdKind: "file",
            saveTargetKind: "standaloneMarkdown",
            pathKind: "unknown",
            extension: filePath
              ? debugLogExtensionForPath(filePath)
              : "unknown",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
            operation: "read",
            result: "failed",
            reason: safeError.reason,
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      }
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.saveMarkdown,
    async (event, rawRequest: unknown): Promise<SaveMarkdownResult | null> => {
      const startedAt = Date.now();
      let request: SaveMarkdownRequest | null = null;
      let filePath: string | null = null;

      try {
        request = parseSaveRequest(rawRequest);
        filePath = request.path;

        if (!filePath) {
          const selectedPath = await selectMarkdownSavePath(event, {
            defaultPath: null
          });

          if (!selectedPath) {
            return null;
          }

          filePath = selectedPath.path;
        }

        const result = await writeStandaloneMarkdown(
          filePath,
          request.content,
          logger,
          startedAt
        );

        if (result.kind === "rejected") {
          return result;
        }

        return {
          kind: "saved",
          path: result.path
        };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        const documentRef = filePath
          ? logger.documentRefForKey(filePath)
          : undefined;
        const content = request?.content ?? "";

        logger.log({
          level: "error",
          event: "document.save.failed",
          details: {
            ...(documentRef ? { documentRef } : {}),
            editorIdKind: "file",
            saveTargetKind: "standaloneMarkdown",
            pathKind: "unknown",
            extension: filePath ? debugLogExtensionForPath(filePath) : "unknown",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
            lineCount: request ? debugLogLineCount(content) : undefined,
            lineEndingKind: request
              ? debugLogLineEndingKind(content)
              : undefined,
            sizeBucket: request
              ? debugLogSizeBucket(Buffer.byteLength(content, "utf8"))
              : undefined,
            byteLength: request
              ? Buffer.byteLength(content, "utf8")
              : undefined,
            characterLength: request ? content.length : undefined,
            encodingAssumption: request ? "utf8" : undefined,
            operation: "write",
            result: "failed",
            reason: safeError.reason,
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      }
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.selectMarkdownSavePath,
    async (
      event,
      rawRequest: unknown
    ): Promise<SelectMarkdownSavePathResult | null> => {
      try {
        return await selectMarkdownSavePath(
          event,
          parseSelectMarkdownSavePathRequest(rawRequest)
        );
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        throw safeError;
      }
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.writeMarkdown,
    async (_event, rawRequest: unknown): Promise<WriteMarkdownResult> => {
      const startedAt = Date.now();
      let request: WriteMarkdownRequest | null = null;
      let filePath: string | null = null;

      try {
        request = parseWriteMarkdownRequest(rawRequest);
        filePath = request.path;

        return await writeStandaloneMarkdown(
          filePath,
          request.content,
          logger,
          startedAt
        );
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        const documentRef = filePath
          ? logger.documentRefForKey(filePath)
          : undefined;
        const content = request?.content ?? "";

        logger.log({
          level: "error",
          event: "document.save.failed",
          details: {
            ...(documentRef ? { documentRef } : {}),
            editorIdKind: "file",
            saveTargetKind: "standaloneMarkdown",
            pathKind: "unknown",
            extension: filePath ? debugLogExtensionForPath(filePath) : "unknown",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
            lineCount: request ? debugLogLineCount(content) : undefined,
            lineEndingKind: request
              ? debugLogLineEndingKind(content)
              : undefined,
            sizeBucket: request
              ? debugLogSizeBucket(Buffer.byteLength(content, "utf8"))
              : undefined,
            byteLength: request
              ? Buffer.byteLength(content, "utf8")
              : undefined,
            characterLength: request ? content.length : undefined,
            encodingAssumption: request ? "utf8" : undefined,
            operation: "write",
            result: "failed",
            reason: safeError.reason,
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      }
    }
  );
}
