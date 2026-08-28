/**
 * #272: main-process glue between the renderer's Session snapshots and the
 * durable `SessionStore`.
 *
 * Responsibilities:
 *   - accept `RendererSessionSnapshot` over IPC, enrich it with facts only
 *     the main process has (`instanceRunId`, the Project's real `projectId`,
 *     live Window state), and persist it
 *   - keep the last renderer snapshot so a pure Window move/resize (which the
 *     renderer never sees) can be re-persisted from `attachWindow` listeners
 *     without renderer involvement
 *   - handle "drop this Session from the restore set" (ordinary non-final
 *     window close) and stop further writes for that sessionId
 *
 * No cold-start restore, no launch routing — #272 is the write-out side.
 */

import { SESSION_CHANNELS } from "../shared/api";
import {
  isSessionId,
  parseRendererSessionSnapshot,
  sessionRecordFromSnapshot,
  type RendererSessionSnapshot,
  type SessionRecord
} from "../shared/session";
import {
  isSessionStorageFailure,
  sessionStorageFailureReason,
  type SessionStorageFailureReason
} from "../shared/sessionPersistenceFailure";
import type { SessionStore } from "./sessionStore";
import {
  captureWindowSessionState,
  type WindowSessionSource
} from "./windowSessionState";

/**
 * A Project-Context snapshot arrived but its Project identity
 * (`metadata.project_id`) could not be resolved, so nothing was written.
 * Surfaced to the IPC caller so the renderer coordinator does NOT treat the
 * snapshot as durable.
 */
export class UnresolvedProjectIdentityError extends Error {
  constructor(readonly sessionId: string) {
    super("Session not persisted: unresolved Project identity.");
    this.name = "UnresolvedProjectIdentityError";
  }
}

type IpcMainLike = {
  handle(
    channel: string,
    listener: (...args: unknown[]) => unknown
  ): void;
};

/** The `BrowserWindow` events that can change persisted Window state. */
const WINDOW_STATE_EVENTS = [
  "resize",
  "move",
  "maximize",
  "unmaximize",
  "enter-full-screen",
  "leave-full-screen",
  "restore"
] as const;

type WindowStateEvent = (typeof WINDOW_STATE_EVENTS)[number];

export interface SessionStoreControllerWindow extends WindowSessionSource {
  on(eventName: WindowStateEvent, listener: () => void): void;
  removeListener(eventName: WindowStateEvent, listener: () => void): void;
}

export interface SessionStoreControllerScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface CreateSessionStoreControllerOptions {
  readonly ipcMain: IpcMainLike;
  readonly sessionStore: SessionStore;
  readonly instanceRunId: string;
  readonly getMainWindow: () => SessionStoreControllerWindow | null;
  readonly getCurrentProjectId: () => string | null;
  readonly getCurrentProjectFilePath: () => string | null;
  readonly now?: () => Date;
  readonly scheduler?: SessionStoreControllerScheduler;
  /** Debounce for Window-event-driven re-persistence. */
  readonly windowChangeDebounceMs?: number;
  /** Report a persistence failure (best-effort; never throws to callers). */
  readonly onError?: (error: unknown) => void;
  /**
   * Called when a Project-Context snapshot could not be persisted because
   * its Project identity is unresolved (diagnostics only — no record is
   * written, and the value is NOT downgraded to a no-Project session).
   */
  readonly onUnresolvedProjectIdentity?: (sessionId: string) => void;
  /**
   * Called ONCE when a storage-class failure occurs on a write the renderer
   * was not awaiting (window-driven re-persist). The host forwards this to
   * the renderer so its coordinator moves to SUSPENDED. Main also stops its
   * own window-driven re-persist loop after this.
   */
  readonly onSessionStorageFailure?: (
    reason: SessionStorageFailureReason
  ) => void;
}

export interface SessionStoreController {
  registerIpc(): void;
  attachWindow(window: SessionStoreControllerWindow): void;
  detachWindow(): void;
  /** Test seam: the last snapshot received from the renderer. */
  peekLastSnapshot(): RendererSessionSnapshot | null;
}

const DEFAULT_WINDOW_CHANGE_DEBOUNCE_MS = 500;

