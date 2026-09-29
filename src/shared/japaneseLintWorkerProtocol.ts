/**
 * #625 Linter Worker (Electron utilityProcess) message protocol.
 *
 * Host (Main Process) <-> Worker messages travel over a MessagePort. Every
 * request carries a `requestId` (answers are matched by it), and a lint run
 * additionally carries a `jobId` (progress / cancel / result are matched by
 * it). A Host can therefore reject exactly the requests a dying Worker leaves
 * unanswered, and drop the result of a job that was canceled.
 *
 * P1a: init / ping / shutdown. P1b: updateConfig / lintDocument / cancel.
 * The manuscript text travels ONLY inside `lintDocument.source`; it is never
 * echoed back, and errors cross the boundary only in sanitized form (see
 * sanitizeErrorForLog.ts) - never a raw message.
 */

import {
  JAPANESE_LINT_MAX_RESULT_COUNT,
  type JapaneseLintDiagnostic,
  type JapaneseLintExtension,
  type JapaneseLintFormat
} from "./japaneseLint";
import {
  enabledJapaneseLintRules,
  isJapaneseLintRuleId,
  resolveJapaneseLintSettings,
  type EnabledJapaneseLintRule,
  type JapaneseLintRuleId
} from "./japaneseLintRules";

export interface JapaneseLintWorkerConfig {
  /** Ids of the rules switched on, in catalog order. */
  readonly enabledRuleIds: readonly JapaneseLintRuleId[];
  /** Snapshot of the enabled rules with their numeric options. */
  readonly rules: readonly EnabledJapaneseLintRule[];
  readonly debounceMs: number;
  readonly lineCacheLimit: number;
  readonly workerRestartAttempts: number;
}

/** Longest source (UTF-16 units) the Worker accepts in one lintDocument. */
export const JAPANESE_LINT_WORKER_MAX_SOURCE_LENGTH = 50_000_000;

export type JapaneseLintWorkerRequest =
  | {
      readonly type: "init";
      readonly requestId: string;
      readonly dictionaryPath: string;
      readonly config: JapaneseLintWorkerConfig;
    }
  | { readonly type: "ping"; readonly requestId: string }
  | {
      readonly type: "updateConfig";
      readonly requestId: string;
      readonly config: JapaneseLintWorkerConfig;
    }
  | {
      readonly type: "lintDocument";
      readonly requestId: string;
      readonly jobId: string;
      readonly source: string;
      readonly format: JapaneseLintFormat;
      readonly ext: JapaneseLintExtension;
    }
  | {
      readonly type: "cancel";
      readonly requestId: string;
      readonly jobId: string;
    }
  | { readonly type: "shutdown"; readonly requestId: string };

export type JapaneseLintWorkerRequestType =
  JapaneseLintWorkerRequest["type"];

export type JapaneseLintWorkerErrorKind =
  | "invalid-message"
  | "not-initialized"
  | "dictionary-missing"
  | "init-failed"
  | "lint-failed"
  | "uncaught-exception"
  | "unhandled-rejection"
  | "internal";

export interface SanitizedWorkerError {
  readonly kind: JapaneseLintWorkerErrorKind;
  readonly name: string;
  readonly code?: string;
  readonly stack: readonly string[];
}

/** Coarse stages: there is no chunking yet, so there is no smooth progress. */
export type JapaneseLintWorkerProgressStage =
  | "queued"
  | "dictionary-check"
  | "lint-running"
  | "completed";

/** A finished lint. Failures are `error` responses, never a result. */
export interface JapaneseLintWorkerDocumentResult {
  readonly ok: true;
  /** At most `maxMessages`, in position order. */
  readonly messages: readonly JapaneseLintDiagnostic[];
  /** How many messages textlint found before the cap. */
  readonly totalMessages: number;
  readonly maxMessages: number;
  readonly truncated: boolean;
  readonly elapsedMs: number;
  readonly sourceChars: number;
  readonly sourceLines: number;
}

