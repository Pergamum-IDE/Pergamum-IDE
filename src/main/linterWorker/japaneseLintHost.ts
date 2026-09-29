import { randomUUID } from "node:crypto";
import {
  JAPANESE_LINT_WORKER_CONNECT_MESSAGE,
  buildJapaneseLintWorkerConfig,
  parseJapaneseLintWorkerResponse,
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
 * init handshake, exchanges ping / shutdown, and notices when the Worker
 * exits or fails. It is written against small interfaces (`fork`,
 * `createChannel`) so the same code is unit-tested with an in-memory Worker.
 *
 * Failure policy: nothing the Worker does may take the app down. Every
 * pending request is settled when the Worker goes away, a repeated shutdown
 * is harmless, and every log line is sanitized (no text, names or paths -
 * see sanitizeErrorForLog.ts).
 *
 * Foundation slice: lifecycle only. It is not connected to the instant check
 * yet, and does not restart a crashed Worker (only reports it via `onExit`).
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
  | "disposed";

/**
 * The only error type this Host throws. Its `message` is just the kind - a
 * Worker's own message text is never carried along.
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
  /** ping. */
  readonly requestMs: number;
  /** shutdown -> exit, before the process is killed. */
  readonly shutdownMs: number;
}

export const defaultJapaneseLintHostTimeouts: JapaneseLintHostTimeouts = {
  startMs: 15_000,
  requestMs: 5_000,
  shutdownMs: 3_000
};

export interface JapaneseLintHostExitInfo {
  readonly code: number | null;
  readonly signal: string | null;
  /** True when the Host asked the Worker to shut down. */
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
  now?(): number;
  timeouts?: Partial<JapaneseLintHostTimeouts>;
  /** Called after every Worker exit; a place for restart logic later. */
  onExit?(info: JapaneseLintHostExitInfo): void;
}

export interface JapaneseLintWorkerPong {
  readonly requestId: string;
  readonly roundTripMs: number;
}

export interface JapaneseLintHost {
  getState(): JapaneseLintHostState;
  start(): Promise<void>;
  ping(): Promise<JapaneseLintWorkerPong>;
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

function isSanitizedWorkerError(value: unknown): value is SanitizedWorkerError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SanitizedWorkerError).kind === "string" &&
    typeof (value as SanitizedWorkerError).name === "string" &&
    Array.isArray((value as SanitizedWorkerError).stack)
  );
}

export function createJapaneseLintHost(
  deps: JapaneseLintHostDeps
): JapaneseLintHost {
  const timeouts: JapaneseLintHostTimeouts = {
    ...defaultJapaneseLintHostTimeouts,
    ...deps.timeouts
  };
  const now = deps.now ?? Date.now;
  const newRequestId = deps.newRequestId ?? (() => randomUUID());

  let state: JapaneseLintHostState = "idle";
  let child: JapaneseLintHostChild | null = null;
  let port: JapaneseLintHostPort | null = null;
  let exited = true;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let exitWaiters: (() => void)[] = [];
  const pending = new Map<string, PendingRequest>();

  // Logging must never throw into the caller.
  function log(
    event:
      | "japaneseLint.worker.started"
      | "japaneseLint.worker.ready"
      | "japaneseLint.worker.request.completed"
      | "japaneseLint.worker.exited"
      | "japaneseLint.worker.error",
    level: "debug" | "warn",
    details: Record<string, unknown>
  ): void {
    try {
      deps.logger.log({
        level,
        event,
        details: {
          linterMode: "foundation",
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
  function logSanitizedError(
    error: unknown,
    kind?: string
  ): void {
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

  function handleExit(code: number, signal?: string | null): void {
    if (exited) {
      return;
    }

    exited = true;

    const expected = state === "stopping";

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

  function handleResponse(raw: unknown): void {
    const response = parseJapaneseLintWorkerResponse(raw);

    if (response === null) {
      logSanitizedError(undefined, "invalid-response");

      return;
    }

    if (response.type === "error" && response.requestId === undefined) {
      // Unsolicited (e.g. an uncaught exception in the Worker): it is about
      // to exit. Log it; the exit settles anything pending.
      logSanitizedError(response.error, response.error.kind);

      return;
    }

    const requestId = response.requestId ?? "";
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

    if (response.type === "error") {
      logSanitizedError(response.error, response.error.kind);
      entry.reject(new JapaneseLintWorkerError("worker-error", response.error));

      return;
    }

    entry.resolve(response);
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

  function killChild(): void {
    try {
      child?.kill();
    } catch {
      /* already gone */
    }
  }

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

  function shutdown(): Promise<void> {
    if (stopPromise !== null) {
      return stopPromise;
    }

    if (state === "idle" || state === "stopped" || state === "failed" || state === "disposed") {
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
    state = "disposed";
  }

  return {
    getState: () => state,
    start,
    ping,
    shutdown,
    dispose
  };
}
