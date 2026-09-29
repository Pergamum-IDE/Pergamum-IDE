import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent
} from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { JAPANESE_MACHINE_CHECK_CHANNELS } from "../shared/api";
import { t, type Language } from "../shared/i18n";
import type { JapaneseLintDiagnostic } from "../shared/japaneseLint";
import {
  estimateJapaneseMachineCheck,
  japaneseMachineCheckFormatForPath,
  parseJapaneseMachineCheckRequest,
  parseJapaneseMachineCheckResultId,
  type JapaneseMachineCheckFailureReason,
  type JapaneseMachineCheckPrepareResult,
  type JapaneseMachineCheckProgress,
  type JapaneseMachineCheckRunResult,
  type JapaneseMachineCheckSaveReportResult
} from "../shared/japaneseMachineCheck";
import { japaneseLintRuleIds } from "../shared/japaneseLintRules";
import { buildJapaneseStyleCheckReport } from "../shared/japaneseStyleCheckReport";
import { buildJapaneseLintWorkerConfig } from "../shared/japaneseLintWorkerProtocol";
import { isProtectedPergamumDataFilePath } from "../shared/saveTargetPolicy";
import { writeFileAtomic } from "./atomicFileWrite";
import { getDebugLogger, type DebugLogger } from "./debugLogger";
import { decodeMarkdownBytes } from "./markdownFileIo";
import { currentProjectRootPath } from "./projectIpc";
import { loadSettings } from "./settingsStore";
import { decodeTextFileBytes, type DecodeTextFileBytesResult } from "./textFileIo";
import type { JapaneseLintHost } from "./linterWorker/japaneseLintHost";
import { createElectronJapaneseLintHost } from "./linterWorker/japaneseLintHostElectron";

/**
 * #625 P2a: the "日本語表現チェック" wizard (prepare / run / cancel).
 *
 * - Only the SAVED content of a project file is checked (the wizard warns
 *   when the editor holds unsaved changes). The Renderer sends a
 *   project-relative path; the project root and the file read stay here.
 * - The lint runs in a Worker of its own, forked when a run starts and
 *   disposed when it ends (finished, canceled or failed). It is deliberately
 *   NOT the instant linter's Worker: a long run neither queues behind nor
 *   blocks the instant check, and canceling it (which ends the process, since
 *   textlint cannot be interrupted) cannot disturb the instant check either.
 * - Only counts come back. Nothing here throws to the Renderer, and nothing
 *   about the text, file name or path is logged.
 */

export interface JapaneseMachineCheckDeps {
  createHost(getSettings: () => unknown): JapaneseLintHost;
  currentProjectRootPath(): string | null;
  /** The stored `japaneseLint` settings. */
  settingsProvider(): Promise<unknown>;
  /** The stored `textFiles.encoding`. */
  textEncodingProvider(): Promise<string>;
  readFile(absolutePath: string): Promise<Uint8Array>;
  /**
   * #625 P2b: the OS save dialog. Resolves the chosen path, or null when the
   * user canceled. The Renderer never supplies a path.
   */
  showSaveDialog(defaultPath: string, owner?: unknown): Promise<string | null>;
  /** Writes the (UTF-8) report. */
  writeReport(absolutePath: string, content: string): Promise<void>;
  /** UI language for the report wording. */
  languageProvider(): Promise<Language>;
  now?(): Date;
  logger: Pick<DebugLogger, "log">;
}

export interface JapaneseMachineCheckService {
  /** #625 P2b: saves the Markdown report of the last finished run. */
  saveReport(
    rawRequest: unknown,
    owner?: unknown
  ): Promise<JapaneseMachineCheckSaveReportResult>;
  /** Forgets the kept findings/text of a finished run (dialog closed). */
  discardResult(rawRequest: unknown): Promise<void>;
  prepare(rawRequest: unknown): Promise<JapaneseMachineCheckPrepareResult>;
  run(
    rawRequest: unknown,
    onProgress?: (progress: JapaneseMachineCheckProgress) => void
  ): Promise<JapaneseMachineCheckRunResult>;
  /** Safe to call any number of times; a no-op when nothing is running. */
  cancel(): Promise<void>;
  /** App quit: stops a run in flight and its Worker. */
  dispose(): Promise<void>;
}

