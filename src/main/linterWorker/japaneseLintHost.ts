import { randomUUID } from "node:crypto";
import type {
  JapaneseLintExtension,
  JapaneseLintFormat
} from "../../shared/japaneseLint";
import {
  JAPANESE_LINT_WORKER_CONNECT_MESSAGE,
  buildJapaneseLintWorkerConfig,
  isJapaneseLintWorkerConfig,
  isSafeJobId,
  parseJapaneseLintWorkerResponse,
  type JapaneseLintWorkerConfig,
  type JapaneseLintWorkerDocumentFailure,
  type JapaneseLintWorkerDocumentFailureReason,
  type JapaneseLintWorkerDocumentResult,
  type JapaneseLintWorkerProgressStage,
  type JapaneseLintWorkerRequest,
  type JapaneseLintWorkerRequestType,
  type JapaneseLintWorkerResponse,
  type SanitizedWorkerError
} from "../../shared/japaneseLintWorkerProtocol";
import type { DebugLogger } from "../debugLogger";
import { sanitizeErrorForLog } from "../sanitizeErrorForLog";

/**
 * Host side (Main Process) of the Japanese Linter Worker.
 *
 * Starts the Worker (Electron utilityProcess in production), performs the
 * init handshake, exchanges ping / updateConfig / lintDocument / cancel /
 * shutdown, and notices when the Worker exits or fails. It is written against
 * small interfaces (`fork`, `createChannel`) so the same code is unit-tested
 * with an in-memory Worker.
 *
 * Failure policy: nothing the Worker does may take the app down.
 *   - Every pending request and job is settled when the Worker goes away.
 *   - `lintDocument` NEVER throws: every way of not producing a result is a
 *     `{ ok: false, reason }` (dictionary-missing / lint-failed / canceled /
 *     worker-failed), so a caller cannot forget a catch.
 *   - A result for a job that was canceled (or has already been settled) is
 *     dropped, never delivered.
 *   - Every log line is sanitized: no text, names or paths (see
 *     sanitizeErrorForLog.ts). The manuscript text is passed to the Worker and
 *     nowhere else.
 *
 * Not connected to the instant check yet (P1b) and no automatic restart
 * (the `onExit` callback is where that will hook in).
 */

export type JapaneseLintHostState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed"
  | "disposed";

export type JapaneseLintWorkerFailureKind =
  /** The Worker is not (or no longer) running. */
  | "not-running"
  | "timeout"
  | "worker-exited"
  /** The Worker answered with a sanitized error. */
  | "worker-error"
  | "start-failed"
  | "invalid-argument"
  | "disposed";

/**
 * The error type of the throwing lifecycle calls (start / ping /
 * updateConfig). Its `message` is just the kind - a Worker's own message text
 * is never carried along.
 */
export class JapaneseLintWorkerError extends Error {
  constructor(
    readonly kind: JapaneseLintWorkerFailureKind,
    readonly workerError?: SanitizedWorkerError
  ) {
    super(kind);
    this.name = "JapaneseLintWorkerError";
  }
}

export interface JapaneseLintHostChild {
  readonly pid: number | undefined;
  postMessage(message: unknown, transfer?: unknown[]): void;
  kill(): boolean;
  on(
    event: "exit",
    listener: (code: number, signal?: string | null) => void
  ): unknown;
  on(event: "error", listener: (...args: unknown[]) => void): unknown;
}

export interface JapaneseLintHostPort {
  postMessage(message: unknown): void;
  on(event: "message", listener: (event: { data: unknown }) => void): unknown;
  on(event: "close", listener: () => void): unknown;
  start(): void;
  close(): void;
}

