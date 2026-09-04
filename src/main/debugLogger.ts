import crypto from "node:crypto";
import path from "node:path";
import {
  DEFAULT_DEBUG_LOG_UI_BUFFER_LIMIT,
  isDebugLogEventName,
  isDebugLogLevel,
  type DebugLogSnapshot,
  type DebugLogDetails,
  type DebugLogEvent,
  type DebugLogEventName,
  type DebugLogLevel,
  type RendererDebugLogRequest,
  type SanitizedDebugLogEvent
} from "../shared/debugLog";
import { DebugLogOpaqueRefRegistry } from "./debugLogOpaqueRefs";
import { formatLocalDebugLogTimestamp } from "./debugLogPath";
import {
  sanitizeDebugLogDetails,
  type DebugLogRuntimeDetails
} from "./debugLogSanitizer";
import {
  DEFAULT_DEBUG_LOG_MAX_LINES,
  DEFAULT_DEBUG_LOG_PRE_SINK_QUEUE_LIMIT,
  JsonlDebugLogSink,
  type DebugLogFileSystem
} from "./jsonlDebugLogSink";

export interface DebugLogAppLike {
  getPath(name: "logs" | "userData"): string;
  getVersion(): string;
  getLocale(): string;
  isPackaged?: boolean;
}

export interface DebugLogger {
  readonly enabled: boolean;
  readonly sessionId: string | null;
  readonly currentFilePath: string | null;
  getSnapshot(): DebugLogSnapshot;
  subscribe(callback: DebugLogEventSubscriber): () => void;
  log(input: {
    level: DebugLogLevel | string;
    event: DebugLogEventName | string;
    details?: Record<string, unknown>;
  }): void;
  logRendererRequest(request: unknown): void;
  openFileSink(logsDir: string | null): void;
  flushAndClose(): void;
  projectRefForKey(key: string): string;
  documentRefForKey(key: string): string;
  isKnownProjectRef(projectRef: string): boolean;
  isKnownDocumentRef(documentRef: string): boolean;
}

export type DebugLogEventSubscriber = (event: SanitizedDebugLogEvent) => void;

export interface CreateDebugLoggerOptions {
  enabled: boolean;
  runtime: DebugLogRuntimeDetails;
  sessionId?: string;
  maxLines?: number;
  preSinkQueueLimit?: number;
  uiBufferLimit?: number;
  fileSystem?: DebugLogFileSystem;
  now?: () => Date;
  isDevelopmentBuild?: boolean;
  warn?: (message: string) => void;
}

