import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions
} from "electron";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  FILE_CHANNELS,
  type CheckFileExistsResult,
  type ExportHtmlCombinedRequest,
  type ExportHtmlCombinedResult,
  type ExportPdfCombinedRequest,
  type ExportPdfCombinedResult,
  type ExportPngFailureReason,
  type ExportPngResult,
  type ExportTxtUtf8Request,
  type ExportTxtUtf8Result,
  type GetDocumentsPathResult,
  type MarkdownFile,
  type MarkdownFileStat,
  type SaveMarkdownRequest,
  type SaveMarkdownResult,
  type SelectExportFolderResult,
  type SelectMarkdownSavePathRequest,
  type SelectMarkdownSavePathResult,
  type SelectPdfSavePathRequest,
  type SelectPdfSavePathResult,
  type WriteMarkdownRequest,
  type WriteMarkdownResult
} from "../shared/api";
import type { AppPlatform } from "../shared/platform";
import {
  isPathEqualOrInsideDirectory,
  isProtectedPergamumDataFilePath
} from "../shared/saveTargetPolicy";
import { inspectPdfFonts } from "../shared/pdfFontInspection";
import {
  buildPdfHeaderFooterTemplates,
  type PdfPageNumberSettings
} from "../shared/pdfPageNumbering";
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
  detectMarkdownLineEnding,
  markdownWriteMetadata,
  sanitizedFileIoError
} from "./markdownFileIo";
import { loadSettings } from "./settingsStore";
import { decodeTextFileBytes, type DecodeTextFileBytesResult } from "./textFileIo";
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

