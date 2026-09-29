import { ipcMain } from "electron";
import { JAPANESE_LINT_CHANNELS } from "../shared/api";
import {
  parseJapaneseLintRequest,
  type JapaneseLintRequest,
  type JapaneseLintResponse
} from "../shared/japaneseLint";
import { buildJapaneseLintWorkerConfig } from "../shared/japaneseLintWorkerProtocol";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import { loadSettings } from "./settingsStore";
import type { JapaneseLintHost } from "./linterWorker/japaneseLintHost";
import { createElectronJapaneseLintHost } from "./linterWorker/japaneseLintHostElectron";

/**
 * #625: the instant Japanese expression check. The request is validated
 * (untrusted input) and the lint itself runs in the utilityProcess Worker
 * (see linterWorker/), never in the Main Process: textlint's cost grows
 * faster than linearly and would otherwise freeze the window.
 *
 * The Renderer contract is unchanged: `{ ok: true, diagnostics, truncated }`
 * or `{ ok: false, reason }`. Every Worker failure (worker-failed,
 * dictionary-missing, lint-failed, canceled) folds into `lint-failed`, so the
 * Renderer just clears its markers. This handler never rejects.
 *
 * Lifecycle: the Worker starts lazily on the first lint that has something to
 * run (a document of any length: there is no size limit, the Worker keeps
 * the Main Process free) and is reused afterwards. `release()` (Linter OFF, project close, app
 * quit) disposes it; the next lint starts a fresh one. Body text is never
 * logged - only sizes, timings and counts.
 */

/** Supplies the stored `japaneseLint` settings; read fresh per request. */
export type JapaneseLintSettingsProvider = () => Promise<unknown>;

const loadStoredJapaneseLintSettings: JapaneseLintSettingsProvider = async () =>
  (await loadSettings()).japaneseLint;

export interface InstantJapaneseLintDeps {
  createHost(getSettings: () => unknown): JapaneseLintHost;
  settingsProvider: JapaneseLintSettingsProvider;
  logger: Pick<DebugLogger, "log">;
}

export interface InstantJapaneseLintService {
  lint(rawRequest: unknown): Promise<JapaneseLintResponse>;
  /** Linter OFF / project close / app quit: stops the Worker. Never rejects. */
  release(): Promise<void>;
}

function countLines(text: string): number {
  let lines = 1;

  for (let index = text.indexOf("\n"); index !== -1; ) {
    lines += 1;
    index = text.indexOf("\n", index + 1);
  }

  return lines;
}

type LintStage = "queued" | "dictionary-check" | "lint-running" | "completed";

