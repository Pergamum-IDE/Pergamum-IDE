import {
  applicationCommandIds,
  assistCommandIds,
  commandPaletteCommandIds,
  editCommandIds,
  editorCommandIds
} from "./commandIds";
import {
  contextMenuSurfaces,
  type ContextMenuSurface
} from "./editContextMenu";

export const debugLogLevels = ["debug", "info", "warn", "error"] as const;

export type DebugLogLevel = (typeof debugLogLevels)[number];

export const DEFAULT_DEBUG_LOG_UI_BUFFER_LIMIT = 1_000;
export const DEBUG_LOG_GAP_RECOVERY_LIMIT = 3;

export const debugLogEventNames = [
  "app.start",
  "log.file.opened",
  "log.file.write.failed",
  "project.open.succeeded",
  "project.open.failed",
  "project.writeLock.reclamation.refused",
  "project.writeLock.stale.detected",
  "project.writeLock.stale.archived",
  "project.writeLock.stale.archive.failed",
  "project.writeLock.reacquire.succeeded",
  "project.writeLock.reacquire.failed",
  "application_menu.command.sent",
  "application_menu.command.received",
  "command.invoked",
  "command.ignored",
  "command.blocked",
  "command.failed",
  "document.open.started",
  "document.open.fileRead.completed",
  "document.open.editorDocument.applied",
  "document.open.previewRender.started",
  "document.open.previewRender.completed",
  "document.open.previewDom.committed",
  "document.open.previewDecoration.completed",
  "document.open.previewFrame.observed",
  "document.open.usable",
  "document.open.completed",
  "document.open.failed",
  "document.save.failed",
  "layout.viewport.changed",
  "ime.composition.started",
  "ime.composition.ended",
  "ime.command.passed_through",
  "ime.command.ignored",
  "ime.save.pending.created",
  "ime.save.pending.scheduled",
  "ime.save.pending.executed",
  "ime.save.pending.cleared",
  "ime.focus.checked",
  "contextMenu.requested",
  "contextMenu.opened",
  "contextMenu.suppressed",
  "contextMenu.command.selected",
  "edit.command.requested",
  "edit.command.delegated",
  "edit.command.ignored",
  "edit.command.failed",
  "db.operation.started",
  "db.operation.succeeded",
  "db.operation.failed",
  "db.operation.skipped",
  "save.requested",
  "save.in_flight.ignored",
  "save.started",
  "save.skipped",
  "save.succeeded",
  "save.failed",
  "glossary.occurrences.scan.failed",
  "recovery.store.init.started",
  "recovery.store.init.succeeded",
  "recovery.store.init.skipped",
  "recovery.store.init.failed",
  "recovery.store.schema.archived",
  "recovery.store.lock.released",
  "recovery.store.lock.reclamation.refused",
  "recovery.store.lock.stale.detected",
  "recovery.store.lock.stale.archived",
  "recovery.store.lock.stale.archive.failed",
  "recovery.store.lock.reacquire.succeeded",
  "recovery.store.lock.reacquire.failed",
  "recovery.document.persisted",
  "recovery.document.persist.failed",
  "recovery.document.deleted",
  "recovery.document.delete.failed",
  "recovery.document.rekeyed",
  "recovery.document.rekey.collision",
  "recovery.document.rekey.failed",
  "recovery.candidates.dialog.shown",
  "recovery.candidates.listed",
  "recovery.document.restored",
  "recovery.document.restore.failed",
  "recovery.document.discarded",
  "recovery.document.discard.failed",
  "recovery.report.copied",
  "app.uncaughtException",
  "app.unhandledRejection"
] as const;

export type DebugLogEventName = (typeof debugLogEventNames)[number];

export const debugLogPlatforms = [
  "win32",
  "darwin",
  "linux",
  "unknown"
] as const;

export type DebugLogPlatform = (typeof debugLogPlatforms)[number];

export const debugLogArchitectures = [
  "x64",
  "arm64",
  "ia32",
  "unknown"
] as const;

export type DebugLogArch = (typeof debugLogArchitectures)[number];

export const debugLogOperations = [
  "open",
  "read",
  "save",
  "write",
  "close",
  "scan",
  "create",
  "update",
  "delete",
  "navigate",
  "initialize",
  "command",
  "unknown"
] as const;