const eventLevelCatalog: Record<DebugLogEventName, DebugLogLevel> = {
  "app.start": "info",
  "log.file.opened": "info",
  "log.file.write.failed": "error",
  "project.open.succeeded": "info",
  "project.open.failed": "error",
  "project.writeLock.reclamation.refused": "debug",
  "project.writeLock.stale.detected": "debug",
  "project.writeLock.stale.archived": "info",
  "project.writeLock.stale.archive.failed": "error",
  "project.writeLock.reacquire.succeeded": "info",
  "project.writeLock.reacquire.failed": "error",
  "application_menu.command.sent": "debug",
  "application_menu.command.received": "debug",
  "command.invoked": "debug",
  "command.ignored": "debug",
  "command.blocked": "debug",
  "command.failed": "error",
  "document.open.started": "debug",
  "document.open.fileRead.completed": "debug",
  "document.open.editorDocument.applied": "debug",
  "document.open.previewRender.started": "debug",
  "document.open.previewRender.completed": "debug",
  "document.open.previewDom.committed": "debug",
  "document.open.previewDecoration.completed": "debug",
  "document.open.previewFrame.observed": "debug",
  "document.open.usable": "debug",
  "document.open.completed": "debug",
  "document.open.failed": "error",
  "document.save.failed": "error",
  "layout.viewport.changed": "debug",
  "ime.composition.started": "debug",
  "ime.composition.ended": "debug",
  "ime.command.passed_through": "debug",
  "ime.command.ignored": "debug",
  "ime.save.pending.created": "debug",
  "ime.save.pending.scheduled": "debug",
  "ime.save.pending.executed": "debug",
  "ime.save.pending.cleared": "debug",
  "ime.focus.checked": "debug",
  "contextMenu.requested": "debug",
  "contextMenu.opened": "debug",
  "contextMenu.suppressed": "debug",
  "contextMenu.command.selected": "debug",
  "edit.command.requested": "debug",
  "edit.command.delegated": "debug",
  "edit.command.ignored": "debug",
  "edit.command.failed": "error",
  "db.operation.started": "debug",
  "db.operation.succeeded": "debug",
  "db.operation.failed": "error",
  "db.operation.skipped": "debug",
  "save.requested": "debug",
  "save.in_flight.ignored": "debug",
  "save.started": "debug",
  "save.skipped": "debug",
  "save.succeeded": "debug",
  "save.failed": "error",
  "glossary.occurrences.scan.failed": "error",
  "search.started": "debug",
  "search.completed": "debug",
  "search.staleDiscarded": "debug",
  "search.cancelled": "debug",
  "search.failed": "error",
  "recovery.store.init.started": "debug",
  "recovery.store.init.succeeded": "info",
  "recovery.store.init.skipped": "debug",
  "recovery.store.init.failed": "error",
  "recovery.store.schema.archived": "info",
  "recovery.store.lock.released": "debug",
  "recovery.store.lock.reclamation.refused": "debug",
  "recovery.store.lock.stale.detected": "debug",
  "recovery.store.lock.stale.archived": "info",
  "recovery.store.lock.stale.archive.failed": "error",
  "recovery.store.lock.reacquire.succeeded": "info",
  "recovery.store.lock.reacquire.failed": "error",
  "recovery.document.persisted": "debug",
  "recovery.document.persist.failed": "error",
  "recovery.document.deleted": "debug",
  "recovery.document.delete.failed": "error",
  "recovery.document.rekeyed": "debug",
  "recovery.document.rekey.collision": "info",
  "recovery.document.rekey.failed": "error",
  "recovery.candidates.dialog.shown": "debug",
  "recovery.candidates.listed": "debug",
  "recovery.document.restored": "info",
  "recovery.document.restore.failed": "error",
  "recovery.document.discarded": "info",
  "recovery.document.discard.failed": "error",
  "recovery.report.copied": "debug",
  "app.uncaughtException": "error",
  "app.unhandledRejection": "error"
};

function platformForProcess(value: NodeJS.Platform): DebugLogRuntimeDetails["platform"] {
  switch (value) {
    case "win32":
    case "darwin":
    case "linux":
      return value;
    default:
      return "unknown";
  }
}

function archForProcess(value: NodeJS.Architecture): DebugLogRuntimeDetails["arch"] {
  switch (value) {
    case "x64":
    case "arm64":
    case "ia32":
      return value;
    default:
      return "unknown";
  }
}

function isRendererDebugLogRequest(
  value: unknown
): value is RendererDebugLogRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createDebugLogRuntimeDetails(
  app: DebugLogAppLike,
  debugMode: boolean
): DebugLogRuntimeDetails {
  return {
    appVersion: app.getVersion(),
    platform: platformForProcess(process.platform),
    arch: archForProcess(process.arch),
    locale: app.getLocale(),
    electronVersion: process.versions.electron ?? "unknown",
    nodeVersion: process.versions.node,
    debugMode
  };
}

export function resolveDebugLogsDirectory(app: DebugLogAppLike): string | null {
  try {
    return app.getPath("logs");
  } catch {
    try {
      return path.join(app.getPath("userData"), "logs");
    } catch {
      return null;
    }
  }
}

class DisabledDebugLogger implements DebugLogger {
  readonly enabled = false;
  readonly sessionId = null;
  readonly currentFilePath = null;

  getSnapshot(): DebugLogSnapshot {
    return {
      enabled: false,
      sessionId: null,
      events: [],
      uiDroppedEventCount: 0,
      uiBufferLimit: DEFAULT_DEBUG_LOG_UI_BUFFER_LIMIT
    };
  }

  subscribe(): () => void {
    return () => undefined;
  }

  log(): void {
    return;
  }

  logRendererRequest(): void {
    return;
  }

  openFileSink(): void {
    return;
  }

  flushAndClose(): void {
    return;
  }

  projectRefForKey(): string {
    return "project:session:000";
  }

  documentRefForKey(): string {
    return "document:session:000";
  }

  isKnownProjectRef(): boolean {
    return false;
  }

  isKnownDocumentRef(): boolean {
    return false;
  }
}

