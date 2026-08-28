/**
 * #272: continuous Session persistence coordinator (renderer side).
 *
 * Owns the debounce / coalescing policy and the "last captured Editor View
 * State per editor" cache. It does NOT serialize to JSON, hash, or touch
 * disk — that is the main process's job, reached through an injected
 * `transport`. It also does NOT itself read `App` state; `App.tsx` feeds it
 * already-derived inputs through a thin seam.
 *
 * Per-keystroke cost is intentionally just "reset a timer": SHA-256 /
 * Editor View State capture happens at most once per flush (≤ every
 * `debounceMs`, and guaranteed at least once per `maxDeferMs` of
 * continuous activity), never on the editor input critical path.
 *
 * Everything time-related is injectable so tests drive it deterministically.
 */

import type { EditorViewState } from "../editorViewState";
import {
  buildRendererSessionSnapshot,
  referencedViewStateKeys,
  type SessionSnapshotInputs
} from "./sessionSnapshot";
import type { RendererSessionSnapshot } from "../../shared/session";
import {
  isSessionStorageFailure,
  sessionStorageFailureReason,
  SessionStorageFailureError,
  type SessionStorageFailureReason
} from "../../shared/sessionPersistenceFailure";

/**
 * A Session write that has not completed within this long is treated as a
 * hung storage operation: the coordinator SUSPENDS rather than waiting
 * forever or stacking more writes. Deliberately far above a normal (even
 * slow-HDD / USB) Session write so a healthy drive is never misjudged.
 */
export const SESSION_PERSISTENCE_SLOW_IO_THRESHOLD_MS = 8_000;

export type SessionPersistenceState = "active" | "suspended";

const SLOW_IO_SENTINEL = Symbol("session-persistence-slow-io");

export interface SessionPersistenceTransport {
  persist(snapshot: RendererSessionSnapshot): void | Promise<void>;
  dropFromRestoreSet(sessionId: string): void | Promise<void>;
}

export interface SessionPersistenceScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

/**
 * Pulled once per flush. Returns the active Markdown editor's cache key and
 * its freshly captured Editor View State (#273), or `null` when there is no
 * active Markdown editor. This is the only place capture / hashing runs.
 */
export type CaptureActiveEditorViewState = () => {
  readonly key: string;
  readonly viewState: EditorViewState | null;
} | null;