export interface JapaneseLintHostTimeouts {
  /** init -> ready. */
  readonly startMs: number;
  /** ping / updateConfig. */
  readonly requestMs: number;
  /** shutdown -> exit, before the process is killed. */
  readonly shutdownMs: number;
  /** A lint job's whole life; on expiry the Worker is ended. */
  readonly jobMs: number;
  /**
   * After a cancel: how long the Worker gets to acknowledge before it is
   * ended. textlint cannot be interrupted, so a busy Worker will not answer.
   */
  readonly cancelGraceMs: number;
}

export const defaultJapaneseLintHostTimeouts: JapaneseLintHostTimeouts = {
  startMs: 15_000,
  requestMs: 5_000,
  shutdownMs: 3_000,
  jobMs: 300_000,
  cancelGraceMs: 1_500
};

export interface JapaneseLintHostExitInfo {
  readonly code: number | null;
  readonly signal: string | null;
  /** True when the Host ended the Worker on purpose (shutdown / cancel). */
  readonly expected: boolean;
}

export interface JapaneseLintHostDeps {
  fork(): JapaneseLintHostChild;
  createChannel(): { port1: unknown; port2: JapaneseLintHostPort };
  /** The kuromoji dictionary directory, resolved by the Host. */
  resolveDictionaryPath(): string;
  /** The stored `japaneseLint` settings section (or undefined = defaults). */
  getSettings(): Promise<unknown> | unknown;
  logger: Pick<DebugLogger, "log">;
  newRequestId?(): string;
  newJobId?(): string;
  now?(): number;
  timeouts?: Partial<JapaneseLintHostTimeouts>;
  /** Called after every Worker exit; a place for restart logic later. */
  onExit?(info: JapaneseLintHostExitInfo): void;
}

export interface JapaneseLintWorkerPong {
  readonly requestId: string;
  readonly roundTripMs: number;
}

export interface JapaneseLintWorkerProgress {
  readonly jobId: string;
  readonly stage: JapaneseLintWorkerProgressStage;
  readonly processedChars: number;
  readonly totalChars: number;
}

export interface JapaneseLintWorkerDocumentInput {
  readonly source: string;
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
  /**
   * Identifies the job for `cancel`. Optional: the Host issues one when
   * absent; a caller that wants to cancel supplies its own (or takes one from
   * `createJobId()`).
   */
  readonly jobId?: string;
  /** Coarse stages only (no chunking yet); never called after a cancel. */
  readonly onProgress?: (progress: JapaneseLintWorkerProgress) => void;
}

export type JapaneseLintWorkerDocumentOutcome =
  | JapaneseLintWorkerDocumentResult
  | JapaneseLintWorkerDocumentFailure;

export interface JapaneseLintHost {
  getState(): JapaneseLintHostState;
  createJobId(): string;
  start(): Promise<void>;
  ping(): Promise<JapaneseLintWorkerPong>;
  /** Swaps the rule / runtime snapshot; applies to jobs that start later. */
  updateConfig(config: JapaneseLintWorkerConfig): Promise<void>;
  /** Never throws: failures are `{ ok: false, reason }`. */
  lintDocument(
    input: JapaneseLintWorkerDocumentInput
  ): Promise<JapaneseLintWorkerDocumentOutcome>;
  /** Idempotent; an unknown or finished job is a no-op. Never hangs. */
  cancel(jobId: string): Promise<void>;
  shutdown(): Promise<void>;
  dispose(): Promise<void>;
}

interface PendingRequest {
  readonly type: JapaneseLintWorkerRequestType;
  readonly startedAt: number;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (response: JapaneseLintWorkerResponse) => void;
  readonly reject: (error: JapaneseLintWorkerError) => void;
}

interface LintJob {
  readonly jobId: string;
  readonly requestId: string;
  readonly startedAt: number;
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
  readonly sourceChars: number;
  readonly sourceLines: number;
  readonly onProgress?: (progress: JapaneseLintWorkerProgress) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (outcome: JapaneseLintWorkerDocumentOutcome) => void;
  /** The caller has been answered (result, failure or cancel). */
  settled: boolean;
  /** Set by cancel(): anything the Worker still sends is dropped. */
  canceled: boolean;
  /** Woken when the Worker answers for this job, or exits. */
  ackWaiters: (() => void)[];
  cancelPromise?: Promise<void>;
}