export type JapaneseLintWorkerDocumentFailureReason =
  | "dictionary-missing"
  | "lint-failed"
  | "canceled"
  | "worker-failed";

/** What a Host reports for a lint that did not produce a result. */
export interface JapaneseLintWorkerDocumentFailure {
  readonly ok: false;
  readonly reason: JapaneseLintWorkerDocumentFailureReason;
  readonly elapsedMs?: number;
}

export type JapaneseLintWorkerResponse =
  | { readonly type: "ready"; readonly requestId: string }
  | { readonly type: "pong"; readonly requestId: string }
  | { readonly type: "config-updated"; readonly requestId: string }
  | {
      readonly type: "progress";
      readonly jobId: string;
      readonly stage: JapaneseLintWorkerProgressStage;
      readonly processedChars: number;
      readonly totalChars: number;
    }
  | {
      readonly type: "lint-result";
      readonly requestId: string;
      readonly jobId: string;
      readonly result: JapaneseLintWorkerDocumentResult;
    }
  | {
      readonly type: "canceled";
      readonly requestId?: string;
      readonly jobId: string;
    }
  | { readonly type: "shutdown-complete"; readonly requestId: string }
  | {
      readonly type: "error";
      readonly requestId?: string;
      readonly jobId?: string;
      readonly error: SanitizedWorkerError;
    };

/** The first message on the Host -> Worker channel hands over the port. */
export const JAPANESE_LINT_WORKER_CONNECT_MESSAGE = {
  type: "connect"
} as const;

const idPattern = /^[A-Za-z0-9_.-]{1,80}$/;
const errorKinds: readonly JapaneseLintWorkerErrorKind[] = [
  "invalid-message",
  "not-initialized",
  "dictionary-missing",
  "init-failed",
  "lint-failed",
  "uncaught-exception",
  "unhandled-rejection",
  "internal"
];
const progressStages: readonly JapaneseLintWorkerProgressStage[] = [
  "queued",
  "dictionary-check",
  "lint-running",
  "completed"
];
const safeNamePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const safeCodePattern = /^[A-Za-z0-9_.-]{1,80}$/;
const stackFramePattern =
  /^ {4}at [A-Za-z_$][\w$.]*(?: \[as [A-Za-z_$][\w$]*\])? \(app\.asar\/[A-Za-z0-9_.\-@+/]+:\d+:\d+\)$/;
const allowedExtensionsByFormat: Readonly<
  Record<JapaneseLintFormat, readonly JapaneseLintExtension[]>
> = {
  markdown: [".md", ".markdown"],
  text: [".txt"]
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Request and job ids share one safe shape. */
export function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

export const isSafeJobId = isSafeRequestId;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteInteger(value) && value >= 0;
}

export function isJapaneseLintWorkerConfig(
  value: unknown
): value is JapaneseLintWorkerConfig {
  if (!isRecord(value)) {
    return false;
  }

  const { enabledRuleIds, rules, debounceMs, lineCacheLimit, workerRestartAttempts } =
    value;

  return (
    Array.isArray(enabledRuleIds) &&
    enabledRuleIds.every(isJapaneseLintRuleId) &&
    Array.isArray(rules) &&
    rules.every(
      (rule) =>
        isRecord(rule) &&
        isJapaneseLintRuleId(rule.id) &&
        isRecord(rule.options) &&
        Object.values(rule.options).every(
          (option) => typeof option === "number" && Number.isFinite(option)
        )
    ) &&
    isFiniteInteger(debounceMs) &&
    isFiniteInteger(lineCacheLimit) &&
    isFiniteInteger(workerRestartAttempts)
  );
}

/** Validates a format / extension pairing (`.md` / `.markdown` / `.txt`). */
export function isValidLintFormatAndExt(
  format: unknown,
  ext: unknown
): format is JapaneseLintFormat {
  return (
    (format === "markdown" || format === "text") &&
    typeof ext === "string" &&
    (allowedExtensionsByFormat[format] as readonly string[]).includes(ext)
  );
}

