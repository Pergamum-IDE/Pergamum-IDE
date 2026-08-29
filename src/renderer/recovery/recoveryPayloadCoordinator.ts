/**
 * Phase 6-4-3: continuous dirty Markdown payload persistence (renderer
 * side).
 *
 * Owns the flush cadence and the "what is already durable" cache. It does
 * NOT read `App` state, serialize to SQLite, or touch disk — it hands
 * ready-built `RecoveryDocumentPayload`s to an injected `transport`.
 *
 * Cadence:
 *   - `RECOVERY_IDLE_FLUSH_MS` (3s) of quiet after the last dirty change
 *     triggers a flush,
 *   - `RECOVERY_MAX_FLUSH_MS` (60s) is the coalescing ceiling — under
 *     continuous typing a flush still happens at least this often. The
 *     tolerated loss window is therefore ≤ 60s of keystrokes.
 *
 * Deletion is Save-success cleanup ONLY (`onSaveSucceeded`). A tab that
 * closes or disappears is NEVER a reason to delete a Recovery row — that
 * (and any explicit discard) is Phase 6-4-4.
 *
 * A flush failure is logged by the host and retried on the next tick; it
 * never blocks editing.
 */

import type {
  RecoveryDocumentPayload,
  RecoveryDocumentWriteResult
} from "../../shared/recoveryDocument";
import type { RecoveryDirtyDocument } from "./recoveryDocumentPayload";

export const RECOVERY_IDLE_FLUSH_MS = 3_000;
export const RECOVERY_MAX_FLUSH_MS = 60_000;

export interface RecoveryPayloadTransport {
  upsert(
    payload: RecoveryDocumentPayload
  ): Promise<RecoveryDocumentWriteResult> | RecoveryDocumentWriteResult;
  delete(
    documentKey: string
  ): Promise<RecoveryDocumentWriteResult> | RecoveryDocumentWriteResult;
}

export interface RecoveryPayloadScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export interface RecoveryPayloadCoordinatorOptions {
  readonly transport: RecoveryPayloadTransport;
  /** Recovery owner? A non-owner / unavailable instance sets this false and
   *  the coordinator becomes a complete no-op (no IPC, no state). */
  readonly enabled?: boolean;
  readonly scheduler?: RecoveryPayloadScheduler;
  readonly now?: () => number;
  readonly idleMs?: number;
  readonly maxMs?: number;
  /** Diagnostics for a flush that returned `{ ok: false, error }`. The body
   *  text is NOT included. */
  readonly onFlushError?: (info: {
    readonly documentKey: string;
    readonly operation: "upsert" | "delete";
    readonly error: unknown;
  }) => void;
}

const defaultScheduler: RecoveryPayloadScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export interface RecoverySaveSucceededArgs {
  /** The document key that existed BEFORE the save (may equal `newKey`). */
  readonly oldKey: string;
  /** The document key AFTER the save (Save As / Untitled first save change
   *  it; a plain in-place save keeps it equal to `oldKey`). */
  readonly newKey: string | null;
  /** The dirty payload UNDER `newKey` if edits made after the save began
   *  leave the document dirty, else `null`. */
  readonly postSavePayload: RecoveryDocumentPayload | null;
}

export class RecoveryPayloadCoordinator {
  private readonly transport: RecoveryPayloadTransport;
  private readonly scheduler: RecoveryPayloadScheduler;
  private readonly now: () => number;
  private readonly idleMs: number;
  private readonly maxMs: number;
  private readonly onFlushError?: RecoveryPayloadCoordinatorOptions["onFlushError"];

  private enabled: boolean;
  private stopped = false;

  /** documentKey → the payload that should be durable right now. */
  private pendingByKey = new Map<string, RecoveryDocumentPayload>();
  /** documentKey → the serialization already confirmed durable. */
  private readonly lastFlushedByKey = new Map<string, string>();
  /**
   * The most recent dirty set fed in — retained even while disabled so that
   * enabling later (once Recovery ownership is known) can act on edits made
   * before ownership was resolved, without waiting for the next edit.
   *
   * This is renderer memory only; while disabled it is never sent over IPC,
   * written to Recovery.db, or surfaced to Session / project DB / debug log.
   */
  private lastFedEntries: readonly RecoveryDirtyDocument[] = [];

  private timerHandle: unknown = null;
  private firstPendingChangeAt: number | null = null;
  private flushChain: Promise<void> = Promise.resolve();

