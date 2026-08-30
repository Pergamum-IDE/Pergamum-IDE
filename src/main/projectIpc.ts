import {
  app,
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
import os from "node:os";
import path from "node:path";
import {
  defaultProjectAccessMode,
  PROJECT_CHANNELS,
  type CloseCurrentProjectRequest,
  type CloseCurrentProjectResult,
  type CreateFileExplorerEntryRequest,
  type CreateFileExplorerEntryResult,
  type FileExplorerEntry,
  type FileExplorerUnavailableReason,
  type ListFileExplorerChildrenRequest,
  type ListFileExplorerChildrenResult,
  type OpenProjectByFilePathRequest,
  type OpenProjectByFilePathResult,
  type OpenRecentProjectRequest,
  type PendingReadOnlyProjectOpen,
  type PendingReadOnlyProjectOpenRequest,
  type PergamumProject,
  type ProjectLockOwnerInfo,
  type PergamumProjectConfig,
  type ProjectAccessMode,
  type ProjectDocument,
  type ProjectDocumentContent,
  type ProjectOpenResult,
  type ReadProjectDocumentRequest,
  type RecordRecentProjectInput,
  type RenameFileExplorerEntryRequest,
  type RenameFileExplorerEntryResult,
  type SaveProjectDocumentRequest,
  type SaveProjectDocumentResult,
  type StartupProjectOpenResult
} from "../shared/api";
import {
  applyMarkdownFileExtension,
  fileExplorerCreateFailureReasonFromErrorCode,
  fileExplorerCreateFailureReasonFromValidationError,
  pathHasReservedFileExplorerSegment,
  validateFileExplorerName,
  type FileExplorerCreateFailureReason
} from "../shared/fileExplorerCreate";
import {
  fileExplorerRenameFailureReasonFromErrorCode,
  validateFileExplorerRenameName,
  type FileExplorerRenameFailureReason
} from "../shared/fileExplorerRename";
import type { AppPlatform } from "../shared/platform";
import {
  isPathEqualOrInsideDirectory,
  projectWriteLockDirectoryPathForProjectRoot,
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
  sanitizedFileIoError,
  type SanitizedFileIoError
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
  loadSettings,
  recordRecentProject
} from "./settingsStore";
import {
  createProjectWindowTitle,
  projectWindowTitleStatusFromAccessMode,
  type ProjectWindowTitleTarget
} from "./projectWindowTitle";
import {
  createProjectLockOwnerMetadata,
  projectLockOwnerInfoFromMetadata,
  projectLockOwnerHandleContent,
  projectLockOwnerHandlePath,
  projectLockOwnerMetadataPath,
  readProjectLockOwnerInfo,
  readProjectLockOwnerMetadata,
  type ProjectLockOwnerMetadata
} from "./projectLockOwnerMetadata";
import {
  probeProcessLiveness,
  type ProcessLiveness
} from "./processLiveness";

interface CurrentProjectState {
  rootPath: string;
  activeProjectFilePath: string;
  // #272: metadata.project_id of the open Project — the Session Store's
  // Project *identity* (distinct from activeProjectFilePath, its *locator*).
  projectId: string;
  projectName: string;
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
  writeOwnership: ProjectWriteOwnership;
  writeOwnershipManager: ProjectWriteOwnershipManager;
}

type ProjectOpenOperation = "create" | "open";

interface PendingReadOnlyProjectOpenState {
  token: string;
  openedProject: ProjectFileOpenResult;
  operation: ProjectOpenOperation;
  logger: DebugLogger;
  projectRef: string;
  startedAt: number;
}

export type ProjectWriteOwnership =
  | {
      kind: "owned";
      staleTakeover?: ProjectWriteLockStaleTakeoverInfo;
    }
  | {
      kind: "unavailable";
      reason: "lockUnavailable" | "lockSetupFailed";
      lockOwner?: ProjectLockOwnerInfo | null;
      staleTakeover?: ProjectWriteLockStaleTakeoverInfo;
    };

export interface ProjectWriteLockAcquireContext {
  readonly projectId: string;
  readonly sessionId: string;
  readonly instanceRunId?: string;
}

export interface ProjectWriteOwnershipManager {
  acquire(
    projectFilePath: string,
    context?: ProjectWriteLockAcquireContext
  ): Promise<ProjectWriteOwnership>;
  release(
    projectFilePath: string,
    ownership: ProjectWriteOwnership
  ): Promise<void>;
}

export interface ProjectWriteLockFileHandle {
  writeFile(data: string, encoding: BufferEncoding): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectWriteLockFileSystem {
  mkdir(path: string): Promise<void>;
  writeFile(
    path: string,
    data: string,
    options: { encoding: BufferEncoding; flag: string }
  ): Promise<void>;
  open(path: string, flags: string): Promise<ProjectWriteLockFileHandle>;
  unlink(path: string): Promise<void>;
  rmdir(path: string): Promise<void>;
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  rename(fromPath: string, toPath: string): Promise<void>;
  stat(path: string): Promise<{ isDirectory(): boolean }>;
}

export interface ProjectWriteLockRuntimeMetadataProvider {
  now(): Date;
  hostname(): string;
  appVersion(): string;
  pid(): number;
}

export type ProjectWriteLockStaleTakeoverPhase =
  | "refused"
  | "reacquired"
  | "archiveFailed"
  | "reacquireFailed";

export interface ProjectWriteLockStaleTakeoverInfo {
  readonly phase: ProjectWriteLockStaleTakeoverPhase;
  readonly ownerPid: number;
  readonly ownerAppVersion: string;
  readonly ownerCreatedAt: string;
  readonly archivedLockDirName?: string;
}

export interface ProjectWriteLockStaleReclamationPolicy {
  readonly probeProcessLiveness: (pid: number) => ProcessLiveness;
}

export type ProjectWindowTitleTargetProvider =
  () => ProjectWindowTitleTarget | null;

let currentProjectState: CurrentProjectState | null = null;
let pendingReadOnlyProjectOpenState: PendingReadOnlyProjectOpenState | null =
  null;
let pendingReadOnlyProjectOpenSequence = 0;
let projectWindowTitleTargetProvider: ProjectWindowTitleTargetProvider | null =
  null;

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

export function projectWriteLockDirectoryPath(
  projectFilePath: string
): string {
  return projectWriteLockDirectoryPathForProjectRoot(
    resolveProjectRoot(projectFilePath)
  );
}

const defaultProjectWriteLockRuntimeMetadataProvider: ProjectWriteLockRuntimeMetadataProvider =
  {
    now: () => new Date(),
    hostname: () => os.hostname(),
    appVersion: () => app.getVersion(),
    pid: () => process.pid
  };

async function bestEffortCloseProjectWriteLockHandle(
  ownerHandle: ProjectWriteLockFileHandle | null
): Promise<void> {
  if (!ownerHandle) {
    return;
  }

  try {
    await ownerHandle.close();
  } catch {
    // Lock handle close is best-effort during cleanup.
  }
}

async function bestEffortCleanupProjectWriteLockArtifacts(
  fileSystem: ProjectWriteLockFileSystem,
  lockDirectoryPath: string
): Promise<void> {
  try {
    await fileSystem.unlink(projectLockOwnerMetadataPath(lockDirectoryPath));
  } catch {
    // Missing or undeletable metadata must not break lock release.
  }

  try {
    await fileSystem.unlink(projectLockOwnerHandlePath(lockDirectoryPath));
  } catch {
    // Missing or undeletable handle marker must not break lock release.
  }

  try {
    await fileSystem.rmdir(lockDirectoryPath);
  } catch {
    // Lock release is best-effort; failing to remove it must not break
    // the project session transition or shutdown path.
  }
}

function projectWriteLockStaleArchiveDirName(
  lockDirectoryPath: string,
  now: Date,
  instanceRunId: string
): string {
  const base = path.basename(lockDirectoryPath);
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const fragment =
    instanceRunId.replace(/[^0-9a-fA-F]/g, "").slice(0, 8) || "run";

  return `${base}.stale-${timestamp}-${fragment}`;
}

function projectWriteLockStaleTakeoverInfo(
  phase: ProjectWriteLockStaleTakeoverPhase,
  staleOwner: ProjectLockOwnerMetadata,
  archivedLockDirName?: string
): ProjectWriteLockStaleTakeoverInfo {
  return {
    phase,
    ownerPid: staleOwner.pid,
    ownerAppVersion: staleOwner.appVersion,
    ownerCreatedAt: staleOwner.createdAt,
    ...(archivedLockDirName ? { archivedLockDirName } : {})
  };
}

function projectLockOwnerMetadataMatches(
  actual: ProjectLockOwnerMetadata,
  expected: ProjectLockOwnerMetadata
): boolean {
  return (
    actual.schemaVersion === expected.schemaVersion &&
    actual.projectId === expected.projectId &&
    actual.sessionId === expected.sessionId &&
    actual.pid === expected.pid &&
    actual.hostname === expected.hostname &&
    actual.appVersion === expected.appVersion &&
    actual.createdAt === expected.createdAt &&
    actual.updatedAt === expected.updatedAt
  );
}

function projectWriteLockContextRunId(
  context: ProjectWriteLockAcquireContext | undefined
): string {
  return context?.instanceRunId ?? context?.sessionId ?? "unknown-session";
}

function projectWriteLockUnavailable(
  reason: "lockUnavailable" | "lockSetupFailed",
  lockOwner: ProjectLockOwnerInfo | null,
  staleTakeover?: ProjectWriteLockStaleTakeoverInfo
): ProjectWriteOwnership {
  return {
    kind: "unavailable",
    reason,
    lockOwner,
    ...(staleTakeover ? { staleTakeover } : {})
  };
}

export class ProjectWriteLockOwnershipManager
  implements ProjectWriteOwnershipManager
{
  private readonly ownedLocks = new Map<
    string,
    { readonly ownerHandle: ProjectWriteLockFileHandle }
  >();

  constructor(
    private readonly fileSystem: ProjectWriteLockFileSystem =
      fs as unknown as ProjectWriteLockFileSystem,
    private readonly metadataProvider: ProjectWriteLockRuntimeMetadataProvider =
      defaultProjectWriteLockRuntimeMetadataProvider,
    private readonly staleReclamationPolicy: ProjectWriteLockStaleReclamationPolicy =
      { probeProcessLiveness }
  ) {}

  async acquire(
    projectFilePath: string,
    context?: ProjectWriteLockAcquireContext
  ): Promise<ProjectWriteOwnership> {
    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);

    if (this.ownedLocks.has(lockDirectoryPath)) {
      return { kind: "owned" };
    }

    try {
      await this.fileSystem.mkdir(lockDirectoryPath);
    } catch (error) {
      if (nodeErrorCode(error) === "EEXIST") {
        return this.reclaimStaleProjectWriteLock(
          lockDirectoryPath,
          context
        );
      }

      return projectWriteLockUnavailable("lockSetupFailed", null);
    }

    return this.writeFreshProjectWriteLockOwner(lockDirectoryPath, context);
  }

  private projectLockOwnerMetadata(
    context: ProjectWriteLockAcquireContext | undefined,
    now: Date
  ): ProjectLockOwnerMetadata {
    return createProjectLockOwnerMetadata({
      projectId: context?.projectId ?? "unknown-project",
      sessionId: context?.sessionId ?? "unknown-session",
      pid: this.metadataProvider.pid(),
      hostname: this.metadataProvider.hostname(),
      appVersion: this.metadataProvider.appVersion(),
      now
    });
  }

  private async writeFreshProjectWriteLockOwner(
    lockDirectoryPath: string,
    context: ProjectWriteLockAcquireContext | undefined,
    staleSuccess?: ProjectWriteLockStaleTakeoverInfo,
    staleFailure?: ProjectWriteLockStaleTakeoverInfo
  ): Promise<ProjectWriteOwnership> {
    let ownerHandle: ProjectWriteLockFileHandle | null = null;
    const failure = (): ProjectWriteOwnership =>
      projectWriteLockUnavailable(
        "lockSetupFailed",
        null,
        staleFailure
      );

    try {
      const metadata = this.projectLockOwnerMetadata(
        context,
        this.metadataProvider.now()
      );

      await this.fileSystem.writeFile(
        projectLockOwnerMetadataPath(lockDirectoryPath),
        `${JSON.stringify(metadata, null, 2)}\n`,
        { encoding: "utf8", flag: "wx" }
      );
      ownerHandle = await this.fileSystem.open(
        projectLockOwnerHandlePath(lockDirectoryPath),
        "wx"
      );
      await ownerHandle.writeFile(projectLockOwnerHandleContent, "utf8");

      const confirmed = await readProjectLockOwnerMetadata(
        this.fileSystem,
        lockDirectoryPath
      );

      if (
        !confirmed ||
        !projectLockOwnerMetadataMatches(confirmed, metadata)
      ) {
        // self-check mismatch は fresh lock の状態が曖昧になったことを意味する。
        // ここで lock directory を削除せず、read-only fallback に任せる。
        // 後続 run で dead owner と確定できた場合だけ stale recovery する。
        await bestEffortCloseProjectWriteLockHandle(ownerHandle);
        return failure();
      }

      this.ownedLocks.set(lockDirectoryPath, { ownerHandle });

      return {
        kind: "owned",
        ...(staleSuccess ? { staleTakeover: staleSuccess } : {})
      };
    } catch {
      await bestEffortCloseProjectWriteLockHandle(ownerHandle);
      await bestEffortCleanupProjectWriteLockArtifacts(
        this.fileSystem,
        lockDirectoryPath
      );

      return failure();
    }
  }

  private async reclaimStaleProjectWriteLock(
    lockDirectoryPath: string,
    context: ProjectWriteLockAcquireContext | undefined
  ): Promise<ProjectWriteOwnership> {
    let lockStat: { isDirectory(): boolean };

    try {
      lockStat = await this.fileSystem.stat(lockDirectoryPath);
    } catch (error) {
      if (nodeErrorCode(error) === "ENOENT") {
        try {
          await this.fileSystem.mkdir(lockDirectoryPath);
        } catch (mkdirError) {
          return projectWriteLockUnavailable(
            nodeErrorCode(mkdirError) === "EEXIST"
              ? "lockUnavailable"
              : "lockSetupFailed",
            nodeErrorCode(mkdirError) === "EEXIST"
              ? await readProjectLockOwnerInfo(
                  this.fileSystem,
                  lockDirectoryPath
                )
              : null
          );
        }

        return this.writeFreshProjectWriteLockOwner(
          lockDirectoryPath,
          context
        );
      }

      return projectWriteLockUnavailable("lockUnavailable", null);
    }

    if (!lockStat.isDirectory()) {
      return projectWriteLockUnavailable("lockUnavailable", null);
    }

    const firstOwner = await readProjectLockOwnerMetadata(
      this.fileSystem,
      lockDirectoryPath
    );

    if (!firstOwner) {
      return projectWriteLockUnavailable("lockUnavailable", null);
    }

    const firstOwnerInfo = projectLockOwnerInfoFromMetadata(firstOwner);
    const firstLiveness = this.staleReclamationPolicy.probeProcessLiveness(
      firstOwner.pid
    );

    if (firstLiveness !== "dead") {
      return projectWriteLockUnavailable(
        "lockUnavailable",
        firstOwnerInfo,
        projectWriteLockStaleTakeoverInfo("refused", firstOwner)
      );
    }

    const secondOwner = await readProjectLockOwnerMetadata(
      this.fileSystem,
      lockDirectoryPath
    );

    if (
      !secondOwner ||
      !projectLockOwnerMetadataMatches(secondOwner, firstOwner) ||
      this.staleReclamationPolicy.probeProcessLiveness(secondOwner.pid) !==
        "dead"
    ) {
      return projectWriteLockUnavailable(
        "lockUnavailable",
        secondOwner ? projectLockOwnerInfoFromMetadata(secondOwner) : null
      );
    }

    const archivedLockDirName = projectWriteLockStaleArchiveDirName(
      lockDirectoryPath,
      this.metadataProvider.now(),
      projectWriteLockContextRunId(context)
    );
    const archivedLockDirPath = path.join(
      path.dirname(lockDirectoryPath),
      archivedLockDirName
    );

    try {
      await this.fileSystem.rename(lockDirectoryPath, archivedLockDirPath);
    } catch {
      return projectWriteLockUnavailable(
        "lockUnavailable",
        firstOwnerInfo,
        projectWriteLockStaleTakeoverInfo("archiveFailed", firstOwner)
      );
    }

    try {
      await this.fileSystem.mkdir(lockDirectoryPath);
    } catch (error) {
      const reason =
        nodeErrorCode(error) === "EEXIST"
          ? "lockUnavailable"
          : "lockSetupFailed";
      const lockOwner =
        reason === "lockUnavailable"
          ? await readProjectLockOwnerInfo(this.fileSystem, lockDirectoryPath)
          : null;

      return projectWriteLockUnavailable(
        reason,
        lockOwner,
        projectWriteLockStaleTakeoverInfo(
          "reacquireFailed",
          firstOwner,
          archivedLockDirName
        )
      );
    }

    return this.writeFreshProjectWriteLockOwner(
      lockDirectoryPath,
      context,
      projectWriteLockStaleTakeoverInfo(
        "reacquired",
        firstOwner,
        archivedLockDirName
      ),
      projectWriteLockStaleTakeoverInfo(
        "reacquireFailed",
        firstOwner,
        archivedLockDirName
      )
    );
  }

  async release(
    projectFilePath: string,
    ownership: ProjectWriteOwnership
  ): Promise<void> {
    if (ownership.kind !== "owned") {
      return;
    }

    const lockDirectoryPath = projectWriteLockDirectoryPath(projectFilePath);
    const ownedLock = this.ownedLocks.get(lockDirectoryPath);

    if (!ownedLock) {
      return;
    }

    this.ownedLocks.delete(lockDirectoryPath);
    await bestEffortCloseProjectWriteLockHandle(ownedLock.ownerHandle);
    await bestEffortCleanupProjectWriteLockArtifacts(
      this.fileSystem,
      lockDirectoryPath
    );
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

/** #272: the open Project's identity (`metadata.project_id`), or null. */
export function currentProjectId(): string | null {
  return currentProjectState?.projectId ?? null;
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

function unsupportedProjectSaveTargetError(): Error & { code: string } {
  const error = new Error(
    "Project document save is not available for the current project."
  ) as Error & { code: string };
  error.code = "ERR_UNSUPPORTED_SAVE_TARGET";

  return error;
}

function assertCurrentProjectDocumentSaveAllowed(): void {
  if (currentProjectState?.accessMode.kind === "readOnly") {
    throw unsupportedProjectSaveTargetError();
  }
}

function assertProjectDocumentSaveTargetAllowed(documentPath: string): void {
  if (isProtectedPergamumDataFilePath(documentPath)) {
    throw unsupportedProjectSaveTargetError();
  }

  const lockDirectoryPath = projectWriteLockDirectoryPath(
    requireCurrentActiveProjectFilePath()
  );

  try {
    if (
      isPathEqualOrInsideDirectory(
        path.resolve(documentPath),
        path.resolve(lockDirectoryPath),
        nodePlatformToAppPlatform(process.platform)
      )
    ) {
      throw unsupportedProjectSaveTargetError();
    }
  } catch {
    throw unsupportedProjectSaveTargetError();
  }
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

async function isDirectoryPath(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

function isSanitizedFileIoError(error: unknown): error is SanitizedFileIoError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "PERGAMUM_FILE_IO_FAILED" &&
    "reason" in error &&
    typeof (error as { reason: unknown }).reason === "string" &&
    error instanceof Error
  );
}

function startupProjectOpenFailureResult(
  error: unknown
): StartupProjectOpenResult {
  const safeError = isSanitizedFileIoError(error)
    ? error
    : sanitizedFileIoError(error);

  return {
    kind: "startupProjectOpenFailed",
    reason: safeError.reason,
    message: safeError.message
  };
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

function parseOpenProjectByFilePathRequest(
  value: unknown
): OpenProjectByFilePathRequest {
  if (
    !isRequestObject(value) ||
    typeof value.projectFilePath !== "string" ||
    value.projectFilePath.length === 0 ||
    typeof value.expectedProjectId !== "string" ||
    value.expectedProjectId.length === 0
  ) {
    throw new Error("Invalid open-project-by-file-path request.");
  }

  return {
    projectFilePath: value.projectFilePath,
    expectedProjectId: value.expectedProjectId
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

function parsePendingReadOnlyProjectOpenRequest(
  value: unknown
): PendingReadOnlyProjectOpenRequest {
  if (
    !isRequestObject(value) ||
    typeof value.token !== "string" ||
    value.token.length === 0
  ) {
    throw new Error("Invalid read-only project open request.");
  }

  return {
    token: value.token
  };
}

function parseCloseCurrentProjectRequest(
  value: unknown
): CloseCurrentProjectRequest {
  if (
    !isRequestObject(value) ||
    typeof value.requestId !== "string" ||
    value.requestId.length === 0 ||
    value.intent !== "explicitProjectClose"
  ) {
    throw new Error("Invalid project close request.");
  }

  return {
    requestId: value.requestId,
    intent: value.intent
  };
}

function parseListFileExplorerChildrenRequest(
  value: unknown
): ListFileExplorerChildrenRequest {
  if (
    !isRequestObject(value) ||
    !("directoryRelativePath" in value) ||
    !(
      value.directoryRelativePath === null ||
      typeof value.directoryRelativePath === "string"
    )
  ) {
    throw new Error("Invalid File Explorer children request.");
  }

  return {
    directoryRelativePath: value.directoryRelativePath
  };
}

function parseRenameFileExplorerEntryRequest(
  value: unknown
): RenameFileExplorerEntryRequest {
  if (
    !isRequestObject(value) ||
    typeof value.sourceRelativePath !== "string" ||
    typeof value.newName !== "string"
  ) {
    throw new Error("Invalid File Explorer rename request.");
  }

  return {
    sourceRelativePath: value.sourceRelativePath,
    newName: value.newName
  };
}

function fileExplorerUnavailableResult(
  directoryRelativePath: string | null,
  reason: FileExplorerUnavailableReason
): ListFileExplorerChildrenResult {
  return {
    kind: "unavailable",
    directoryRelativePath,
    reason
  };
}

function normalizeFileExplorerDirectoryRelativePath(
  directoryRelativePath: string | null
): string | null {
  if (directoryRelativePath === null || directoryRelativePath.length === 0) {
    return null;
  }

  if (
    directoryRelativePath.includes("\0") ||
    path.isAbsolute(directoryRelativePath) ||
    path.win32.isAbsolute(directoryRelativePath) ||
    path.posix.isAbsolute(directoryRelativePath)
  ) {
    throw new Error("File Explorer path must be project-relative.");
  }

  const normalized = directoryRelativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error("File Explorer path must stay inside the project root.");
  }

  return segments.join("/");
}

function normalizeFileExplorerEntryRelativePath(relativePath: string): string {
  if (relativePath.length === 0) {
    throw new Error("File Explorer entry path must not be empty.");
  }

  if (
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath)
  ) {
    throw new Error("File Explorer path must be project-relative.");
  }

  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (
    segments.some(
      (segment) =>
        segment.length === 0 || segment === "." || segment === ".."
    )
  ) {
    throw new Error("File Explorer path must stay inside the project root.");
  }

  return segments.join("/");
}

function resolveFileExplorerDirectoryPath(directoryRelativePath: string | null):
  | {
      kind: "ok";
      directoryRelativePath: string | null;
      directoryPath: string;
      rootPath: string;
      projectState: CurrentProjectState;
    }
  | {
      kind: "unavailable";
      reason: FileExplorerUnavailableReason;
    } {
  if (!currentProjectState) {
    return {
      kind: "unavailable",
      reason: "noProject"
    };
  }

  let normalizedDirectoryRelativePath: string | null = null;

  try {
    normalizedDirectoryRelativePath =
      normalizeFileExplorerDirectoryRelativePath(directoryRelativePath);
  } catch {
    return {
      kind: "unavailable",
      reason: "outsideProjectRoot"
    };
  }

  // #311: reject a request into any reserved / hidden path segment
  // (`.git`, `.pergamum_recovery`, `pergamum.json`, `.pergamum.lock.stale-…`,
  // OS noise, and Pergamum data files) before touching the filesystem. These
  // never appear in a listing (see isHiddenFileExplorerEntry); a direct
  // request for one must not scan the directory either.
  if (
    pathHasReservedFileExplorerSegment(normalizedDirectoryRelativePath) ||
    (normalizedDirectoryRelativePath !== null &&
      normalizedDirectoryRelativePath
        .split("/")
        .some((segment) => isProtectedPergamumDataFilePath(segment)))
  ) {
    return {
      kind: "unavailable",
      reason: "reserved"
    };
  }

  const directoryPath =
    normalizedDirectoryRelativePath === null
      ? currentProjectState.rootPath
      : path.resolve(
          currentProjectState.rootPath,
          normalizedDirectoryRelativePath
        );
  const relativeFromRoot = path.relative(
    currentProjectState.rootPath,
    directoryPath
  );

  if (
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    return {
      kind: "unavailable",
      reason: "outsideProjectRoot"
    };
  }

  return {
    kind: "ok",
    directoryRelativePath: normalizedDirectoryRelativePath,
    directoryPath,
    rootPath: currentProjectState.rootPath,
    projectState: currentProjectState
  };
}

function sameFileSystemPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left);
  const resolvedRight = path.resolve(right);

  if (process.platform === "win32" || process.platform === "darwin") {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }

  return resolvedLeft === resolvedRight;
}

function isHiddenFileExplorerEntry(
  entryName: string,
  entryPath: string,
  activeProjectFilePath: string
): boolean {
  const normalizedName = entryName.normalize("NFC");
  const lowerName = normalizedName.toLowerCase();

  if (sameFileSystemPath(entryPath, activeProjectFilePath)) {
    return true;
  }

  if (isProtectedPergamumDataFilePath(normalizedName)) {
    return true;
  }

  return (
    lowerName === ".pergamum" ||
    lowerName === ".pergamum.lock" ||
    lowerName.startsWith(".pergamum.lock.stale-") ||
    lowerName === projectConfigFileName.toLowerCase() ||
    lowerName === ".pergamum_recovery" ||
    lowerName === ".git" ||
    lowerName === ".ds_store" ||
    lowerName === "thumbs.db" ||
    lowerName === "desktop.ini"
  );
}

function compareFileExplorerEntries(
  left: FileExplorerEntry,
  right: FileExplorerEntry
): number {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}

async function fileExplorerDirectoryTraversalFailureReason(
  rootPath: string,
  directoryRelativePath: string | null
): Promise<FileExplorerUnavailableReason | null> {
  if (directoryRelativePath === null) {
    return null;
  }

  let currentPath = rootPath;

  for (const segment of directoryRelativePath.split("/")) {
    currentPath = path.join(currentPath, segment);

    try {
      const stats = await fs.lstat(currentPath);

      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        return "notDirectory";
      }
    } catch {
      return "unreadable";
    }
  }

  return null;
}

function isProjectMarkdownDocumentPath(relativePath: string): boolean {
  const extension = path.extname(relativePath).toLowerCase();

  return extension === ".md" || extension === ".markdown";
}

function normalizedProjectMarkdownDocumentRelativePath(
  rootPath: string,
  absolutePath: string
): string | null {
  const relativePath = path.relative(rootPath, path.resolve(absolutePath));

  if (
    relativePath.length === 0 ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }

  if (!isProjectMarkdownDocumentPath(relativePath)) {
    return null;
  }

  return normalizeRelativePath(relativePath);
}

function registerProjectDocumentPath(
  projectState: CurrentProjectState,
  absolutePath: string
): string | null {
  const normalized = normalizedProjectMarkdownDocumentRelativePath(
    projectState.rootPath,
    absolutePath
  );

  if (!normalized) {
    return null;
  }

  projectState.documentRelativePaths.add(normalized);

  return normalized;
}

async function listFileExplorerChildren(
  request: ListFileExplorerChildrenRequest
): Promise<ListFileExplorerChildrenResult> {
  const resolved = resolveFileExplorerDirectoryPath(
    request.directoryRelativePath
  );

  if (resolved.kind === "unavailable") {
    return fileExplorerUnavailableResult(null, resolved.reason);
  }

  try {
    const traversalFailureReason =
      await fileExplorerDirectoryTraversalFailureReason(
        resolved.rootPath,
        resolved.directoryRelativePath
      );

    if (traversalFailureReason) {
      return fileExplorerUnavailableResult(
        resolved.directoryRelativePath,
        traversalFailureReason
      );
    }

    const directoryStats = await fs.lstat(resolved.directoryPath);

    if (
      directoryStats.isSymbolicLink() ||
      !directoryStats.isDirectory()
    ) {
      return fileExplorerUnavailableResult(
        resolved.directoryRelativePath,
        "notDirectory"
      );
    }

    const entries = await fs.readdir(resolved.directoryPath, {
      withFileTypes: true
    });
    const visibleEntries: FileExplorerEntry[] = [];

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }

      if (!entry.isDirectory() && !entry.isFile()) {
        continue;
      }

      const entryPath = path.join(resolved.directoryPath, entry.name);

      if (
        isHiddenFileExplorerEntry(
          entry.name,
          entryPath,
          resolved.projectState.activeProjectFilePath
        )
      ) {
        continue;
      }

      const relativePath = normalizeRelativePath(
        path.relative(resolved.rootPath, entryPath)
      );

      if (entry.isFile() && isProjectMarkdownDocumentPath(relativePath)) {
        resolved.projectState.documentRelativePaths.add(relativePath);
      }

      visibleEntries.push({
        kind: entry.isDirectory() ? "folder" : "file",
        name: entry.name,
        relativePath
      });
    }

    return {
      kind: "ok",
      directoryRelativePath: resolved.directoryRelativePath,
      entries: visibleEntries.sort(compareFileExplorerEntries)
    };
  } catch {
    return fileExplorerUnavailableResult(
      resolved.directoryRelativePath,
      "unreadable"
    );
  }
}