export interface SessionPersistenceCoordinatorOptions {
  readonly sessionId: string;
  readonly transport: SessionPersistenceTransport;
  readonly captureActiveEditorViewState: CaptureActiveEditorViewState;
  readonly scheduler?: SessionPersistenceScheduler;
  readonly now?: () => number;
  /** Quiet period after the last change before a flush. */
  readonly debounceMs?: number;
  /** Coalescing ceiling: a flush happens within this long of the first
   *  pending change even under continuous activity. */
  readonly maxDeferMs?: number;
  /** Override the hung-write threshold (see the constant). */
  readonly slowIoThresholdMs?: number;
  /**
   * Called exactly ONCE, on the ACTIVE → SUSPENDED transition (a
   * storage-class Session persistence failure). The host shows a single
   * Error notification and stops expecting continuous persistence for the
   * rest of the run. Never called for transient logical conditions.
   */
  readonly onSuspended?: (reason: SessionStorageFailureReason) => void;
  /**
   * #274: when true, the coordinator holds ALL automatic persistence
   * (continuous flushes, view-state-dirty nudges) until
   * `resolveColdStartRestore()` is called. Cold-start Session restore uses
   * this so the very first durable write already carries the adopted
   * `sessionId` and the restored editors — never a throwaway snapshot under
   * a freshly-minted sessionId that would grow the restore set.
   */
  readonly deferInitialFlush?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_MAX_DEFER_MS = 2_000;

const defaultScheduler: SessionPersistenceScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export class SessionPersistenceCoordinator {
  private sessionId: string;
  private readonly transport: SessionPersistenceTransport;
  private readonly captureActiveEditorViewState: CaptureActiveEditorViewState;
  private readonly scheduler: SessionPersistenceScheduler;
  private readonly now: () => number;
  private readonly debounceMs: number;
  private readonly maxDeferMs: number;
  private readonly slowIoThresholdMs: number;
  private readonly onSuspended?: (reason: SessionStorageFailureReason) => void;

  private readonly viewStateCache = new Map<string, EditorViewState>();
  private inputs: SessionSnapshotInputs | null = null;
  private timerHandle: unknown = null;
  private firstPendingChangeAt: number | null = null;
  private lastPersistedSerialization: string | null = null;
  private stopped = false;
  /** ACTIVE → SUSPENDED is one-way for this coordinator instance. A new
   *  coordinator (next app run) starts ACTIVE again. */
  private suspended = false;
  private flushInFlight: Promise<void> = Promise.resolve();
  /** A `transport.persist` that outran the slow-I/O threshold and may still
   *  be running. We never issue a new automatic write while this is set. */
  private slowInFlightPersist: Promise<void> | null = null;
  /** #274: while true, automatic persistence is held until cold-start
   *  Session restore resolves (`resolveColdStartRestore`). */
  private coldStartDeferred: boolean;
  /** #274: once any snapshot has been persisted, `adoptSessionId` is
   *  refused — a later id change would orphan the record already written. */
  private hasPersisted = false;

  constructor(options: SessionPersistenceCoordinatorOptions) {
    this.sessionId = options.sessionId;
    this.transport = options.transport;
    this.captureActiveEditorViewState = options.captureActiveEditorViewState;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => Date.now());
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxDeferMs = options.maxDeferMs ?? DEFAULT_MAX_DEFER_MS;
    this.slowIoThresholdMs =
      options.slowIoThresholdMs ?? SESSION_PERSISTENCE_SLOW_IO_THRESHOLD_MS;
    this.onSuspended = options.onSuspended;
    this.coldStartDeferred = options.deferInitialFlush ?? false;
  }

  getState(): SessionPersistenceState {
    return this.suspended ? "suspended" : "active";
  }

  /**
   * #274: adopt the restored Session's identity BEFORE any snapshot has been
   * persisted, so continuous persistence overwrites that same
   * `data/<sessionId>.json` rather than creating a second restore-set entry
   * under a throwaway id. No-op once a write has happened or once cold start
   * has resolved.
   */
  adoptSessionId(sessionId: string): void {
    if (this.stopped || this.hasPersisted || !this.coldStartDeferred) {
      return;
    }

    this.sessionId = sessionId;
  }

  /**
   * #274: cold-start Session restore has finished (or was skipped). Release
   * the held automatic persistence.
   *
   * `scheduleNow` — when a Session was actually restored, the host's
   * `setState` (adopted sessionId + restored editors) will re-run
   * `updateSessionInputs`, which now schedules the flush with the CORRECT
   * inputs; scheduling here would race a stale pre-adopt snapshot. When
   * nothing was restored, pass `scheduleNow: true` so the current (fresh /
   * launch-target) state is still persisted.
   */
  resolveColdStartRestore(options: { scheduleNow?: boolean } = {}): void {
    if (!this.coldStartDeferred) {
      return;
    }

    this.coldStartDeferred = false;

    if (
      options.scheduleNow === true &&
      !this.stopped &&
      !this.suspended &&
      this.inputs
    ) {
      this.scheduleFlush();
    }
  }

  /**
   * Move to SUSPENDED because Session persistence cannot proceed safely
   * (e.g. the main process reported a storage failure for a write the
   * renderer was not awaiting). Idempotent; fires `onSuspended` once.
   */
  suspendFromStorageFailure(reason: SessionStorageFailureReason): void {
    this.suspend(reason);
  }