const txtUtf8Filters = [
  {
    name: "TXT（UTF-8）",
    extensions: ["txt"]
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

/**
 * #360: an `fs.Stats` timestamp → ISO string, or `null` when it is not a
 * usable date (NaN, or the Unix epoch, which several filesystems report when
 * birthtime is unsupported).
 */
function isoTimestampOrNull(value: Date): string | null {
  const ms = value.getTime();
  return Number.isFinite(ms) && ms > 0 ? value.toISOString() : null;
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

function parseExportTxtUtf8Request(value: unknown): ExportTxtUtf8Request {
  if (
    typeof value !== "object" ||
    value === null ||
    !("defaultFileName" in value) ||
    typeof value.defaultFileName !== "string" ||
    value.defaultFileName.trim().length === 0 ||
    !("content" in value) ||
    typeof value.content !== "string"
  ) {
    throw new Error("Invalid TXT export request.");
  }

  const obj = value as Record<string, unknown>;

  return {
    defaultFileName: ensureTxtExtension(value.defaultFileName.trim()),
    content: value.content,
    targetPath:
      typeof obj.targetPath === "string" && obj.targetPath.trim().length > 0
        ? obj.targetPath.trim()
        : null,
    allowOverwrite: obj.allowOverwrite === true
  };
}

function ensureMarkdownExtension(filePath: string): string {
  if (path.extname(filePath)) {
    return filePath;
  }

  return `${filePath}.md`;
}

function ensureTxtExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === ".txt"
    ? filePath
    : `${filePath}.txt`;
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

/**
 * #537: maps a raw Node `error.code` from a PNG export write to a small,
 * stable reason — the raw Node error / exception text is never surfaced to
 * the renderer (same convention as `fileExplorerCreateFailureReasonFromErrorCode`
 * / `fileExplorerRenameFailureReasonFromErrorCode`).
 */
function exportPngFailureReasonFromErrorCode(
  code: string | null
): ExportPngFailureReason {
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "permissionDenied";
    case "ENOSPC":
      return "noSpace";
    case "EROFS":
      return "readOnlyFilesystem";
    default:
      return "unknown";
  }
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
        let decoded: {
          content: string;
          encoding: "utf8";
          lineEnding: ReturnType<typeof detectMarkdownLineEnding>;
          byteLength: number;
          characterLength: number;
          hadBom: boolean;
        };

        if (filePath.toLowerCase().endsWith(".txt")) {
          const settings = await loadSettings();
          const encoding = settings?.textFiles?.encoding ?? "utf8";
          let textDecoded: DecodeTextFileBytesResult;

          try {
            textDecoded = decodeTextFileBytes(bytes, encoding);
          } catch (err) {
            if (encoding === "utf8" || encoding === "utf8Bom") {
              try {
                textDecoded = decodeTextFileBytes(bytes, "shiftJis");
              } catch {
                throw err;
              }
            } else {
              throw err;
            }
          }

          decoded = {
            content: textDecoded.content,
            encoding: "utf8" as const,
            lineEnding: detectMarkdownLineEnding(textDecoded.content),
            byteLength: bytes.byteLength,
            characterLength: textDecoded.content.length,
            hadBom: textDecoded.hadBom
          };
        } else {
          decoded = decodeMarkdownBytes(bytes);
        }
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
        let decoded: {
          content: string;
          encoding: "utf8";
          lineEnding: ReturnType<typeof detectMarkdownLineEnding>;
          byteLength: number;
          characterLength: number;
          hadBom: boolean;
        };

        if (filePath.toLowerCase().endsWith(".txt")) {
          const settings = await loadSettings();
          const encoding = settings?.textFiles?.encoding ?? "utf8";
          let textDecoded: DecodeTextFileBytesResult;

          try {
            textDecoded = decodeTextFileBytes(bytes, encoding);
          } catch (err) {
            if (encoding === "utf8" || encoding === "utf8Bom") {
              try {
                textDecoded = decodeTextFileBytes(bytes, "shiftJis");
              } catch {
                throw err;
              }
            } else {
              throw err;
            }
          }

          decoded = {
            content: textDecoded.content,
            encoding: "utf8" as const,
            lineEnding: detectMarkdownLineEnding(textDecoded.content),
            byteLength: bytes.byteLength,
            characterLength: textDecoded.content.length,
            hadBom: textDecoded.hadBom
          };
        } else {
          decoded = decodeMarkdownBytes(bytes);
        }

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

  // #360: Document Metrics "ファイル情報" — last-modified time (mtime) for
  // one file by absolute path. No content read. A failed stat rejects with a
  // sanitized error; the renderer then shows its "unavailable" state, so a
  // missing / unreadable file never disrupts the editor. Creation time is
  // not surfaced — birthtime is misleading for a manuscript (see #360).
  ipcMain.handle(
    FILE_CHANNELS.statMarkdownFile,
    async (_event, rawRequest: unknown): Promise<MarkdownFileStat> => {
      let filePath: string | null = null;

      try {
        filePath = parseReadMarkdownFileRequest(rawRequest).path;

        const stats = await fs.stat(filePath);

        return {
          modifiedAtIso: isoTimestampOrNull(stats.mtime)
        };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);

        logger.log({
          level: "debug",
          event: "document.open.failed",
          details: {
            ...(filePath
              ? { documentRef: logger.documentRefForKey(filePath) }
              : {}),
            extension: filePath
              ? debugLogExtensionForPath(filePath)
              : "unknown",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
            operation: "read",
            result: "failed",
            reason: safeError.reason,
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

  ipcMain.handle(
    FILE_CHANNELS.exportTxtUtf8,
    async (
      event,
      rawRequest: unknown
    ): Promise<ExportTxtUtf8Result> => {
      const startedAt = Date.now();
      let request: ExportTxtUtf8Request | null = null;
      let filePath: string | null = null;

      try {
        request = parseExportTxtUtf8Request(rawRequest);
        if (request.targetPath) {
          filePath = ensureTxtExtension(request.targetPath);
        } else {
          const owner = parentWindow(event);
          const options: SaveDialogOptions = {
            title: "Export TXT (UTF-8)",
            defaultPath: request.defaultFileName,
            filters: txtUtf8Filters
          };
          const selected = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);

          if (selected.canceled || !selected.filePath) {
            return { ok: false, reason: "canceled" };
          }

          filePath = ensureTxtExtension(selected.filePath);
        }

        const targetClassification =
          await classifyStandaloneSaveTarget(filePath);
        if (targetClassification.kind === "rejected") {
          throw new Error(`TXT export target rejected: ${targetClassification.reason}`);
        }

        let fileExists = false;
        try {
          await fs.stat(filePath);
          fileExists = true;
        } catch {
          fileExists = false;
        }

        if (fileExists && request.allowOverwrite !== true) {
          throw new Error(`Target file already exists and allowOverwrite is not true: ${filePath}`);
        }

        await writeFileAtomic(filePath, request.content);

        logger.log({
          level: "debug",
          event: "export.txt.succeeded",
          details: {
            documentRef: logger.documentRefForKey(filePath),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: debugLogExtensionForPath(filePath),
            pathDepth: debugLogPathDepth(filePath),
            lineCount: debugLogLineCount(request.content),
            lineEndingKind: debugLogLineEndingKind(request.content),
            sizeBucket: debugLogSizeBucket(
              Buffer.byteLength(request.content, "utf8")
            ),
            byteLength: Buffer.byteLength(request.content, "utf8"),
            characterLength: request.content.length,
            encodingAssumption: "utf8",
            operation: "write",
            result: "succeeded",
            durationMs: durationSince(startedAt)
          }
        });

        return { ok: true, outputPath: filePath };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);

        logger.log({
          level: "error",
          event: "export.txt.failed",
          details: {
            ...(filePath
              ? { documentRef: logger.documentRefForKey(filePath) }
              : {}),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: filePath ? debugLogExtensionForPath(filePath) : ".txt",
            pathDepth: filePath ? debugLogPathDepth(filePath) : undefined,
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
    FILE_CHANNELS.readAozoraTextFile,
    async (_event, rawRequest: unknown): Promise<string> => {
      const filePath =
        typeof rawRequest === "object" && rawRequest !== null && "path" in rawRequest
          ? String((rawRequest as { path: unknown }).path)
          : String(rawRequest);
      const bytes = await fs.readFile(filePath);
      const decoder = new TextDecoder("shift_jis");
      return decoder.decode(bytes);
    }
  );

  function ensureHtmlExtension(targetPath: string): string {
    return targetPath.toLowerCase().endsWith(".html")
      ? targetPath
      : `${targetPath}.html`;
  }

  function parseExportHtmlCombinedRequest(
    raw: unknown
  ): ExportHtmlCombinedRequest {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Invalid request: expected object");
    }
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.defaultFileName !== "string" ||
      typeof obj.htmlContent !== "string"
    ) {
      throw new Error(
        "Invalid request: missing defaultFileName or htmlContent"
      );
    }
    const imageAssets = Array.isArray(obj.imageAssets)
      ? obj.imageAssets.map((item: unknown) => {
          const assetObj = (item as Record<string, unknown>) ?? {};
          return {
            sourceProjectRelativePath: String(
              assetObj.sourceProjectRelativePath ?? ""
            ),
            outputRelativePath: String(assetObj.outputRelativePath ?? "")
          };
        })
      : [];
    return {
      defaultFileName: obj.defaultFileName,
      htmlContent: obj.htmlContent,
      imageAssets,
      projectRootPath:
        typeof obj.projectRootPath === "string" ? obj.projectRootPath : null,
      targetPath:
        typeof obj.targetPath === "string" && obj.targetPath.trim().length > 0
          ? obj.targetPath.trim()
          : null,
      allowOverwrite: obj.allowOverwrite === true
    };
  }

  function isSubPath(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  ipcMain.handle(
    FILE_CHANNELS.exportHtmlCombined,
    async (
      event,
      rawRequest: unknown
    ): Promise<ExportHtmlCombinedResult> => {
      const startedAt = Date.now();
      let request: ExportHtmlCombinedRequest | null = null;
      let finalPath: string | null = null;

      try {
        request = parseExportHtmlCombinedRequest(rawRequest);
        if (request.targetPath) {
          finalPath = path.normalize(ensureHtmlExtension(request.targetPath));
        } else {
          const owner = parentWindow(event);
          const options: SaveDialogOptions = {
            title: "Export HTML (Combined)",
            defaultPath: request.defaultFileName,
            filters: [{ name: "HTML (*.html)", extensions: ["html"] }]
          };
          const selected = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);

          if (selected.canceled || !selected.filePath) {
            return { ok: false, reason: "canceled" };
          }

          finalPath = path.normalize(ensureHtmlExtension(selected.filePath));
        }

        const targetClassification =
          await classifyStandaloneSaveTarget(finalPath);
        if (targetClassification.kind === "rejected") {
          throw new Error(
            `HTML export target rejected: ${targetClassification.reason}`
          );
        }

        let fileExists = false;
        try {
          await fs.stat(finalPath);
          fileExists = true;
        } catch {
          fileExists = false;
        }

        if (fileExists && request.allowOverwrite !== true) {
          throw new Error(
            `Target file already exists and allowOverwrite is not true: ${finalPath}`
          );
        }

        await writeFileAtomic(finalPath, request.htmlContent);

        const exportDir = path.dirname(finalPath);
        let warningCount = 0;

        for (const item of request.imageAssets) {
          try {
            if (!item.sourceProjectRelativePath || !item.outputRelativePath) {
              warningCount += 1;
              continue;
            }

            if (request.projectRootPath) {
              const sourceAbs = path.resolve(
                request.projectRootPath,
                item.sourceProjectRelativePath
              );
              if (!isSubPath(request.projectRootPath, sourceAbs)) {
                warningCount += 1;
                continue;
              }

              try {
                await fs.stat(sourceAbs);
              } catch {
                warningCount += 1;
                continue;
              }

              const destAbs = path.resolve(exportDir, item.outputRelativePath);
              if (!isSubPath(exportDir, destAbs)) {
                warningCount += 1;
                continue;
              }

              await fs.mkdir(path.dirname(destAbs), { recursive: true });
              await fs.copyFile(sourceAbs, destAbs);
            } else {
              warningCount += 1;
            }
          } catch {
            warningCount += 1;
          }
        }

        logger.log({
          level: "debug",
          event: "export.html.succeeded",
          details: {
            documentRef: logger.documentRefForKey(finalPath),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: debugLogExtensionForPath(finalPath),
            pathDepth: debugLogPathDepth(finalPath),
            lineCount: debugLogLineCount(request.htmlContent),
            lineEndingKind: debugLogLineEndingKind(request.htmlContent),
            sizeBucket: debugLogSizeBucket(
              Buffer.byteLength(request.htmlContent, "utf8")
            ),
            byteLength: Buffer.byteLength(request.htmlContent, "utf8"),
            characterLength: request.htmlContent.length,
            encodingAssumption: "utf8",
            operation: "write",
            result: "succeeded",
            warningCount,
            durationMs: durationSince(startedAt)
          }
        });

        return { ok: true, outputPath: finalPath, warningCount };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);

        logger.log({
          level: "error",
          event: "export.html.failed",
          details: {
            ...(finalPath
              ? { documentRef: logger.documentRefForKey(finalPath) }
              : {}),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: finalPath
              ? debugLogExtensionForPath(finalPath)
              : ".html",
            pathDepth: finalPath ? debugLogPathDepth(finalPath) : undefined,
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

  function ensurePdfExtension(targetPath: string): string {
    return targetPath.toLowerCase().endsWith(".pdf")
      ? targetPath
      : `${targetPath}.pdf`;
  }

  function parseExportPdfCombinedRequest(
    raw: unknown
  ): ExportPdfCombinedRequest {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Invalid request: expected object");
    }
    const obj = raw as Record<string, unknown>;
    if (
      typeof obj.defaultFileName !== "string" ||
      typeof obj.htmlContent !== "string"
    ) {
      throw new Error(
        "Invalid request: missing defaultFileName or htmlContent"
      );
    }
    const imageAssets = Array.isArray(obj.imageAssets)
      ? obj.imageAssets.map((item: unknown) => {
          const assetObj = (item as Record<string, unknown>) ?? {};
          return {
            sourceProjectRelativePath: String(
              assetObj.sourceProjectRelativePath ?? ""
            ),
            outputRelativePath: String(assetObj.outputRelativePath ?? "")
          };
        })
      : [];
    const pdfPageNumberSettings =
      typeof obj.pdfPageNumberSettings === "object" &&
      obj.pdfPageNumberSettings !== null
        ? ({
            position: String(
              (obj.pdfPageNumberSettings as Record<string, unknown>).position ??
                "none"
            ),
            format: String(
              (obj.pdfPageNumberSettings as Record<string, unknown>).format ?? "none"
            )
          } as PdfPageNumberSettings)
        : null;

    const pdfWritingMode =
      obj.pdfWritingMode === "vertical-rl" ? "vertical-rl" : "horizontal";

    return {
      targetPath:
        typeof obj.targetPath === "string" && obj.targetPath.trim().length > 0
          ? obj.targetPath.trim()
          : null,
      defaultFileName: obj.defaultFileName,
      htmlContent: obj.htmlContent,
      imageAssets,
      projectRootPath:
        typeof obj.projectRootPath === "string" ? obj.projectRootPath : null,
      pdfFontFamily:
        typeof obj.pdfFontFamily === "string" ? obj.pdfFontFamily : null,
      pdfPageNumberSettings,
      pdfWritingMode,
      allowOverwrite: obj.allowOverwrite === true
    };
  }

  ipcMain.handle(
    FILE_CHANNELS.selectPdfSavePath,
    async (
      event,
      rawRequest: unknown
    ): Promise<SelectPdfSavePathResult> => {
      const defaultFileName =
        typeof rawRequest === "object" &&
        rawRequest !== null &&
        "defaultFileName" in rawRequest &&
        typeof (rawRequest as { defaultFileName?: unknown }).defaultFileName ===
          "string"
          ? (rawRequest as { defaultFileName: string }).defaultFileName
          : "export.pdf";

      const owner = parentWindow(event);
      const options: SaveDialogOptions = {
        title: "Export PDF (Combined)",
        defaultPath: defaultFileName,
        filters: [{ name: "PDF (*.pdf)", extensions: ["pdf"] }]
      };
      const selected = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);

      if (selected.canceled || !selected.filePath) {
        return { ok: false, reason: "canceled" };
      }

      return { ok: true, filePath: path.normalize(ensurePdfExtension(selected.filePath)) };
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.exportPdfCombined,
    async (
      event,
      rawRequest: unknown
    ): Promise<ExportPdfCombinedResult> => {
      const startedAt = Date.now();
      let request: ExportPdfCombinedRequest | null = null;
      let finalPath: string | null = null;
      let tempDir: string | null = null;
      let pdfWindow: BrowserWindow | null = null;

      try {
        request = parseExportPdfCombinedRequest(rawRequest);
        if (request.targetPath) {
          finalPath = path.normalize(ensurePdfExtension(request.targetPath));
        } else {
          const owner = parentWindow(event);
          const options: SaveDialogOptions = {
            title: "Export PDF (Combined)",
            defaultPath: request.defaultFileName,
            filters: [{ name: "PDF (*.pdf)", extensions: ["pdf"] }]
          };
          const selected = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);

          if (selected.canceled || !selected.filePath) {
            return { ok: false, reason: "canceled" };
          }
          finalPath = path.normalize(ensurePdfExtension(selected.filePath));
        }

        const targetClassification =
          await classifyStandaloneSaveTarget(finalPath);
        if (targetClassification.kind === "rejected") {
          throw new Error(
            `PDF export target rejected: ${targetClassification.reason}`
          );
        }

        let fileExists = false;
        try {
          await fs.stat(finalPath);
          fileExists = true;
        } catch {
          fileExists = false;
        }

        if (fileExists && request.allowOverwrite !== true) {
          throw new Error(
            `Target file already exists and allowOverwrite is not true: ${finalPath}`
          );
        }

        tempDir = await fs.mkdtemp(
          path.join(os.tmpdir(), "pergamum-pdf-export-")
        );
        const tempHtmlPath = path.join(tempDir, "index.html");
        await writeFileAtomic(tempHtmlPath, request.htmlContent);

        let warningCount = 0;

        for (const item of request.imageAssets) {
          try {
            if (!item.sourceProjectRelativePath || !item.outputRelativePath) {
              warningCount += 1;
              continue;
            }

            if (request.projectRootPath) {
              const sourceAbs = path.resolve(
                request.projectRootPath,
                item.sourceProjectRelativePath
              );
              if (!isSubPath(request.projectRootPath, sourceAbs)) {
                warningCount += 1;
                continue;
              }

              try {
                await fs.stat(sourceAbs);
              } catch {
                warningCount += 1;
                continue;
              }

              const destAbs = path.resolve(tempDir, item.outputRelativePath);
              if (!isSubPath(tempDir, destAbs)) {
                warningCount += 1;
                continue;
              }

              await fs.mkdir(path.dirname(destAbs), { recursive: true });
              await fs.copyFile(sourceAbs, destAbs);
            } else {
              warningCount += 1;
            }
          } catch {
            warningCount += 1;
          }
        }

        pdfWindow = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true,
            images: true
          }
        });

        pdfWindow.webContents.session.webRequest.onBeforeRequest(
          { urls: ["*://*/*"] },
          (details, callback) => {
            const url = details.url;
            if (url.startsWith("file://")) {
              callback({ cancel: false });
            } else {
              callback({ cancel: true });
            }
          }
        );

        pdfWindow.webContents.on("will-navigate", (navEvent, url) => {
          if (!url.startsWith("file://")) {
            navEvent.preventDefault();
          }
        });

        await pdfWindow.loadFile(tempHtmlPath);

        const headerFooterTemplates = buildPdfHeaderFooterTemplates(
          request.pdfPageNumberSettings
        );

        const pdfBuffer = await pdfWindow.webContents.printToPDF({
          pageSize: "A4",
          landscape: request.pdfWritingMode === "vertical-rl",
          printBackground: true,
          displayHeaderFooter: headerFooterTemplates.displayHeaderFooter,
          headerTemplate: headerFooterTemplates.headerTemplate,
          footerTemplate: headerFooterTemplates.footerTemplate,
          margins: {
            top: 0.79,
            bottom: 0.79,
            left: 0.79,
            right: 0.79
          }
        });

        await writeFileAtomic(finalPath, pdfBuffer);

        const fontInspection = inspectPdfFonts(
          pdfBuffer,
          request.pdfFontFamily
        );

        logger.log({
          level: "debug",
          event: "export.pdf.succeeded",
          details: {
            documentRef: logger.documentRefForKey(finalPath),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: debugLogExtensionForPath(finalPath),
            pathDepth: debugLogPathDepth(finalPath),
            byteLength: pdfBuffer.length,
            operation: "write",
            result: "succeeded",
            warningCount,
            durationMs: durationSince(startedAt)
          }
        });

        return { ok: true, outputPath: finalPath, warningCount, fontInspection };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);

        logger.log({
          level: "error",
          event: "export.pdf.failed",
          details: {
            ...(finalPath
              ? { documentRef: logger.documentRefForKey(finalPath) }
              : {}),
            editorIdKind: "file",
            saveTargetKind: "unknown",
            pathKind: "unknown",
            extension: finalPath
              ? debugLogExtensionForPath(finalPath)
              : ".pdf",
            pathDepth: finalPath ? debugLogPathDepth(finalPath) : undefined,
            operation: "write",
            result: "failed",
            reason: safeError.reason,
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) {
          pdfWindow.destroy();
        }
        if (tempDir) {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch {
            // ignore temp dir cleanup failure
          }
        }
      }
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.selectExportFolder,
    async (event, rawRequest: unknown): Promise<SelectExportFolderResult> => {
      const owner = parentWindow(event);
      const defaultPath =
        typeof rawRequest === "object" &&
        rawRequest !== null &&
        "defaultPath" in rawRequest &&
        typeof (rawRequest as { defaultPath?: unknown }).defaultPath === "string"
          ? (rawRequest as { defaultPath: string }).defaultPath
          : undefined;

      const options: OpenDialogOptions = {
        title: "Select Export Folder",
        properties: ["openDirectory"],
        ...(defaultPath ? { defaultPath } : {})
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, reason: "canceled" };
      }

      return { ok: true, folderPath: result.filePaths[0] };
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.getDocumentsPath,
    async (): Promise<GetDocumentsPathResult> => {
      return { path: app.getPath("documents") };
    }
  );

  ipcMain.handle(
    FILE_CHANNELS.checkFileExists,
    async (_event, rawRequest: unknown): Promise<CheckFileExistsResult> => {
      if (
        typeof rawRequest !== "object" ||
        rawRequest === null ||
        !("filePath" in rawRequest) ||
        typeof (rawRequest as { filePath: unknown }).filePath !== "string"
      ) {
        return { exists: false };
      }
      const targetPath = (rawRequest as { filePath: string }).filePath;
      try {
        await fs.stat(targetPath);
        return { exists: true };
      } catch {
        return { exists: false };
      }
    }
  );

  // #537: Document Map PNG export — one page per call. Overwrite permission
  // is decided by the renderer BEFORE this is ever invoked (dry-run exists
  // check + explicit user confirmation), so this always writes/overwrites
  // unconditionally, exactly like `writeFileAtomic`'s own always-replace
  // semantics.
  ipcMain.handle(
    FILE_CHANNELS.exportPng,
    async (_event, rawRequest: unknown): Promise<ExportPngResult> => {
      if (
        typeof rawRequest !== "object" ||
        rawRequest === null ||
        typeof (rawRequest as { filePath?: unknown }).filePath !== "string" ||
        !((rawRequest as { pngBytes?: unknown }).pngBytes instanceof Uint8Array)
      ) {
        return { ok: false, reason: "invalidRequest" };
      }

      const { filePath, pngBytes } = rawRequest as {
        filePath: string;
        pngBytes: Uint8Array;
      };

      const targetClassification = await classifyStandaloneSaveTarget(filePath);
      if (targetClassification.kind === "rejected") {
        return { ok: false, reason: "rejected" };
      }

      try {
        await writeFileAtomic(filePath, Buffer.from(pngBytes));
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          reason: exportPngFailureReasonFromErrorCode(nodeErrorCode(error))
        };
      }
    }
  );
}