// -------------------------------------------------------------------------
// #307: File Explorer "New File" / "New Folder" — create only, never
// destructive (#305). The main process is the source of truth: it enforces
// current-project-root only, no outside-root or symlink traversal, no
// reserved-path mutation, no overwrite, and read-only rejection. The
// renderer's reusable name dialog does none of this.
// -------------------------------------------------------------------------

function parseCreateFileExplorerEntryRequest(
  value: unknown
): CreateFileExplorerEntryRequest {
  if (
    !isRequestObject(value) ||
    typeof value.name !== "string" ||
    (value.parentDirectoryRelativePath !== null &&
      value.parentDirectoryRelativePath !== undefined &&
      typeof value.parentDirectoryRelativePath !== "string")
  ) {
    throw new Error("Invalid File Explorer create request.");
  }

  return {
    parentDirectoryRelativePath:
      typeof value.parentDirectoryRelativePath === "string"
        ? value.parentDirectoryRelativePath
        : null,
    name: value.name
  };
}

type FileExplorerCreateTarget =
  | {
      kind: "ok";
      name: string;
      parentDirectoryPath: string;
      targetPath: string;
      relativePath: string;
      rootPath: string;
    }
  | { kind: "error"; reason: FileExplorerCreateFailureReason };

async function resolveFileExplorerCreateTarget(
  parentDirectoryRelativePath: string | null,
  validatedName: string
): Promise<FileExplorerCreateTarget> {
  if (!currentProjectState) {
    return { kind: "error", reason: "noProject" };
  }

  if (currentProjectState.accessMode.kind === "readOnly") {
    return { kind: "error", reason: "readOnlyProject" };
  }

  if (isProtectedPergamumDataFilePath(validatedName)) {
    return { kind: "error", reason: "reservedName" };
  }

  const resolved = resolveFileExplorerDirectoryPath(
    parentDirectoryRelativePath
  );

  if (resolved.kind === "unavailable") {
    return {
      kind: "error",
      reason:
        resolved.reason === "noProject"
          ? "noProject"
          : resolved.reason === "notDirectory"
            ? "notDirectory"
            : "outsideProjectRoot"
    };
  }

  const traversalFailureReason =
    await fileExplorerDirectoryTraversalFailureReason(
      resolved.rootPath,
      resolved.directoryRelativePath
    );

  if (traversalFailureReason) {
    return {
      kind: "error",
      reason:
        traversalFailureReason === "notDirectory"
          ? "notDirectory"
          : "targetDirectoryMissing"
    };
  }

  try {
    const parentStats = await fs.lstat(resolved.directoryPath);

    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
      return { kind: "error", reason: "notDirectory" };
    }
  } catch {
    return { kind: "error", reason: "targetDirectoryMissing" };
  }

  const targetPath = path.join(resolved.directoryPath, validatedName);
  const relativeFromRoot = path.relative(resolved.rootPath, targetPath);

  if (
    relativeFromRoot.length === 0 ||
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    return { kind: "error", reason: "outsideProjectRoot" };
  }

  return {
    kind: "ok",
    name: validatedName,
    parentDirectoryPath: resolved.directoryPath,
    targetPath,
    relativePath: normalizeRelativePath(relativeFromRoot),
    rootPath: resolved.rootPath
  };
}

