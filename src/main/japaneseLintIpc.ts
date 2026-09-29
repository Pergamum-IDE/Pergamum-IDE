import { app, ipcMain } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { JAPANESE_LINT_CHANNELS } from "../shared/api";
import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  isJapaneseLintSourceTooLarge,
  parseJapaneseLintRequest,
  type JapaneseLintRequest,
  type JapaneseLintResponse
} from "../shared/japaneseLint";
import { enabledJapaneseLintRules } from "../shared/japaneseLintRules";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import { loadSettings } from "./settingsStore";
import { withJapaneseLintRejectionGuard } from "./japaneseLintRejectionGuard";
import { lintJapanese } from "./textlint/japaneseLintEngine";

/**
 * #625: runs the Japanese lint engine for a Renderer request. The request is
 * validated (untrusted input) and only serializable diagnostics come back;
 * `fix` suggestions are deliberately not sent (no auto-fix in this slice).
 *
 * Documents longer than JAPANESE_LINT_MAX_SOURCE_LENGTH are skipped
 * (`too-large`) without touching textlint: it runs on the Main Process and
 * its cost grows faster than linearly, so a novel-sized text would freeze the
 * window ("Not responding"). At most JAPANESE_LINT_MAX_RESULT_COUNT
 * diagnostics are returned (`truncated`). Body text is never logged - only
 * sizes, timings and counts.
 *
 * This handler never rejects: every failure - including a missing kuromoji
 * dictionary - becomes `{ ok: false }`, and the engine call runs inside the
 * rejection guard so a rejection leaking out of textlint cannot terminate the
 * app (see japaneseLintRejectionGuard.ts).
 */

// kuromoji reads its dictionary from disk at runtime. textlint's
// kuromojin resolves the location with `require.resolve("kuromoji")`, which
// does not work in the packaged app (only whitelisted node_modules are
// shipped - see forge.config.js), so the dictionary directory is pinned
// explicitly via kuromojin's own KUROMOJIN_DIC_PATH override.
const dictionaryProbeFile = "base.dat.gz";

export interface JapaneseLintDictionary {
  /** Directory holding kuromoji's dictionary files. */
  readonly directory: string;
}

export function resolveJapaneseLintDictionaryDirectory(
  appPath: string = app.getAppPath()
): string {
  return path.join(appPath, "node_modules", "kuromoji", "dict");
}

let dictionaryCheck: Promise<boolean> | null = null;

/**
 * Pins KUROMOJIN_DIC_PATH and verifies the dictionary is actually readable.
 * A negative result is not cached forever-lost: it is re-checked on the next
 * request only if the previous check failed.
 */
export function ensureJapaneseLintDictionary(
  directory: string = resolveJapaneseLintDictionaryDirectory()
): Promise<boolean> {
  if (dictionaryCheck === null) {
    dictionaryCheck = (async () => {
      try {
        await fs.access(path.join(directory, dictionaryProbeFile));
        process.env.KUROMOJIN_DIC_PATH = directory;

        return true;
      } catch {
        return false;
      }
    })().then((available) => {
      if (!available) {
        dictionaryCheck = null;
      }

      return available;
    });
  }

  return dictionaryCheck;
}

/** Test helper: forget the cached dictionary check. */
export function resetJapaneseLintDictionaryCheck(): void {
  dictionaryCheck = null;
}

function countLines(text: string): number {
  let lines = 1;

  for (let index = text.indexOf("\n"); index !== -1; ) {
    lines += 1;
    index = text.indexOf("\n", index + 1);
  }

  return lines;
}

/**
 * Supplies the stored `japaneseLint` settings (Application Settings) for a
 * request. Read fresh on every request so a change in Settings applies to the
 * very next lint; a failure to read falls back to the catalog defaults.
 */
export type JapaneseLintSettingsProvider = () => Promise<unknown>;

const loadStoredJapaneseLintSettings: JapaneseLintSettingsProvider = async () =>
  (await loadSettings()).japaneseLint;

export async function handleJapaneseLintRequest(
  rawRequest: unknown,
  logger: DebugLogger = getDebugLogger(),
  settingsProvider: JapaneseLintSettingsProvider = loadStoredJapaneseLintSettings
): Promise<JapaneseLintResponse> {
  const startedAt = Date.now();
  let request: JapaneseLintRequest | null = null;

  // Logging must never throw into the handler.
  const logRun = (
    result: "succeeded" | "failed" | "ignored",
    extra: { reason?: "too_large" | "lint_failed" | "validation_failed"; count?: number }
  ): void => {
    try {
      logger.log({
        level: "debug",
        event: "japaneseLint.run.completed",
        details: {
          result,
          ...extra,
          ...(request
            ? {
                characterLength: request.text.length,
                lineCount: countLines(request.text),
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

    // Too large for the Main Process: skip before doing any work.
    if (isJapaneseLintSourceTooLarge(request.text.length)) {
      logRun("ignored", { reason: "too_large" });

      return { ok: false, reason: "too-large" };
    }

    let storedSettings: unknown;

    try {
      storedSettings = await settingsProvider();
    } catch {
      storedSettings = undefined;
    }

    const rules = enabledJapaneseLintRules(storedSettings);

    // Every rule switched off: nothing to check, so textlint (and its
    // dictionary) is not started at all.
    if (rules.length === 0) {
      logRun("succeeded", { count: 0 });

      return { ok: true, diagnostics: [], truncated: false };
    }

    // Without the dictionary textlint's rules fail deep inside promise chains
    // we cannot await, so do not enter the engine at all.
    if (!(await ensureJapaneseLintDictionary())) {
      logRun("failed", { reason: "lint_failed" });

      return { ok: false, reason: "lint-failed" };
    }

    const { format, text, ext } = request;
    const messages = await withJapaneseLintRejectionGuard(() =>
      format === "markdown"
        ? lintJapanese(text, {
            format: "markdown",
            ext: ext === ".markdown" ? ".markdown" : ".md",
            rules
          })
        : lintJapanese(text, { format: "text", ext: ".txt", rules })
    );
    const truncated = messages.length > JAPANESE_LINT_MAX_RESULT_COUNT;

    logRun("succeeded", { count: messages.length });

    return {
      ok: true,
      // The engine returns messages in position order, so the cut keeps the
      // earliest ones.
      diagnostics: messages
        .slice(0, JAPANESE_LINT_MAX_RESULT_COUNT)
        .map((message) => ({
          ruleId: message.ruleId,
          severity: message.severity,
          message: message.message,
          line: message.line,
          column: message.column,
          index: message.index
        })),
      truncated
    };
  } catch {
    logRun("failed", { reason: "lint_failed" });

    return { ok: false, reason: "lint-failed" };
  }
}

export function registerJapaneseLintIpc(): void {
  ipcMain.handle(JAPANESE_LINT_CHANNELS.lint, async (_event, rawRequest) =>
    handleJapaneseLintRequest(rawRequest)
  );
}