export type DebugLogOperation = (typeof debugLogOperations)[number];

export const debugLogDbOperations = [
  "create",
  "read",
  "update",
  "delete",
  "upsert",
  "list",
  "count",
  "initialize",
  "transaction"
] as const;

export type DebugLogDbOperation = (typeof debugLogDbOperations)[number];

export const debugLogDbEntityKinds = [
  "glossaryEntry",
  "glossaryAtom",
  "glossaryTag",
  "database",
  "unknown"
] as const;

export type DebugLogDbEntityKind = (typeof debugLogDbEntityKinds)[number];

export const debugLogResults = [
  "succeeded",
  "failed",
  "cancelled",
  "ignored",
  "unknown"
] as const;

export type DebugLogResult = (typeof debugLogResults)[number];

export const debugLogEditorIdKinds = [
  "file",
  "untitled",
  "projectDocument",
  "glossaryEntry",
  "unknown"
] as const;

export type DebugLogEditorIdKind = (typeof debugLogEditorIdKinds)[number];

/** `CurrentDocument.kind`, for document-open timing events (#152). */
export const debugLogDocumentKinds = [
  "file",
  "project",
  "untitled",
  "unknown"
] as const;

export type DebugLogDocumentKind = (typeof debugLogDocumentKinds)[number];

/** `CurrentEditor.kind`, for document-open timing events (#152). */
export const debugLogEditorKinds = [
  "markdown",
  "glossaryEntry",
  "unknown"
] as const;

export type DebugLogEditorKind = (typeof debugLogEditorKinds)[number];

export const debugLogReasons = [
  "validation_failed",
  "context_stale",
  "not_found",
  "no_changes",
  "database_unavailable",
  "transaction_inactive",
  "invalid_command",
  "window_unavailable",
  "web_contents_destroyed",
  "native_delegation_unavailable",
  "focus_left_app_shell",
  "active_editor_changed",
  "project_context_changed",
  "unmount",
  "composition_restarted",
  "manual_clear",
  "unsupported_surface",
  "disabled_command",
  "readOnlyProject",
  "app_modal_open",
  "unsupported_editor",
  "glossary_not_dirty",
  "glossary_already_saving",
  "standalone_save_canceled",
  "no_save_target",
  "permissionDenied",
  "notFound",
  "invalidPath",
  "invalidEncoding",
  "locked",
  "unknown"
] as const;

export type DebugLogReason = (typeof debugLogReasons)[number];

export const debugLogApplicationMenuTriggers = [
  "menu",
  "accelerator",
  "unknown"
] as const;

export type DebugLogApplicationMenuTrigger =
  (typeof debugLogApplicationMenuTriggers)[number];

/**
 * Closed enum for command execution `source` details. Intentionally closed
 * (rather than a free-form string) so future UI or registry-boundary command
 * sources stay explicit.
 */
export const debugLogCommandExecutionSources = [
  "activityBar",
  "applicationMenu",
  "commandPalette",
  "contextMenu",
  "documentTabBar",
  "editorSurface",
  "toolbar",
  "utilityWindow",
  "workspaceSidebar",
  "unknown"
] as const;

export type DebugLogCommandExecutionSource =
  (typeof debugLogCommandExecutionSources)[number];

export const debugLogSaveTargetKinds = [
  "projectDocument",
  "standaloneMarkdown",
  "glossaryEntry",
  "unsupported",
  "unknown"
] as const;

export type DebugLogSaveTargetKind =
  (typeof debugLogSaveTargetKinds)[number];

export const debugLogPathKinds = [
  "projectFile",
  "appData",
  "logsDir",
  "unknown"
] as const;

export type DebugLogPathKind = (typeof debugLogPathKinds)[number];

export const debugLogExtensions = [
  ".md",
  ".markdown",
  ".txt",
  "none",
  "unknown"
] as const;

export type DebugLogExtension = (typeof debugLogExtensions)[number];

export const debugLogSizeBuckets = [
  "empty",
  "small",
  "medium",
  "large",
  "huge",
  "unknown"
] as const;

export type DebugLogSizeBucket = (typeof debugLogSizeBuckets)[number];