const defaultScheduler: SessionStoreControllerScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createSessionStoreController(
  options: CreateSessionStoreControllerOptions
): SessionStoreController {
  const now = options.now ?? (() => new Date());
  const scheduler = options.scheduler ?? defaultScheduler;
  const windowChangeDebounceMs =
    options.windowChangeDebounceMs ?? DEFAULT_WINDOW_CHANGE_DEBOUNCE_MS;
  const reportError = options.onError ?? (() => undefined);

  let lastSnapshot: RendererSessionSnapshot | null = null;
  const stoppedSessionIds = new Set<string>();
  // Once a storage-class failure is seen, main stops its own window-driven
  // re-persist loop for the rest of the run (the renderer coordinator is
  // told to SUSPEND). Cleared only by a new process.
  let mainDrivenPersistSuspended = false;
  let storageFailureNotified = false;

  let attachedWindow: SessionStoreControllerWindow | null = null;
  let windowListeners: Array<{
    event: WindowStateEvent;
    listener: () => void;
  }> = [];
  let windowDebounceHandle: unknown = null;

  // Serialize all store writes so a window-driven re-persist can never
  // interleave with an IPC-driven one.
  let writeQueue: Promise<unknown> = Promise.resolve();

  /**
   * Chains `operation` after any in-flight store write. The returned promise
   * REJECTS if `operation` rejects, so an IPC caller (the renderer
   * coordinator) learns about a persist / membership-removal failure and can
   * retry or decline a window close. `writeQueue` itself is kept
   * always-resolved so one failure does not wedge the chain.
   */
  function enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  function resolveProjectId(snapshot: RendererSessionSnapshot): string | null {
    if (!snapshot.projectContext) {
      return null;
    }

    // Only attach the live projectId when it matches the locator the
    // renderer actually sent — never label a Session with an identity for a
    // different Project.
    return options.getCurrentProjectFilePath() ===
      snapshot.projectContext.projectFilePath
      ? options.getCurrentProjectId()
      : null;
  }

  /**
   * Build the durable record, or `null` when a Project-Context snapshot
   * cannot be given the Project's real `metadata.project_id`
   * (`sessionRecordFromSnapshot` enforces the identity/locator split — it
   * never invents an `"unknown-project"` identity and never downgrades to
   * `projectContext: null`).
   */
  function enrich(snapshot: RendererSessionSnapshot): SessionRecord | null {
    return sessionRecordFromSnapshot(snapshot, {
      instanceRunId: options.instanceRunId,
      projectId: resolveProjectId(snapshot),
      window: captureWindowSessionState(options.getMainWindow()),
      now: now()
    });
  }

  function noteStorageFailure(): void {
    // A storage-class failure means the Session store is unhealthy. Stop the
    // window-driven re-persist loop for the rest of the run.
    mainDrivenPersistSuspended = true;
  }

  function persistSnapshot(snapshot: RendererSessionSnapshot): Promise<void> {
    return enqueueWrite(async () => {
      // #272 (review Blocker 2): re-check at ACTUAL execution time, not only
      // at enqueue time. A persist can be queued behind an in-flight
      // `dropFromRestoreSet`; if that drop succeeds first, this Session has
      // left the restore set and re-persisting it here would silently
      // resurrect it. A FAILED drop does not populate `stoppedSessionIds`,
      // so a later persist still runs normally.
      if (stoppedSessionIds.has(snapshot.sessionId)) {
        return;
      }

      const record = enrich(snapshot);

      if (!record) {
        // Unresolved Project identity — nothing was written. This is NOT a
        // successful persist: rejecting keeps the renderer coordinator from
        // marking the snapshot durable. The renderer retains it as its
        // lastSnapshot and re-persists once the live projectId resolves.
        // Transient logical condition — NOT a storage failure.
        options.onUnresolvedProjectIdentity?.(snapshot.sessionId);
        throw new UnresolvedProjectIdentityError(snapshot.sessionId);
      }

      await options.sessionStore.persistSession(record);
    }).catch((error) => {
      if (isSessionStorageFailure(error)) {
        noteStorageFailure();
      }
      throw error;
    });
  }

  function handlePersistSession(rawSnapshot: unknown): Promise<void> {
    const snapshot = parseRendererSessionSnapshot(rawSnapshot);

    if (!snapshot || stoppedSessionIds.has(snapshot.sessionId)) {
      return Promise.resolve();
    }

    lastSnapshot = snapshot;

    return persistSnapshot(snapshot);
  }

  function handleDropSessionFromRestoreSet(rawRequest: unknown): Promise<void> {
    if (
      !isRecord(rawRequest) ||
      typeof rawRequest.sessionId !== "string" ||
      !isSessionId(rawRequest.sessionId)
    ) {
      return Promise.resolve();
    }

    const { sessionId } = rawRequest;

    // #272 (review Blocker 2): stop main-side persistence for this Session
    // ONLY once the manifest removal is actually durable. If it fails, the
    // renderer cancels the window close and keeps persisting, so main must
    // stay in sync — do NOT pre-emptively drop lastSnapshot / stop.
    return enqueueWrite(async () => {
      await options.sessionStore.removeSessionFromRestoreSet(sessionId);
      stoppedSessionIds.add(sessionId);
      if (lastSnapshot?.sessionId === sessionId) {
        lastSnapshot = null;
      }
    }).catch((error) => {
      // #272 (review follow-up 7): a storage-class failure on the drop means
      // the Session store is unhealthy just as much as a failed persist
      // does. Stop main's own window-driven re-persist loop too. The
      // explicit IPC rejection still propagates to the renderer, which
      // suspends via its awaited call — no redundant `storageFailure` event.
      // A transient logical failure (unresolved Project identity) never
      // reaches here for a drop, and would not suspend anyway.
      if (isSessionStorageFailure(error)) {
        noteStorageFailure();
      }
      throw error;
    });
  }

  function clearWindowDebounce(): void {
    if (windowDebounceHandle !== null) {
      scheduler.cancel(windowDebounceHandle);
      windowDebounceHandle = null;
    }
  }

  function handleWindowStateChange(): void {
    // Once storage is known-bad, do not keep nudging it (no I/O spam).
    if (mainDrivenPersistSuspended) {
      return;
    }

    clearWindowDebounce();
    windowDebounceHandle = scheduler.schedule(() => {
      windowDebounceHandle = null;

      const snapshot = lastSnapshot;

      if (
        !snapshot ||
        stoppedSessionIds.has(snapshot.sessionId) ||
        mainDrivenPersistSuspended
      ) {
        return;
      }

      // Fire-and-forget by design (a window nudge is not correctness-
      // critical). The renderer is NOT awaiting this write, so:
      //   - transient (unresolved Project identity): ignore, retried later
      //   - storage-class failure: notify the renderer ONCE so its
      //     coordinator SUSPENDS, and stop nudging
      //   - anything else: surface to `onError`
      void persistSnapshot(snapshot).catch((error) => {
        if (error instanceof UnresolvedProjectIdentityError) {
          return;
        }

        if (isSessionStorageFailure(error)) {
          if (!storageFailureNotified) {
            storageFailureNotified = true;
            options.onSessionStorageFailure?.(
              sessionStorageFailureReason(error)
            );
          }
          return;
        }

        reportError(error);
      });
    }, windowChangeDebounceMs);
  }

  function detachWindow(): void {
    clearWindowDebounce();

    if (attachedWindow) {
      for (const { event, listener } of windowListeners) {
        attachedWindow.removeListener(event, listener);
      }
    }

    windowListeners = [];
    attachedWindow = null;
  }

  return {
    registerIpc() {
      options.ipcMain.handle(
        SESSION_CHANNELS.persistSession,
        (_event: unknown, rawSnapshot: unknown) =>
          handlePersistSession(rawSnapshot)
      );
      options.ipcMain.handle(
        SESSION_CHANNELS.dropSessionFromRestoreSet,
        (_event: unknown, rawRequest: unknown) =>
          handleDropSessionFromRestoreSet(rawRequest)
      );
    },
    attachWindow(window) {
      detachWindow();
      attachedWindow = window;
      windowListeners = WINDOW_STATE_EVENTS.map((event) => {
        const listener = () => handleWindowStateChange();
        window.on(event, listener);

        return { event, listener };
      });
    },
    detachWindow,
    peekLastSnapshot: () => lastSnapshot
  };
}
