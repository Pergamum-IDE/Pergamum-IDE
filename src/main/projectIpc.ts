import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type OpenDialogOptions,
  type SaveDialogOptions
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  defaultProjectAccessMode,
  PROJECT_CHANNELS,
  type OpenRecentProjectRequest,
  type PergamumProject,
  type PergamumProjectConfig,
  type ProjectAccessMode,
  type ProjectDocument,
  type ProjectDocumentContent,
  type ReadProjectDocumentRequest,
  type RecordRecentProjectInput,
  type SaveProjectDocumentRequest,
  type SaveProjectDocumentResult
} from "../shared/api";
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
import { projectConfigFileName, readProjectConfig } from "./projectConfigStore";
import {
  createProjectDatabase,
  openProjectDatabase,
  projectFileExtension,
  readProjectMetadata,
  resolveProjectFilePath,
  resolveProjectRoot,
  type ProjectDatabase,
  type ProjectMetadata
} from "./projectDatabase";
import {
  findRecentProjectByFilePath,
  recordRecentProject
} from "./settingsStore";

interface CurrentProjectState {
  rootPath: string;
  activeProjectFilePath: string;
  accessMode: ProjectAccessMode;
  writeOwnership: ProjectWriteOwnership;
  writeOwnershipManager: ProjectWriteOwnershipManager;
  documentRelativePaths: Set<string>;
}

interface ProjectFileOpenResult {
  project: PergamumProject;
  metadata: ProjectMetadata;
  projectFilePath: string;
  projectRootPath: string;
}

export type ProjectWriteOwnership =
  | {
      kind: "owned";
    }
  | {
      kind: "unavailable";
      reason: "lockUnavailable";
    };

export interface ProjectWriteOwnershipManager {
  acquire(projectFilePath: string): Promise<ProjectWriteOwnership>;
  release(
    projectFilePath: string,
    ownership: ProjectWriteOwnership
  ): Promise<void>;
}

let currentProjectState: CurrentProjectState | null = null;

const defaultProjectRecoveryDirectoryName = ".pergamum_recovery";
const createProjectConflictWarningMessage =
  "既に Pergamum のプロジェクト設定または復旧領域があります。\n\n" +
  "既存の設定を上書きし、本文やGlossaryに関する復旧領域があるフォルダに新しいプロジェクトを作成します。\n\n" +
  "これは破壊的な変更を伴います。\n" +
  "本当によろしいですか？";

const createProjectConflictDialogButtonIndex = {
  confirm: 0,
  cancel: 1
} as const;
const projectWriteLockDirectoryName = ".pergamum.lock";

export function projectWriteLockDirectoryPath(
  projectFilePath: string
): string {
  return path.join(
    resolveProjectRoot(projectFilePath),
    projectWriteLockDirectoryName
  );
}

export class ProjectWriteLockOwnershipManager
  implements ProjectWriteOwnershipManager
{
  private readonly ownedLockDirectoryPaths = new Set<string>();

  async acquire(projectFilePath: string): Promise<ProjectWriteOwnership> {
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);

    if (this.ownedLockDirectoryPaths.has(lockDirectoryPath)) {
      return { kind: "owned" };
    }

    try {
      await fs.mkdir(lockDirectoryPath);
      this.ownedLockDirectoryPaths.add(lockDirectoryPath);
      return { kind: "owned" };
    } catch (error) {
      if (nodeErrorCode(error) === "EEXIST") {
        return {
          kind: "unavailable",
          reason: "lockUnavailable"
        };
      }

      throw error;
    }
  }

  async release(
    projectFilePath: string,
    ownership: ProjectWriteOwnership
  ): Promise<void> {
    if (ownership.kind !== "owned") {
      return;
    }

    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);

    if (!this.ownedLockDirectoryPaths.has(lockDirectoryPath)) {
      return;
    }

    try {
      await fs.rmdir(lockDirectoryPath);
    } catch {
      // Lock release is best-effort; failing to remove it must not break
      // the project session transition or shutdown path.
    } finally {
      this.ownedLockDirectoryPaths.delete(lockDirectoryPath);
    }
  }
}

export const defaultProjectWriteOwnershipManager: ProjectWriteOwnershipManager =
  new ProjectWriteLockOwnershipManager();