export const debugLogLineEndingKinds = [
  "lf",
  "crlf",
  "cr",
  "mixed",
  "none",
  "unknown"
] as const;

export type DebugLogLineEndingKind = (typeof debugLogLineEndingKinds)[number];

export const debugLogEncodingAssumptions = ["utf8", "unknown"] as const;

export type DebugLogEncodingAssumption =
  (typeof debugLogEncodingAssumptions)[number];

/**
 * Closed catalog for the Recovery Store's `Recovery.db` `PRAGMA
 * journal_mode` result (Phase 6-4-2). Only "wal" is a healthy value; any
 * other reported mode collapses to "other" so a stray value can never leak
 * a path or free-form string into the log.
 */
export const debugLogRecoveryJournalModes = ["wal", "other", "unknown"] as const;

export type DebugLogRecoveryJournalMode =
  (typeof debugLogRecoveryJournalModes)[number];

/**
 * Closed catalog for the Recovery Store's `Recovery.db` `PRAGMA
 * synchronous` result (Phase 6-4-2). "full" is the required value.
 */
export const debugLogRecoverySynchronousLevels = [
  "full",
  "other",
  "unknown"
] as const;

export type DebugLogRecoverySynchronousLevel =
  (typeof debugLogRecoverySynchronousLevels)[number];

/**
 * Closed enum for `layout.viewport.changed`'s optional `viewportChangeSource`
 * detail (#162). Deliberately its own key/catalog rather than reusing the
 * generic `source` detail (`DebugLogCommandExecutionSource`, used by command
 * execution events) — the two describe unrelated things, and sharing one key
 * would let either catalog silently accept the other's values.
 */
export const debugLogViewportChangeSources = [
  "windowResize",
  "paneResize",
  "unknown"
] as const;

export type DebugLogViewportChangeSource =
  (typeof debugLogViewportChangeSources)[number];

export type DebugLogErrorCategory =
  | "notFound"
  | "permissionDenied"
  | "io"
  | "database"
  | "validation"
  | "unknown";

export interface SanitizedErrorInfo {
  name?: string;
  code?: string;
  category: DebugLogErrorCategory;
}

export interface DebugLogDetails {
  appVersion?: string;
  platform?: DebugLogPlatform;
  arch?: DebugLogArch;
  locale?: string;
  electronVersion?: string;
  nodeVersion?: string;
  debugMode?: boolean;

  commandId?: string;
  editorIdKind?: DebugLogEditorIdKind;
  interactionId?: string;
  requestedSurface?: ContextMenuSurface;
  delegatedSurface?: ContextMenuSurface;
  hasSelection?: boolean;
  operation?: DebugLogOperation;
  dbOperationId?: string;
  dbOperation?: DebugLogDbOperation;
  dbEntityKind?: DebugLogDbEntityKind;
  result?: DebugLogResult;
  reason?: DebugLogReason;
  trigger?: DebugLogApplicationMenuTrigger;
  source?: DebugLogCommandExecutionSource;
  statusKey?: string;

  hasPendingSave?: boolean;
  hasScheduledSave?: boolean;
  isComposing?: boolean;
  isDirty?: boolean;
  canSave?: boolean;
  hasRelatedTarget?: boolean;
  nextTargetInsideAppShell?: boolean;
  documentHasFocus?: boolean;
  willClearPendingSave?: boolean;

  saveTargetKind?: DebugLogSaveTargetKind;

  projectRef?: string;
  documentRef?: string;

  pathKind?: DebugLogPathKind;
  extension?: DebugLogExtension;
  pathDepth?: number;
  sizeBucket?: DebugLogSizeBucket;
  lineCount?: number;
  lineEndingKind?: DebugLogLineEndingKind;
  encodingAssumption?: DebugLogEncodingAssumption;

  /** Per-open correlation id for document-open timing events (#152). Not a persistent id. */
  documentOpenId?: string;
  fileSizeBytes?: number;
  byteLength?: number;
  characterLength?: number;
  hadBom?: boolean;
  documentKind?: DebugLogDocumentKind;
  editorKind?: DebugLogEditorKind;

  durationMs?: number;
  count?: number;

