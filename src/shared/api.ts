import type {
  ApplicationSettings,
  ProjectSettings,
  SaveApplicationSettingsRequest
} from "./settings";
import type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossarySurfaceLookupResult,
  UpdateGlossaryEntryInput
} from "./glossary";
import type {
  DebugLogReason,
  DebugLogSnapshot,
  RendererDebugLogRequest,
  SanitizedDebugLogEvent
} from "./debugLog";
import type {
  EditContextMenuCommandSelection,
  EditContextMenuPopupRequest,
  NativeEditDelegationRequest
} from "./editContextMenu";
import type {
  CloseCurrentProjectRequest,
  CloseCurrentProjectResult,
  LifecycleCloseDecision,
  LifecycleWindowCloseRequest,
  QuitApplicationRequest,
  QuitApplicationResult
} from "./lifecycle";
import type { AppPlatform } from "./platform";
import type { RendererSessionSnapshot, SessionRecord } from "./session";
import type { ColdStartLaunchTarget } from "./sessionRestore";

export type { AppPlatform } from "./platform";
export type {
  CloseCurrentProjectRequest,
  CloseCurrentProjectResult,
  DirtyWorkingCopy,
  DirtyWorkingCopyKind,
  DirtyWorkingCopyScope,
  LifecycleCloseDecision,
  LifecycleIntent,
  LifecycleWindowCloseRequest,
  QuitApplicationRequest,
  QuitApplicationResult,
  SaveWorkingCopyOutcome
} from "./lifecycle";

export type {
  ApplicationSettings,
  EffectiveSettings,
  ExpectedLineEnding,
  LineEndingMarkerGlyph,
  NewFileEncoding,
  NewFileLineEnding,
  ParagraphIndentExcludeLeadingCharacters,
  PreviewRendererId,
  RecordRecentProjectInput,
  ProjectSettings,
  RecentProject,
  SaveApplicationSettingsRequest,
  WorkbenchNotificationSettings
} from "./settings";
export type {
  CreateGlossaryEntryInput,
  GlossaryEntry,
  GlossaryEntryId,
  GlossaryEntryKind,
  GlossaryForm,
  GlossaryFormId,
  GlossaryFormInput,
  GlossaryFormMatchBoundary,
  GlossaryFormRelation,
  GlossarySurfaceLookupInput,
  GlossarySurfaceLookupResult,
  GlossaryWarningPolicy,
  UpdateGlossaryEntryInput
} from "./glossary";

export const FILE_CHANNELS = {
  openMarkdown: "files:openMarkdown",
  /** #274: read a Markdown file by absolute path — no dialog. Used to
   *  reopen a standalone Markdown editor / route a Markdown launch target. */
  readMarkdownFile: "files:readMarkdownFile",
  saveMarkdown: "files:saveMarkdown",
  selectMarkdownSavePath: "files:selectMarkdownSavePath",
  writeMarkdown: "files:writeMarkdown"
} as const;

export const PROJECT_CHANNELS = {
  createProject: "projects:createProject",
  openProject: "projects:openProject",
  openStartupProject: "projects:openStartupProject",
  /** #274: reopen a project from an arbitrary `.pergamum` path through the
   *  normal open lifecycle (metadata / write-lock / read-only policy), with
   *  a saved-identity check. Used only by cold-start Session restore. */
  openProjectByFilePath: "projects:openProjectByFilePath",
  openRecentProject: "projects:openRecentProject",
  confirmReadOnlyProjectOpen: "projects:confirmReadOnlyProjectOpen",
  cancelReadOnlyProjectOpen: "projects:cancelReadOnlyProjectOpen",
  readProjectDocument: "projects:readProjectDocument",
  saveProjectDocument: "projects:saveProjectDocument",
  closeCurrentProject: "projects:closeCurrentProject"
} as const;

export const LIFECYCLE_CHANNELS = {
  windowCloseRequested: "lifecycle:windowCloseRequested",
  respondWindowCloseRequest: "lifecycle:respondWindowCloseRequest",
  quitApplication: "lifecycle:quitApplication"
} as const;

export const SETTINGS_CHANNELS = {
  getSettings: "settings:getSettings",
  saveSettings: "settings:saveSettings"
} as const;

export const SESSION_CHANNELS = {
  persistSession: "session:persistSession",
  dropSessionFromRestoreSet: "session:dropSessionFromRestoreSet",
  /** #274: renderer → main, once at cold start — the bounded restore-set
   *  read result plus the launch target extracted from argv. */
  getColdStartRestore: "session:getColdStartRestore",
  /** main → renderer: a storage-class Session persistence failure occurred
   *  for a write the renderer was not awaiting (window-driven re-persist). */
  storageFailure: "session:storageFailure"
} as const;