async function createFileExplorerEntry(
  rawRequest: unknown,
  entryKind: FileExplorerEntry["kind"],
  logger: DebugLogger
): Promise<CreateFileExplorerEntryResult> {
  let request: CreateFileExplorerEntryRequest;

  try {
    request = parseCreateFileExplorerEntryRequest(rawRequest);
  } catch {
    return { ok: false, reason: "invalidName" };
  }

  const validation = validateFileExplorerName(request.name);

  if (!validation.ok) {
    return {
      ok: false,
      reason: fileExplorerCreateFailureReasonFromValidationError(
        validation.error
      )
    };
  }

  let finalName = validation.name;

  if (entryKind === "file") {
    const withExtension = applyMarkdownFileExtension(validation.name);

    if (!withExtension.ok) {
      return { ok: false, reason: "unsupportedExtension" };
    }

    finalName = withExtension.fileName;

    // The appended / kept extension must not turn the name into a
    // reserved one (e.g. a bare "pergamum" typed as "pergamum.json").
    const revalidated = validateFileExplorerName(finalName);

    if (!revalidated.ok) {
      return {
        ok: false,
        reason: fileExplorerCreateFailureReasonFromValidationError(
          revalidated.error
        )
      };
    }
  }

  const target = await resolveFileExplorerCreateTarget(
    request.parentDirectoryRelativePath,
    finalName
  );

  if (target.kind === "error") {
    return { ok: false, reason: target.reason };
  }

  try {
    if (entryKind === "file") {
      // Overwrite-protected create — `wx` throws EEXIST rather than
      // truncating an existing file.
      await fs.writeFile(target.targetPath, "", { flag: "wx" });
    } else {
      // Non-recursive: the parent must already exist, and mkdir throws
      // EEXIST for an existing file or folder.
      await fs.mkdir(target.targetPath);
    }
  } catch (error) {
    const reason = fileExplorerCreateFailureReasonFromErrorCode(
      nodeErrorCode(error)
    );

    logger.log({
      level: "error",
      event: "fileExplorer.create.failed",
      details: {
        projectRef: logger.projectRefForKey(target.rootPath),
        entryKind,
        pathDepth: debugLogPathDepth(target.relativePath),
        result: "failed",
        reason
      }
    });

    return { ok: false, reason };
  }

  if (entryKind === "file") {
    currentProjectState?.documentRelativePaths.add(target.relativePath);
  }

  logger.log({
    level: "info",
    event: "fileExplorer.create.completed",
    details: {
      projectRef: logger.projectRefForKey(target.rootPath),
      entryKind,
      extension: debugLogExtensionForPath(target.relativePath),
      pathDepth: debugLogPathDepth(target.relativePath),
      result: "succeeded"
    }
  });

  return {
    ok: true,
    entry: {
      kind: entryKind,
      name: target.name,
      relativePath: target.relativePath
    }
  };
}