/** Validates an untrusted message on the Worker side. null = malformed. */
export function parseJapaneseLintWorkerRequest(
  raw: unknown
): JapaneseLintWorkerRequest | null {
  if (!isRecord(raw) || !isSafeRequestId(raw.requestId)) {
    return null;
  }

  switch (raw.type) {
    case "ping":
    case "shutdown":
      return { type: raw.type, requestId: raw.requestId };
    case "init":
      return typeof raw.dictionaryPath === "string" &&
        raw.dictionaryPath.length > 0 &&
        raw.dictionaryPath.length <= 4096 &&
        isJapaneseLintWorkerConfig(raw.config)
        ? {
            type: "init",
            requestId: raw.requestId,
            dictionaryPath: raw.dictionaryPath,
            config: raw.config
          }
        : null;
    case "updateConfig":
      return isJapaneseLintWorkerConfig(raw.config)
        ? { type: "updateConfig", requestId: raw.requestId, config: raw.config }
        : null;
    case "cancel":
      return isSafeJobId(raw.jobId)
        ? { type: "cancel", requestId: raw.requestId, jobId: raw.jobId }
        : null;
    case "lintDocument":
      return isSafeJobId(raw.jobId) &&
        typeof raw.source === "string" &&
        raw.source.length <= JAPANESE_LINT_WORKER_MAX_SOURCE_LENGTH &&
        isValidLintFormatAndExt(raw.format, raw.ext)
        ? {
            type: "lintDocument",
            requestId: raw.requestId,
            jobId: raw.jobId,
            source: raw.source,
            format: raw.format,
            ext: raw.ext as JapaneseLintExtension
          }
        : null;
    default:
      return null;
  }
}

function parseSanitizedWorkerError(raw: unknown): SanitizedWorkerError | null {
  if (
    !isRecord(raw) ||
    !errorKinds.includes(raw.kind as JapaneseLintWorkerErrorKind) ||
    typeof raw.name !== "string" ||
    !safeNamePattern.test(raw.name) ||
    !Array.isArray(raw.stack)
  ) {
    return null;
  }

  if (
    raw.code !== undefined &&
    !(typeof raw.code === "string" && safeCodePattern.test(raw.code))
  ) {
    return null;
  }

  // Re-check every frame: the Worker is another process and is not trusted.
  const stack = raw.stack
    .filter(
      (frame): frame is string =>
        typeof frame === "string" && stackFramePattern.test(frame)
    )
    .slice(0, 20);

  return {
    kind: raw.kind as JapaneseLintWorkerErrorKind,
    name: raw.name,
    ...(typeof raw.code === "string" ? { code: raw.code } : {}),
    stack
  };
}

const diagnosticSeverities = ["info", "warning", "error"] as const;

function parseDiagnostic(raw: unknown): JapaneseLintDiagnostic | null {
  if (
    !isRecord(raw) ||
    typeof raw.ruleId !== "string" ||
    !safeCodePattern.test(raw.ruleId) ||
    !diagnosticSeverities.includes(
      raw.severity as (typeof diagnosticSeverities)[number]
    ) ||
    typeof raw.message !== "string" ||
    raw.message.length > 2000 ||
    !isNonNegativeInteger(raw.line) ||
    !isNonNegativeInteger(raw.column) ||
    !isNonNegativeInteger(raw.index)
  ) {
    return null;
  }

  return {
    ruleId: raw.ruleId,
    severity: raw.severity as JapaneseLintDiagnostic["severity"],
    message: raw.message,
    line: raw.line,
    column: raw.column,
    index: raw.index
  };
}