  /** Direct children of the preview container right after DOM commit (#154). */
  previewNodeCount?: number;
  /** Text nodes GlossaryPreviewDecorator's TreeWalker visited (#154). */
  visitedTextNodeCount?: number;
  /** Visited text nodes that had at least one glossary match inserted (#154). */
  decoratedNodeCount?: number;
  /** Total glossary surface matches inserted across all decorated nodes (#154). */
  matchCount?: number;

  preSinkQueuedEventCount?: number;
  droppedEventCount?: number;
  droppedKeyCount?: number;
  rotated?: boolean;

  /**
   * Safe aggregate document/window/pane metrics attached to
   * `document.open.completed` only, never `document.open.usable` (#161).
   * See src/shared/documentMetrics.ts for `documentCharCount` /
   * `documentLineCount` / `documentMaxLineLength`'s exact definitions.
   * `appWindowWidth`/`appWindowHeight` are the renderer's content-area
   * viewport (`window.innerWidth`/`innerHeight`), not the OS window's outer
   * bounds or position. `editorPane*`/`previewPane*` are each pane element's
   * `clientWidth`/`clientHeight`. Width/height only — no x/y, no screen or
   * monitor identity.
   */
  documentCharCount?: number;
  documentLineCount?: number;
  documentMaxLineLength?: number;
  appWindowWidth?: number;
  appWindowHeight?: number;
  editorPaneWidth?: number;
  editorPaneHeight?: number;
  previewPaneWidth?: number;
  previewPaneHeight?: number;
  /** Best-effort trigger attribution for `layout.viewport.changed` (#162). */
  viewportChangeSource?: DebugLogViewportChangeSource;

  /**
   * Recovery Store (Phase 6-4-2). `instanceRunId` is the owning run's
   * process-run id (an opaque UUIDv7, safe to log). `schemaVersion` is the
   * `Recovery.db` `metadata.schema_version` observed at init / archive.
   * `journalMode` / `synchronous` are the read-back PRAGMA results on the
   * owner connection. No path, no `payload_text`, no manuscript text is
   * ever carried here.
   */
  instanceRunId?: string;
  schemaVersion?: number;
  journalMode?: DebugLogRecoveryJournalMode;
  synchronous?: DebugLogRecoverySynchronousLevel;

  /**
   * #293/#302: the owner recorded in a stale lock metadata file left by a
   * killed process. Diagnostics only — `ownerPid` is that dead process's OS
   * pid, `ownerAppVersion` its app version string, `ownerCreatedAt` its ISO
   * lock-acquire timestamp. No path, no manuscript text, no store name.
   */
  ownerPid?: number;
  ownerAppVersion?: string;
  ownerCreatedAt?: string;

  error?: SanitizedErrorInfo;
}

/**
 * #163 investigated why `document.open.*` events' `seq`/`timestamp` order
 * can disagree with the chronological order of what they measured (e.g.
 * `previewRender.started` — whose mark is captured earliest, during React
 * render — can log *after* `previewDom.committed`, whose mark is captured
 * later, during a child's layout effect that runs before the parent's
 * passive effect that reports `previewRender.started`). Conclusion below;
 * see the DebugLogEvent fields for what each one actually means.
 */
export interface DebugLogEvent {
  /**
   * Emit order: assigned in `DebugLogger.createEvent` (main process) each
   * time `log()`/`logRendererRequest()` is *called*, one per call, strictly
   * increasing. For renderer-originated events this is effectively IPC
   * receipt order (the `debugLog.logEvent` handler in debugLogIpc.ts is
   * synchronous, so it matches the order `logRendererDebugEvent` was called
   * in the renderer) — NOT the chronological order of the moment each event
   * describes. A React passive effect can call `logRendererDebugEvent` for
   * an earlier-captured `performance.now()` mark after a child's layout
   * effect has already logged a later-captured one (see #163). Do not infer
   * measurement-occurrence order from `seq` across different events.
   */
  seq: number;
  /**
   * Wall-clock time the main-process logger received/processed this event
   * (`formatLocalDebugLogTimestamp(this.now())` in `createEvent`) — i.e. the
   * same "emit order" boundary as `seq`, just as a clock reading rather than
   * a counter. Not the time the underlying measured moment occurred in the
   * renderer.
   */
  timestamp: string;
  level: DebugLogLevel;
  event: DebugLogEventName;
  sessionId: string;
  /**
   * Each event's own `durationMs` (where present) is the authoritative
   * value for "how long did this take" / "how far from what boundary" — its
   * meaning is documented per call site (e.g. App.tsx's
   * handleDocumentOpen* functions, GlossaryPreviewDecorator's layout
   * effect). Reconstructing the true chronological order across multiple
   * `document.open.*` events for one `documentOpenId` means reading each
   * event's own documented boundary and comparing `durationMs` values, not
   * comparing `seq`/`timestamp`.
   */
  details?: DebugLogDetails;
}