// -------------------------------------------------------------------------
// #313: File Explorer Rename v1 — single Markdown file rename and empty
// folder rename only. This stays filesystem-scoped: no Project DB rewrite,
// no subtree move, no dirty-editor knowledge in main.
// -------------------------------------------------------------------------

function fileExplorerEntryNameFromRelativePath(relativePath: string): string {
  return relativePath.split("/").pop() ?? relativePath;
}

function fileExplorerParentDirectoryRelativePath(
  relativePath: string
): string | null {
  const slashIndex = relativePath.lastIndexOf("/");

  return slashIndex === -1 ? null : relativePath.slice(0, slashIndex);
}

type FileExplorerRenameTarget =
  | {
      kind: "ok";
      projectState: CurrentProjectState;
      entryKind: FileExplorerEntry["kind"];
      oldRelativePath: string;
      newRelativePath: string;
      newName: string;
      parentDirectoryRelativePath: string | null;
      sourcePath: string;
      targetPath: string;
    }
  | { kind: "error"; reason: FileExplorerRenameFailureReason };

function fileExplorerRenameReasonFromUnavailable(
  reason: FileExplorerUnavailableReason
): FileExplorerRenameFailureReason {
  switch (reason) {
    case "noProject":
      return "noProject";
    case "notDirectory":
      return "notDirectory";
    case "reserved":
      return "reservedName";
    case "outsideProjectRoot":
    case "invalidRequest":
    case "unreadable":
      return "outsideProjectRoot";
  }
}