function parseDocumentResult(
  raw: unknown
): JapaneseLintWorkerDocumentResult | null {
  if (
    !isRecord(raw) ||
    raw.ok !== true ||
    !Array.isArray(raw.messages) ||
    !isNonNegativeInteger(raw.totalMessages) ||
    !isNonNegativeInteger(raw.maxMessages) ||
    typeof raw.truncated !== "boolean" ||
    !isNonNegativeInteger(raw.elapsedMs) ||
    !isNonNegativeInteger(raw.sourceChars) ||
    !isNonNegativeInteger(raw.sourceLines)
  ) {
    return null;
  }

  const messages: JapaneseLintDiagnostic[] = [];

  for (const entry of raw.messages) {
    const message = parseDiagnostic(entry);

    if (message === null) {
      return null;
    }

    messages.push(message);
  }

  // Defensive: never accept more than the cap, whatever the Worker says.
  if (messages.length > JAPANESE_LINT_MAX_RESULT_COUNT) {
    return null;
  }

  return {
    ok: true,
    messages,
    totalMessages: raw.totalMessages,
    maxMessages: raw.maxMessages,
    truncated: raw.truncated,
    elapsedMs: raw.elapsedMs,
    sourceChars: raw.sourceChars,
    sourceLines: raw.sourceLines
  };
}

/** Validates an untrusted message on the Host side. null = malformed. */
export function parseJapaneseLintWorkerResponse(
  raw: unknown
): JapaneseLintWorkerResponse | null {
  if (!isRecord(raw)) {
    return null;
  }

  switch (raw.type) {
    case "ready":
    case "pong":
    case "config-updated":
    case "shutdown-complete":
      return isSafeRequestId(raw.requestId)
        ? { type: raw.type, requestId: raw.requestId }
        : null;
    case "progress":
      return isSafeJobId(raw.jobId) &&
        progressStages.includes(raw.stage as JapaneseLintWorkerProgressStage) &&
        isNonNegativeInteger(raw.processedChars) &&
        isNonNegativeInteger(raw.totalChars)
        ? {
            type: "progress",
            jobId: raw.jobId,
            stage: raw.stage as JapaneseLintWorkerProgressStage,
            processedChars: raw.processedChars,
            totalChars: raw.totalChars
          }
        : null;
    case "lint-result": {
      const result = parseDocumentResult(raw.result);

      return isSafeRequestId(raw.requestId) &&
        isSafeJobId(raw.jobId) &&
        result !== null
        ? {
            type: "lint-result",
            requestId: raw.requestId,
            jobId: raw.jobId,
            result
          }
        : null;
    }
    case "canceled":
      if (!isSafeJobId(raw.jobId)) {
        return null;
      }

      if (raw.requestId === undefined) {
        return { type: "canceled", jobId: raw.jobId };
      }

      return isSafeRequestId(raw.requestId)
        ? { type: "canceled", requestId: raw.requestId, jobId: raw.jobId }
        : null;
    case "error": {
      const error = parseSanitizedWorkerError(raw.error);

      if (error === null) {
        return null;
      }

      if (raw.requestId !== undefined && !isSafeRequestId(raw.requestId)) {
        return null;
      }

      if (raw.jobId !== undefined && !isSafeJobId(raw.jobId)) {
        return null;
      }

      return {
        type: "error",
        ...(raw.requestId !== undefined ? { requestId: raw.requestId } : {}),
        ...(raw.jobId !== undefined ? { jobId: raw.jobId } : {}),
        error
      };
    }
    default:
      return null;
  }
}

/**
 * The config a Host sends with `init` / `updateConfig`: the rule snapshot plus
 * the runtime settings, resolved from the stored `japaneseLint` section.
 */
export function buildJapaneseLintWorkerConfig(
  storedSettings: unknown
): JapaneseLintWorkerConfig {
  const resolved = resolveJapaneseLintSettings(storedSettings);
  const rules = enabledJapaneseLintRules(storedSettings);

  return {
    enabledRuleIds: rules.map((rule) => rule.id),
    rules,
    debounceMs: resolved.debounceMs,
    lineCacheLimit: resolved.lineCacheLimit,
    workerRestartAttempts: resolved.workerRestartAttempts
  };
}