export interface SanitizedDebugLogEvent {
  seq: number;
  timestamp: string;
  level: DebugLogLevel;
  event: DebugLogEventName;
  details?: DebugLogDetails;
}

export interface DebugLogSnapshot {
  enabled: boolean;
  sessionId: string | null;
  events: SanitizedDebugLogEvent[];
  uiDroppedEventCount: number;
  uiBufferLimit: number;
}

export interface RendererDebugLogRequest {
  level: DebugLogLevel | string;
  event: DebugLogEventName | string;
  details?: Record<string, unknown>;
}

export const knownDebugLogCommandIds = [
  applicationCommandIds.openAbout,
  applicationCommandIds.createProject,
  applicationCommandIds.openProject,
  editorCommandIds.openMarkdownDocument,
  editorCommandIds.saveDocument,
  editorCommandIds.saveAs,
  editorCommandIds.close,
  applicationCommandIds.toggleRecentProjects,
  commandPaletteCommandIds.open,
  assistCommandIds.showLineEndingDistribution,
  assistCommandIds.insertParagraphIndent,
  assistCommandIds.removeParagraphIndent,
  ...editCommandIds,
  "workspace.files.toggle",
  "workspace.files.createMarkdownFile",
  "workspace.files.createFolder",
  "workspace.files.rename",
  "workspace.search.focus",
  "workspace.glossary.focus",
  "workspace.applicationSettings.open",
  "workbench.utilityWindow.open",
  "workbench.utilityWindow.close",
  "workbench.utilityWindow.toggle",
  "workbench.debugLog.open",
  "glossary.entry.open",
  "glossary.entry.create",
  "glossary.entry.occurrences.previous",
  "glossary.entry.occurrences.next",
  "glossary.occurrences.previous",
  "glossary.occurrences.next",
  "glossary.occurrences.entry.open",
  "glossary.occurrences.tracking.close"
] as const;

export const knownDebugLogStatusKeys = [
  "unknown",
  "app.ready",
  "status.commandFailed",
  "status.documentOpenFailed",
  "status.glossaryOccurrenceEntryNotFound",
  "status.glossaryOccurrenceNoActiveDocument",
  "status.glossaryOccurrenceNotFound",
  "status.openCanceled",
  "status.openedFile",
  "status.openedProject",
  "status.openedProjectDocument",
  "status.openedProjectDocumentOnly",
  "status.openProjectCanceled",
  "status.fileExplorerRenameSucceeded",
  "status.projectDocumentNotFound",
  "status.projectOpenFailed",
  "status.recentProjectOpenFailed",
  "status.saveAsTargetAlreadyOpen",
  "status.saveCanceled",
  "status.saveFailed",
  "status.savedPath",
  "status.settingsReloadFailed",
  "status.settingsSaveFailed",
  "status.settingsSaved",
  "status.soundPlaybackFailed",
  "status.withDetail"
] as const;

function includesValue<TValue extends string>(
  catalog: readonly TValue[],
  value: unknown
): value is TValue {
  return typeof value === "string" && catalog.includes(value as TValue);
}

export function isDebugLogLevel(value: unknown): value is DebugLogLevel {
  return includesValue(debugLogLevels, value);
}

export function isDebugLogEventName(value: unknown): value is DebugLogEventName {
  return includesValue(debugLogEventNames, value);
}

export function isDebugLogContextMenuSurface(
  value: unknown
): value is ContextMenuSurface {
  return includesValue(contextMenuSurfaces, value);
}