class FileDebugLogger implements DebugLogger {
  readonly enabled = true;
  readonly sessionId: string;
  private readonly opaqueRefs = new DebugLogOpaqueRefRegistry();
  private readonly preSinkQueueLimit: number;
  private readonly uiBufferLimit: number;
  private readonly now: () => Date;
  private readonly maxLines: number;
  private readonly fileSystem: DebugLogFileSystem | undefined;
  private readonly isDevelopmentBuild: boolean | undefined;
  private readonly warn: ((message: string) => void) | undefined;
  private sink: JsonlDebugLogSink | null = null;
  private sinkUnavailable = false;
  private seq = 0;
  private preSinkQueue: DebugLogEvent[] = [];
  private preSinkDroppedEventCount = 0;
  private uiBuffer: SanitizedDebugLogEvent[] = [];
  private uiDroppedEventCount = 0;
  private subscribers = new Set<DebugLogEventSubscriber>();
  private writeFailureEventAccepted = false;

  constructor(private readonly options: CreateDebugLoggerOptions) {
    this.sessionId = options.sessionId ?? crypto.randomUUID();
    this.preSinkQueueLimit = Math.max(
      1,
      options.preSinkQueueLimit ?? DEFAULT_DEBUG_LOG_PRE_SINK_QUEUE_LIMIT
    );
    this.uiBufferLimit = Math.max(
      1,
      options.uiBufferLimit ?? DEFAULT_DEBUG_LOG_UI_BUFFER_LIMIT
    );
    this.now = options.now ?? (() => new Date());
    this.maxLines = Math.max(
      1,
      options.maxLines ?? DEFAULT_DEBUG_LOG_MAX_LINES
    );
    this.fileSystem = options.fileSystem;
    this.isDevelopmentBuild = options.isDevelopmentBuild;
    this.warn = options.warn;
  }

  get currentFilePath(): string | null {
    return this.sink?.currentFilePath ?? null;
  }

  getSnapshot(): DebugLogSnapshot {
    return {
      enabled: true,
      sessionId: this.sessionId,
      events: [...this.uiBuffer],
      uiDroppedEventCount: this.uiDroppedEventCount,
      uiBufferLimit: this.uiBufferLimit
    };
  }

  subscribe(callback: DebugLogEventSubscriber): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  log(input: {
    level: DebugLogLevel | string;
    event: DebugLogEventName | string;
    details?: Record<string, unknown>;
  }): void {
    if (!isDebugLogLevel(input.level) || !isDebugLogEventName(input.event)) {
      return;
    }

    this.rotateOpenSinkIfNeeded();

    const event = this.createEvent(input.event, input.details);

    this.acceptEvent(event);
  }

  logRendererRequest(request: unknown): void {
    if (!isRendererDebugLogRequest(request)) {
      return;
    }

    this.log({
      level: request.level,
      event: request.event,
      details: request.details
    });
  }

  openFileSink(logsDir: string | null): void {
    if (this.sink || this.sinkUnavailable) {
      return;
    }

    if (logsDir === null) {
      this.preSinkQueue = [];
      this.preSinkDroppedEventCount = 0;
      this.sinkUnavailable = true;
      return;
    }

    const sink = new JsonlDebugLogSink({
      logsDir,
      sessionId: this.sessionId,
      maxLines: this.maxLines,
      fileSystem: this.fileSystem,
      isDevelopmentBuild: this.isDevelopmentBuild,
      warn: this.warn
    });

    if (!sink.open(this.now())) {
      this.preSinkQueue = [];
      this.preSinkDroppedEventCount = 0;
      this.sink = sink;
      return;
    }

    this.sink = sink;
    const queuedEvents = this.preSinkQueue;
    const droppedEventCount = this.preSinkDroppedEventCount;
    this.preSinkQueue = [];
    this.preSinkDroppedEventCount = 0;

    for (const queuedEvent of queuedEvents) {
      this.writeEventToOpenSink(queuedEvent);
    }

    const openedEvent = this.createEvent("log.file.opened", {
      preSinkQueuedEventCount: queuedEvents.length,
      droppedEventCount,
      rotated: false
    });

    this.acceptEvent(openedEvent);
  }

  flushAndClose(): void {
    this.sink?.close();
  }

  projectRefForKey(key: string): string {
    return this.opaqueRefs.projectRefForKey(key);
  }

  documentRefForKey(key: string): string {
    return this.opaqueRefs.documentRefForKey(key);
  }

  isKnownProjectRef(projectRef: string): boolean {
    return this.opaqueRefs.isKnownProjectRef(projectRef);
  }

  isKnownDocumentRef(documentRef: string): boolean {
    return this.opaqueRefs.isKnownDocumentRef(documentRef);
  }