/**
 * What a finished run keeps, in the Main Process only, so the report can be
 * built on request. Replaced by the next run, dropped on discard / quit.
 */
interface FinishedRun {
  readonly resultId: string;
  readonly absolutePath: string;
  readonly fileName: string;
  readonly sourceText: string;
  readonly messages: readonly JapaneseLintDiagnostic[];
  readonly totalMessages: number;
  readonly truncated: boolean;
  readonly executedAt: Date;
}

interface LoadedSource {
  readonly absolutePath: string;
  readonly fileName: string;
  readonly ext: string;
  readonly format: "markdown" | "text";
  readonly lintExt: ".md" | ".markdown" | ".txt";
  readonly text: string;
}

function countLines(text: string): number {
  let lines = 1;

  for (let index = text.indexOf("\n"); index !== -1; ) {
    lines += 1;
    index = text.indexOf("\n", index + 1);
  }

  return lines;
}

/** `relativePath` inside `root`, or null when it escapes or is not a path. */
export function resolveInsideProject(
  root: string,
  relativePath: string
): string | null {
  if (path.isAbsolute(relativePath)) {
    return null;
  }

  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), absolute);

  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    return null;
  }

  return absolute;
}

function decodeText(bytes: Uint8Array, encoding: string): string {
  const tryDecode = (value: string): DecodeTextFileBytesResult =>
    decodeTextFileBytes(bytes, value as never);

  try {
    return tryDecode(encoding).content;
  } catch (error) {
    // Same fallback as opening a .txt in the editor.
    if (encoding === "utf8" || encoding === "utf8Bom") {
      return tryDecode("shiftJis").content;
    }

    throw error;
  }
}

