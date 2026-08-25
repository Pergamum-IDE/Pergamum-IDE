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
  DebugLogSnapshot,
  RendererDebugLogRequest,
  SanitizedDebugLogEvent
} from "./debugLog";
import type {
  EditContextMenuCommandSelection,
  EditContextMenuPopupRequest,
  NativeEditDelegationRequest
} from "./editContextMenu";
import type { AppPlatform } from "./platform";

export type { AppPlatform } from "./platform";

export type {
  ApplicationSettings,
  EffectiveSettings,
  NewFileEncoding,
  NewFileLineEnding,
  PreviewRendererId,
  RecordRecentProjectInput,
  ProjectSettings,
  RecentProject,
  SaveApplicationSettingsRequest
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
  saveMarkdown: "files:saveMarkdown",
  selectMarkdownSavePath: "files:selectMarkdownSavePath",
  writeMarkdown: "files:writeMarkdown"
} as const;

export const PROJECT_CHANNELS = {
  createProject: "projects:createProject",
  openProject: "projects:openProject",
  openRecentProject: "projects:openRecentProject",
  confirmReadOnlyProjectOpen: "projects:confirmReadOnlyProjectOpen",
  cancelReadOnlyProjectOpen: "projects:cancelReadOnlyProjectOpen",
  readProjectDocument: "projects:readProjectDocument",
  saveProjectDocument: "projects:saveProjectDocument"
} as const;

export const SETTINGS_CHANNELS = {
  getSettings: "settings:getSettings",
  saveSettings: "settings:saveSettings"
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
  command: "applicationMenu:command"
} as const;

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
  };
  settings: {
    getSettings: () => Promise<ApplicationSettings>;
    saveSettings: (
      settings: SaveApplicationSettingsRequest
    ) => Promise<ApplicationSettings>;
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