export function projectAccessModeFromWriteOwnership(
  ownership: ProjectWriteOwnership
): ProjectAccessMode {
  switch (ownership.kind) {
    case "owned":
      return { ...defaultProjectAccessMode };
    case "unavailable":
      return {
        kind: "readOnly",
        reason: "writeLockUnavailable"
      };
  }
}

export function currentProjectRootPath(): string | null {
  return currentProjectState?.rootPath ?? null;
}

export function currentActiveProjectFilePath(): string | null {
  return currentProjectState?.activeProjectFilePath ?? null;
}

export function currentProjectAccessMode(): ProjectAccessMode | null {
  return currentProjectState?.accessMode ?? null;
}

export function requireCurrentProjectRootPath(): string {
  if (!currentProjectState) {
    throw new Error("No project is currently open.");
  }

  return currentProjectState.rootPath;
}

export function requireCurrentActiveProjectFilePath(): string {
  if (!currentProjectState) {
    throw new Error("No project is currently open.");
  }

  return currentProjectState.activeProjectFilePath;
}

export function requireCurrentProjectAccessMode(): ProjectAccessMode {
  if (!currentProjectState) {
    throw new Error("No project is currently open.");
  }

  return currentProjectState.accessMode;
}

function parentWindow(event: IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined;
}

function nodeErrorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }

  return undefined;
}