export function createJapaneseMachineCheckService(
  deps: JapaneseMachineCheckDeps
): JapaneseMachineCheckService {
  let active: {
    readonly host: JapaneseLintHost;
    readonly jobId: string;
    canceled: boolean;
  } | null = null;
  // Set while a run is between "accepted" and "Worker gone".
  let running = false;
  // A cancel that arrives before the Worker exists (still reading the file).
  let cancelRequested = false;
  // #625 P2b: the last finished run, for the Markdown report.
  let lastRun: FinishedRun | null = null;

  const reportLog = (
    details: Record<string, unknown>,
    level: "debug" | "warn" = "debug"
  ): void => {
    try {
      deps.logger.log({
        level,
        event: "japaneseLint.run.completed",
        details: { linterMode: "wizard-report", ...details } as never
      });
    } catch {
      /* diagnostics only */
    }
  };

  const log = (
    details: Record<string, unknown>,
    level: "debug" | "warn" = "debug"
  ): void => {
    try {
      deps.logger.log({
        level,
        event: "japaneseLint.run.completed",
        details: { linterMode: "wizard", ...details } as never
      });
    } catch {
      /* diagnostics only */
    }
  };

  async function load(
    rawRequest: unknown
  ): Promise<
    | { readonly ok: true; readonly source: LoadedSource; readonly isDirty: boolean }
    | { readonly ok: false; readonly reason: JapaneseMachineCheckFailureReason }
  > {
    const request = parseJapaneseMachineCheckRequest(rawRequest);

    if (request === null) {
      return { ok: false, reason: "invalid-request" };
    }

    const format = japaneseMachineCheckFormatForPath(request.relativePath);

    if (format === null) {
      return { ok: false, reason: "unsupported-file" };
    }

    const root = deps.currentProjectRootPath();

    if (root === null) {
      return { ok: false, reason: "no-project" };
    }

    const absolute = resolveInsideProject(root, request.relativePath);

    if (absolute === null) {
      return { ok: false, reason: "invalid-request" };
    }

    try {
      const bytes = await deps.readFile(absolute);
      const lower = absolute.toLowerCase();
      const raw =
        format === "text"
          ? decodeText(bytes, await deps.textEncodingProvider())
          : decodeMarkdownBytes(bytes).content;
      const lintExt = lower.endsWith(".txt")
        ? ".txt"
        : lower.endsWith(".markdown")
          ? ".markdown"
          : ".md";

      return {
        ok: true,
        isDirty: request.isDirty === true,
        source: {
          absolutePath: absolute,
          fileName: path.basename(absolute),
          ext: lintExt,
          format,
          lintExt,
          // The editor works on "\n"; so does the check.
          text: raw.replace(/\r\n?/g, "\n")
        }
      };
    } catch {
      return { ok: false, reason: "read-failed" };
    }
  }

  async function readSettings(): Promise<unknown> {
    try {
      return await deps.settingsProvider();
    } catch {
      return undefined;
    }
  }

  async function prepare(
    rawRequest: unknown
  ): Promise<JapaneseMachineCheckPrepareResult> {
    try {
      const loaded = await load(rawRequest);

      if (!loaded.ok) {
        return loaded;
      }

      const config = buildJapaneseLintWorkerConfig(await readSettings());
      const sourceChars = loaded.source.text.length;

      return {
        ok: true,
        fileName: loaded.source.fileName,
        ext: loaded.source.ext,
        format: loaded.source.format,
        sourceChars,
        sourceLines: countLines(loaded.source.text),
        isDirty: loaded.isDirty,
        enabledRuleIds: config.enabledRuleIds,
        estimate: estimateJapaneseMachineCheck(sourceChars)
      };
    } catch {
      return { ok: false, reason: "read-failed" };
    }
  }

  async function run(
    rawRequest: unknown,
    onProgress?: (progress: JapaneseMachineCheckProgress) => void
  ): Promise<JapaneseMachineCheckRunResult> {
    if (running) {
      return { ok: false, reason: "busy" };
    }

    running = true;
    cancelRequested = false;
    // A new run replaces the kept result of the previous one.
    lastRun = null;

    const startedAt = Date.now();
    const notify = (progress: JapaneseMachineCheckProgress): void => {
      try {
        onProgress?.(progress);
      } catch {
        /* a progress listener must not break the run */
      }
    };
    let host: JapaneseLintHost | null = null;

    try {
      notify({ stage: "starting" });

      const loaded = await load(rawRequest);

      if (!loaded.ok) {
        log({ result: "failed", failureReason: "read-failed" });

        return loaded;
      }

      const stored = await readSettings();
      const config = buildJapaneseLintWorkerConfig(stored);

      if (config.rules.length === 0) {
        return { ok: false, reason: "no-rules" };
      }

      const { source } = loaded;

      host = deps.createHost(() => stored);

      const jobId = host.createJobId();

      active = { host, jobId, canceled: cancelRequested };

      const state = active;

      if (state.canceled) {
        return { ok: false, reason: "canceled" };
      }

      await host.start();

      if (state.canceled) {
        return { ok: false, reason: "canceled" };
      }

      const outcome = await host.lintDocument({
        source: source.text,
        format: source.format,
        ext: source.lintExt,
        jobId,
        onProgress: (progress) => {
          if (
            progress.stage === "dictionary-check" ||
            progress.stage === "lint-running"
          ) {
            notify({ stage: progress.stage });
          }
        }
      });

      // A canceled run never becomes a summary, whatever the Worker sent.
      if (state.canceled) {
        return { ok: false, reason: "canceled" };
      }

      if (!outcome.ok) {
        log(
          {
            result: "failed",
            failureReason: outcome.reason,
            characterLength: source.text.length,
            lineCount: countLines(source.text),
            lintFormat: source.format,
            extension: source.lintExt,
            enabledRuleIds: config.enabledRuleIds,
            durationMs: Date.now() - startedAt
          },
          "warn"
        );

        return {
          ok: false,
          reason: outcome.reason === "canceled" ? "canceled" : "lint-failed"
        };
      }

      notify({ stage: "aggregating" });

      const counts = new Map<string, number>();

      for (const message of outcome.messages) {
        counts.set(message.ruleId, (counts.get(message.ruleId) ?? 0) + 1);
      }

      // Catalog order; ids outside the catalog (should not happen) last.
      const known: readonly string[] = japaneseLintRuleIds;
      const ruleCounts = [
        ...known.filter((id) => counts.has(id)),
        ...[...counts.keys()].filter((id) => !known.includes(id))
      ].map((ruleId) => ({ ruleId, count: counts.get(ruleId) ?? 0 }));

      log({
        result: "succeeded",
        characterLength: source.text.length,
        lineCount: countLines(source.text),
        lintFormat: source.format,
        extension: source.lintExt,
        totalMessages: outcome.totalMessages,
        returnedMessages: outcome.messages.length,
        truncated: outcome.truncated,
        enabledRuleIds: config.enabledRuleIds,
        durationMs: Date.now() - startedAt
      });

      // The findings and the checked text stay here for the report.
      lastRun = {
        resultId: jobId,
        absolutePath: source.absolutePath,
        fileName: source.fileName,
        sourceText: source.text,
        messages: outcome.messages,
        totalMessages: outcome.totalMessages,
        truncated: outcome.truncated,
        executedAt: deps.now?.() ?? new Date()
      };

      return {
        ok: true,
        summary: {
          resultId: jobId,
          fileName: source.fileName,
          totalMessages: outcome.totalMessages,
          returnedMessages: outcome.messages.length,
          truncated: outcome.truncated,
          sourceChars: source.text.length,
          sourceLines: countLines(source.text),
          elapsedMs: Date.now() - startedAt,
          ruleCounts
        }
      };
    } catch {
      log({ result: "failed", failureReason: "worker-failed" }, "warn");

      return {
        ok: false,
        reason: active?.canceled ? "canceled" : "worker-failed"
      };
    } finally {
      const workerHost = host;

      active = null;
      running = false;

      if (workerHost !== null) {
        void workerHost.dispose().catch(() => undefined);
      }
    }
  }

  async function saveReport(
    rawRequest: unknown,
    owner?: unknown
  ): Promise<JapaneseMachineCheckSaveReportResult> {
    const startedAt = Date.now();
    const resultId = parseJapaneseMachineCheckResultId(rawRequest);
    const run = lastRun;

    // Only a finished run of this session can be saved, and only by its id.
    if (resultId === null || run === null || run.resultId !== resultId) {
      reportLog({ result: "failed", failureReason: "not-ready" });

      return { ok: false, reason: "not-ready" };
    }

    const counts = {
      totalMessages: run.totalMessages,
      returnedMessages: run.messages.length,
      truncated: run.truncated
    };

    try {
      const defaultPath = path.join(
        path.dirname(run.absolutePath),
        `${run.fileName}.lint.md`
      );
      const chosen = await deps.showSaveDialog(defaultPath, owner);

      if (chosen === null) {
        reportLog({
          result: "ignored",
          failureReason: "canceled",
          ...counts,
          workerJobId: run.resultId,
          durationMs: Date.now() - startedAt
        });

        return { ok: false, reason: "canceled" };
      }

      // Never overwrite the checked manuscript or a Pergamum data file.
      const sameAsSource =
        path.resolve(chosen).toLowerCase() ===
        path.resolve(run.absolutePath).toLowerCase();

      if (
        sameAsSource ||
        isProtectedPergamumDataFilePath(chosen) ||
        /^pergamum\.(db|json)(-wal|-shm|-journal)?$/i.test(path.basename(chosen))
      ) {
        reportLog({
          result: "failed",
          failureReason: "invalid-target",
          ...counts,
          workerJobId: run.resultId,
          durationMs: Date.now() - startedAt
        });

        return { ok: false, reason: "invalid-target" };
      }

      const language = await deps.languageProvider().catch(() => "ja" as Language);
      const content = buildJapaneseStyleCheckReport({
        fileName: run.fileName,
        executedAt: run.executedAt,
        totalMessages: run.totalMessages,
        returnedMessages: run.messages.length,
        truncated: run.truncated,
        sourceText: run.sourceText,
        messages: run.messages,
        translate: (key, values) => t(language, key, values),
        numberLocale: language === "ja" ? "ja-JP" : "en-US"
      });

      await deps.writeReport(chosen, content);
      reportLog({
        result: "succeeded",
        ...counts,
        workerJobId: run.resultId,
        durationMs: Date.now() - startedAt
      });

      return { ok: true, fileName: path.basename(chosen) };
    } catch {
      reportLog(
        {
          result: "failed",
          failureReason: "write-failed",
          ...counts,
          workerJobId: run.resultId,
          durationMs: Date.now() - startedAt
        },
        "warn"
      );

      return { ok: false, reason: "write-failed" };
    }
  }

  async function discardResult(rawRequest: unknown): Promise<void> {
    const resultId = parseJapaneseMachineCheckResultId(rawRequest);

    if (lastRun !== null && (resultId === null || lastRun.resultId === resultId)) {
      lastRun = null;
    }
  }

  async function cancel(): Promise<void> {
    const current = active;

    if (current === null) {
      cancelRequested = running;

      return;
    }

    if (current.canceled) {
      return;
    }

    current.canceled = true;

    try {
      // Answers the running lintDocument at once; the Host ends the Worker if
      // textlint does not acknowledge in time. run()'s finally disposes it.
      await current.host.cancel(current.jobId);
    } catch {
      /* the Worker is disposed by run() either way */
    }
  }

  async function dispose(): Promise<void> {
    lastRun = null;
    await cancel();
  }

  return { prepare, run, cancel, dispose, saveReport, discardResult };
}