async function resolveFileExplorerRenameTarget(
  request: RenameFileExplorerEntryRequest
): Promise<FileExplorerRenameTarget> {
  if (!currentProjectState) {
    return { kind: "error", reason: "noProject" };
  }

  if (currentProjectState.accessMode.kind === "readOnly") {
    return { kind: "error", reason: "readOnlyProject" };
  }

  let sourceRelativePath: string;

  try {
    sourceRelativePath = normalizeFileExplorerEntryRelativePath(
      request.sourceRelativePath
    );
  } catch {
    return {
      kind: "error",
      reason:
        request.sourceRelativePath.length === 0
          ? "cannotRenameProjectRoot"
          : "outsideProjectRoot"
    };
  }

  if (
    pathHasReservedFileExplorerSegment(sourceRelativePath) ||
    sourceRelativePath
      .split("/")
      .some((segment) => isProtectedPergamumDataFilePath(segment))
  ) {
    return { kind: "error", reason: "reservedName" };
  }

  const parentDirectoryRelativePath =
    fileExplorerParentDirectoryRelativePath(sourceRelativePath);
  const parent = resolveFileExplorerDirectoryPath(
    parentDirectoryRelativePath
  );

  if (parent.kind === "unavailable") {
    return {
      kind: "error",
      reason: fileExplorerRenameReasonFromUnavailable(parent.reason)
    };
  }

  const traversalFailureReason =
    await fileExplorerDirectoryTraversalFailureReason(
      parent.rootPath,
      parent.directoryRelativePath
    );

  if (traversalFailureReason) {
    return {
      kind: "error",
      reason:
        traversalFailureReason === "notDirectory"
          ? "notDirectory"
          : "sourceMissing"
    };
  }

  const sourcePath = path.resolve(parent.rootPath, sourceRelativePath);
  const relativeFromRoot = path.relative(parent.rootPath, sourcePath);

  if (
    relativeFromRoot.length === 0 ||
    relativeFromRoot.startsWith("..") ||
    path.isAbsolute(relativeFromRoot)
  ) {
    return { kind: "error", reason: "outsideProjectRoot" };
  }

  let sourceStats: Awaited<ReturnType<typeof fs.lstat>>;

  try {
    sourceStats = await fs.lstat(sourcePath);
  } catch (error) {
    return {
      kind: "error",
      reason: fileExplorerRenameFailureReasonFromErrorCode(
        nodeErrorCode(error)
      )
    };
  }

  if (sourceStats.isSymbolicLink()) {
    return { kind: "error", reason: "notFile" };
  }

  if (!sourceStats.isFile() && !sourceStats.isDirectory()) {
    return { kind: "error", reason: "notFile" };
  }

  const entryKind: FileExplorerEntry["kind"] = sourceStats.isDirectory()
    ? "folder"
    : "file";

  if (
    entryKind === "file" &&
    !isProjectMarkdownDocumentPath(sourceRelativePath)
  ) {
    return { kind: "error", reason: "unsupportedExtension" };
  }

  const nameValidation = validateFileExplorerRenameName({
    kind: entryKind,
    originalName: fileExplorerEntryNameFromRelativePath(sourceRelativePath),
    newName: request.newName
  });

  if (!nameValidation.ok) {
    return { kind: "error", reason: nameValidation.reason };
  }

  if (isProtectedPergamumDataFilePath(nameValidation.name)) {
    return { kind: "error", reason: "reservedName" };
  }

  const targetPath = path.join(parent.directoryPath, nameValidation.name);
  const targetRelativeFromRoot = path.relative(parent.rootPath, targetPath);

  if (
    targetRelativeFromRoot.length === 0 ||
    targetRelativeFromRoot.startsWith("..") ||
    path.isAbsolute(targetRelativeFromRoot)
  ) {
    return { kind: "error", reason: "outsideProjectRoot" };
  }

  const targetRelativePath = normalizeRelativePath(targetRelativeFromRoot);

  if (
    pathHasReservedFileExplorerSegment(targetRelativePath) ||
    targetRelativePath
      .split("/")
      .some((segment) => isProtectedPergamumDataFilePath(segment))
  ) {
    return { kind: "error", reason: "reservedName" };
  }

  if (sameFileSystemPath(sourcePath, targetPath)) {
    return { kind: "error", reason: "samePath" };
  }

  try {
    await fs.lstat(targetPath);
    return { kind: "error", reason: "alreadyExists" };
  } catch (error) {
    if (nodeErrorCode(error) !== "ENOENT") {
      return {
        kind: "error",
        reason: fileExplorerRenameFailureReasonFromErrorCode(
          nodeErrorCode(error)
        )
      };
    }
  }

  if (entryKind === "folder") {
    let childNames: string[];

    try {
      childNames = await fs.readdir(sourcePath);
    } catch (error) {
      return {
        kind: "error",
        reason: fileExplorerRenameFailureReasonFromErrorCode(
          nodeErrorCode(error)
        )
      };
    }

    if (childNames.length > 0) {
      return { kind: "error", reason: "folderNotEmpty" };
    }
  }

  return {
    kind: "ok",
    projectState: parent.projectState,
    entryKind,
    oldRelativePath: sourceRelativePath,
    newRelativePath: targetRelativePath,
    newName: nameValidation.name,
    parentDirectoryRelativePath: parent.directoryRelativePath,
    sourcePath,
    targetPath
  };
}