export const GLOSSARY_CHANNELS = {
  create: "glossary:create",
  getById: "glossary:getById",
  list: "glossary:list",
  lookupSurface: "glossary:lookupSurface",
  update: "glossary:update",
  delete: "glossary:delete"
} as const;

export const DEBUG_LOG_CHANNELS = {
  logEvent: "debugLog:logEvent",
  getSnapshot: "debugLog:getSnapshot",
  subscribe: "debugLog:subscribe",
  unsubscribe: "debugLog:unsubscribe",
  event: "debugLog:event"
} as const;

export const APPLICATION_MENU_CHANNELS = {
  command: "applicationMenu:command",
  setEnablement: "applicationMenu:setEnablement"
} as const;

/**
 * #252 follow-up: renderer -> main push of live command enablement (from
 * `CommandRegistry.isEnabledForContext`, the same evaluation the Command
 * Palette already uses), keyed by `ApplicationMenuCommandId`, so the
 * native Electron menu — built once at startup and otherwise never
 * touched — can reflect `when` (e.g. `editor.kind.markdown`) as a real
 * disabled state. Commands not present in the map are left as they are;
 * a command that never declares a `when` is simply always sent as `true`.
 */
export type ApplicationMenuEnablementMap = Record<string, boolean>;

export const CONTEXT_MENU_CHANNELS = {
  popupEditMenu: "contextMenu:popupEditMenu",
  commandSelected: "contextMenu:commandSelected"
} as const;

export const EDIT_CHANNELS = {
  delegateNativeEdit: "edit:delegateNativeEdit"
} as const;

export const APP_INFO_CHANNELS = {
  getAppInfo: "appInfo:getAppInfo",
  openRepository: "appInfo:openRepository",
  openTypewriterSoundsCredit: "appInfo:openTypewriterSoundsCredit"
} as const;

export const APP_INFO_EXTERNAL_LINKS = {
  repository: "https://github.com/Pergamum-IDE/Pergamum-IDE",
  typewriterSoundsCredit:
    "https://opengameart.org/content/typewriter-sounds"
} as const;

export type MarkdownLineEnding =
  | "lf"
  | "crlf"
  | "cr"
  | "mixed"
  | "none"
  | "unknown";

export interface MarkdownFileReadMetadata {
  encoding: "utf8";
  lineEnding: MarkdownLineEnding;
  byteLength: number;
  characterLength: number;
  hadBom: boolean;
}

export interface MarkdownFile {
  path: string;
  content: string;
  metadata: MarkdownFileReadMetadata;
}

export interface SaveMarkdownRequest {
  path: string | null;
  content: string;
}

export type SaveMarkdownRejectedReason = "protected" | "unverifiable";

export interface SaveMarkdownSavedResult {
  kind: "saved";
  path: string;
}

export interface SaveMarkdownRejectedResult {
  kind: "rejected";
  reason: SaveMarkdownRejectedReason;
}

export type SaveMarkdownResult =
  | SaveMarkdownSavedResult
  | SaveMarkdownRejectedResult;

export interface SelectMarkdownSavePathRequest {
  defaultPath: string | null;
}

export interface SelectMarkdownSavePathResult {
  path: string;
}

export interface WriteMarkdownRequest {
  path: string;
  content: string;
}

export interface WriteMarkdownSavedResult {
  kind: "saved";
  path: string;
  encoding: "utf8";
  lineEnding: MarkdownLineEnding;
  byteLength: number;
  characterLength: number;
}

export type WriteMarkdownResult =
  | WriteMarkdownSavedResult
  | SaveMarkdownRejectedResult;

export interface PergamumProjectConfig {
  name?: string;
  settings?: ProjectSettings;
}

export interface ProjectDocument {
  relativePath: string;
  name: string;
}

export interface ReadProjectDocumentRequest {
  relativePath: string;
}

export interface ProjectDocumentContent {
  relativePath: string;
  content: string;
  metadata: MarkdownFileReadMetadata;
}

export interface SaveProjectDocumentRequest {
  relativePath: string;
  content: string;
}

export interface SaveProjectDocumentResult {
  relativePath: string;
}

export type ProjectAccessMode =
  | { kind: "readWrite" }
  | { kind: "readOnly"; reason: "writeLockUnavailable" };