let service: JapaneseMachineCheckService | null = null;

function getService(): JapaneseMachineCheckService {
  service ??= createJapaneseMachineCheckService({
    createHost: (getSettings) =>
      createElectronJapaneseLintHost({ logger: getDebugLogger(), getSettings }),
    currentProjectRootPath,
    settingsProvider: async () => (await loadSettings()).japaneseLint,
    textEncodingProvider: async () =>
      (await loadSettings())?.textFiles?.encoding ?? "utf8",
    readFile: (absolutePath) => fs.readFile(absolutePath),
    showSaveDialog: async (defaultPath, owner) => {
      const options: Electron.SaveDialogOptions = {
        title: "日本語表現チェック",
        defaultPath,
        filters: [
          { name: "Markdown Files", extensions: ["md"] },
          { name: "All Files", extensions: ["*"] }
        ]
      };
      const result =
        owner instanceof BrowserWindow
          ? await dialog.showSaveDialog(owner, options)
          : await dialog.showSaveDialog(options);

      return result.canceled || !result.filePath ? null : result.filePath;
    },
    writeReport: (absolutePath, content) => writeFileAtomic(absolutePath, content),
    languageProvider: async () =>
      (await loadSettings()).workbench.language as Language,
    logger: getDebugLogger()
  });

  return service;
}