/**
 * #320: notify the Recovery Store that files moved on disk, so a pending
 * Recovery candidate for the old path is re-keyed instead of stranded. Best
 * effort — it never throws and its result does not affect the rename / move
 * result. Takes a list so a future batch / subtree Move reuses it.
 */
export type RecoveryPathRekeyHook = (
  pairs: readonly { oldAbsolutePath: string; newAbsolutePath: string }[]
) => void;

let recoveryPathRekeyHook: RecoveryPathRekeyHook | null = null;

async function renameFileExplorerEntry(
  rawRequest: unknown
): Promise<RenameFileExplorerEntryResult> {
  let request: RenameFileExplorerEntryRequest;

  try {
    request = parseRenameFileExplorerEntryRequest(rawRequest);
  } catch {
    return { ok: false, reason: "invalidName" };
  }

  const target = await resolveFileExplorerRenameTarget(request);

  if (target.kind === "error") {
    return { ok: false, reason: target.reason };
  }

  try {
    await fs.rename(target.sourcePath, target.targetPath);
  } catch (error) {
    return {
      ok: false,
      reason: fileExplorerRenameFailureReasonFromErrorCode(
        nodeErrorCode(error)
      )
    };
  }

  if (target.entryKind === "file") {
    target.projectState.documentRelativePaths.delete(target.oldRelativePath);
    target.projectState.documentRelativePaths.add(target.newRelativePath);

    // #320: fs.rename succeeded — re-key any Recovery row for the old path.
    // A folder rename in v1 is empty-folder-only, so no descendant file
    // paths change; only a file rename needs this.
    try {
      recoveryPathRekeyHook?.([
        {
          oldAbsolutePath: target.sourcePath,
          newAbsolutePath: target.targetPath
        }
      ]);
    } catch {
      // Best effort: a Recovery re-key failure never breaks the rename.
    }
  }

  return {
    ok: true,
    oldRelativePath: target.oldRelativePath,
    newEntry: {
      kind: target.entryKind,
      name: target.newName,
      relativePath: target.newRelativePath
    },
    parentDirectoryRelativePath: target.parentDirectoryRelativePath
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

/**
 * #287 follow-up: make a Markdown file that was created inside the current
 * project's root AFTER the project was opened (for example a `.recovered.md`
 * file written next to its origin document) a first-class project document,
 * so it can be read and saved through the project document IPC without
 * reopening the project.
 *
 * Returns the project-root-relative path — forward-slash separated, the same
 * form `discoverMarkdownFiles` produces — when `absolutePath` is a Markdown
 * file inside the open project root; otherwise `null` (no project open, path
 * outside the root, or not a supported Markdown file). Idempotent.
 */
export function registerCurrentProjectDocumentPath(
  absolutePath: string
): string | null {
  if (!currentProjectState) {
    return null;
  }

  return registerProjectDocumentPath(currentProjectState, absolutePath);
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

      if (!entry.isFile() || !isProjectMarkdownDocumentPath(entry.name)) {
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

async function releaseWriteOwnershipStrict(
  writeOwnershipManager: ProjectWriteOwnershipManager,
  projectFilePath: string,
  writeOwnership: ProjectWriteOwnership
): Promise<void> {
  await writeOwnershipManager.release(projectFilePath, writeOwnership);
}

async function releaseWriteOwnershipBestEffort(
  writeOwnershipManager: ProjectWriteOwnershipManager,
  projectFilePath: string,
  writeOwnership: ProjectWriteOwnership
): Promise<void> {
  try {
    await releaseWriteOwnershipStrict(
      writeOwnershipManager,
      projectFilePath,
      writeOwnership
    );
  } catch {
    // Ownership release is intentionally best-effort.
  }
}

async function releaseProjectWriteOwnershipStrict(
  state: CurrentProjectState
): Promise<void> {
  await releaseWriteOwnershipStrict(
    state.writeOwnershipManager,
    state.activeProjectFilePath,
    state.writeOwnership
  );
}

async function releaseProjectWriteOwnershipBestEffort(
  state: CurrentProjectState
): Promise<void> {
  await releaseWriteOwnershipBestEffort(
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

export function setProjectWindowTitleTargetProvider(
  provider: ProjectWindowTitleTargetProvider | null
): void {
  projectWindowTitleTargetProvider = provider;
}

async function requestCurrentProjectWindowTitleUpdate(): Promise<void> {
  if (!projectWindowTitleTargetProvider) {
    return;
  }

  await updateCurrentProjectWindowTitle();
}

export async function updateCurrentProjectWindowTitle(): Promise<void> {
  const target = projectWindowTitleTargetProvider?.() ?? null;

  if (!target) {
    return;
  }

  try {
    const settings = await loadSettings();
    target.setTitle(
      createProjectWindowTitle({
        projectName: currentProjectState?.projectName ?? null,
        titleStatus: currentProjectState
          ? projectWindowTitleStatusFromAccessMode(
              currentProjectState.accessMode
            )
          : null,
        language: settings.workbench.language
      })
    );
  } catch {
    // Window title updates must not affect project open/close lifecycle.
  }
}

export async function releaseCurrentProjectWriteOwnership(): Promise<void> {
  await discardPendingReadOnlyProjectOpen();

  const stateToRelease = currentProjectState;

  if (!stateToRelease) {
    return;
  }

  currentProjectState = null;
  await requestCurrentProjectWindowTitleUpdate();
  await releaseProjectWriteOwnershipBestEffort(stateToRelease);
}

export async function closeCurrentProject(): Promise<CloseCurrentProjectResult> {
  const stateToClose = currentProjectState;

  if (!stateToClose) {
    await discardPendingReadOnlyProjectOpen();
    return { status: "noProject" };
  }

  try {
    try {
      await releaseProjectWriteOwnershipStrict(stateToClose);
    } catch {
      return { status: "failed", reason: "releaseFailed" };
    }

    await discardPendingReadOnlyProjectOpen();
    if (currentProjectState === stateToClose) {
      currentProjectState = null;
    }
    await requestCurrentProjectWindowTitleUpdate();

    return { status: "closed" };
  } catch {
    return { status: "failed", reason: "unexpected" };
  }
}

async function activateProject(
  project: PergamumProject,
  projectId: string,
  writeOwnershipManager: ProjectWriteOwnershipManager,
  writeOwnership: ProjectWriteOwnership
): Promise<void> {
  const previousState = currentProjectState;

  currentProjectState = {
    rootPath: project.rootPath,
    activeProjectFilePath: project.activeProjectFilePath,
    projectId,
    projectName: project.name,
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
    await releaseProjectWriteOwnershipBestEffort(previousState);
  }

  await requestCurrentProjectWindowTitleUpdate();
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

function logProjectOpenSucceeded(
  logger: DebugLogger,
  projectRef: string,
  operation: ProjectOpenOperation,
  startedAt: number
): void {
  logger.log({
    level: "info",
    event: "project.open.succeeded",
    details: {
      projectRef,
      operation,
      result: "succeeded",
      durationMs: durationSince(startedAt)
    }
  });
}

function projectWriteLockStaleTakeoverLogDetails(
  info: ProjectWriteLockStaleTakeoverInfo,
  instanceRunId: string | undefined,
  startedAt: number,
  result: "succeeded" | "failed" | "ignored"
): Record<string, unknown> {
  return {
    result,
    ...(instanceRunId ? { instanceRunId } : {}),
    ownerPid: info.ownerPid,
    ownerAppVersion: info.ownerAppVersion,
    ownerCreatedAt: info.ownerCreatedAt,
    durationMs: Math.max(0, durationSince(startedAt))
  };
}

function logProjectWriteLockStaleTakeover(
  logger: DebugLogger,
  ownership: ProjectWriteOwnership,
  instanceRunId: string | undefined,
  startedAt: number
): void {
  const staleTakeover = ownership.staleTakeover;

  if (!staleTakeover) {
    return;
  }

  if (staleTakeover.phase === "refused") {
    logger.log({
      level: "debug",
      event: "project.writeLock.reclamation.refused",
      details: {
        ...projectWriteLockStaleTakeoverLogDetails(
          staleTakeover,
          instanceRunId,
          startedAt,
          "ignored"
        ),
        reason: "locked"
      }
    });
    return;
  }

  logger.log({
    level: "debug",
    event: "project.writeLock.stale.detected",
    details: projectWriteLockStaleTakeoverLogDetails(
      staleTakeover,
      instanceRunId,
      startedAt,
      "ignored"
    )
  });

  if (staleTakeover.phase === "reacquired") {
    logger.log({
      level: "info",
      event: "project.writeLock.stale.archived",
      details: projectWriteLockStaleTakeoverLogDetails(
        staleTakeover,
        instanceRunId,
        startedAt,
        "succeeded"
      )
    });
    logger.log({
      level: "info",
      event: "project.writeLock.reacquire.succeeded",
      details: projectWriteLockStaleTakeoverLogDetails(
        staleTakeover,
        instanceRunId,
        startedAt,
        "succeeded"
      )
    });
    return;
  }

  if (staleTakeover.phase === "archiveFailed") {
    logger.log({
      level: "error",
      event: "project.writeLock.stale.archive.failed",
      details: projectWriteLockStaleTakeoverLogDetails(
        staleTakeover,
        instanceRunId,
        startedAt,
        "failed"
      )
    });
    return;
  }

  logger.log({
    level: "error",
    event: "project.writeLock.reacquire.failed",
    details: projectWriteLockStaleTakeoverLogDetails(
      staleTakeover,
      instanceRunId,
      startedAt,
      "failed"
    )
  });
}

async function finalizeProjectFileOpen(
  openedProject: ProjectFileOpenResult
): Promise<PergamumProject> {
  await activateProject(
    openedProject.project,
    openedProject.metadata.projectId,
    openedProject.writeOwnershipManager,
    openedProject.writeOwnership
  );
  await recordProjectFileOpenRecently(openedProject);

  return openedProject.project;
}

function readOnlyProjectOpenNeedsConfirmation(
  project: PergamumProject
): boolean {
  return (
    project.accessMode.kind === "readOnly" &&
    project.accessMode.reason === "writeLockUnavailable"
  );
}

function nextPendingReadOnlyProjectOpenToken(): string {
  pendingReadOnlyProjectOpenSequence += 1;
  return `pending-read-only-project-open:${pendingReadOnlyProjectOpenSequence}`;
}

async function discardPendingReadOnlyProjectOpen(): Promise<void> {
  const pending = pendingReadOnlyProjectOpenState;

  if (!pending) {
    return;
  }

  pendingReadOnlyProjectOpenState = null;
  await releaseWriteOwnershipBestEffort(
    pending.openedProject.writeOwnershipManager,
    pending.openedProject.projectFilePath,
    pending.openedProject.writeOwnership
  );
}

async function createPendingReadOnlyProjectOpen(
  openedProject: ProjectFileOpenResult,
  logger: DebugLogger,
  projectRef: string,
  operation: ProjectOpenOperation,
  startedAt: number
): Promise<PendingReadOnlyProjectOpen> {
  await discardPendingReadOnlyProjectOpen();

  const token = nextPendingReadOnlyProjectOpenToken();
  pendingReadOnlyProjectOpenState = {
    token,
    openedProject,
    operation,
    logger,
    projectRef,
    startedAt
  };

  return {
    kind: "pendingReadOnlyProjectOpen",
    token,
    project: openedProject.project,
    readOnlyReason:
      openedProject.writeOwnership.kind === "unavailable"
        ? openedProject.writeOwnership.reason
        : "lockUnavailable",
    lockOwner:
      openedProject.writeOwnership.kind === "unavailable"
        ? openedProject.writeOwnership.lockOwner ?? null
        : null
  };
}

async function projectOpenResultForOpenedProject(
  openedProject: ProjectFileOpenResult,
  logger: DebugLogger,
  projectRef: string,
  operation: ProjectOpenOperation,
  startedAt: number
): Promise<ProjectOpenResult> {
  if (readOnlyProjectOpenNeedsConfirmation(openedProject.project)) {
    return createPendingReadOnlyProjectOpen(
      openedProject,
      logger,
      projectRef,
      operation,
      startedAt
    );
  }

  const project = await finalizeProjectFileOpen(openedProject);
  logProjectOpenSucceeded(logger, projectRef, operation, startedAt);

  return project;
}

export async function confirmReadOnlyProjectOpen(
  rawRequest: unknown
): Promise<PergamumProject | null> {
  const request = parsePendingReadOnlyProjectOpenRequest(rawRequest);
  const pending = pendingReadOnlyProjectOpenState;

  if (!pending || pending.token !== request.token) {
    return null;
  }

  pendingReadOnlyProjectOpenState = null;
  const project = await finalizeProjectFileOpen(pending.openedProject);
  logProjectOpenSucceeded(
    pending.logger,
    pending.projectRef,
    pending.operation,
    pending.startedAt
  );

  return project;
}

export async function cancelReadOnlyProjectOpen(
  rawRequest: unknown
): Promise<void> {
  const request = parsePendingReadOnlyProjectOpenRequest(rawRequest);
  const pending = pendingReadOnlyProjectOpenState;

  if (!pending || pending.token !== request.token) {
    return;
  }

  await discardPendingReadOnlyProjectOpen();
}

async function createProjectFromProjectFile(
  projectFilePath: string,
  logger: DebugLogger,
  writeOwnershipManager: ProjectWriteOwnershipManager,
  instanceRunId?: string
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
  const lockStartedAt = Date.now();
  const ownership = await writeOwnershipManager.acquire(projectFilePath, {
    projectId: metadata.projectId,
    sessionId: logger.sessionId ?? "unknown-session",
    ...(instanceRunId ? { instanceRunId } : {})
  });
  logProjectWriteLockStaleTakeover(
    logger,
    ownership,
    instanceRunId,
    lockStartedAt
  );
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

    shouldReleaseOwnership = false;

    return {
      project,
      metadata,
      projectFilePath,
      projectRootPath,
      writeOwnership: ownership,
      writeOwnershipManager
    };
  } finally {
    if (shouldReleaseOwnership) {
      await releaseWriteOwnershipBestEffort(
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
  writeOwnershipManager: ProjectWriteOwnershipManager,
  instanceRunId?: string
): Promise<ProjectFileOpenResult> {
  const projectRootPath = resolveProjectRoot(projectFilePath);
  const database = await openProjectDatabase(projectFilePath, logger);
  const metadata = await readProjectMetadataAndClose(database);

  const config = await readProjectConfig(projectRootPath);
  const lockStartedAt = Date.now();
  const ownership = await writeOwnershipManager.acquire(projectFilePath, {
    projectId: metadata.projectId,
    sessionId: logger.sessionId ?? "unknown-session",
    ...(instanceRunId ? { instanceRunId } : {})
  });
  logProjectWriteLockStaleTakeover(
    logger,
    ownership,
    instanceRunId,
    lockStartedAt
  );
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

    shouldReleaseOwnership = false;

    return {
      project,
      metadata,
      projectFilePath,
      projectRootPath,
      writeOwnership: ownership,
      writeOwnershipManager
    };
  } finally {
    if (shouldReleaseOwnership) {
      await releaseWriteOwnershipBestEffort(
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
    defaultProjectWriteOwnershipManager,
  instanceRunId?: string
): Promise<ProjectOpenResult> {
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
      writeOwnershipManager,
      instanceRunId
    );
    return projectOpenResultForOpenedProject(
      openedProject,
      logger,
      projectRef,
      "create",
      startedAt
    );
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
    defaultProjectWriteOwnershipManager,
  instanceRunId?: string
): Promise<ProjectOpenResult> {
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
      writeOwnershipManager,
      instanceRunId
    );
    return projectOpenResultForOpenedProject(
      openedProject,
      logger,
      projectRef,
      "open",
      startedAt
    );
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

export async function openStartupProject(
  rawProjectFilePath: string,
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager,
  instanceRunId?: string
): Promise<ProjectOpenResult> {
  const startedAt = Date.now();
  let projectRef: string | undefined;

  try {
    const projectFilePath = resolveProjectFilePath(rawProjectFilePath);

    if (await isDirectoryPath(projectFilePath)) {
      return null;
    }

    projectRef = logger.projectRefForKey(projectFilePath);

    const openedProject = await openProjectFromProjectFile(
      projectFilePath,
      logger,
      writeOwnershipManager,
      instanceRunId
    );
    return projectOpenResultForOpenedProject(
      openedProject,
      logger,
      projectRef,
      "open",
      startedAt
    );
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

/**
 * #274: reopen a project from an arbitrary `.pergamum` path for cold-start
 * Session restore. Goes through the SAME open lifecycle as every other open
 * (metadata validation, write ownership / write-lock, read-only fallback,
 * read-only confirmation, error handling) — Session Restore never gets an
 * unsafe shortcut. After the metadata is read, the reopened
 * `metadata.project_id` MUST equal the identity the Session saved; a
 * mismatch means the `.pergamum` at that path is a different project now,
 * which is a Project restore failure, never a guess.
 */
export async function openProjectByFilePath(
  rawProjectFilePath: string,
  expectedProjectId: string,
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager,
  instanceRunId?: string
): Promise<OpenProjectByFilePathResult> {
  const startedAt = Date.now();
  let projectRef: string | undefined;

  try {
    const projectFilePath = resolveProjectFilePath(rawProjectFilePath);

    if (await isDirectoryPath(projectFilePath)) {
      return {
        kind: "failed",
        reason: "notFound",
        message: "Project file was not found."
      };
    }

    projectRef = logger.projectRefForKey(projectFilePath);

    const openedProject = await openProjectFromProjectFile(
      projectFilePath,
      logger,
      writeOwnershipManager,
      instanceRunId
    );

    if (openedProject.metadata.projectId !== expectedProjectId) {
      // Different project at this locator now — release what we just
      // acquired and report the mismatch. Never adopt the other identity.
      await releaseWriteOwnershipBestEffort(
        openedProject.writeOwnershipManager,
        openedProject.projectFilePath,
        openedProject.writeOwnership
      );

      return { kind: "identityMismatch" };
    }

    return {
      kind: "opened",
      result: await projectOpenResultForOpenedProject(
        openedProject,
        logger,
        projectRef,
        "open",
        startedAt
      )
    };
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

    return {
      kind: "failed",
      reason: safeError.reason,
      message: safeError.message
    };
  }
}

export function registerProjectIpc(
  logger: DebugLogger = getDebugLogger(),
  writeOwnershipManager: ProjectWriteOwnershipManager =
    defaultProjectWriteOwnershipManager,
  windowTitleTargetProvider?: ProjectWindowTitleTargetProvider,
  startupProjectFilePath?: string | null,
  instanceRunId?: string,
  rekeyRecoveryPaths?: RecoveryPathRekeyHook
): void {
  setProjectWindowTitleTargetProvider(windowTitleTargetProvider ?? null);
  recoveryPathRekeyHook = rekeyRecoveryPaths ?? null;
  let pendingStartupProjectFilePath = startupProjectFilePath ?? null;

  ipcMain.handle(PROJECT_CHANNELS.createProject, (event) =>
    createProject(event, logger, writeOwnershipManager, instanceRunId)
  );

  ipcMain.handle(PROJECT_CHANNELS.openProject, (event) =>
    openProject(event, logger, writeOwnershipManager, instanceRunId)
  );

  ipcMain.handle(
    PROJECT_CHANNELS.closeCurrentProject,
    async (_event, rawRequest: unknown): Promise<CloseCurrentProjectResult> => {
      parseCloseCurrentProjectRequest(rawRequest);
      return closeCurrentProject();
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.openStartupProject,
    async (): Promise<StartupProjectOpenResult> => {
      const projectFilePath = pendingStartupProjectFilePath;
      pendingStartupProjectFilePath = null;

      if (!projectFilePath) {
        return { kind: "noStartupProjectOpen" };
      }

      try {
        return {
          kind: "startupProjectOpenResult",
          result: await openStartupProject(
            projectFilePath,
            logger,
            writeOwnershipManager,
            instanceRunId
          )
        };
      } catch (error) {
        return startupProjectOpenFailureResult(error);
      }
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.openProjectByFilePath,
    async (
      _event,
      rawRequest: unknown
    ): Promise<OpenProjectByFilePathResult> => {
      const request = parseOpenProjectByFilePathRequest(rawRequest);

      return openProjectByFilePath(
        request.projectFilePath,
        request.expectedProjectId,
        logger,
        writeOwnershipManager,
        instanceRunId
      );
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.openRecentProject,
    async (
      _event,
      rawRequest: unknown
    ): Promise<ProjectOpenResult> => {
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
          writeOwnershipManager,
          instanceRunId
        );

        return projectOpenResultForOpenedProject(
          openedProject,
          logger,
          logger.projectRefForKey(projectFilePath),
          "open",
          startedAt
        );
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
    PROJECT_CHANNELS.confirmReadOnlyProjectOpen,
    (_event, rawRequest: unknown): Promise<PergamumProject | null> =>
      confirmReadOnlyProjectOpen(rawRequest)
  );

  ipcMain.handle(
    PROJECT_CHANNELS.cancelReadOnlyProjectOpen,
    async (_event, rawRequest: unknown): Promise<void> => {
      await cancelReadOnlyProjectOpen(rawRequest);
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.listFileExplorerChildren,
    async (
      _event,
      rawRequest: unknown
    ): Promise<ListFileExplorerChildrenResult> => {
      let request: ListFileExplorerChildrenRequest;

      try {
        request = parseListFileExplorerChildrenRequest(rawRequest);
      } catch {
        return fileExplorerUnavailableResult(null, "invalidRequest");
      }

      return listFileExplorerChildren(request);
    }
  );

  ipcMain.handle(
    PROJECT_CHANNELS.createFileExplorerMarkdownFile,
    async (
      _event,
      rawRequest: unknown
    ): Promise<CreateFileExplorerEntryResult> =>
      createFileExplorerEntry(rawRequest, "file", logger)
  );

  ipcMain.handle(
    PROJECT_CHANNELS.createFileExplorerFolder,
    async (
      _event,
      rawRequest: unknown
    ): Promise<CreateFileExplorerEntryResult> =>
      createFileExplorerEntry(rawRequest, "folder", logger)
  );

  ipcMain.handle(
    PROJECT_CHANNELS.renameFileExplorerEntry,
    async (
      _event,
      rawRequest: unknown
    ): Promise<RenameFileExplorerEntryResult> =>
      renameFileExplorerEntry(rawRequest)
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
        assertCurrentProjectDocumentSaveAllowed();
        const documentPath = resolveProjectDocumentPath(request.relativePath);
        assertProjectDocumentSaveTargetAllowed(documentPath);
        const metadata = markdownWriteMetadata(request.content);
        // Crash-safe manuscript write (temp sibling file → fsync → atomic
        // rename). An interrupted save cannot leave the previous good
        // document truncated / half-written; "saved" means the atomic
        // replace completed. Any failure throws here and is reported as a
        // non-cleaning file I/O error below (dirty state is preserved).
        await writeFileAtomic(documentPath, request.content);
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