export const defaultProjectAccessMode: ProjectAccessMode = {
  kind: "readWrite"
};

export interface PergamumProject {
  rootPath: string;
  activeProjectFilePath: string;
  accessMode: ProjectAccessMode;
  name: string;
  config: PergamumProjectConfig | null;
  documents: ProjectDocument[];
}

export interface ProjectLockOwnerInfo {
  hostname: string;
  openedAt: string;
}

export type PendingReadOnlyProjectOpenReason =
  | "lockUnavailable"
  | "lockSetupFailed";

export interface PendingReadOnlyProjectOpen {
  kind: "pendingReadOnlyProjectOpen";
  token: string;
  project: PergamumProject;
  readOnlyReason: PendingReadOnlyProjectOpenReason;
  lockOwner: ProjectLockOwnerInfo | null;
}

export type ProjectOpenResult =
  | PergamumProject
  | PendingReadOnlyProjectOpen
  | null;

export type StartupProjectOpenResult =
  | { kind: "noStartupProjectOpen" }
  | { kind: "startupProjectOpenResult"; result: ProjectOpenResult }
  | {
      kind: "startupProjectOpenFailed";
      reason: DebugLogReason;
      message: string;
    };

/**
 * #274: result of reopening a project from an arbitrary `.pergamum` path
 * during cold-start Session restore.
 *
 *   - `opened`           → proceed through the normal open result
 *                          (`resolveProjectOpenResult` / read-only confirm)
 *   - `identityMismatch` → the `.pergamum` at that path is a DIFFERENT
 *                          project than the Session saved; Project restore
 *                          failed, never guessed
 *   - `failed`           → missing / unreadable / other open error
 */
export type OpenProjectByFilePathResult =
  | { kind: "opened"; result: ProjectOpenResult }
  | { kind: "identityMismatch" }
  | { kind: "failed"; reason: DebugLogReason; message: string };

export interface OpenProjectByFilePathRequest {
  projectFilePath: string;
  expectedProjectId: string;
}

/**
 * #274: cold-start restore payload handed to the renderer once at startup.
 * `SessionRecord`s here are already validated current-schema cores; the
 * renderer selects at most one to restore.
 */
export type ColdStartRestoreRead =
  | {
      kind: "ok";
      sessions: SessionRecord[];
      manifestListedSessionCount: number;
      skippedSessionCount: number;
    }
  | { kind: "empty" }
  | {
      kind: "manifestUnavailable";
      reason: "unreadable" | "malformed" | "unsupportedSchema";
    }
  | { kind: "timedOut" };

export interface ColdStartRestorePayload {
  read: ColdStartRestoreRead;
  launchTarget: ColdStartLaunchTarget | null;
}

export interface PendingReadOnlyProjectOpenRequest {
  token: string;
}

export function isPendingReadOnlyProjectOpen(
  value: ProjectOpenResult
): value is PendingReadOnlyProjectOpen {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "pendingReadOnlyProjectOpen"
  );
}

export interface OpenRecentProjectRequest {
  projectFilePath: string;
}

export interface GlossaryEntryIdRequest {
  id: string;
}

export interface DeleteGlossaryEntryRequest {
  id: string;
  confirmMessage: string;
}

export interface DeleteGlossaryEntryResult {
  deleted: boolean;
}

export interface GlossarySurfaceLookupRequest {
  surface: string;
}

export interface PergamumRuntimeInfo {
  electron: string;
  chromium: string;
  node: string;
  v8: string;
  osType: string;
  osRelease: string;
  platform: string;
  arch: string;
}

export interface PergamumAppInfo {
  name: string;
  version: string;
  license: string;
  copyright: string;
  runtime: PergamumRuntimeInfo;
}