/** App quit. Never rejects. */
export function disposeJapaneseMachineCheck(): Promise<void> {
  return service === null ? Promise.resolve() : service.dispose().catch(() => undefined);
}

export function registerJapaneseMachineCheckIpc(): void {
  ipcMain.handle(
    JAPANESE_MACHINE_CHECK_CHANNELS.prepare,
    async (_event, rawRequest) => getService().prepare(rawRequest)
  );
  ipcMain.handle(
    JAPANESE_MACHINE_CHECK_CHANNELS.run,
    async (event: IpcMainInvokeEvent, rawRequest) =>
      getService().run(rawRequest, (progress) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(JAPANESE_MACHINE_CHECK_CHANNELS.progress, progress);
        }
      })
  );
  ipcMain.handle(JAPANESE_MACHINE_CHECK_CHANNELS.cancel, async () => {
    await getService().cancel();
  });
  ipcMain.handle(
    JAPANESE_MACHINE_CHECK_CHANNELS.saveReport,
    async (event: IpcMainInvokeEvent, rawRequest) =>
      getService().saveReport(
        rawRequest,
        BrowserWindow.fromWebContents(event.sender) ?? undefined
      )
  );
  ipcMain.handle(
    JAPANESE_MACHINE_CHECK_CHANNELS.discardResult,
    async (_event, rawRequest) => {
      await getService().discardResult(rawRequest);
    }
  );
}