function isSanitizedWorkerError(value: unknown): value is SanitizedWorkerError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SanitizedWorkerError).kind === "string" &&
    typeof (value as SanitizedWorkerError).name === "string" &&
    Array.isArray((value as SanitizedWorkerError).stack)
  );
}

function countLines(text: string): number {
  let lines = 1;

  for (let index = text.indexOf("\n"); index !== -1; ) {
    lines += 1;
    index = text.indexOf("\n", index + 1);
  }

  return lines;
}

type HostLogEvent =
  | "japaneseLint.worker.started"
  | "japaneseLint.worker.ready"
  | "japaneseLint.worker.request.completed"
  | "japaneseLint.worker.exited"
  | "japaneseLint.worker.error"
  | "japaneseLint.worker.lint.completed";

export function createJapaneseLintHost(
  deps: JapaneseLintHostDeps
): JapaneseLintHost {
  const timeouts: JapaneseLintHostTimeouts = {
    ...defaultJapaneseLintHostTimeouts,
    ...deps.timeouts
  };
  const now = deps.now ?? Date.now;
  const newRequestId = deps.newRequestId ?? (() => randomUUID());
  const newJobId = deps.newJobId ?? (() => randomUUID());

  let state: JapaneseLintHostState = "idle";
  let child: JapaneseLintHostChild | null = null;
  let port: JapaneseLintHostPort | null = null;
  let exited = true;
  // The Host ended the Worker itself (cancel / job timeout): not a crash.
  let deliberateKill = false;
  let currentConfig: JapaneseLintWorkerConfig | null = null;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let exitWaiters: (() => void)[] = [];
  const pending = new Map<string, PendingRequest>();
  const jobs = new Map<string, LintJob>();

  // Logging must never throw into the caller.
  function log(
    event: HostLogEvent,
    level: "debug" | "warn",
    details: Record<string, unknown>
  ): void {
    try {
      deps.logger.log({
        level,
        event,
        details: {
          linterMode: "worker-lint",
          ...(child?.pid !== undefined ? { workerPid: child.pid } : {}),
          ...details
        }
      });
    } catch {
      /* diagnostics only */
    }
  }

  // An error the Worker sent is already in sanitized form (and was validated
  // by parseJapaneseLintWorkerResponse); anything else is a local exception
  // and goes through sanitizeErrorForLog. Either way no message text is kept.
  function logSanitizedError(error: unknown, kind?: string): void {
    const sanitized: {
      name: string;
      code?: string;
      stack: readonly string[];
    } = isSanitizedWorkerError(error) ? error : sanitizeErrorForLog(error);

    log("japaneseLint.worker.error", "warn", {
      errorName: sanitized.name,
      ...(sanitized.code !== undefined ? { errorCode: sanitized.code } : {}),
      sanitizedStack: sanitized.stack,
      ...(kind !== undefined ? { workerErrorKind: kind } : {})
    });
  }

  function rejectAllPending(kind: JapaneseLintWorkerFailureKind): void {
    for (const [requestId, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(requestId);
      entry.reject(new JapaneseLintWorkerError(kind));
    }
  }

  function settleExitWaiters(): void {
    const waiters = exitWaiters;

    exitWaiters = [];

    for (const waiter of waiters) {
      waiter();
    }
  }

  function closePort(): void {
    try {
      port?.close();
    } catch {
      /* already closed */
    }

    port = null;
  }

  function killChild(): void {
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
  }

  // ---- lint jobs ---------------------------------------------------------

  function logLintCompleted(
    job: LintJob,
    outcome: JapaneseLintWorkerDocumentOutcome
  ): void {
    log("japaneseLint.worker.lint.completed", "debug", {
      workerRequestType: "lintDocument",
      workerRequestId: job.requestId,
      workerJobId: job.jobId,
      lintFormat: job.format,
      extension: job.ext,
      characterLength: job.sourceChars,
      lineCount: job.sourceLines,
      durationMs: Math.max(0, now() - job.startedAt),
      ...(currentConfig ? { enabledRuleIds: currentConfig.enabledRuleIds } : {}),
      ...(outcome.ok
        ? {
            result: "succeeded",
            totalMessages: outcome.totalMessages,
            returnedMessages: outcome.messages.length,
            truncated: outcome.truncated
          }
        : {
            result: outcome.reason === "canceled" ? "cancelled" : "failed",
            failureReason: outcome.reason
          })
    });
  }

  /** Answers the caller exactly once; a later result is dropped. */
  function answerJob(
    job: LintJob,
    outcome: JapaneseLintWorkerDocumentOutcome
  ): void {
    if (job.settled) {
      return;
    }

    job.settled = true;
    clearTimeout(job.timer);
    logLintCompleted(job, outcome);
    job.resolve(outcome);
  }

  /** The Worker is done with the job (any answer): forget it. */
  function retireJob(job: LintJob): void {
    clearTimeout(job.timer);
    jobs.delete(job.jobId);

    const waiters = job.ackWaiters;

    job.ackWaiters = [];

    for (const waiter of waiters) {
      waiter();
    }
  }

  function failureFor(
    reason: JapaneseLintWorkerDocumentFailureReason,
    job: LintJob
  ): JapaneseLintWorkerDocumentFailure {
    return {
      ok: false,
      reason,
      elapsedMs: Math.max(0, now() - job.startedAt)
    };
  }

  function reasonForWorkerError(
    kind: SanitizedWorkerError["kind"]
  ): JapaneseLintWorkerDocumentFailureReason {
    switch (kind) {
      case "dictionary-missing":
        return "dictionary-missing";
      case "lint-failed":
        return "lint-failed";
      default:
        return "worker-failed";
    }
  }

  // ---- exit --------------------------------------------------------------

  function handleExit(code: number, signal?: string | null): void {
    if (exited) {
      return;
    }

    exited = true;

    const expected = state === "stopping" || deliberateKill;

    deliberateKill = false;
    log("japaneseLint.worker.exited", expected ? "debug" : "warn", {
      exitCode: code,
      ...(signal ? { exitSignal: signal } : {})
    });

    // A shutdown in flight is answered by the exit itself.
    for (const [requestId, entry] of pending) {
      if (expected && entry.type === "shutdown") {
        clearTimeout(entry.timer);
        pending.delete(requestId);
        entry.resolve({ type: "shutdown-complete", requestId });
      }
    }

    rejectAllPending("worker-exited");

    // Every job the Worker leaves unanswered fails safely (a canceled job was
    // already answered as canceled, and is simply forgotten here).
    for (const job of [...jobs.values()]) {
      answerJob(job, failureFor("worker-failed", job));
      retireJob(job);
    }

    closePort();

    if (state !== "disposed") {
      state = expected ? "stopped" : "failed";
    }

    settleExitWaiters();

    try {
      deps.onExit?.({ code, signal: signal ?? null, expected });
    } catch {
      /* a listener must not break the Host */
    }
  }

  // ---- responses ---------------------------------------------------------

  function handleResponse(raw: unknown): void {
    const response = parseJapaneseLintWorkerResponse(raw);

    if (response === null) {
      logSanitizedError(undefined, "invalid-response");

      return;
    }

    switch (response.type) {
      case "progress": {
        const job = jobs.get(response.jobId);

        if (job !== undefined && !job.settled && !job.canceled) {
          try {
            job.onProgress?.({
              jobId: response.jobId,
              stage: response.stage,
              processedChars: response.processedChars,
              totalChars: response.totalChars
            });
          } catch {
            /* a progress listener must not break the Host */
          }
        }

        return;
      }
      case "lint-result": {
        const job = jobs.get(response.jobId);

        if (job === undefined) {
          return;
        }

        // A canceled job's result is dropped: answerJob is a no-op then.
        answerJob(job, response.result);
        retireJob(job);

        return;
      }
      case "canceled": {
        const job = jobs.get(response.jobId);

        if (job !== undefined) {
          answerJob(job, failureFor("canceled", job));
          retireJob(job);
        }

        return;
      }
      case "error": {
        logSanitizedError(response.error, response.error.kind);

        if (response.jobId !== undefined) {
          const job = jobs.get(response.jobId);

          if (job !== undefined) {
            answerJob(job, failureFor(reasonForWorkerError(response.error.kind), job));
            retireJob(job);
          }
        }

        if (response.requestId !== undefined) {
          rejectPending(response.requestId, response);
        }

        return;
      }
      default:
        settlePending(response);
    }
  }

  function settlePending(
    response: Extract<
      JapaneseLintWorkerResponse,
      { requestId: string; type: "ready" | "pong" | "config-updated" | "shutdown-complete" }
    >
  ): void {
    const entry = pending.get(response.requestId);

    if (entry === undefined) {
      return;
    }

    clearTimeout(entry.timer);
    pending.delete(response.requestId);
    log("japaneseLint.worker.request.completed", "debug", {
      workerRequestType: entry.type,
      workerRequestId: response.requestId,
      durationMs: Math.max(0, now() - entry.startedAt)
    });
    entry.resolve(response);
  }

  function rejectPending(
    requestId: string,
    response: Extract<JapaneseLintWorkerResponse, { type: "error" }>
  ): void {
    const entry = pending.get(requestId);

    if (entry === undefined) {
      return;
    }

    clearTimeout(entry.timer);
    pending.delete(requestId);
    log("japaneseLint.worker.request.completed", "debug", {
      workerRequestType: entry.type,
      workerRequestId: requestId,
      durationMs: Math.max(0, now() - entry.startedAt)
    });
    entry.reject(new JapaneseLintWorkerError("worker-error", response.error));
  }

  function send(
    request: JapaneseLintWorkerRequest,
    timeoutMs: number
  ): Promise<JapaneseLintWorkerResponse> {
    return new Promise<JapaneseLintWorkerResponse>((resolve, reject) => {
      if (port === null || exited) {
        reject(new JapaneseLintWorkerError("not-running"));

        return;
      }

      const timer = setTimeout(() => {
        pending.delete(request.requestId);
        reject(new JapaneseLintWorkerError("timeout"));
      }, timeoutMs);

      pending.set(request.requestId, {
        type: request.type,
        startedAt: now(),
        timer,
        resolve,
        reject
      });

      try {
        port.postMessage(request);
      } catch (error) {
        clearTimeout(timer);
        pending.delete(request.requestId);
        logSanitizedError(error, "post-failed");
        reject(new JapaneseLintWorkerError("not-running"));
      }
    });
  }

  function waitForExit(timeoutMs: number): Promise<void> {
    if (exited) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);

      exitWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Ends the Worker on purpose (cancel of a running job, job timeout). */
  async function terminateWorker(): Promise<void> {
    if (exited) {
      return;
    }

    deliberateKill = true;
    killChild();
    await waitForExit(timeouts.shutdownMs);
  }

  // ---- lifecycle ---------------------------------------------------------

  async function doStart(): Promise<void> {
    const startedAt = now();
    let settings: unknown;

    try {
      settings = await deps.getSettings();
    } catch {
      settings = undefined;
    }

    const config = buildJapaneseLintWorkerConfig(settings);
    const dictionaryPath = deps.resolveDictionaryPath();
    const forked = deps.fork();
    const { port1, port2 } = deps.createChannel();

    child = forked;
    port = port2;
    exited = false;
    deliberateKill = false;
    currentConfig = config;

    forked.on("exit", (code, signal) => handleExit(code, signal));
    forked.on("error", () => {
      // Electron reports a fatal child error here; the exit event follows.
      log("japaneseLint.worker.error", "warn", { workerErrorKind: "child-error" });
    });
    port2.on("message", (event) => handleResponse(event.data));
    port2.on("close", () => undefined);
    port2.start();
    log("japaneseLint.worker.started", "debug", {});

    // Hand the Worker its end of the channel, then run the init handshake.
    forked.postMessage(JAPANESE_LINT_WORKER_CONNECT_MESSAGE, [port1]);
    await send(
      { type: "init", requestId: newRequestId(), dictionaryPath, config },
      timeouts.startMs
    );
    state = "ready";
    log("japaneseLint.worker.ready", "debug", {
      durationMs: Math.max(0, now() - startedAt),
      enabledRuleIds: config.enabledRuleIds
    });
  }

  async function start(): Promise<void> {
    if (state === "disposed") {
      throw new JapaneseLintWorkerError("disposed");
    }

    if (state === "ready") {
      return;
    }

    if (startPromise !== null) {
      return startPromise;
    }

    if (state === "stopping") {
      await (stopPromise ?? Promise.resolve());
    }

    state = "starting";
    startPromise = doStart()
      .catch((error: unknown) => {
        // Whatever went wrong, leave no half-started process behind.
        if (!(error instanceof JapaneseLintWorkerError)) {
          logSanitizedError(error, "start-error");
        }

        killChild();
        closePort();
        rejectAllPending("start-failed");
        state = "failed";

        throw error instanceof JapaneseLintWorkerError
          ? error
          : new JapaneseLintWorkerError("start-failed");
      })
      .finally(() => {
        startPromise = null;
      });

    return startPromise;
  }

  async function ping(): Promise<JapaneseLintWorkerPong> {
    if (state !== "ready") {
      throw new JapaneseLintWorkerError("not-running");
    }

    const requestId = newRequestId();
    const startedAt = now();

    await send({ type: "ping", requestId }, timeouts.requestMs);

    return { requestId, roundTripMs: Math.max(0, now() - startedAt) };
  }

  async function updateConfig(config: JapaneseLintWorkerConfig): Promise<void> {
    if (!isJapaneseLintWorkerConfig(config)) {
      throw new JapaneseLintWorkerError("invalid-argument");
    }

    if (state !== "ready") {
      throw new JapaneseLintWorkerError("not-running");
    }

    await send(
      { type: "updateConfig", requestId: newRequestId(), config },
      timeouts.requestMs
    );
    currentConfig = config;
  }

  function lintDocument(
    input: JapaneseLintWorkerDocumentInput
  ): Promise<JapaneseLintWorkerDocumentOutcome> {
    const startedAt = now();
    const jobId =
      input.jobId !== undefined && isSafeJobId(input.jobId)
        ? input.jobId
        : newJobId();
    const requestId = newRequestId();
    const sourceChars =
      typeof input.source === "string" ? input.source.length : 0;
    const sourceLines =
      typeof input.source === "string" ? countLines(input.source) : 0;

    return new Promise<JapaneseLintWorkerDocumentOutcome>((resolve) => {
      const failNow = (
        reason: JapaneseLintWorkerDocumentFailureReason
      ): void => {
        const failed: JapaneseLintWorkerDocumentFailure = {
          ok: false,
          reason,
          elapsedMs: Math.max(0, now() - startedAt)
        };

        log("japaneseLint.worker.lint.completed", "debug", {
          workerRequestType: "lintDocument",
          workerRequestId: requestId,
          workerJobId: jobId,
          lintFormat: input.format,
          extension: input.ext,
          characterLength: sourceChars,
          lineCount: sourceLines,
          durationMs: failed.elapsedMs,
          result: "failed",
          failureReason: reason
        });
        resolve(failed);
      };

      // Not running (idle / starting / stopped / failed / disposed), or a
      // job id already in use: fail safely, never throw.
      if (
        state !== "ready" ||
        port === null ||
        exited ||
        jobs.has(jobId) ||
        typeof input.source !== "string"
      ) {
        failNow("worker-failed");

        return;
      }

      const job: LintJob = {
        jobId,
        requestId,
        startedAt,
        format: input.format,
        ext: input.ext,
        sourceChars,
        sourceLines,
        ...(input.onProgress ? { onProgress: input.onProgress } : {}),
        // A job that never comes back must not pin the Host forever: the
        // Worker is ended and the job fails.
        timer: setTimeout(() => {
          answerJob(job, failureFor("worker-failed", job));
          void terminateWorker();
        }, timeouts.jobMs),
        resolve,
        settled: false,
        canceled: false,
        ackWaiters: []
      };

      jobs.set(jobId, job);

      try {
        port.postMessage({
          type: "lintDocument",
          requestId,
          jobId,
          source: input.source,
          format: input.format,
          ext: input.ext
        });
      } catch (error) {
        logSanitizedError(error, "post-failed");
        answerJob(job, failureFor("worker-failed", job));
        retireJob(job);
      }
    });
  }

  function cancel(jobId: string): Promise<void> {
    const job = jobs.get(jobId);

    // Unknown or already finished: nothing to do (also covers a double cancel
    // once the first one has completed).
    if (job === undefined) {
      return Promise.resolve();
    }

    if (job.cancelPromise !== undefined) {
      return job.cancelPromise;
    }

    job.canceled = true;
    // The caller is answered NOW; whatever the Worker sends later is dropped.
    answerJob(job, failureFor("canceled", job));

    job.cancelPromise = (async () => {
      if (port !== null && !exited) {
        try {
          port.postMessage({ type: "cancel", requestId: newRequestId(), jobId });
        } catch {
          /* the exit handling below covers a dead port */
        }

        // Wait for the Worker to acknowledge - but only so long.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, timeouts.cancelGraceMs);

          job.ackWaiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      // Not acknowledged (textlint is busy and cannot be interrupted): end
      // the Worker. It can be started again afterwards.
      if (jobs.get(jobId) === job && !exited) {
        await terminateWorker();
      }

      retireJob(job);
    })();

    return job.cancelPromise;
  }

  function shutdown(): Promise<void> {
    if (stopPromise !== null) {
      return stopPromise;
    }

    if (
      state === "idle" ||
      state === "stopped" ||
      state === "failed" ||
      state === "disposed"
    ) {
      return Promise.resolve();
    }

    const wasStarting = startPromise;

    state = "stopping";
    stopPromise = (async () => {
      // Let a start in flight settle first so its process can be stopped.
      await wasStarting?.catch(() => undefined);

      if (!exited) {
        state = "stopping";

        try {
          await send(
            { type: "shutdown", requestId: newRequestId() },
            timeouts.shutdownMs
          );
        } catch {
          /* fall through to the forced stop below */
        }

        await waitForExit(timeouts.shutdownMs);

        if (!exited) {
          killChild();
          await waitForExit(timeouts.shutdownMs);
        }
      }

      closePort();

      // dispose() may have run meanwhile; TypeScript cannot see that.
      if ((state as JapaneseLintHostState) !== "disposed") {
        state = "stopped";
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        stopPromise = null;
      });

    return stopPromise;
  }

  async function dispose(): Promise<void> {
    if (state === "disposed") {
      return;
    }

    await shutdown();
    killChild();
    closePort();
    rejectAllPending("disposed");

    for (const job of [...jobs.values()]) {
      answerJob(job, failureFor("worker-failed", job));
      retireJob(job);
    }

    state = "disposed";
  }

  return {
    getState: () => state,
    createJobId: newJobId,
    start,
    ping,
    updateConfig,
    lintDocument,
    cancel,
    shutdown,
    dispose
  };
}