export interface PergamumApi {
  /**
   * Renderer-safe application platform (#182), resolved once at preload
   * time via `nodePlatformToAppPlatform`. Dialog and other renderer UI code
   * must read this instead of any Node-specific platform value.
   */
  platform: AppPlatform;
  files: {
    /**
     * `documentOpenId` correlates this open's document-open timing debug
     * events (#152); it is not a persistent id and is not derived from the
     * file path or content.
     */
    openMarkdown: (documentOpenId: string) => Promise<MarkdownFile | null>;
    /** #274: read a Markdown file by absolute path (no dialog). Rejects
     *  with a sanitized error when the file is missing / unreadable. */
    readMarkdownFile: (filePath: string) => Promise<MarkdownFile>;
    saveMarkdown: (
      path: string | null,
      content: string
    ) => Promise<SaveMarkdownResult | null>;
    selectMarkdownSavePath: (
      defaultPath: string | null
    ) => Promise<SelectMarkdownSavePathResult | null>;
    writeMarkdown: (
      path: string,
      content: string
    ) => Promise<WriteMarkdownResult>;
  };
  projects: {
    createProject: () => Promise<ProjectOpenResult>;
    openProject: () => Promise<ProjectOpenResult>;
    openStartupProject: () => Promise<StartupProjectOpenResult>;
    /** #274: reopen a project from a saved `.pergamum` path with a
     *  saved-identity check, for cold-start Session restore only. */
    openProjectByFilePath: (
      projectFilePath: string,
      expectedProjectId: string
    ) => Promise<OpenProjectByFilePathResult>;
    openRecentProject: (projectFilePath: string) => Promise<ProjectOpenResult>;
    confirmReadOnlyProjectOpen: (
      token: string
    ) => Promise<PergamumProject | null>;
    cancelReadOnlyProjectOpen: (token: string) => Promise<void>;
    readProjectDocument: (
      relativePath: string
    ) => Promise<ProjectDocumentContent>;
    saveProjectDocument: (
      relativePath: string,
      content: string
    ) => Promise<SaveProjectDocumentResult>;
    closeCurrentProject: (
      request: CloseCurrentProjectRequest
    ) => Promise<CloseCurrentProjectResult>;
  };
  settings: {
    getSettings: () => Promise<ApplicationSettings>;
    saveSettings: (
      settings: SaveApplicationSettingsRequest
    ) => Promise<ApplicationSettings>;
  };
  /**
   * #272: continuous Session persistence (the "write it out" side only —
   * no cold-start restore here). The renderer pushes a
   * `RendererSessionSnapshot`; the main process enriches it with
   * instanceRunId / projectId / live Window state and writes it durably
   * under `<userData>/sessions/`.
   */
  session: {
    persist: (snapshot: RendererSessionSnapshot) => Promise<void>;
    dropFromRestoreSet: (sessionId: string) => Promise<void>;
    /** #274: fetch the cold-start restore payload (bounded restore-set read
     *  result + launch target). Meant to be consumed once at startup. */
    getColdStartRestore: () => Promise<ColdStartRestorePayload>;
    /**
     * Subscribe to "the main process hit a storage-class Session
     * persistence failure for a write you were not awaiting" (window-driven
     * re-persist). The renderer moves its coordinator to SUSPENDED.
     */
    onStorageFailure: (
      callback: (reason: string) => void
    ) => () => void;
  };
  glossary: {
    create: (input: CreateGlossaryEntryInput) => Promise<GlossaryEntry>;
    getById: (id: string) => Promise<GlossaryEntry | null>;
    list: () => Promise<GlossaryEntry[]>;
    lookupSurface: (surface: string) => Promise<GlossarySurfaceLookupResult>;
    update: (input: UpdateGlossaryEntryInput) => Promise<GlossaryEntry>;
    delete: (
      id: string,
      confirmMessage: string
    ) => Promise<DeleteGlossaryEntryResult>;
  };
  debugLog: {
    logEvent: (request: RendererDebugLogRequest) => Promise<void>;
    getSnapshot: () => Promise<DebugLogSnapshot>;
    onEvent: (callback: (event: SanitizedDebugLogEvent) => void) => () => void;
  };
  applicationMenu: {
    onCommand: (callback: (commandId: string) => void) => () => void;
    setEnablement: (enablement: ApplicationMenuEnablementMap) => void;
  };
  lifecycle: {
    onWindowCloseRequest: (
      callback: (request: LifecycleWindowCloseRequest) => void
    ) => () => void;
    respondWindowCloseRequest: (
      decision: LifecycleCloseDecision
    ) => Promise<void>;
    quitApplication: (
      request: QuitApplicationRequest
    ) => Promise<QuitApplicationResult>;
  };
  contextMenu: {
    popupEditMenu: (request: EditContextMenuPopupRequest) => Promise<boolean>;
    onCommandSelected: (
      callback: (selection: EditContextMenuCommandSelection) => void
    ) => () => void;
  };
  edit: {
    delegateNativeEdit: (
      request: NativeEditDelegationRequest
    ) => Promise<boolean>;
  };
  appInfo: {
    getAppInfo: () => Promise<PergamumAppInfo>;
    openRepository: () => Promise<void>;
    openTypewriterSoundsCredit: () => Promise<void>;
  };
}