  constructor(options: RecoveryPayloadCoordinatorOptions) {
    this.transport = options.transport;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => Date.now());
    this.idleMs = options.idleMs ?? RECOVERY_IDLE_FLUSH_MS;
    this.maxMs = options.maxMs ?? RECOVERY_MAX_FLUSH_MS;
    this.onFlushError = options.onFlushError;
    this.enabled = options.enabled ?? false;
  }

  /**
   * Turn Recovery persistence on/off for this run (set from the Recovery
   * Store status once it is known). Disabling clears pending work. A
   * disabled → enabled transition immediately re-evaluates the most recent
   * dirty set, so a document edited BEFORE ownership was known is still
   * flushed on the normal cadence without needing a further edit.
   */
  setEnabled(enabled: boolean): void {
    const wasEnabled = this.enabled;
    this.enabled = enabled;

    if (!enabled) {
      this.clearTimer();
      this.pendingByKey.clear();
      return;
    }

    if (!wasEnabled && !this.stopped) {
      this.applyDirtyEntries(this.lastFedEntries);
    }
  }

  isEnabled(): boolean {
    return this.enabled && !this.stopped;
  }

  /**
   * Feed the current set of dirty Markdown working copies. Cheap; call on
   * every relevant render. A document that leaves the set (became clean, or
   * its tab closed) is dropped from the pending set but its Recovery row is
   * NOT deleted here.
   */
  updateDirtyDocuments(entries: readonly RecoveryDirtyDocument[]): void {
    // Retained in renderer memory regardless of `enabled` so a later
    // `setEnabled(true)` can act on edits made before Recovery ownership was
    // known. Disabled still means no IPC / DB write / logging.
    this.lastFedEntries = entries;

    if (!this.isEnabled()) {
      return;
    }

    this.applyDirtyEntries(entries);
  }

  private applyDirtyEntries(
    entries: readonly RecoveryDirtyDocument[]
  ): void {
    if (!this.isEnabled()) {
      return;
    }

    const nextKeys = new Set(entries.map((entry) => entry.documentKey));

    for (const key of [...this.pendingByKey.keys()]) {
      if (!nextKeys.has(key)) {
        this.pendingByKey.delete(key);
        // Deliberately keep `lastFlushedByKey[key]` and the DB row — a tab
        // close / undo-to-clean is NOT a delete trigger (Phase 6-4-4).
      }
    }

    let changed = false;

    for (const entry of entries) {
      const serialized = JSON.stringify(entry.payload);

      if (this.lastFlushedByKey.get(entry.documentKey) === serialized) {
        // Already durable and unchanged — no need to flush it.
        this.pendingByKey.delete(entry.documentKey);
        continue;
      }

      this.pendingByKey.set(entry.documentKey, entry.payload);
      changed = true;
    }

    if (changed) {
      this.scheduleFlush();
    } else {
      this.clearTimerIfNothingPending();
    }
  }

  /**
   * Retire the Recovery snapshot that a completed save made durable, and
   * protect any edit made after the save began.
   *
   * Ordering contract: the caller MUST have already observed the atomic
   * Markdown write succeed (#284) before calling this.
   *
   *   - `postSavePayload` present → UPSERT it under `newKey` first (so
   *     post-save edits are protected under the new identity),
   *   - then DELETE `oldKey` — but ONLY when the identity actually changed
   *     (`oldKey !== newKey`, i.e. Save As / Untitled first save) or the
   *     document is clean after the save. A plain in-place save that is
   *     still dirty keeps its row (now reflecting the post-save edits).
   *
   * The DELETE never targets `newKey`.
   */
  onSaveSucceeded(args: RecoverySaveSucceededArgs): void {
    if (!this.isEnabled()) {
      return;
    }

    const { oldKey, newKey, postSavePayload } = args;

    this.enqueue(async () => {
      if (postSavePayload && newKey) {
        const result = await this.transport.upsert(postSavePayload);

        if (isOk(result)) {
          this.lastFlushedByKey.set(newKey, JSON.stringify(postSavePayload));
          this.pendingByKey.set(newKey, postSavePayload);
        } else if (isError(result)) {
          this.onFlushError?.({
            documentKey: newKey,
            operation: "upsert",
            error: result.error
          });
        }
      }

      const identityChanged = oldKey !== newKey;

      if (identityChanged || !postSavePayload) {
        const result = await this.transport.delete(oldKey);

        this.pendingByKey.delete(oldKey);
        this.lastFlushedByKey.delete(oldKey);

        if (isError(result)) {
          this.onFlushError?.({
            documentKey: oldKey,
            operation: "delete",
            error: result.error
          });
        }
      }
    });
  }

  /** Best-effort flush of any pending dirty payloads (approved quit / final
   *  window close). Never required for correctness. */
  flushNow(): Promise<void> {
    if (!this.isEnabled()) {
      return this.flushChain;
    }

    this.clearTimer();
    return this.runFlush();
  }

  dispose(): void {
    this.stopped = true;
    this.clearTimer();
    this.pendingByKey.clear();
  }

  private scheduleFlush(): void {
    const nowMs = this.now();

    if (this.firstPendingChangeAt === null) {
      this.firstPendingChangeAt = nowMs;
    }

    const deferredSoFar = nowMs - this.firstPendingChangeAt;
    const remainingCeiling = Math.max(0, this.maxMs - deferredSoFar);
    const delay = Math.min(this.idleMs, remainingCeiling);

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

  private clearTimerIfNothingPending(): void {
    if (this.pendingByKey.size === 0) {
      this.clearTimer();
      this.firstPendingChangeAt = null;
    }
  }

  private runFlush(): Promise<void> {
    return this.enqueue(async () => {
      this.firstPendingChangeAt = null;

      for (const [key, payload] of [...this.pendingByKey.entries()]) {
        const serialized = JSON.stringify(payload);

        if (this.lastFlushedByKey.get(key) === serialized) {
          this.pendingByKey.delete(key);
          continue;
        }

        const result = await this.transport.upsert(payload);

        if (isOk(result)) {
          this.lastFlushedByKey.set(key, serialized);
          // Only clear the pending slot if it was not overwritten by a
          // newer edit while the write was in flight.
          if (this.pendingByKey.get(key) === payload) {
            this.pendingByKey.delete(key);
          }
        } else if (isError(result)) {
          // Keep it pending; the next tick retries. Editing continues.
          this.onFlushError?.({
            documentKey: key,
            operation: "upsert",
            error: result.error
          });
        } else {
          // `skipped` (non-owner / unavailable): stop trying for this run.
          this.pendingByKey.delete(key);
        }
      }
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const next = this.flushChain.then(operation, operation);
    this.flushChain = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }
}

function isOk(
  result: RecoveryDocumentWriteResult
): result is { ok: true; mode: never } {
  return result.ok === true;
}

function isError(
  result: RecoveryDocumentWriteResult
): result is { ok: false; error: string } {
  return result.ok === false && "error" in result;
}