  private suspend(reason: SessionStorageFailureReason): void {
    if (this.suspended) {
      return;
    }

    this.suspended = true;
    this.clearTimer();

    try {
      this.onSuspended?.(reason);
    } catch {
      // A failing notification callback must not wedge the coordinator.
    }
  }

  /**
   * Feed the latest derived (view-state-free) session inputs. Cheap; call
   * on every relevant render. Schedules a coalesced flush.
   *
   * A SUSPENDED coordinator ignores this entirely — ordinary continuous
   * persistence is stopped for the rest of the run, so no per-keystroke
   * retry storm and no repeated failures.
   */
  updateSessionInputs(inputs: SessionSnapshotInputs): void {
    if (this.stopped || this.suspended) {
      return;
    }

    this.inputs = inputs;
    this.pruneViewStateCache(inputs);

    // #274: while cold-start restore is in flight the inputs are retained
    // but no flush is scheduled — `resolveColdStartRestore()` releases it.
    if (this.coldStartDeferred) {
      return;
    }

    this.scheduleFlush();
  }

  /**
   * Record the View State of an editor that is *about to stop being the
   * active one* (tab switch / active-editor change / close), captured by the
   * caller at that low-frequency lifecycle boundary — NOT per keystroke.
   *
   * Without this, an edit made to editor A followed by a switch to editor B
   * before the debounce fires would let the flush only ever capture B, and
   * A's latest caret / selection / scroll / digest would never be cached.
   *
   * The cache is not pruned here (the open-editor set may not have been
   * reported yet); a coalesced flush is scheduled so the captured state
   * becomes durable.
   */
  recordEditorViewState(
    key: string,
    viewState: EditorViewState | null
  ): void {
    if (this.stopped || this.suspended) {
      return;
    }

    if (viewState === null) {
      this.viewStateCache.delete(key);
    } else {
      this.viewStateCache.set(key, viewState);
    }

    if (this.coldStartDeferred) {
      return;
    }

    this.scheduleFlush();
  }

  /**
   * Cheap "the active editor's #273 View State changed" signal — caret /
   * selection / scroll moved without a document edit. It ONLY schedules a
   * coalesced flush; it does NOT capture, hash, or serialize anything. The
   * actual `captureActiveEditorViewState()` (SHA-256 included) still happens
   * once per flush.
   *
   * Fire it freely per selection / scroll event; the debounce + maxDefer
   * ceiling coalesce a burst into a single flush. A SUSPENDED coordinator
   * ignores it (no I/O).
   */
  markViewStateDirty(): void {
    if (this.stopped || this.suspended || this.coldStartDeferred) {
      return;
    }

    this.scheduleFlush();
  }

