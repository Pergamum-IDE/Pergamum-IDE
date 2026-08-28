/**
 * #274: the bounded, cold-start restore-set read.
 *
 * Startup must never be held hostage by a slow Session read. This wraps
 * `SessionStore.readRestoreSetForColdStart()` in a named, testable time
 * budget:
 *
 *   - completes within budget → the real result
 *   - exceeds the budget      → `{ kind: "timedOut" }`, restore is abandoned
 *     for this launch and startup continues
 *
 * A timeout is NOT a corruption verdict: nothing is deleted, repaired, or
 * rewritten. The underlying `fs` read is not cancellable and we do not build
 * a cancellation framework — a late result is simply ignored (its promise
 * rejection, if any, is swallowed here so it never becomes an unhandled
 * rejection).
 */

import type {
  ColdStartRestoreSetReadResult,
  SessionSkip,
  SessionStore
} from "./sessionStore";
import type { SessionRecord } from "../shared/session";

/**
 * Time budget for the whole cold-start restore-set read. Chosen so a
 * healthy drive (even a slow HDD / network share on a small restore set)
 * never trips it, while a genuinely hung read cannot stall startup. Not an
 * Issue-mandated product value — see the #274 report. Injectable for tests.
 */
export const COLD_START_RESTORE_READ_BUDGET_MS = 2_000;

export type ColdStartRestoreRead =
  | {
      readonly kind: "ok";
      readonly sessions: readonly SessionRecord[];
      readonly skipped: readonly SessionSkip[];
      readonly manifestListedSessionCount: number;
    }
  | { readonly kind: "empty" }
  | {
      readonly kind: "manifestUnavailable";
      readonly reason: "unreadable" | "malformed" | "unsupportedSchema";
    }
  | { readonly kind: "timedOut" };

export interface ScheduledTimeout {
  cancel(): void;
}

export type ScheduleTimeout = (
  callback: () => void,
  delayMs: number
) => ScheduledTimeout;

const defaultScheduleTimeout: ScheduleTimeout = (callback, delayMs) => {
  const handle = setTimeout(callback, delayMs);

  return { cancel: () => clearTimeout(handle) };
};

const TIMED_OUT = Symbol("cold-start-restore-read-timed-out");

function classify(result: ColdStartRestoreSetReadResult): ColdStartRestoreRead {
  switch (result.manifestOutcome.kind) {
    case "empty":
      return { kind: "empty" };
    case "unavailable":
      return {
        kind: "manifestUnavailable",
        reason: result.manifestOutcome.reason
      };
    case "usable":
      return {
        kind: "ok",
        sessions: result.sessions,
        skipped: result.skipped,
        manifestListedSessionCount:
          result.manifestOutcome.manifest.sessions.length
      };
  }
}

export interface ReadColdStartRestoreSetOptions {
  readonly store: Pick<SessionStore, "readRestoreSetForColdStart">;
  readonly thresholdMs?: number;
  readonly scheduleTimeout?: ScheduleTimeout;
}

export async function readColdStartRestoreSet(
  options: ReadColdStartRestoreSetOptions
): Promise<ColdStartRestoreRead> {
  const thresholdMs = options.thresholdMs ?? COLD_START_RESTORE_READ_BUDGET_MS;
  const scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout;

  // Normalize the read to a never-rejecting promise so a late failure cannot
  // surface as an unhandled rejection after we have already fallen back.
  const readPromise = options.store.readRestoreSetForColdStart().then(
    (value) => ({ ok: true as const, value }),
    () => ({ ok: false as const })
  );

  let fireTimeout: () => void = () => undefined;
  const timeoutPromise = new Promise<typeof TIMED_OUT>((resolve) => {
    fireTimeout = () => resolve(TIMED_OUT);
  });
  const scheduled: ScheduledTimeout = scheduleTimeout(fireTimeout, thresholdMs);

  const outcome = await Promise.race([readPromise, timeoutPromise]);

  scheduled.cancel();

  if (outcome === TIMED_OUT) {
    // The read may still be running. We never touch it again; its eventual
    // result (or rejection) is already swallowed above.
    return { kind: "timedOut" };
  }

  if (!outcome.ok) {
    return { kind: "manifestUnavailable", reason: "unreadable" };
  }

  return classify(outcome.value);
}