  private createEvent(
    eventName: DebugLogEventName,
    details: Record<string, unknown> | undefined
  ): DebugLogEvent {
    const sanitizedDetails = sanitizeDebugLogDetails(details, {
      runtime: this.options.runtime,
      isKnownProjectRef: (projectRef) => this.isKnownProjectRef(projectRef),
      isKnownDocumentRef: (documentRef) => this.isKnownDocumentRef(documentRef)
    });

    return {
      seq: this.nextSeq(),
      timestamp: formatLocalDebugLogTimestamp(this.now()),
      level: eventLevelCatalog[eventName],
      event: eventName,
      sessionId: this.sessionId,
      ...(sanitizedDetails ? { details: sanitizedDetails } : {})
    };
  }

  private nextSeq(): number {
    this.seq += 1;
    return this.seq;
  }

  private acceptEvent(event: DebugLogEvent): void {
    this.addEventToUiBuffer(event);
    this.notifySubscribers(event);
    this.writeEvent(event);
  }

  private sanitizedEventForRenderer(
    event: DebugLogEvent
  ): SanitizedDebugLogEvent {
    return {
      seq: event.seq,
      timestamp: event.timestamp,
      level: event.level,
      event: event.event,
      ...(event.details ? { details: event.details } : {})
    };
  }

  private addEventToUiBuffer(event: DebugLogEvent): void {
    const sanitizedEvent = this.sanitizedEventForRenderer(event);

    if (this.uiBuffer.length >= this.uiBufferLimit) {
      this.uiBuffer.shift();
      this.uiDroppedEventCount += 1;
    }

    this.uiBuffer.push(sanitizedEvent);
  }

  private notifySubscribers(event: DebugLogEvent): void {
    const sanitizedEvent = this.sanitizedEventForRenderer(event);

    for (const subscriber of this.subscribers) {
      try {
        subscriber(sanitizedEvent);
      } catch {
        // Debug UI subscribers must not affect logging or app behavior.
      }
    }
  }

  private writeEvent(event: DebugLogEvent): void {
    // Seq is assigned when an event is accepted, before sink state checks.
    // A degraded sink can therefore leave gaps in the JSONL file by design.
    if (this.sinkUnavailable) {
      return;
    }

    if (!this.sink) {
      this.enqueuePreSinkEvent(event);
      return;
    }

    this.writeEventToOpenSink(event);
  }

  private enqueuePreSinkEvent(event: DebugLogEvent): void {
    if (this.preSinkQueue.length >= this.preSinkQueueLimit) {
      this.preSinkQueue.shift();
      this.preSinkDroppedEventCount += 1;
    }

    this.preSinkQueue.push(event);
  }

  private writeEventToOpenSink(event: DebugLogEvent): void {
    const sink = this.sink;

    if (!sink || sink.isDegraded) {
      return;
    }

    if (sink.shouldRotate()) {
      this.rotateSink();
    }

    if (!this.sink || this.sink.isDegraded) {
      return;
    }

    const didWrite = this.sink.writeLine(JSON.stringify(event));

    if (!didWrite) {
      this.recordFileWriteFailedForUi();
    }
  }

  private rotateOpenSinkIfNeeded(): void {
    if (this.sink?.shouldRotate()) {
      this.rotateSink();
    }
  }

  private rotateSink(): void {
    if (!this.sink) {
      return;
    }

    this.sink.close();

    if (!this.sink.open(this.now())) {
      return;
    }

    const openedEvent = this.createEvent("log.file.opened", {
      rotated: true
    });

    this.acceptEvent(openedEvent);
  }

  private recordFileWriteFailedForUi(): void {
    if (this.writeFailureEventAccepted) {
      return;
    }

    this.writeFailureEventAccepted = true;
    const event = this.createEvent("log.file.write.failed", {
      error: { category: "io" }
    });

    this.addEventToUiBuffer(event);
    this.notifySubscribers(event);
  }
}

const disabledDebugLogger = new DisabledDebugLogger();
let currentDebugLogger: DebugLogger = disabledDebugLogger;

export function createDebugLogger(
  options: CreateDebugLoggerOptions
): DebugLogger {
  return options.enabled ? new FileDebugLogger(options) : disabledDebugLogger;
}

export function setDebugLogger(logger: DebugLogger): void {
  currentDebugLogger = logger;
}

export function getDebugLogger(): DebugLogger {
  return currentDebugLogger;
}