  /**
   * Immediately persist a caller-provided snapshot as a **durable commit
   * boundary** — used for explicit restore-set mutations (e.g. the
   * post-Close Project state) that must NOT be left to the debounce or to a
   * later React effect catching up.
   *
   * Unlike the debounced flush, a persist failure here is NOT swallowed:
   * the returned promise REJECTS, so the caller can abort the operation
   * whose durability depended on this write (e.g. leave the Project open
   * because its post-close Session state could not be made durable).
   *
   * Cancels any pending debounced flush so a stale pre-mutation snapshot is
   * never written after this. If the resulting snapshot already equals what
   * is durable, it resolves without a redundant write.
   *
   * An explicit durable commit boundary — it runs even when the coordinator
   * is SUSPENDED (SUSPENDED only stops *automatic* continuous persistence).
   * A storage-class failure here still SUSPENDS and still REJECTS, so the
   * caller (e.g. explicit Project Close) declines rather than pretending
   * durability was achieved.
   */
  commitNow(inputs: SessionSnapshotInputs): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }

    this.inputs = inputs;
    this.pruneViewStateCache(inputs);
    this.clearTimer();
    this.firstPendingChangeAt = null;

    const committed = this.flushInFlight
      .catch(() => undefined)
      .then(() => this.persistCurrentInputs({ mode: "durableCommit" }));

    // Keep the internal chain progressing without letting a commitNow
    // rejection wedge future flushes.
    this.flushInFlight = committed.then(
      () => undefined,
      () => undefined
    );

    return committed;
  }

  /**
   * Force any pending change to be flushed now (best-effort optimization for
   * approved quit / final window close). Never required for correctness —
   * continuous persistence already keeps the durable snapshot current.
   */
  flushNow(): Promise<void> {
    if (this.stopped || this.suspended || this.coldStartDeferred) {
      // Best-effort only; nothing to flush when SUSPENDED or while cold-start
      // restore is still holding automatic persistence.
      return this.flushInFlight;
    }

    this.clearTimer();

    return this.runFlush();
  }

  /**
   * Remove this Session from the future restore set (ordinary non-final
   * window close). Stops all further persistence for this coordinator and
   * resolves only once the transport reports the membership was actually
   * dropped; rejects if it could not be. The caller uses that to decide
   * whether the window close may proceed (a close that "succeeds" while the
   * Session is still in the restore set would revive it next launch).
   */
  dropFromRestoreSet(): Promise<void> {
    if (this.stopped) {
      return Promise.resolve();
    }

    this.clearTimer();

    return Promise.resolve(
      this.transport.dropFromRestoreSet(this.sessionId)
    ).then(
      () => {
        // Only stop once the removal is actually durable.
        this.stopped = true;
      },
      (error) => {
        // A storage-class failure here also SUSPENDS automatic persistence
        // (the store is unhealthy). The rejection still propagates so the
        // caller declines the window close.
        if (isSessionStorageFailure(error)) {
          this.suspend(sessionStorageFailureReason(error));
        }
        throw error;
      }
    );
  }

  dispose(): void {
    this.stopped = true;
    this.clearTimer();
  }

  private pruneViewStateCache(inputs: SessionSnapshotInputs): void {
    const referenced = referencedViewStateKeys(inputs);

    for (const key of [...this.viewStateCache.keys()]) {
      if (!referenced.has(key)) {
        this.viewStateCache.delete(key);
      }
    }
  }

  private scheduleFlush(): void {
    const nowMs = this.now();

    if (this.firstPendingChangeAt === null) {
      this.firstPendingChangeAt = nowMs;
    }

    const deferredSoFar = nowMs - this.firstPendingChangeAt;
    const remainingCeiling = Math.max(0, this.maxDeferMs - deferredSoFar);
    const delay = Math.min(this.debounceMs, remainingCeiling);

    this.clearTimer();
    this.timerHandle = this.scheduler.schedule(() => {
      this.timerHandle = null;
      void this.runFlush();
    }, delay);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.scheduler.cancel(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private runFlush(): Promise<void> {
    this.flushInFlight = this.flushInFlight
      .catch(() => undefined)
      .then(() => this.persistCurrentInputs({ mode: "ordinary" }));

    return this.flushInFlight;
  }

  /**
   * Capture the active editor's View State (the one place SHA-256 runs),
   * build the snapshot from the current inputs + cache, and persist it if
   * it differs from what is already durable.
   *
   * `mode`:
   *   - `"ordinary"` — automatic continuous persistence. Skips entirely
   *     (no I/O) when the coordinator is SUSPENDED, INCLUDING the case where
   *     it was queued on `flushInFlight` before the suspension and only now
   *     reaches the front of the chain. Failures are handled (SUSPEND on
   *     storage-class / slow) and then swallowed.
   *   - `"durableCommit"` — an explicit lifecycle commit boundary
   *     (`commitNow`). Runs even when SUSPENDED. A storage-class / slow
   *     failure still SUSPENDS and additionally REJECTS, so the caller
   *     (explicit Project Close, non-final Window Close) declines rather
   *     than pretending durability was achieved.
   *
   * Failure classification:
   *   - a persist that does not settle within `slowIoThresholdMs`: hung
   *     storage op → SUSPEND, keep a handle on the still in-flight promise
   *     (never assume it was cancelled), issue no other write.
   *   - a storage-class rejection (`SessionStorageFailureError` / an
   *     IPC-flattened one): SUSPEND.
   *   - a transient logical rejection (unresolved Project identity): left
   *     for the next change to retry — NOT a suspension.
   */
  private async persistCurrentInputs(options: {
    mode: "ordinary" | "durableCommit";
  }): Promise<void> {
    const isDurableCommit = options.mode === "durableCommit";

    if (this.stopped || !this.inputs) {
      return;
    }

    // Ordinary continuous persistence must not run once SUSPENDED — not even
    // a flush that was already queued on the chain before the transition —
    // nor while cold-start restore is still holding automatic persistence.
    if (!isDurableCommit && (this.suspended || this.coldStartDeferred)) {
      return;
    }

    // Never run two Session writes concurrently: if a prior write went slow
    // and may still be running, wait for it (bounded again by the slow
    // threshold) before issuing a new one.
    if (this.slowInFlightPersist) {
      const settledOrSlow = await this.raceSlowIo(this.slowInFlightPersist);

      if (settledOrSlow === SLOW_IO_SENTINEL) {
        this.suspend("slowIo");
        if (isDurableCommit) {
          throw new SessionStorageFailureError("slowIo");
        }
        return;
      }

      this.slowInFlightPersist = null;
    }

    // Re-check: a suspension may have landed while we awaited the slow
    // in-flight write above.
    if (!isDurableCommit && this.suspended) {
      return;
    }

    this.firstPendingChangeAt = null;

    const captured = this.captureActiveEditorViewState();

    if (captured) {
      if (captured.viewState === null) {
        this.viewStateCache.delete(captured.key);
      } else {
        this.viewStateCache.set(captured.key, captured.viewState);
      }
    }

    const snapshot = buildRendererSessionSnapshot(
      this.inputs,
      this.viewStateCache
    );
    const serialization = JSON.stringify(snapshot);

    if (serialization === this.lastPersistedSerialization) {
      return;
    }

    const persistPromise = Promise.resolve(this.transport.persist(snapshot));

    let raced: unknown;
    try {
      raced = await this.raceSlowIo(persistPromise);
    } catch (error) {
      // The persist itself rejected before the slow timer fired.
      if (isSessionStorageFailure(error)) {
        this.suspend(sessionStorageFailureReason(error));
      }
      if (isDurableCommit) {
        throw error;
      }
      return;
    }

    if (raced === SLOW_IO_SENTINEL) {
      // The write is taking too long. It may still be running — keep a
      // handle so a later flush waits on it, and DO NOT assume it is gone.
      this.slowInFlightPersist = persistPromise.then(
        () => undefined,
        () => undefined
      );
      this.suspend("slowIo");
      if (isDurableCommit) {
        throw new SessionStorageFailureError("slowIo");
      }
      return;
    }

    this.lastPersistedSerialization = serialization;
    this.hasPersisted = true;
  }

  /**
   * Resolve to the settled value of `promise`, or to `SLOW_IO_SENTINEL` if
   * it does not settle within `slowIoThresholdMs`. Rejections propagate.
   * The slow timer is always cleared.
   */
  private raceSlowIo(promise: Promise<unknown>): Promise<unknown> {
    let timer: unknown = null;

    const slow = new Promise<typeof SLOW_IO_SENTINEL>((resolve) => {
      timer = this.scheduler.schedule(
        () => resolve(SLOW_IO_SENTINEL),
        this.slowIoThresholdMs
      );
    });

    return Promise.race([promise, slow]).finally(() => {
      if (timer !== null) {
        this.scheduler.cancel(timer);
      }
    });
  }
}