export function createInstantJapaneseLintService(
  deps: InstantJapaneseLintDeps
): InstantJapaneseLintService {
  let host: JapaneseLintHost | null = null;
  // The settings the running Worker was last given (init or updateConfig).
  let appliedConfigKey: string | null = null;
  // The settings the current request read; also what a (re)start inits with.
  let latestStored: unknown;
  // Jobs of this Instant Linter session that the Worker has not begun yet.
  const jobStages = new Map<string, LintStage>();

  const cancelSuperseded = (activeHost: JapaneseLintHost): void => {
    for (const [jobId, stage] of jobStages) {
      // A job textlint is already running cannot be interrupted; cancelling
      // it would end the whole Worker (and the new job with it). Its result
      // is simply discarded by the Renderer's stale-result guard.
      if (stage === "queued" || stage === "dictionary-check") {
        jobStages.delete(jobId);
        void activeHost.cancel(jobId).catch(() => undefined);
      }
    }
  };

  const lint = async (rawRequest: unknown): Promise<JapaneseLintResponse> => {
    const startedAt = Date.now();
    let request: JapaneseLintRequest | null = null;

    // Logging must never throw into the handler.
    const logRun = (
      result: "succeeded" | "failed",
      extra: {
        reason?: "lint_failed" | "validation_failed";
        count?: number;
        failureReason?: "dictionary-missing" | "lint-failed" | "canceled" | "worker-failed";
        enabledRuleIds?: readonly string[];
        truncated?: boolean;
      }
    ): void => {
      try {
        const { count, ...rest } = extra;

        deps.logger.log({
          level: "debug",
          event: "japaneseLint.run.completed",
          details: {
            linterMode: "instant-worker",
            result,
            ...rest,
            ...(count !== undefined
              ? { count, totalMessages: count, returnedMessages: count }
              : {}),
            ...(request
              ? {
                  characterLength: request.text.length,
                  lineCount: countLines(request.text),
                  lintFormat: request.format,
                  extension: request.ext
                }
              : {}),
            durationMs: Date.now() - startedAt
          }
        });
      } catch {
        /* diagnostics only */
      }
    };

    try {
      request = parseJapaneseLintRequest(rawRequest);

      if (request === null) {
        logRun("failed", { reason: "validation_failed" });

        return { ok: false, reason: "invalid-request" };
      }

      try {
        latestStored = await deps.settingsProvider();
      } catch {
        latestStored = undefined;
      }

      const config = buildJapaneseLintWorkerConfig(latestStored);

      // Every rule switched off: nothing to check, so no Worker is started.
      if (config.rules.length === 0) {
        logRun("succeeded", { count: 0, enabledRuleIds: [] });

        return { ok: true, diagnostics: [], truncated: false };
      }

      if (host === null) {
        host = deps.createHost(() => latestStored);
        appliedConfigKey = null;
      }

      const activeHost = host;
      const configKey = JSON.stringify(config);

      if (activeHost.getState() !== "ready") {
        // (Re)starting inits the Worker with the settings just read.
        await activeHost.start();
        appliedConfigKey = configKey;
      } else if (appliedConfigKey !== configKey) {
        await activeHost.updateConfig(config);
        appliedConfigKey = configKey;
      }

      cancelSuperseded(activeHost);

      const jobId = activeHost.createJobId();

      jobStages.set(jobId, "queued");

      const outcome = await activeHost.lintDocument({
        source: request.text,
        format: request.format,
        ext: request.ext,
        jobId,
        onProgress: (progress) => {
          if (jobStages.has(jobId)) {
            jobStages.set(jobId, progress.stage);
          }
        }
      });

      jobStages.delete(jobId);

      if (!outcome.ok) {
        logRun("failed", {
          reason: "lint_failed",
          failureReason: outcome.reason,
          enabledRuleIds: config.enabledRuleIds
        });

        return { ok: false, reason: "lint-failed" };
      }

      logRun("succeeded", {
        count: outcome.messages.length,
        truncated: outcome.truncated,
        enabledRuleIds: config.enabledRuleIds
      });

      return {
        ok: true,
        diagnostics: outcome.messages.map((message) => ({
          ruleId: message.ruleId,
          severity: message.severity,
          message: message.message,
          line: message.line,
          column: message.column,
          index: message.index
        })),
        truncated: outcome.truncated
      };
    } catch {
      // start() / updateConfig() failing (e.g. a missing Worker bundle).
      logRun("failed", { reason: "lint_failed", failureReason: "worker-failed" });

      return { ok: false, reason: "lint-failed" };
    }
  };

  const release = async (): Promise<void> => {
    const released = host;

    host = null;
    appliedConfigKey = null;
    jobStages.clear();

    if (released === null) {
      return;
    }

    try {
      await released.dispose();
    } catch {
      /* the Worker is being thrown away anyway */
    }
  };

  return { lint, release };
}

let service: InstantJapaneseLintService | null = null;

function getInstantJapaneseLintService(): InstantJapaneseLintService {
  service ??= createInstantJapaneseLintService({
    createHost: (getSettings) =>
      createElectronJapaneseLintHost({
        logger: getDebugLogger(),
        getSettings
      }),
    settingsProvider: loadStoredJapaneseLintSettings,
    logger: getDebugLogger()
  });

  return service;
}

/** Linter OFF / project close / app quit. Safe to call at any time. */
export function releaseJapaneseLintWorker(): Promise<void> {
  return service === null ? Promise.resolve() : service.release();
}

export function registerJapaneseLintIpc(): void {
  ipcMain.handle(JAPANESE_LINT_CHANNELS.lint, async (_event, rawRequest) =>
    getInstantJapaneseLintService().lint(rawRequest)
  );
  ipcMain.handle(JAPANESE_LINT_CHANNELS.release, async () => {
    await releaseJapaneseLintWorker();
  });
}
