import { promises as fs } from "node:fs";
import path from "node:path";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  type JapaneseLintDiagnostic,
  type JapaneseLintExtension,
  type JapaneseLintFormat
} from "../../shared/japaneseLint";
import type { EnabledJapaneseLintRule } from "../../shared/japaneseLintRules";
import {
  isSafeJobId,
  isSafeRequestId,
  parseJapaneseLintWorkerRequest,
  type JapaneseLintWorkerConfig,
  type JapaneseLintWorkerErrorKind,
  type JapaneseLintWorkerProgressStage,
  type JapaneseLintWorkerResponse
} from "../../shared/japaneseLintWorkerProtocol";
import { sanitizeErrorForLog } from "../sanitizeErrorForLog";
import { japaneseLintDictionaryProbeFile } from "./japaneseLintDictionary";

/**
 * The Linter Worker's message handling, independent of Electron so it can be
 * unit-tested and driven over any transport. The utilityProcess entry
 * (japaneseLintWorker.ts) wires it to a MessagePort and to the real textlint
 * engine.
 *
 * P1b: `lintDocument` runs textlint in the Worker process (never in the Main
 * Process), `updateConfig` swaps the rule/runtime snapshot for FUTURE jobs,
 * and `cancel` is best-effort (see below). Every error leaves this module
 * already sanitized (name / code / allow-listed stack frames) - a raw
 * `message` never reaches a response - and the manuscript text is never
 * echoed back.
 *
 * Jobs run one at a time, in arrival order. textlint cannot be interrupted
 * mid-run, so a `cancel` for a job that is already running only marks it: the
 * result is dropped when it finishes (answered with `canceled`). Really
 * stopping a running job is the Host's call (it ends the process).
 */

export interface JapaneseLintWorkerLintOptions {
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
  readonly rules: readonly EnabledJapaneseLintRule[];
}

export interface JapaneseLintWorkerCoreDeps {
  send(response: JapaneseLintWorkerResponse): void;
  exit(code: number): void;
  /** True when the kuromoji dictionary directory is readable. */
  dictionaryExists(dictionaryPath: string): Promise<boolean>;
  /** Points the dictionary-reading engine at the directory the Host gave. */
  setDictionaryPath(dictionaryPath: string): void;
  /** Runs textlint; messages come back in position order. */
  lint(
    source: string,
    options: JapaneseLintWorkerLintOptions
  ): Promise<readonly JapaneseLintDiagnostic[]>;
  now?(): number;
}

export interface JapaneseLintWorkerCore {
  handleMessage(raw: unknown): Promise<void>;
  /** Reports a fatal error (uncaught exception / rejection), then exits. */
  reportFatal(
    kind: "uncaught-exception" | "unhandled-rejection",
    error: unknown
  ): void;
  /**
   * Reports an error without ending the process: a rejection that leaked out
   * of textlint is worth telling the Host about, but the Worker is still fine.
   */
  reportError(
    kind: "uncaught-exception" | "unhandled-rejection",
    error: unknown
  ): void;
}

export async function dictionaryDirectoryExists(
  dictionaryPath: string
): Promise<boolean> {
  try {
    await fs.access(path.join(dictionaryPath, japaneseLintDictionaryProbeFile));

    return true;
  } catch {
    return false;
  }
}

function countLines(text: string): number {
  let lines = 1;

  for (let index = text.indexOf("\n"); index !== -1; ) {
    lines += 1;
    index = text.indexOf("\n", index + 1);
  }

  return lines;
}

interface Job {
  readonly requestId: string;
  readonly jobId: string;
  readonly source: string;
  readonly format: JapaneseLintFormat;
  readonly ext: JapaneseLintExtension;
  canceled: boolean;
  /** requestId of the cancel request that marked a running job. */
  cancelRequestId?: string;
}