function sanitizedProjectConfigWriteError(error: unknown): Error & {
  code?: string;
} {
  const sanitized = new Error(
    "Could not write project configuration."
  ) as Error & {
    code?: string;
  };
  const code = nodeErrorCode(error);

  if (code) {
    sanitized.code = code;
  }

  return sanitized;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (nodeErrorCode(error) === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function projectFileDialogFilters() {
  return [
    {
      name: "Pergamum Project",
      extensions: [projectFileExtension.slice(1)]
    }
  ];
}

async function showProjectMessageBox(
  event: IpcMainInvokeEvent,
  options: MessageBoxOptions
): Promise<MessageBoxReturnValue> {
  const owner = parentWindow(event);

  return owner
    ? dialog.showMessageBox(owner, options)
    : dialog.showMessageBox(options);
}

async function showInvalidProjectFileDialog(
  event: IpcMainInvokeEvent
): Promise<void> {
  await showProjectMessageBox(event, {
    type: "error",
    message: `Pergamum project files must use the ${projectFileExtension} extension.`,
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
}

async function showExistingProjectFileDialog(
  event: IpcMainInvokeEvent
): Promise<void> {
  await showProjectMessageBox(event, {
    type: "error",
    message: "プロジェクトファイルは既に存在します。上書きせずに中止しました。",
    buttons: ["OK"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
}

async function confirmCreateProjectInExistingRoot(
  event: IpcMainInvokeEvent
): Promise<boolean> {
  const result = await showProjectMessageBox(event, {
    type: "warning",
    message: createProjectConflictWarningMessage,
    buttons: ["意味を理解して同意", "キャンセル"],
    defaultId: createProjectConflictDialogButtonIndex.cancel,
    cancelId: createProjectConflictDialogButtonIndex.cancel,
    noLink: true
  });

  return result?.response === createProjectConflictDialogButtonIndex.confirm;
}

function normalizeRelativePath(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function initialProjectNameFromProjectFilePath(
  projectFilePath: string
): string {
  const initialName = path.parse(projectFilePath).name.trim();

  return initialName || "Untitled Project";
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function durationSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function projectDocumentRefKey(rootPath: string, relativePath: string): string {
  return `${rootPath}\0${relativePath}`;
}

function isRequestObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseReadProjectDocumentRequest(
  value: unknown
): ReadProjectDocumentRequest {
  if (!isRequestObject(value) || typeof value.relativePath !== "string") {
    throw new Error("Invalid project document read request.");
  }

  return {
    relativePath: value.relativePath
  };
}

function parseSaveProjectDocumentRequest(
  value: unknown
): SaveProjectDocumentRequest {
  if (
    !isRequestObject(value) ||
    typeof value.relativePath !== "string" ||
    typeof value.content !== "string"
  ) {
    throw new Error("Invalid project document save request.");
  }

  return {
    relativePath: value.relativePath,
    content: value.content
  };
}

function parseOpenRecentProjectRequest(
  value: unknown
): OpenRecentProjectRequest {
  if (
    !isRequestObject(value) ||
    typeof value.projectFilePath !== "string" ||
    value.projectFilePath.length === 0
  ) {
    throw new Error("Invalid recent project open request.");
  }

  return {
    projectFilePath: value.projectFilePath
  };
}

function resolveProjectDocumentPath(relativePath: string): string {
  if (!currentProjectState) {
    throw new Error("No project is currently open.");
  }

  if (!currentProjectState.documentRelativePaths.has(relativePath)) {
    throw new Error("Project document is not part of the current project.");
  }

  const resolvedPath = path.resolve(currentProjectState.rootPath, relativePath);
  const resolvedRelativePath = path.relative(
    currentProjectState.rootPath,
    resolvedPath
  );

  if (
    resolvedRelativePath.startsWith("..") ||
    path.isAbsolute(resolvedRelativePath)
  ) {
    throw new Error("Project document path is outside the current project.");
  }

  return resolvedPath;
}

async function discoverMarkdownFiles(
  rootPath: string
): Promise<ProjectDocument[]> {
  const documents: ProjectDocument[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await fs.readdir(directoryPath, {
      withFileTypes: true
    });

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
        continue;
      }

      documents.push({
        relativePath: normalizeRelativePath(path.relative(rootPath, entryPath)),
        name: entry.name
      });
    }
  }

  try {
    await walk(rootPath);
  } catch (error) {
    throw new Error(`Could not discover Markdown files: ${errorDetail(error)}`);
  }

  return documents.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

async function releaseWriteOwnership(
  writeOwnershipManager: ProjectWriteOwnershipManager,
  projectFilePath: string,
  writeOwnership: ProjectWriteOwnership
): Promise<void> {
  try {
    await writeOwnershipManager.release(projectFilePath, writeOwnership);
  } catch {
    // Ownership release is intentionally best-effort.
  }
}

async function releaseProjectWriteOwnership(
  state: CurrentProjectState
): Promise<void> {
  await releaseWriteOwnership(
    state.writeOwnershipManager,
    state.activeProjectFilePath,
    state.writeOwnership
  );
}

function shouldReleasePreviousProjectWriteOwnership(
  previousState: CurrentProjectState,
  nextProjectFilePath: string,
  nextOwnershipManager: ProjectWriteOwnershipManager,
  nextOwnership: ProjectWriteOwnership
): boolean {
  return !(
    previousState.activeProjectFilePath === nextProjectFilePath &&
    previousState.writeOwnershipManager === nextOwnershipManager &&
    previousState.writeOwnership.kind === "owned" &&
    nextOwnership.kind === "owned"
  );
}

export async function releaseCurrentProjectWriteOwnership(): Promise<void> {
  const stateToRelease = currentProjectState;

  if (!stateToRelease) {
    return;
  }

  currentProjectState = null;
  await releaseProjectWriteOwnership(stateToRelease);
}

async function activateProject(
  project: PergamumProject,
  writeOwnershipManager: ProjectWriteOwnershipManager,
  writeOwnership: ProjectWriteOwnership
): Promise<void> {
  const previousState = currentProjectState;

  currentProjectState = {
    rootPath: project.rootPath,
    activeProjectFilePath: project.activeProjectFilePath,
    accessMode: project.accessMode,
    writeOwnership,
    writeOwnershipManager,
    documentRelativePaths: new Set(
      project.documents.map((document) => document.relativePath)
    )
  };

  if (
    previousState &&
    shouldReleasePreviousProjectWriteOwnership(
      previousState,
      project.activeProjectFilePath,
      writeOwnershipManager,
      writeOwnership
    )
  ) {
    await releaseProjectWriteOwnership(previousState);
  }
}

async function createProjectFromParts(
  rootPath: string,
  activeProjectFilePath: string,
  accessMode: ProjectAccessMode,
  name: string,
  config: PergamumProjectConfig | null
): Promise<PergamumProject> {
  const documents = await discoverMarkdownFiles(rootPath);

  return {
    rootPath,
    activeProjectFilePath,
    accessMode,
    name,
    config,
    documents
  };
}

async function writeProjectConfig(
  rootPath: string,
  config: PergamumProjectConfig
): Promise<void> {
  try {
    await fs.writeFile(
      path.join(rootPath, projectConfigFileName),
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );
  } catch (error) {
    throw sanitizedProjectConfigWriteError(error);
  }
}

async function readProjectMetadataAndClose(
  database: ProjectDatabase
): Promise<ProjectMetadata> {
  try {
    return await readProjectMetadata(database);
  } finally {
    await database.close();
  }
}

async function hasCreateProjectConflict(rootPath: string): Promise<boolean> {
  const hasProjectConfig = await pathExists(
    path.join(rootPath, projectConfigFileName)
  );
  const hasProjectRecoveryDirectory = await pathExists(
    path.join(rootPath, defaultProjectRecoveryDirectoryName)
  );

  return hasProjectConfig || hasProjectRecoveryDirectory;
}

async function recordProjectRecently(
  recentProject: RecordRecentProjectInput
): Promise<void> {
  try {
    await recordRecentProject(recentProject);
  } catch {
    console.warn("Could not record recent project.");
  }
}

function recentProjectInputFromMetadata(
  metadata: ProjectMetadata,
  projectFilePath: string,
  projectRootPath: string
): RecordRecentProjectInput {
  return {
    projectId: metadata.projectId,
    projectName: metadata.projectName,
    projectFilePath,
    projectRootPath,
    schemaVersion: metadata.schemaVersion
  };
}

async function recordProjectFileOpenRecently(
  openedProject: ProjectFileOpenResult
): Promise<void> {
  await recordProjectRecently(
    recentProjectInputFromMetadata(
      openedProject.metadata,
      openedProject.projectFilePath,
      openedProject.projectRootPath
    )
  );
}

async function createProjectFromProjectFile(
  projectFilePath: string,
  logger: DebugLogger,
  writeOwnershipManager: ProjectWriteOwnershipManager
): Promise<ProjectFileOpenResult> {
  const projectRootPath = resolveProjectRoot(projectFilePath);
  const initialProjectName =
    initialProjectNameFromProjectFilePath(projectFilePath);
  const database = await createProjectDatabase(
    {
      projectFilePath,
      projectName: initialProjectName
    },
    logger
  );
  const metadata = await readProjectMetadataAndClose(database);

  const config: PergamumProjectConfig = {
    name: metadata.projectName
  };

  await writeProjectConfig(projectRootPath, config);
  const ownership = await writeOwnershipManager.acquire(projectFilePath);
  const accessMode = projectAccessModeFromWriteOwnership(ownership);
  let shouldReleaseOwnership = true;

  try {
    const project = await createProjectFromParts(
      projectRootPath,
      projectFilePath,
      accessMode,
      metadata.projectName,
      await readProjectConfig(projectRootPath)
    );

    await activateProject(project, writeOwnershipManager, ownership);
    shouldReleaseOwnership = false;

    return {
      project,
      metadata,
      projectFilePath,
      projectRootPath
    };
  } finally {
    if (shouldReleaseOwnership) {
      await releaseWriteOwnership(
        writeOwnershipManager,
        projectFilePath,
        ownership
      );
    }
  }
}

async function openProjectFromProjectFile(
  projectFilePath: string,
  logger: DebugLogger,
  writeOwnershipManager: ProjectWriteOwnershipManager
): Promise<ProjectFileOpenResult> {
  const projectRootPath = resolveProjectRoot(projectFilePath);
  const database = await openProjectDatabase(projectFilePath, logger);
  const metadata = await readProjectMetadataAndClose(database);

  const config = await readProjectConfig(projectRootPath);
  const ownership = await writeOwnershipManager.acquire(projectFilePath);
  const accessMode = projectAccessModeFromWriteOwnership(ownership);
  let shouldReleaseOwnership = true;

  try {
    const project = await createProjectFromParts(
      projectRootPath,
      projectFilePath,
      accessMode,
      metadata.projectName,
      config
    );

    await activateProject(project, writeOwnershipManager, ownership);
    shouldReleaseOwnership = false;

    return {
      project,
      metadata,
      projectFilePath,
      projectRootPath
    };
  } finally {
    if (shouldReleaseOwnership) {
      await releaseWriteOwnership(
        writeOwnershipManager,
        projectFilePath,
        ownership
      );
    }
  }
}

export async function createProject(
  event: IpcMainInvokeEvent,
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager
): Promise<PergamumProject | null> {
  const startedAt = Date.now();
  let projectRef: string | undefined;

  try {
    const owner = parentWindow(event);
    const options: SaveDialogOptions = {
      title: "Create Pergamum Project",
      filters: projectFileDialogFilters()
    };
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    let projectFilePath: string;
    try {
      projectFilePath = resolveProjectFilePath(result.filePath);
    } catch {
      await showInvalidProjectFileDialog(event);
      return null;
    }

    projectRef = logger.projectRefForKey(projectFilePath);

    if (await pathExists(projectFilePath)) {
      await showExistingProjectFileDialog(event);
      return null;
    }

    const projectRootPath = resolveProjectRoot(projectFilePath);
    if (await hasCreateProjectConflict(projectRootPath)) {
      const confirmed = await confirmCreateProjectInExistingRoot(event);

      if (!confirmed) {
        return null;
      }
    }

    const openedProject = await createProjectFromProjectFile(
      projectFilePath,
      logger,
      writeOwnershipManager
    );
    await recordProjectFileOpenRecently(openedProject);

    logger.log({
      level: "info",
      event: "project.open.succeeded",
      details: {
        projectRef,
        operation: "create",
        result: "succeeded",
        durationMs: durationSince(startedAt)
      }
    });

    return openedProject.project;
  } catch (error) {
    const safeError = sanitizedFileIoError(error);
    logger.log({
      level: "error",
      event: "project.open.failed",
      details: {
        ...(projectRef ? { projectRef } : {}),
        operation: "create",
        result: "failed",
        durationMs: durationSince(startedAt),
        error: safeError
      }
    });

    throw safeError;
  }
}

export async function openProject(
  event: IpcMainInvokeEvent,
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager
): Promise<PergamumProject | null> {
  const startedAt = Date.now();
  let projectRef: string | undefined;

  try {
    const owner = parentWindow(event);
    const options: OpenDialogOptions = {
      title: "Open Pergamum Project",
      properties: ["openFile"],
      filters: projectFileDialogFilters()
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    let projectFilePath: string;
    try {
      projectFilePath = resolveProjectFilePath(result.filePaths[0]);
    } catch {
      await showInvalidProjectFileDialog(event);
      return null;
    }

    projectRef = logger.projectRefForKey(projectFilePath);

    const openedProject = await openProjectFromProjectFile(
      projectFilePath,
      logger,
      writeOwnershipManager
    );
    await recordProjectFileOpenRecently(openedProject);

    logger.log({
      level: "info",
      event: "project.open.succeeded",
      details: {
        projectRef,
        operation: "open",
        result: "succeeded",
        durationMs: durationSince(startedAt)
      }
    });

    return openedProject.project;
  } catch (error) {
    const safeError = sanitizedFileIoError(error);
    logger.log({
      level: "error",
      event: "project.open.failed",
      details: {
        ...(projectRef ? { projectRef } : {}),
        operation: "open",
        result: "failed",
        durationMs: durationSince(startedAt),
        error: safeError
      }
    });

    throw safeError;
  }
}

export function registerProjectIpc(
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager
): void {
  ipcMain.handle(PROJECT_CHANNELS.createProject, (event) =>
    createProject(event, logger, writeOwnershipManager)
  );

  ipcMain.handle(PROJECT_CHANNELS.openProject, (event) =>
    openProject(event, logger, writeOwnershipManager)
  );

  ipcMain.handle(
    PROJECT_CHANNELS.openRecentProject,
    async (
      _event,
      rawRequest: unknown
    ): Promise<PergamumProject> => {
      const startedAt = Date.now();
      let request: OpenRecentProjectRequest;

      try {
        request = parseOpenRecentProjectRequest(rawRequest);
        const projectFilePath = resolveProjectFilePath(request.projectFilePath);
        const recentProject = await findRecentProjectByFilePath(
          projectFilePath
        );

        if (!recentProject) {
          throw new Error("Recent project is not registered.");
        }

        const openedProject = await openProjectFromProjectFile(
          projectFilePath,
          logger,
          writeOwnershipManager
        );
        await recordProjectFileOpenRecently(openedProject);

        logger.log({
          level: "info",
          event: "project.open.succeeded",
          details: {
            projectRef: logger.projectRefForKey(projectFilePath),
            operation: "open",
            result: "succeeded",
            durationMs: durationSince(startedAt)
          }
        });

        return openedProject.project;
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        logger.log({
          level: "error",
          event: "project.open.failed",
          details: {
            operation: "open",
            result: "failed",
            durationMs: durationSince(startedAt),
            error: safeError
          }
        });

        throw safeError;
      }
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.readProjectDocument,
    async (
      _event,
      rawRequest: unknown
    ): Promise<ProjectDocumentContent> => {
      const startedAt = Date.now();
      let request: ReadProjectDocumentRequest | null = null;

      try {
        request = parseReadProjectDocumentRequest(rawRequest);
        const documentPath = resolveProjectDocumentPath(request.relativePath);
        const bytes = await fs.readFile(documentPath);
        const decoded = decodeMarkdownBytes(bytes);
        const rootPath = requireCurrentProjectRootPath();
        const documentRef = logger.documentRefForKey(
          projectDocumentRefKey(rootPath, request.relativePath)
        );
        const projectRef = logger.projectRefForKey(rootPath);

        logger.log({
          level: "debug",
          event: "document.open.fileRead.completed",
          details: {
            projectRef,
            documentRef,
            pathKind: "projectFile",
            extension: debugLogExtensionForPath(request.relativePath),
            pathDepth: debugLogPathDepth(request.relativePath),
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
          relativePath: request.relativePath,
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
        const rootPath = currentProjectState?.rootPath;
        const documentRef =
          rootPath && request
            ? logger.documentRefForKey(
                projectDocumentRefKey(rootPath, request.relativePath)
              )
            : undefined;
        const projectRef = rootPath
          ? logger.projectRefForKey(rootPath)
          : undefined;

        logger.log({
          level: "error",
          event: "document.open.failed",
          details: {
            ...(projectRef ? { projectRef } : {}),
            ...(documentRef ? { documentRef } : {}),
            pathKind: "projectFile",
            extension: request
              ? debugLogExtensionForPath(request.relativePath)
              : "unknown",
            pathDepth: request
              ? debugLogPathDepth(request.relativePath)
              : undefined,
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
    PROJECT_CHANNELS.saveProjectDocument,
    async (
      _event,
      rawRequest: unknown
    ): Promise<SaveProjectDocumentResult> => {
      const startedAt = Date.now();
      let request: SaveProjectDocumentRequest | null = null;

      try {
        request = parseSaveProjectDocumentRequest(rawRequest);
        const documentPath = resolveProjectDocumentPath(request.relativePath);
        const metadata = markdownWriteMetadata(request.content);
        await fs.writeFile(documentPath, request.content, "utf8");
        const rootPath = requireCurrentProjectRootPath();
        const documentRef = logger.documentRefForKey(
          projectDocumentRefKey(rootPath, request.relativePath)
        );
        const projectRef = logger.projectRefForKey(rootPath);

        logger.log({
          level: "debug",
          event: "save.succeeded",
          details: {
            projectRef,
            documentRef,
            editorIdKind: "projectDocument",
            saveTargetKind: "projectDocument",
            pathKind: "projectFile",
            extension: debugLogExtensionForPath(request.relativePath),
            pathDepth: debugLogPathDepth(request.relativePath),
            lineCount: debugLogLineCount(request.content),
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
          relativePath: request.relativePath
        };
      } catch (error) {
        const safeError = sanitizedFileIoError(error);
        const rootPath = currentProjectState?.rootPath;
        const documentRef =
          rootPath && request
            ? logger.documentRefForKey(
                projectDocumentRefKey(rootPath, request.relativePath)
              )
            : undefined;
        const projectRef = rootPath
          ? logger.projectRefForKey(rootPath)
          : undefined;

        logger.log({
          level: "error",
          event: "document.save.failed",
          details: {
            ...(projectRef ? { projectRef } : {}),
            ...(documentRef ? { documentRef } : {}),
            editorIdKind: "projectDocument",
            saveTargetKind: "projectDocument",
            pathKind: "projectFile",
            extension: request
              ? debugLogExtensionForPath(request.relativePath)
              : "unknown",
            pathDepth: request
              ? debugLogPathDepth(request.relativePath)
              : undefined,
            lineCount: request
              ? debugLogLineCount(request.content)
              : undefined,
            lineEndingKind: request
              ? debugLogLineEndingKind(request.content)
              : undefined,
            sizeBucket: request
              ? debugLogSizeBucket(Buffer.byteLength(request.content, "utf8"))
              : undefined,
            byteLength: request
              ? Buffer.byteLength(request.content, "utf8")
              : undefined,
            characterLength: request ? request.content.length : undefined,
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