export function createJapaneseLintWorkerCore(
  deps: JapaneseLintWorkerCoreDeps
): JapaneseLintWorkerCore {
  const now = deps.now ?? Date.now;
  let state: "uninitialized" | "ready" | "stopping" = "uninitialized";
  let dictionaryPath = "";
  let config: JapaneseLintWorkerConfig | null = null;
  const queue: Job[] = [];
  let running: Job | null = null;
  let draining = false;

  function sendError(
    kind: JapaneseLintWorkerErrorKind,
    error: unknown,
    ids: { requestId?: string; jobId?: string } = {}
  ): void {
    const sanitized = sanitizeErrorForLog(error);

    deps.send({
      type: "error",
      ...(ids.requestId !== undefined ? { requestId: ids.requestId } : {}),
      ...(ids.jobId !== undefined ? { jobId: ids.jobId } : {}),
      error: {
        kind,
        name: sanitized.name,
        ...(sanitized.code !== undefined ? { code: sanitized.code } : {}),
        stack: sanitized.stack
      }
    });
  }

  function idOf(raw: unknown, key: "requestId" | "jobId"): string | undefined {
    const id =
      typeof raw === "object" && raw !== null
        ? (raw as Record<string, unknown>)[key]
        : undefined;

    return (key === "requestId" ? isSafeRequestId(id) : isSafeJobId(id))
      ? (id as string)
      : undefined;
  }

  function sendProgress(
    job: Job,
    stage: JapaneseLintWorkerProgressStage,
    processedChars: number
  ): void {
    deps.send({
      type: "progress",
      jobId: job.jobId,
      stage,
      processedChars,
      totalChars: job.source.length
    });
  }

  function sendCanceled(job: Job): void {
    deps.send({
      type: "canceled",
      ...(job.cancelRequestId !== undefined
        ? { requestId: job.cancelRequestId }
        : {}),
      jobId: job.jobId
    });
  }

  async function runJob(job: Job): Promise<void> {
    const startedAt = now();

    if (job.canceled) {
      sendCanceled(job);

      return;
    }

    sendProgress(job, "dictionary-check", 0);

    if (!(await deps.dictionaryExists(dictionaryPath))) {
      // Never enter textlint without its dictionary.
      sendError("dictionary-missing", undefined, {
        requestId: job.requestId,
        jobId: job.jobId
      });

      return;
    }

    // A job runs with the config it STARTED with; an updateConfig arriving
    // meanwhile only affects later jobs.
    const snapshot = config;

    sendProgress(job, "lint-running", 0);

    let messages: readonly JapaneseLintDiagnostic[];

    try {
      messages =
        snapshot === null || snapshot.rules.length === 0
          ? [] // every rule off: nothing to check, textlint is not started
          : await deps.lint(job.source, {
              format: job.format,
              ext: job.ext,
              rules: snapshot.rules
            });
    } catch (error) {
      sendError("lint-failed", error, {
        requestId: job.requestId,
        jobId: job.jobId
      });

      return;
    }

    if (job.canceled) {
      // Canceled while running: the result is dropped, never delivered.
      sendCanceled(job);

      return;
    }

    const capped = messages.slice(0, JAPANESE_LINT_MAX_RESULT_COUNT);

    sendProgress(job, "completed", job.source.length);
    deps.send({
      type: "lint-result",
      requestId: job.requestId,
      jobId: job.jobId,
      result: {
        ok: true,
        messages: capped.map((message) => ({
          ruleId: message.ruleId,
          severity: message.severity,
          message: message.message,
          line: message.line,
          column: message.column,
          index: message.index
        })),
        totalMessages: messages.length,
        maxMessages: JAPANESE_LINT_MAX_RESULT_COUNT,
        truncated: messages.length > JAPANESE_LINT_MAX_RESULT_COUNT,
        elapsedMs: Math.max(0, Math.round(now() - startedAt)),
        sourceChars: job.source.length,
        sourceLines: countLines(job.source)
      }
    });
  }

  // Runs queued jobs one after another. Never throws and never runs twice.
  async function drain(): Promise<void> {
    if (draining) {
      return;
    }

    draining = true;

    try {
      for (let job = queue.shift(); job !== undefined; job = queue.shift()) {
        running = job;

        try {
          await runJob(job);
        } catch (error) {
          try {
            sendError("internal", error, {
              requestId: job.requestId,
              jobId: job.jobId
            });
          } catch {
            /* the port is gone; nothing left to tell */
          }
        }

        running = null;
      }
    } finally {
      running = null;
      draining = false;
    }
  }

  async function handleMessage(raw: unknown): Promise<void> {
    try {
      const request = parseJapaneseLintWorkerRequest(raw);

      if (request === null) {
        sendError("invalid-message", undefined, {
          requestId: idOf(raw, "requestId"),
          jobId: idOf(raw, "jobId")
        });

        return;
      }

      switch (request.type) {
        case "init": {
          if (!(await deps.dictionaryExists(request.dictionaryPath))) {
            sendError("dictionary-missing", undefined, {
              requestId: request.requestId
            });

            return;
          }

          dictionaryPath = request.dictionaryPath;
          config = request.config;
          deps.setDictionaryPath(request.dictionaryPath);
          state = "ready";
          deps.send({ type: "ready", requestId: request.requestId });

          return;
        }
        case "ping": {
          if (state !== "ready") {
            sendError("not-initialized", undefined, {
              requestId: request.requestId
            });

            return;
          }

          deps.send({ type: "pong", requestId: request.requestId });

          return;
        }
        case "updateConfig": {
          if (state !== "ready") {
            sendError("not-initialized", undefined, {
              requestId: request.requestId
            });

            return;
          }

          config = request.config;
          deps.send({ type: "config-updated", requestId: request.requestId });

          return;
        }
        case "lintDocument": {
          if (state !== "ready") {
            sendError("not-initialized", undefined, {
              requestId: request.requestId,
              jobId: request.jobId
            });

            return;
          }

          const job: Job = {
            requestId: request.requestId,
            jobId: request.jobId,
            source: request.source,
            format: request.format,
            ext: request.ext,
            canceled: false
          };

          queue.push(job);
          sendProgress(job, "queued", 0);
          // Not awaited: the loop must stay free to receive a cancel.
          void drain();

          return;
        }
        case "cancel": {
          const queuedIndex = queue.findIndex(
            (job) => job.jobId === request.jobId
          );

          if (queuedIndex >= 0) {
            const [job] = queue.splice(queuedIndex, 1);

            if (job !== undefined) {
              job.canceled = true;
              job.cancelRequestId = request.requestId;
              sendCanceled(job);
            }

            return;
          }

          if (running !== null && running.jobId === request.jobId) {
            // textlint cannot be stopped mid-run: mark it; the result is
            // dropped (and `canceled` sent) when it finishes.
            running.canceled = true;
            running.cancelRequestId = request.requestId;

            return;
          }

          // Unknown / already finished: cancel is idempotent.
          deps.send({
            type: "canceled",
            requestId: request.requestId,
            jobId: request.jobId
          });

          return;
        }
        case "shutdown": {
          const alreadyStopping = state === "stopping";

          state = "stopping";

          // Jobs that never started are canceled, not silently dropped.
          for (const job of queue.splice(0)) {
            job.canceled = true;
            sendCanceled(job);
          }

          deps.send({
            type: "shutdown-complete",
            requestId: request.requestId
          });

          // A repeated shutdown is answered but never exits twice.
          if (!alreadyStopping) {
            deps.exit(0);
          }

          return;
        }
      }
    } catch (error) {
      sendError("internal", error, {
        requestId: idOf(raw, "requestId"),
        jobId: idOf(raw, "jobId")
      });
    }
  }

  return {
    handleMessage,
    reportError(kind, error) {
      try {
        sendError(kind, error);
      } catch {
        /* the port is gone; nothing left to tell */
      }
    },
    reportFatal(kind, error) {
      try {
        sendError(kind, error);
      } finally {
        deps.exit(1);
      }
    }
  };
}
